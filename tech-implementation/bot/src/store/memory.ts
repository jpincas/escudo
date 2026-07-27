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
  type Member,
  migrateDevice,
  type PanelLink,
  type PanelSession,
  type Store,
  type VillageProfile,
} from "./types.ts";

export class MemoryStore implements Store {
  private incidents = new Map<string, Incident>();
  private members = new Map<string, Member>();
  private devices = new Map<string, Device>();
  private inbox = new Map<string, InboxEntry>();
  private villageProfile: VillageProfile | null = null;
  private panelLinks = new Map<string, PanelLink>();
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

  async putPanelLink(link: PanelLink): Promise<void> {
    this.panelLinks.set(link.token, { ...link });
  }

  async takePanelLink(token: string): Promise<PanelLink | null> {
    const link = this.panelLinks.get(token);
    // Deleted whether or not it had expired: a consumed token is spent either
    // way, matching KvStore.
    this.panelLinks.delete(token);
    if (!link) return null;
    return new Date(link.expiresAt) > new Date() ? { ...link } : null;
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
