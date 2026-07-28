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
//   ["village_profile"]                    → VillageProfile (single row; §3
//                                              spec 2026-07-27 — presentation
//                                              only, see its own doc in types.ts)
//   ["panel_code", code]                   → PanelCode  (one-time login code,
//                                              §5 spec 2026-07-27; the code
//                                              value itself is the key, so a
//                                              guess that doesn't exist finds
//                                              nothing and touches nothing —
//                                              see PanelCode's own doc)
//   ["panel_code_admin", telegramId]       → code       (pointer, so a fresh
//                                              code can supersede an admin's
//                                              old one, A6)
//   ["rate_limit", key]                    → { count, resetAt } (login
//                                              endpoint rate limiting, §5.2 —
//                                              one fixed key for the whole
//                                              deployment; see src/web/login.ts)
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
  emptyVillageProfile,
  type InboxEntry,
  type Incident,
  type IncidentPage,
  InvalidCursorError,
  type Member,
  migrateDevice,
  type PanelCode,
  type PanelSession,
  type Store,
  type VillageProfile,
} from "./types.ts";

const incidentKey = (id: string): Deno.KvKey => ["incident", id];
const byDayKey = (day: string, id: string): Deno.KvKey => ["incident_by_day", day, id];
const openKey = (ref: string, category: string): Deno.KvKey => ["incident_open", ref, category];
const memberKey = (telegramId: string): Deno.KvKey => ["member", telegramId];
const deviceKey = (msisdn: string): Deno.KvKey => ["device", msisdn];
const inboxKey = (msisdn: string): Deno.KvKey => ["inbox", msisdn];
const villageProfileKey: Deno.KvKey = ["village_profile"];
const panelCodeKey = (code: string): Deno.KvKey => ["panel_code", code];
const panelCodeAdminKey = (telegramId: string): Deno.KvKey => ["panel_code_admin", telegramId];
const rateLimitKey = (key: string): Deno.KvKey => ["rate_limit", key];
const panelSessionKey = (token: string): Deno.KvKey => ["panel_session", token];
const metaKey = (key: string): Deno.KvKey => ["meta", key];

interface RateLimitWindow {
  count: number;
  /** ISO 8601, UTC — when this window's count resets to zero. */
  resetAt: string;
}

/** Bounded retries for bumpRateLimit()'s optimistic-concurrency loop. Sized
 *  generously rather than tightly: each retry is one more KV round trip, not
 *  a meaningful cost, and this is the one place a deliberate flood is the
 *  expected input (that's the whole point of the counter it maintains), so
 *  it needs headroom for real contention rather than the handful of
 *  requests one village's ordinary login traffic produces. */
const RATE_LIMIT_RETRIES = 1000;

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

  /**
   * Reads `limit + 1` rows so it can tell, in this same round trip, whether
   * there is a further page — without that peek, "does another page exist"
   * would cost a whole extra request that comes back empty. The cursor
   * handed back is Deno KV's own list cursor, captured right after the
   * `limit`-th row: replaying it resumes exactly where this page stopped,
   * never re-showing or skipping a row.
   */
  async listIncidentsPage(limit: number, cursor: string | null): Promise<IncidentPage> {
    const iter = this.kv.list<string>(
      { prefix: ["incident_by_day"] },
      { reverse: true, limit: limit + 1, cursor: cursor ?? undefined },
    );

    const incidents: Incident[] = [];
    let cursorAtLimit: string | null = null;
    let count = 0;
    try {
      for await (const entry of iter) {
        count++;
        if (count > limit) break; // the peek row — its presence means more exist
        const incident = await this.getIncident(entry.value);
        if (incident) incidents.push(incident);
        cursorAtLimit = iter.cursor;
      }
    } catch (err) {
      // Deno KV validates the cursor lazily, on the first row consumed, not
      // when list() is called — so this is where a garbage, truncated, or
      // wrong-backend cursor throws. A real one it deleted since (e.g. the
      // row retention purged) never reaches here: KV's cursor is a position
      // in the key range, not a promise that a specific key still exists,
      // so it keeps working after the row behind it is gone. Only cursor
      // decode failures are TypeErrors; anything else is a genuine fault
      // and must keep surfacing as one, not get relabelled as bad input.
      if (cursor !== null && err instanceof TypeError) throw new InvalidCursorError();
      throw err;
    }

    return { incidents, nextCursor: count > limit ? cursorAtLimit : null };
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
    return entry.value ? migrateDevice(entry.value) : null;
  }

  async listDevices(): Promise<Device[]> {
    const devices: Device[] = [];
    for await (const entry of this.kv.list<Device>({ prefix: ["device"] })) {
      devices.push(migrateDevice(entry.value));
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

  // ── Public profile — presentation only, see VillageProfile's own doc ──

  async getVillageProfile(): Promise<VillageProfile> {
    const entry = await this.kv.get<VillageProfile>(villageProfileKey);
    return entry.value ?? emptyVillageProfile();
  }

  async putVillageProfile(profile: VillageProfile): Promise<void> {
    await this.kv.set(villageProfileKey, profile);
  }

  async putPanelCode(entry: PanelCode): Promise<void> {
    // Superseding any code already outstanding for this admin (A6) happens
    // in the same write: read the admin's current code, if any, and delete it
    // as part of the same transaction that stores the new one — there is
    // never a moment where both are live.
    const adminKey = panelCodeAdminKey(entry.telegramId);
    const existing = await this.kv.get<string>(adminKey);

    const tx = this.kv.atomic();
    if (existing.value) tx.delete(panelCodeKey(existing.value));
    tx.set(panelCodeKey(entry.code), entry, { expireIn: msUntil(entry.expiresAt) });
    tx.set(adminKey, entry.code, { expireIn: msUntil(entry.expiresAt) });

    const result = await tx.commit();
    if (!result.ok) throw new Error(`Failed to store panel code for ${entry.telegramId}`);
  }

  async takePanelCode(code: string, now: Date): Promise<PanelCode | null> {
    const key = panelCodeKey(code);
    const entry = await this.kv.get<PanelCode>(key);
    if (!entry.value) return null;

    // Delete before returning, and only honour it if *this* call is the one
    // that removed it: two requests racing the same correct code must not
    // both come back with a session. The admin-pointer key is left as is —
    // it may already point at a newer code if one has superseded this one,
    // and putPanelCode() cleans up whatever it finds when that happens;
    // deleting it here unconditionally would risk removing a live newer
    // code's own pointer.
    const deleted = await this.kv.atomic().check(entry).delete(key).commit();
    if (!deleted.ok) return null;

    return new Date(entry.value.expiresAt) > now ? entry.value : null;
  }

  /**
   * Retries under contention rather than dropping a losing racer's
   * increment (review finding F2): `get` then `set` with no compare-and-swap
   * let 200 concurrent callers land as few as 4 — 196 free, uncounted
   * guesses. Every attempt here re-reads the current value and re-commits
   * against it with `.check()`, so a losing racer tries again against
   * whatever the winner just wrote, instead of silently vanishing.
   */
  async bumpRateLimit(key: string, windowMs: number, now: Date): Promise<number> {
    const k = rateLimitKey(key);
    const nowMs = now.getTime();

    for (let attempt = 0; attempt < RATE_LIMIT_RETRIES; attempt++) {
      const entry = await this.kv.get<RateLimitWindow>(k);
      const expired = !entry.value || new Date(entry.value.resetAt).getTime() <= nowMs;
      const count = expired ? 1 : entry.value!.count + 1;
      const resetAt = expired ? new Date(nowMs + windowMs).toISOString() : entry.value!.resetAt;

      const result = await this.kv.atomic()
        .check(entry)
        .set(k, { count, resetAt } satisfies RateLimitWindow, { expireIn: msUntil(resetAt) })
        .commit();
      if (result.ok) return count;
      // Lost the race — another caller wrote first. Loop and retry against
      // the value they left, rather than returning as if nothing happened.
    }

    // Exhausted every retry under heavy contention. Fail closed: a caller
    // that cannot prove it landed under the limit is treated as over it,
    // never as clear — the one direction that can't turn into a free guess.
    return Number.MAX_SAFE_INTEGER;
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
