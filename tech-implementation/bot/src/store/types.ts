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

/** One bounded page of the incident log, newest first. See Store.listIncidentsPage. */
export interface IncidentPage {
  incidents: Incident[];
  /** Pass to the next call to continue; null means this page reached the
   *  end of the log. */
  nextCursor: string | null;
}

/**
 * Thrown by Store.listIncidentsPage when `cursor` cannot be interpreted at
 * all, as opposed to a well-formed cursor that simply has nothing left
 * behind it (which is the ordinary `nextCursor: null` case, not an error).
 * Callers — see src/panel/api.ts — must catch this and answer a defined
 * 400, the same way every other malformed input on this API is refused;
 * letting it fall through to a framework's generic handler is exactly the
 * unhandled-500 this exists to prevent.
 */
export class InvalidCursorError extends Error {
  constructor() {
    super("Invalid cursor");
    this.name = "InvalidCursorError";
  }
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

/** A name and a role, nothing more — see VillageProfile below. */
export interface ResponsiblePerson {
  name: string;
  role: string;
}

/**
 * The deployment's own public profile: what the welcome page (§4, spec
 * 2026-07-27) shows about this village to a visitor. Edited from the panel's
 * Config screen (§3).
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ NOTHING ON THE ALERT PATH MAY READ THIS TYPE OR ITS STORE METHODS.   │
 * │ Not the bot, not the bridge, not the alert service, not the          │
 * │ notifier, not retention. Its only two consumers are the welcome      │
 * │ page and its own editor screen (src/panel/api.ts's                  │
 * │ "Public profile" routes). If you find yourself importing             │
 * │ VillageProfile, getVillageProfile or putVillageProfile from          │
 * │ src/alerts.ts, src/bridge/*, src/telegram/* or src/jobs/*, stop —    │
 * │ that is exactly the thing this record is not allowed to do. A bad    │
 * │ edit here must only ever be able to make the welcome page wrong.      │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Every field is optional and independent, and the all-empty value (see
 * emptyVillageProfile()) is a valid, expected state — a brand-new deployment
 * has one and must render sanely. There is no history: a write replaces the
 * single row wholesale, and the previous value is gone.
 *
 * Deliberately absent: the village name (stays in config.yaml — one source
 * of truth), locale, timezone, categories, the emergency line, retention, and
 * anything to do with domains or secrets. None of those belong to a web form.
 */
export interface VillageProfile {
  /** E.164, e.g. "+34600111222" — the number a neighbour calls to raise the
   *  alarm. Null means this deployment has no call bridge yet, or hasn't
   *  said so. Validated as international format on write, nothing more:
   *  this is presentation, not the bridge's own device registry. */
  escudoPhone: string | null;
  /**
   * An `https` link to an image hosted elsewhere. Never a data URL and never
   * uploaded binary — Deno KV caps a value at 64 KiB, which a usable photo
   * exceeds. Rendered as given: no proxying, resizing or caching (spec A10),
   * so a URL that later 404s is the welcome page's problem to degrade from,
   * not this store's to prevent.
   */
  photoUrl: string | null;
  /** A short free-text paragraph introducing this village's Red Escudo. */
  introText: string | null;
  /**
   * Ordered — the welcome page shows them in this order. Name and role only:
   * no phone numbers, no emails, no addresses. These are real people's names
   * published to the open web (spec §3.4); the editor screen is where that
   * is disclosed to whoever enters them, not here.
   */
  responsiblePeople: ResponsiblePerson[];
}

/**
 * The valid "nothing has ever been written" state. A fresh object every
 * call — responsiblePeople is a mutable array, and handing back a shared one
 * would let one request's edits leak into another's.
 */
export function emptyVillageProfile(): VillageProfile {
  return { escudoPhone: null, photoUrl: null, introText: null, responsiblePeople: [] };
}

/**
 * A one-time login code handed out over Telegram (spec 2026-07-27 §5) — the
 * bot is the authentication channel: it already knows who the admins are and
 * can already prove it, so the panel needs no passwords, no email and no
 * user table of its own. Replaces the old magic-link `PanelLink`: the bot now
 * sends a short digits-only code and nothing else, which the admin types
 * into the public login page themselves.
 *
 * Short-lived and consumed on first correct guess, looked up by its own
 * value as a KV key — see Store.takePanelCode(). A wrong guess is simply a
 * key nobody wrote, so it touches nothing: not this code, not anyone else's.
 * That is deliberate (see the review note in src/panel/auth.ts's header): an
 * earlier version compared a guess against every currently-live code and
 * charged a miss against all of them, which let one guesser kill *any*
 * admin's fresh code from anywhere on the internet, with no need to know who
 * they were. Guessing is defended entirely by the login endpoint's rate
 * limit now (src/web/login.ts), not by anything carried on this record.
 */
export interface PanelCode {
  code: string;
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
  /** Newest first. Used by /export, and nothing else — a screen must page
   *  instead (see listIncidentsPage), so this whole-log read never grows
   *  into how the History screen loads. */
  listIncidents(): Promise<Incident[]>;
  /**
   * A bounded, newest-first read for the History screen (spec 2026-07-27
   * §6). Built on the same day-index reverse scan listIncidents() already
   * does, but stops after `limit` rather than loading everything and
   * slicing in memory — a screen's page size is what decides how much work
   * a request does. `cursor` is null for the first page and otherwise
   * exactly what the previous call returned as `nextCursor`; its shape is a
   * backend implementation detail (KvStore and MemoryStore encode it
   * differently) and must never be constructed by a caller, only replayed.
   *
   * A cursor is a *position*, not a promise that the row it names still
   * exists — one naming an incident retention has since deleted must still
   * resume cleanly from that point, exactly as a real page boundary would.
   * A cursor that cannot be interpreted at all — garbage, truncated, or one
   * shaped for the other backend — is a different case and rejected:
   * rejects with InvalidCursorError rather than quietly resetting to page
   * one, which would hand back the top of the log with no signal that
   * anything was wrong.
   *
   * The invariant every backend must honour: listIncidentsPage either
   * returns a page continuing from that position, or throws
   * InvalidCursorError. It must never silently restart from the beginning.
   * That does NOT mean both backends throw on identical inputs — KvStore's
   * cursor is Deno KV's own opaque list cursor and can legitimately decode a
   * string MemoryStore, which only recognises cursors it tagged itself, has
   * no way to recognise (and vice versa). Either answer is fine as long as
   * it isn't a silent restart; see tests/store_test.ts for the class of
   * inputs this must hold for.
   */
  listIncidentsPage(limit: number, cursor: string | null): Promise<IncidentPage>;
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

  // ── Public profile (presentation only — see VillageProfile's own doc
  //    above; nothing on the alert path may call either of these) ──
  /**
   * Never null: emptyVillageProfile() when nothing has ever been written,
   * which is a valid state, not a missing one. May reject if the underlying
   * read fails (e.g. KV unavailable) — that is the one failure the config
   * screen (and only the config screen) must show.
   */
  getVillageProfile(): Promise<VillageProfile>;
  /** Replaces the single row wholesale. Last write wins; no history. */
  putVillageProfile(profile: VillageProfile): Promise<void>;

  // ── Panel login codes (spec 2026-07-27 §5; replaces panel links) ──
  /**
   * Mint a code for an admin, superseding any code already outstanding for
   * them (A6) as part of the same write — there is never a moment with two
   * live codes for one admin.
   */
  putPanelCode(entry: PanelCode): Promise<void>;
  /**
   * Consume a code atomically: looks it up by its own value (a plain KV get,
   * not a scan or a comparison — see PanelCode's own doc for why that
   * matters), returning it and deleting it in one step so two requests
   * racing the same correct code cannot both open a session. A code that
   * doesn't exist — wrong, expired-and-purged, already used, or superseded
   * — returns null, identically to a code that was never issued at all.
   */
  takePanelCode(code: string, now: Date): Promise<PanelCode | null>;

  // ── Login rate limiting (spec 2026-07-27 §5.2) ──
  /**
   * Bump a fixed-window counter for `key` and return the count after
   * bumping. Atomic under concurrency: a lost race retries against the
   * fresh value rather than silently dropping the increment, and a caller
   * that cannot land a write after retrying gets back a count guaranteed to
   * read as over any real limit (fail closed, never fire-and-forget). The
   * window is anchored to wall-clock time, not to any code's lifecycle —
   * asking the bot for a new code does not reset it ("survives across
   * codes"). src/web/login.ts uses one fixed key for the whole deployment,
   * not one per caller — see its own comment for why.
   */
  bumpRateLimit(key: string, windowMs: number, now: Date): Promise<number>;

  // ── Panel sessions ──
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
