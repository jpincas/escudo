// In-memory storage — tests only, no persistence.
//
// Mirrors KvStore's semantics exactly, including the "an open incident is one
// that exists and isn't cancelled" rule. tests/store_test.ts runs the same
// suite against both; keep them in step.

import {
  type BridgeChannel,
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

// A cursor MemoryStore can trust is one it issued itself — not merely a
// string shaped like an incident id. An earlier version accepted anything
// matching a loose id-shape regex, which let a caller-invented string that
// happened to sort above every real id (e.g. "zzz-fff") silently return page
// one with a fresh-looking nextCursor: indistinguishable from an actual first
// page, with no signal anything was wrong (review finding, 2026-07-28).
//
// Tagging every cursor this store hands out closes that: anything without
// the tag was never issued here and is rejected outright. The tagged part is
// still just the id of the last row already returned — comparison happens on
// that untagged id, preserving the tolerance for a cursor naming a
// since-purged incident (see listIncidentsPage's own comment).
const MEMORY_CURSOR_PREFIX = "mc:";

/** Encodes a position in the log — the id of the last row already returned —
 *  as an opaque MemoryStore cursor. */
function encodeCursor(id: string): string {
  return `${MEMORY_CURSOR_PREFIX}${id}`;
}

/** The inverse of encodeCursor. Throws InvalidCursorError for anything this
 *  store could not have issued, tagged or not. */
function decodeCursor(cursor: string): string {
  if (!cursor.startsWith(MEMORY_CURSOR_PREFIX)) throw new InvalidCursorError();
  return cursor.slice(MEMORY_CURSOR_PREFIX.length);
}

interface RateLimitWindow {
  count: number;
  /** ISO 8601, UTC. */
  resetAt: string;
}

export class MemoryStore implements Store {
  private incidents = new Map<string, Incident>();
  private members = new Map<string, Member>();
  private devices = new Map<string, Device>();
  private inbox = new Map<string, InboxEntry>();
  private villageProfile: VillageProfile | null = null;
  private panelCodes = new Map<string, PanelCode>();
  private panelCodeByAdmin = new Map<string, string>();
  private rateLimits = new Map<string, RateLimitWindow>();
  private sessions = new Map<string, PanelSession>();
  private meta = new Map<string, string>();

  async putIncident(incident: Incident): Promise<void> {
    this.incidents.set(incident.id, { ...incident });
  }

  async getIncident(id: string): Promise<Incident | null> {
    const incident = this.incidents.get(id);
    return incident ? { ...incident } : null;
  }

  async findOpenIncident(reporterRef: string, category: string): Promise<Incident | null> {
    const matches = [...this.incidents.values()]
      .filter((i) => i.reporterRef === reporterRef && i.category === category && !i.cancelledAt)
      .sort((a, b) => (a.id < b.id ? 1 : -1));
    return matches[0] ? { ...matches[0] } : null;
  }

  async listIncidents(): Promise<Incident[]> {
    return [...this.incidents.values()]
      .sort((a, b) => (a.id < b.id ? 1 : -1))
      .map((i) => ({ ...i }));
  }

  // Mirrors KvStore's *behaviour*, not its cursor's bytes: KvStore's cursor is
  // Deno KV's own opaque list cursor, this one is a tagged wrapper around the
  // id of the last incident already handed back. Either way a caller only
  // ever replays what it was given, so the difference is invisible from
  // outside this file — see bumpRateLimit above for the same "same contract,
  // different plumbing" idea.
  async listIncidentsPage(limit: number, cursor: string | null): Promise<IncidentPage> {
    const position = cursor === null ? null : decodeCursor(cursor);

    const sorted = [...this.incidents.values()].sort((a, b) => (a.id < b.id ? 1 : -1));
    // A cursor is a *position* — everything strictly older than it — not a
    // promise that the incident it names still exists. Comparing ids rather
    // than requiring an exact match (the previous version's bug) means a
    // cursor naming a row retention has since purged still resumes cleanly,
    // the same tolerance KvStore's real cursor has for a deleted boundary key.
    const remaining = position !== null ? sorted.filter((i) => i.id < position) : sorted;
    const page = remaining.slice(0, limit);
    const hasMore = remaining.length > limit;
    return {
      incidents: page.map((i) => ({ ...i })),
      nextCursor: hasMore ? encodeCursor(page[page.length - 1].id) : null,
    };
  }

  async purgeIncidentsBefore(cutoff: string): Promise<number> {
    let deleted = 0;
    for (const [id, incident] of this.incidents) {
      if (incident.createdAt < cutoff) {
        this.incidents.delete(id);
        deleted++;
      }
    }
    return deleted;
  }

  async putMember(member: Member): Promise<void> {
    this.members.set(member.telegramId, { ...member });
  }

  async getMember(telegramId: string): Promise<Member | null> {
    const member = this.members.get(telegramId);
    return member ? { ...member } : null;
  }

  async listMembers(): Promise<Member[]> {
    return [...this.members.values()]
      .sort((a, b) => (a.joinedAt < b.joinedAt ? -1 : 1))
      .map((m) => ({ ...m }));
  }

  async putDevice(device: Device): Promise<void> {
    this.devices.set(device.msisdn, { ...device });
  }

  async getDevice(msisdn: string): Promise<Device | null> {
    const device = this.devices.get(msisdn);
    return device ? migrateDevice({ ...device }) : null;
  }

  async listDevices(): Promise<Device[]> {
    return [...this.devices.values()]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((d) => migrateDevice({ ...d }));
  }

  async deleteDevice(msisdn: string): Promise<void> {
    this.devices.delete(msisdn);
  }

  async noteInbound(
    msisdn: string,
    via: BridgeChannel,
    body: string | null,
    at: Date,
  ): Promise<void> {
    const existing = this.inbox.get(msisdn);
    const seenAt = at.toISOString();
    this.inbox.set(msisdn, {
      msisdn,
      count: (existing?.count ?? 0) + 1,
      firstSeenAt: existing?.firstSeenAt ?? seenAt,
      lastSeenAt: seenAt,
      lastVia: via,
      lastBody: body,
    });
  }

  async listInbox(): Promise<InboxEntry[]> {
    return [...this.inbox.values()]
      .sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1))
      .map((e) => ({ ...e }));
  }

  async deleteInboxEntry(msisdn: string): Promise<void> {
    this.inbox.delete(msisdn);
  }

  async purgeInboxBefore(cutoff: string): Promise<number> {
    let deleted = 0;
    for (const [msisdn, entry] of this.inbox) {
      if (entry.lastSeenAt < cutoff) {
        this.inbox.delete(msisdn);
        deleted++;
      }
    }
    return deleted;
  }

  // ── Public profile — presentation only, see VillageProfile's own doc ──

  async getVillageProfile(): Promise<VillageProfile> {
    if (!this.villageProfile) return emptyVillageProfile();
    return {
      ...this.villageProfile,
      responsiblePeople: this.villageProfile.responsiblePeople.map((p) => ({ ...p })),
    };
  }

  async putVillageProfile(profile: VillageProfile): Promise<void> {
    this.villageProfile = {
      ...profile,
      responsiblePeople: profile.responsiblePeople.map((p) => ({ ...p })),
    };
  }

  async putPanelCode(entry: PanelCode): Promise<void> {
    // Supersede any code already outstanding for this admin (A6) — mirrors
    // KvStore doing both in one write.
    const existing = this.panelCodeByAdmin.get(entry.telegramId);
    if (existing) this.panelCodes.delete(existing);

    this.panelCodes.set(entry.code, { ...entry });
    this.panelCodeByAdmin.set(entry.telegramId, entry.code);
  }

  async takePanelCode(code: string, now: Date): Promise<PanelCode | null> {
    const entry = this.panelCodes.get(code);
    // Deleted whether or not it had expired: a consumed code is spent either
    // way, matching KvStore. The admin pointer is left alone, same reasoning
    // as KvStore's takePanelCode — it may already point at a newer code.
    this.panelCodes.delete(code);
    if (!entry) return null;
    return new Date(entry.expiresAt) > now ? { ...entry } : null;
  }

  // No compare-and-swap needed here: every await above is a full statement
  // apart, and JS never interleaves two synchronous sections of different
  // async calls on one thread, so a read here and the write below it can
  // never be split by a concurrent bumpRateLimit() the way they can against
  // real KV. This still mirrors KvStore's *behaviour* exactly; it just gets
  // there without needing KvStore's retry loop.
  async bumpRateLimit(key: string, windowMs: number, now: Date): Promise<number> {
    const nowMs = now.getTime();
    const existing = this.rateLimits.get(key);

    if (!existing || new Date(existing.resetAt).getTime() <= nowMs) {
      const resetAt = new Date(nowMs + windowMs).toISOString();
      this.rateLimits.set(key, { count: 1, resetAt });
      return 1;
    }

    const count = existing.count + 1;
    this.rateLimits.set(key, { count, resetAt: existing.resetAt });
    return count;
  }

  async putSession(session: PanelSession): Promise<void> {
    this.sessions.set(session.token, { ...session });
  }

  async getSession(token: string): Promise<PanelSession | null> {
    const session = this.sessions.get(token);
    if (!session) return null;
    return new Date(session.expiresAt) > new Date() ? { ...session } : null;
  }

  async deleteSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  async getMeta(key: string): Promise<string | null> {
    return this.meta.get(key) ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.meta.set(key, value);
  }

  close(): void {}
}
