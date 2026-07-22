// Deno KV–backed storage.
//
// The same class serves both deployment shapes: on Deno Deploy it talks to a
// provisioned KV database; self-hosted it talks to a local file (set
// ESCUDO_KV_PATH), which is SQLite under the hood. No second adapter needed.
//
// Key schema:
//   ["incident", id]                       → Incident
//   ["incident_by_day", day, id]           → id        (retention range scans)
//   ["incident_open", reporterRef, cat]    → id        (double-tap guard)
//   ["member", telegramId]                 → Member
//   ["device", msisdn]                     → Device
//   ["inbox", msisdn]                      → InboxEntry (unregistered callers)
//   ["panel_link", token]                  → PanelLink   (one-time, expiring)
//   ["panel_session", token]               → PanelSession (expiring)
//   ["meta", key]                          → string    (bot housekeeping)
//
// Incident ids are time-ordered (see newIncidentId), so a reverse range scan of
// the day index yields newest-first without sorting.
//
// Links and sessions carry their own expiresAt *and* are written with KV's
// expireIn. The stored timestamp is what decides validity — MemoryStore has no
// TTL and the two must agree — while expireIn only stops dead rows accumulating.

import {
  type BridgeChannel,
  dayOf,
  type Device,
  type InboxEntry,
  type Incident,
  type Member,
  type PanelLink,
  type PanelSession,
  type Store,
} from "./types.ts";

const incidentKey = (id: string): Deno.KvKey => ["incident", id];
const byDayKey = (day: string, id: string): Deno.KvKey => ["incident_by_day", day, id];
const openKey = (ref: string, category: string): Deno.KvKey => ["incident_open", ref, category];
const memberKey = (telegramId: string): Deno.KvKey => ["member", telegramId];
const deviceKey = (msisdn: string): Deno.KvKey => ["device", msisdn];
const inboxKey = (msisdn: string): Deno.KvKey => ["inbox", msisdn];
const panelLinkKey = (token: string): Deno.KvKey => ["panel_link", token];
const panelSessionKey = (token: string): Deno.KvKey => ["panel_session", token];
const metaKey = (key: string): Deno.KvKey => ["meta", key];

/** Milliseconds until an ISO timestamp, floored at zero. */
function msUntil(isoTimestamp: string): number {
  return Math.max(0, new Date(isoTimestamp).getTime() - Date.now());
}

export class KvStore implements Store {
  constructor(private kv: Deno.Kv) {}

  static async open(path?: string): Promise<KvStore> {
    return new KvStore(await Deno.openKv(path));
  }

  async putIncident(incident: Incident): Promise<void> {
    const day = dayOf(incident.createdAt);
    const open = openKey(incident.reporterRef, incident.category);

    const tx = this.kv.atomic()
      .set(incidentKey(incident.id), incident)
      .set(byDayKey(day, incident.id), incident.id);

    // The "open" pointer is what the double-tap guard reads. A cancelled alert
    // is not open, so cancelling must clear it — otherwise the next press
    // within the dedupe window would silently attach to a dead incident.
    if (incident.cancelledAt) tx.delete(open);
    else tx.set(open, incident.id);

    const result = await tx.commit();
    if (!result.ok) throw new Error(`Failed to store incident ${incident.id}`);
  }

  async getIncident(id: string): Promise<Incident | null> {
    const entry = await this.kv.get<Incident>(incidentKey(id));
    return entry.value ?? null;
  }

  async findOpenIncident(reporterRef: string, category: string): Promise<Incident | null> {
    const pointer = await this.kv.get<string>(openKey(reporterRef, category));
    if (!pointer.value) return null;
    const incident = await this.getIncident(pointer.value);
    return incident?.cancelledAt ? null : incident;
  }

  async listIncidents(): Promise<Incident[]> {
    const incidents: Incident[] = [];
    for await (
      const entry of this.kv.list<string>({ prefix: ["incident_by_day"] }, { reverse: true })
    ) {
      const incident = await this.getIncident(entry.value);
      if (incident) incidents.push(incident);
    }
    return incidents;
  }

  async purgeIncidentsBefore(cutoff: string): Promise<number> {
    // Scan whole days up to and including the cutoff's own day, then filter
    // precisely on createdAt — the day index narrows the scan, it doesn't
    // decide the boundary.
    const range = {
      start: ["incident_by_day"] as Deno.KvKey,
      end: ["incident_by_day", dayOf(cutoff), "￿"] as Deno.KvKey,
    };

    let deleted = 0;
    for await (const entry of this.kv.list<string>(range)) {
      const incident = await this.getIncident(entry.value);
      if (incident && incident.createdAt >= cutoff) continue;

      const tx = this.kv.atomic().delete(entry.key).delete(incidentKey(entry.value));
      if (incident) tx.delete(openKey(incident.reporterRef, incident.category));
      await tx.commit();
      deleted++;
    }
    return deleted;
  }

  async putMember(member: Member): Promise<void> {
    await this.kv.set(memberKey(member.telegramId), member);
  }

  async getMember(telegramId: string): Promise<Member | null> {
    const entry = await this.kv.get<Member>(memberKey(telegramId));
    return entry.value ?? null;
  }

  async listMembers(): Promise<Member[]> {
    const members: Member[] = [];
    for await (const entry of this.kv.list<Member>({ prefix: ["member"] })) {
      members.push(entry.value);
    }
    return members.sort((a, b) => (a.joinedAt < b.joinedAt ? -1 : 1));
  }

  async putDevice(device: Device): Promise<void> {
    await this.kv.set(deviceKey(device.msisdn), device);
  }

  async getDevice(msisdn: string): Promise<Device | null> {
    const entry = await this.kv.get<Device>(deviceKey(msisdn));
    return entry.value ?? null;
  }

  async listDevices(): Promise<Device[]> {
    const devices: Device[] = [];
    for await (const entry of this.kv.list<Device>({ prefix: ["device"] })) {
      devices.push(entry.value);
    }
    return devices.sort((a, b) => a.label.localeCompare(b.label));
  }

  async deleteDevice(msisdn: string): Promise<void> {
    await this.kv.delete(deviceKey(msisdn));
  }

  async noteInbound(
    msisdn: string,
    via: BridgeChannel,
    body: string | null,
    at: Date,
  ): Promise<void> {
    const key = inboxKey(msisdn);
    const existing = await this.kv.get<InboxEntry>(key);
    const seenAt = at.toISOString();

    // Last write wins if two calls race. The count may then under-report by
    // one, which is not worth a retry loop on a path whose job is to make sure
    // the coordinator sees the number at all.
    await this.kv.set(
      key,
      {
        msisdn,
        count: (existing.value?.count ?? 0) + 1,
        firstSeenAt: existing.value?.firstSeenAt ?? seenAt,
        lastSeenAt: seenAt,
        lastVia: via,
        // An SMS body is kept only while it is the latest thing this number said;
        // a later call replaces it with null rather than leaving stale text.
        lastBody: body,
      } satisfies InboxEntry,
    );
  }

  async listInbox(): Promise<InboxEntry[]> {
    const entries: InboxEntry[] = [];
    for await (const entry of this.kv.list<InboxEntry>({ prefix: ["inbox"] })) {
      entries.push(entry.value);
    }
    return entries.sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
  }

  async deleteInboxEntry(msisdn: string): Promise<void> {
    await this.kv.delete(inboxKey(msisdn));
  }

  async purgeInboxBefore(cutoff: string): Promise<number> {
    let deleted = 0;
    for await (const entry of this.kv.list<InboxEntry>({ prefix: ["inbox"] })) {
      if (entry.value.lastSeenAt >= cutoff) continue;
      await this.kv.delete(entry.key);
      deleted++;
    }
    return deleted;
  }

  async putPanelLink(link: PanelLink): Promise<void> {
    await this.kv.set(panelLinkKey(link.token), link, { expireIn: msUntil(link.expiresAt) });
  }

  async takePanelLink(token: string): Promise<PanelLink | null> {
    const key = panelLinkKey(token);
    const entry = await this.kv.get<PanelLink>(key);
    if (!entry.value) return null;

    // Delete before returning, and only honour the link if *this* call is the
    // one that removed it: two requests racing the same token must not both
    // come back with a session.
    const deleted = await this.kv.atomic().check(entry).delete(key).commit();
    if (!deleted.ok) return null;

    return new Date(entry.value.expiresAt) > new Date() ? entry.value : null;
  }

  async putSession(session: PanelSession): Promise<void> {
    await this.kv.set(panelSessionKey(session.token), session, {
      expireIn: msUntil(session.expiresAt),
    });
  }

  async getSession(token: string): Promise<PanelSession | null> {
    const entry = await this.kv.get<PanelSession>(panelSessionKey(token));
    if (!entry.value) return null;
    return new Date(entry.value.expiresAt) > new Date() ? entry.value : null;
  }

  async deleteSession(token: string): Promise<void> {
    await this.kv.delete(panelSessionKey(token));
  }

  async getMeta(key: string): Promise<string | null> {
    const entry = await this.kv.get<string>(metaKey(key));
    return entry.value ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.kv.set(metaKey(key), value);
  }

  close(): void {
    this.kv.close();
  }
}
