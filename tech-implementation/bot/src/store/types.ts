// Storage interface and the two record shapes the bot persists.
//
// Two backends implement this: KvStore (Deno KV — production and self-hosting
// alike, since local Deno KV is just SQLite on disk) and MemoryStore (tests).
// A change to one that isn't mirrored in the other passes the tests and breaks
// production — the shared suite in tests/store_test.ts exists to stop that.
//
// GDPR posture (spec §4): a member is a name and a Telegram id, nothing more.
// There are deliberately NO health or vulnerability flags anywhere in these
// shapes. Modelling "who is frail" would drag the whole system into Article 9
// special-category processing. Don't add one.

/**
 * Where an alert came from.
 *
 * `device` is anything that reached the bridge: a pendant, a wall unit, a watch
 * or a neighbour's own phone. One value covers all of them deliberately — the
 * shape of the hardware changes nothing about how the alarm is handled.
 */
export type IncidentSource = "telegram" | "device";

export interface Incident {
  id: string;
  source: IncidentSource;
  /** Category id, matching one in config.categories. */
  category: string;
  /** Telegram user id, or the E.164 number a bridge alert arrived from. */
  reporterRef: string;
  /** Display name as shown in the group at the time of the alert. */
  reporterName: string;
  /**
   * Street address, for alerts raised by a registered device.
   *
   * Copied from the Device at the moment of the alert rather than looked up
   * later: this is where a responder is being sent, and it must not silently
   * change if the registry is edited afterwards. Null for Telegram alerts,
   * where the reporter can share a live pin instead.
   */
  reporterAddress: string | null;
  /**
   * What kind of thing raised it, snapshotted like the address and for the same
   * reason: editing the registry afterwards must not rewrite what an alert said
   * at the time. Null for Telegram alerts — a person, not a device.
   */
  reporterKind: DeviceKind | null;
  /**
   * Set when an admin raised this from the panel rather than a device raising
   * it (§5.2). The group sees an ordinary alert — that is the point of the
   * exercise — so this is the only record that it was a drill, and the incident
   * log would otherwise be a lie about what happened in the village.
   */
  simulatedBy: string | null;
  /** Message id of the alert post in the village group, for later edits. */
  groupMessageId: number | null;
  lat: number | null;
  lon: number | null;
  /** ISO 8601, UTC. */
  createdAt: string;
  cancelledAt: string | null;
  /** Telegram user id of whoever cancelled it. */
  cancelledBy: string | null;
}

export interface Member {
  telegramId: string;
  displayName: string;
  /** ISO 8601, UTC. */
  joinedAt: string;
}

/**
 * What shape of thing is registered.
 *
 * Every kind raises exactly the same alarm — nothing on the alert path branches
 * on it, and nothing here changes urgency, routing, or who is notified. It
 * changes one thing: the icon on the alert, so a responder reading their phone
 * in the dark knows whether a neighbour pressed a button or a house went off.
 *
 * `phone` is an ordinary phone belonging to a neighbour — a dumbphone, or a
 * smartphone whose owner doesn't use Telegram. It costs nothing and needs no
 * hardware, so it is the door most people come through.
 *
 * `alarm` is a domestic alarm panel wired to dial the bridge. It is the only
 * kind where nobody chose to raise the alarm, and quite possibly the most
 * useful thing this system does.
 *
 * `pendant` and `watch` were separate kinds until July 2026 and are folded into
 * `wearable` on read — see normaliseKind().
 */
export type DeviceKind = "base" | "wearable" | "phone" | "alarm" | "other";

/**
 * Map a stored kind onto the current set.
 *
 * Registries in the field predate the July 2026 merge, and a device that came
 * back as an unknown kind would fail validation on the next panel edit — for a
 * cosmetic field, on a record whose job is to raise alarms.
 */
export function normaliseKind(kind: string): DeviceKind {
  if (kind === "pendant" || kind === "watch") return "wearable";
  const known: DeviceKind[] = ["base", "wearable", "phone", "alarm", "other"];
  return known.includes(kind as DeviceKind) ? kind as DeviceKind : "other";
}

/**
 * Applied on the way out of every store, not in a one-off migration script: a
 * village's registry is small and read constantly, and a rewrite that half-ran
 * is a worse thing to own than a mapping that costs nothing.
 */
export function migrateDevice(device: Device): Device {
  return { ...device, kind: normaliseKind(device.kind) };
}

/**
 * A registered way of raising the alarm that isn't Telegram.
 *
 * The bridge receives a call or an SMS and knows only a phone number. This is
 * what turns that number into an alert a neighbour can act on: who, and above
 * all *where* — a base station on a kitchen wall carries no GPS, so the address
 * IS the location.
 *
 * Deliberately a device fact, not a person fact. "This number belongs to this
 * house" says nothing about anybody's health, and recording *why* someone has
 * one would drag the whole system into Article 9 processing. Don't add a reason
 * field — see the note at the top of this file.
 */
export interface Device {
  /** E.164, e.g. "+34600111222". The key: it is what an SMS arrives from. */
  msisdn: string;
  /** How the alert is headed in the group — "Casa de María". */
  label: string;
  /** Where a responder actually goes. */
  address: string;
  kind: DeviceKind;
  /**
   * Last time this device demonstrably worked — a real alert or a test.
   *
   * The whole liveness story hangs off this one field. Shop-bought devices send
   * no heartbeat and no telemetry, so unlike a LoRaWAN button there is nothing
   * else that can tell us a device still works. A stale date here is the only
   * warning the village will ever get.
   */
  lastProvenAt: string | null;
  /** ISO 8601, UTC. */
  registeredAt: string;
}

/** How something reached the bridge. */
export type BridgeChannel = "call" | "sms";

/**
 * A number that contacted the bridge but isn't registered.
 *
 * This is how a household actually joins. Nobody types a phone number into a
 * form: the coordinator stands in the kitchen, presses the new pendant, and the
 * number appears here to be named and given an address. It is also the only
 * warning that a device was installed and never finished being set up.
 *
 * Unregistered callers are never posted to the group — that would make the
 * alarm raisable by anyone who guesses the number — but they are never silently
 * dropped either, because silence would hide a broken install.
 *
 * These are phone numbers belonging to identifiable people, so they are purged
 * on the same schedule as everything else (see purgeInboxBefore).
 */
export interface InboxEntry {
  /** E.164. The key. */
  msisdn: string;
  /** How many times this number has reached the bridge. */
  count: number;
  /** ISO 8601, UTC. */
  firstSeenAt: string;
  /** ISO 8601, UTC. */
  lastSeenAt: string;
  lastVia: BridgeChannel;
  /** Last message body, if it was an SMS. Often names the device's maker. */
  lastBody: string | null;
}

/**
 * A one-time link handed out over Telegram to open the admin panel.
 *
 * Short-lived and consumed on first use. The bot is the authentication channel:
 * it already knows who the admins are and can already prove it, so the panel
 * needs no passwords, no email and no user table of its own.
 */
export interface PanelLink {
  token: string;
  telegramId: string;
  name: string;
  /** ISO 8601, UTC. */
  expiresAt: string;
}

/** A signed-in panel session, keyed by the value held in the cookie. */
export interface PanelSession {
  token: string;
  telegramId: string;
  name: string;
  /** ISO 8601, UTC. */
  createdAt: string;
  /** ISO 8601, UTC. */
  expiresAt: string;
}

export interface Store {
  // ── Incidents ──
  putIncident(incident: Incident): Promise<void>;
  getIncident(id: string): Promise<Incident | null>;
  /**
   * The most recent uncancelled incident from this reporter in this category,
   * or null. Backs the double-tap guard.
   */
  findOpenIncident(reporterRef: string, category: string): Promise<Incident | null>;
  /** Newest first. Used by /export. */
  listIncidents(): Promise<Incident[]>;
  /** Deletes incidents created strictly before `cutoff` (ISO 8601). Returns the count. */
  purgeIncidentsBefore(cutoff: string): Promise<number>;

  // ── Members ──
  putMember(member: Member): Promise<void>;
  getMember(telegramId: string): Promise<Member | null>;
  /**
   * Everyone the bot can reach. Exactly the people who have pressed Start:
   * Telegram forbids a bot messaging anyone else, so this is the reachable
   * set by definition. Backs the keyboard refresh.
   */
  listMembers(): Promise<Member[]>;

  // ── Devices ──
  putDevice(device: Device): Promise<void>;
  getDevice(msisdn: string): Promise<Device | null>;
  /** Sorted by label, because that is how the panel and a human read them. */
  listDevices(): Promise<Device[]>;
  deleteDevice(msisdn: string): Promise<void>;

  // ── Bridge inbox ──
  /**
   * Record a contact from an unregistered number. Upserts: a second call from
   * the same number bumps the count rather than making a second row, so a
   * device stuck in a loop doesn't bury the rest of the inbox.
   */
  noteInbound(msisdn: string, via: BridgeChannel, body: string | null, at: Date): Promise<void>;
  /** Newest first — the number that just rang is the one being registered. */
  listInbox(): Promise<InboxEntry[]>;
  /** Called when a number is registered, or dismissed by the coordinator. */
  deleteInboxEntry(msisdn: string): Promise<void>;
  /** Deletes entries last seen strictly before `cutoff` (ISO 8601). Returns the count. */
  purgeInboxBefore(cutoff: string): Promise<number>;

  // ── Panel access ──
  putPanelLink(link: PanelLink): Promise<void>;
  /**
   * Consume a magic link: returns it and deletes it in one step, so a link
   * works exactly once even if the URL is forwarded, logged or pasted twice.
   * Expired links return null.
   */
  takePanelLink(token: string): Promise<PanelLink | null>;
  putSession(session: PanelSession): Promise<void>;
  /** Expired sessions return null rather than being handed back stale. */
  getSession(token: string): Promise<PanelSession | null>;
  deleteSession(token: string): Promise<void>;

  // ── Housekeeping ──
  /** Small named values the bot keeps about itself, not about people. */
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;

  close(): void;
}

/** `2026-07-20T14:32:00.000Z` → `2026-07-20`. Used for the retention index. */
export function dayOf(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}
