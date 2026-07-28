// The admin panel's HTTP API.
//
// Mounted under /api and used only by the SPA in panel/. Deliberately separate
// from everything on the alert path: no handler here is reachable from Telegram
// or from the bridge, and nothing here is imported by src/alerts.ts. A panel
// route failing must never be able to stop an alarm being raised.
//
// Every route requires a session cookie. Authority comes from having been an
// admin at the moment the login code was minted and redeemed; see auth.ts
// and src/web/login.ts (the code redemption itself lives outside /api, at
// POST /panel, since it's a plain browser form submission, not JSON).

import { Hono } from "hono";
import { z } from "zod";
import type { Config } from "../config.ts";
import type {
  Device,
  DeviceKind,
  Incident,
  IncidentSource,
  PanelSession,
  ResponsiblePerson,
  Store,
  VillageProfile,
} from "../store/types.ts";
import { InvalidCursorError } from "../store/types.ts";
import { clearedCookie, tokenFromCookies } from "./auth.ts";
import type { AlertService } from "../alerts.ts";
import { DEFAULT_CATEGORY } from "../bridge/inbound.ts";
import { formatAlert, resolveCategory } from "../format.ts";
import { MSISDN, normaliseMsisdn } from "../msisdn.ts";
import { INBOX_RETENTION_DAYS } from "../jobs/retention.ts";

/**
 * Panel copy lives here rather than in src/i18n, which types every string the
 * *bot* can say to the village. These are operator-facing messages in a tool
 * only admins ever open; keeping them out avoids growing that interface — and
 * its "a half-translated locale fails deno check" guarantee — with strings the
 * village will never see.
 */
const MESSAGES = {
  es: {
    unauthorized: "Sesión caducada. Pide un código nuevo al bot con /panel.",
    badMsisdn: "El teléfono debe estar en formato internacional, por ejemplo +34600111222.",
    duplicate: "Ese número ya está registrado.",
    notFound: "No existe ningún dispositivo con ese número.",
    inboxNotFound: "Esa entrada ya no está en la bandeja de entrada.",
    invalid: "Faltan datos o no son válidos.",
    simulateUnavailable: "Las alertas de prueba no están disponibles en esta instalación.",
    badPhotoUrl: "La URL de la foto debe empezar por https://.",
    photoUrlTooLong: "La URL de la foto es demasiado larga (máximo 2000 caracteres).",
    introTextTooLong: "El texto de presentación es demasiado largo (máximo 2000 caracteres).",
    personNameRequired: "Cada persona responsable necesita un nombre.",
    personNameTooLong: "El nombre es demasiado largo (máximo 200 caracteres).",
    personRoleRequired: "Cada persona responsable necesita una función.",
    personRoleTooLong: "La función es demasiado larga (máximo 200 caracteres).",
    tooManyResponsiblePeople: "Se pueden añadir como máximo 50 personas responsables.",
    profileUnavailable: "No se ha podido leer la configuración pública. Inténtalo de nuevo.",
    profileWriteFailed: "No se ha podido guardar la configuración pública. Inténtalo de nuevo.",
  },
  en: {
    unauthorized: "Session expired. Ask the bot for a new code with /panel.",
    badMsisdn: "The phone number must be in international format, e.g. +34600111222.",
    duplicate: "That number is already registered.",
    notFound: "No device is registered with that number.",
    inboxNotFound: "That entry is no longer in the inbox.",
    invalid: "Something is missing or invalid.",
    simulateUnavailable: "Test alerts are not available in this deployment.",
    badPhotoUrl: "The photo URL must start with https://.",
    photoUrlTooLong: "The photo URL is too long (2000 characters maximum).",
    introTextTooLong: "The intro text is too long (2000 characters maximum).",
    personNameRequired: "Every responsible person needs a name.",
    personNameTooLong: "The name is too long (200 characters maximum).",
    personRoleRequired: "Every responsible person needs a role.",
    personRoleTooLong: "The role is too long (200 characters maximum).",
    tooManyResponsiblePeople: "At most 50 responsible people can be added.",
    profileUnavailable: "Could not read the public config. Try again.",
    profileWriteFailed: "Could not save the public config. Try again.",
  },
} as const;

const KINDS = ["base", "wearable", "phone", "alarm", "other"] as const;

const simulateSchema = z.object({
  category: z.string().optional(),
  preview: z.boolean().optional(),
});

const CreateDevice = z.object({
  msisdn: z.string().trim(),
  label: z.string().trim().min(1),
  address: z.string().trim().min(1),
  kind: z.enum(KINDS),
});

const UpdateDevice = z.object({
  label: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  kind: z.enum(KINDS).optional(),
});

// Same required fields as CreateDevice, minus msisdn — that comes from the
// inbox entry being registered (the URL param), not the body, so there is
// exactly one place a household's number is typed in by hand: the plain
// "Add device" form.
const RegisterFromInbox = z.object({
  label: z.string().trim().min(1),
  address: z.string().trim().min(1),
  kind: z.enum(KINDS),
});

// The village profile is written as one row, not patched field by field
// (spec 3.2: "no history, last write wins"): the form always holds the
// current value of every field, so a save always sends the whole thing. An
// empty string means "not set" for the three scalar fields — the schema only
// checks shape here; emptiness and format are decided below, field by field,
// so a rejected edit can say exactly which one was wrong.
const WriteVillageProfile = z.object({
  escudoPhone: z.string(),
  photoUrl: z.string(),
  introText: z.string(),
  responsiblePeople: z.array(z.object({ name: z.string(), role: z.string() })),
});

// Sensible bounds, checked field by field like everything else here (a
// field-named 400, not a bare 500 from Deno KV's 64 KiB value cap — the
// whole record, phone/photo/intro/people together, has to fit in one entry).
const MAX_PHOTO_URL_LENGTH = 2000;
const MAX_INTRO_TEXT_LENGTH = 2000;
const MAX_PERSON_NAME_LENGTH = 200;
const MAX_PERSON_ROLE_LENGTH = 200;
const MAX_RESPONSIBLE_PEOPLE = 50;

export type DeviceStatus = "ok" | "overdue" | "never";

/**
 * How a device looks to the panel: the stored record plus the one derived thing
 * a coordinator is actually scanning the table for.
 */
export interface DeviceView extends Device {
  status: DeviceStatus;
}

/**
 * A device is only as trustworthy as its last proof. Never proven is called out
 * separately from merely overdue: one is an install that was never finished,
 * the other is a routine that has slipped, and they need different actions.
 */
export function deviceStatus(
  device: Device,
  proveWithinDays: number,
  now: Date = new Date(),
): DeviceStatus {
  if (!device.lastProvenAt) return "never";
  const ageDays = (now.getTime() - new Date(device.lastProvenAt).getTime()) / 86_400_000;
  return ageDays > proveWithinDays ? "overdue" : "ok";
}

/**
 * The one place a Device record is created. Both POST /devices (adding one by
 * hand) and POST /inbox/:msisdn/register (spec 2026-07-27 §7.2) call this and
 * nothing else — the inbox route does not repeat the normalise → validate →
 * duplicate-check → put sequence itself, because a second copy of that
 * sequence is exactly how a duplicate check gets bypassed by accident later.
 * Re-registering an existing number would silently repoint a household's
 * alarm at a different address (spec's "must not happen"), so this is the one
 * function ever allowed to decide that question.
 */
async function registerDevice(
  store: Store,
  input: { msisdn: string; label: string; address: string; kind: DeviceKind },
): Promise<
  { ok: true; device: Device } | { ok: false; reason: "badMsisdn" | "duplicate" }
> {
  const msisdn = normaliseMsisdn(input.msisdn);
  if (!MSISDN.test(msisdn)) return { ok: false, reason: "badMsisdn" };
  if (await store.getDevice(msisdn)) return { ok: false, reason: "duplicate" };

  const device: Device = {
    msisdn,
    label: input.label,
    address: input.address,
    kind: input.kind,
    lastProvenAt: null,
    registeredAt: new Date().toISOString(),
  };
  await store.putDevice(device);
  return { ok: true, device };
}

// ── History (spec 2026-07-27 §6) ──
//
// A read over the incident log that already exists — see Incident's own doc
// in src/store/types.ts. Not a filter, not an export: a bounded, paged view
// for the screen, built on Store.listIncidentsPage so a page never costs a
// whole-log read.

/** Fixed, not client-controlled — there is nothing here for a village to
 *  tune, and a client-chosen page size is the door listIncidents() being
 *  called per-screen-load would otherwise open. */
const HISTORY_PAGE_SIZE = 20;

const ListIncidentsQuery = z.object({ cursor: z.string().optional() });

/**
 * What the History screen shows for one incident. Two different rules for
 * two different columns, both required by spec §6.1:
 *   - reporterName/reporterAddress/reporterKind/lat/lon/simulatedBy/
 *     cancelledAt are carried through unchanged — these are the values
 *     snapshotted on the incident at the time, and must not be re-derived
 *     from today's registry (Incident's own doc explains why).
 *   - categoryEmoji/categoryLabel are resolved against the *live* config,
 *     because spec calls for "the configured emoji and label", not what a
 *     stale category id said when the alert was raised.
 */
export interface IncidentView {
  id: string;
  createdAt: string;
  source: IncidentSource;
  categoryId: string;
  categoryEmoji: string;
  categoryLabel: string;
  reporterName: string;
  reporterAddress: string | null;
  reporterKind: DeviceKind | null;
  lat: number | null;
  lon: number | null;
  simulatedBy: string | null;
  cancelledAt: string | null;
}

function incidentView(config: Config, incident: Incident): IncidentView {
  const { emoji, label } = resolveCategory(config, incident.category);
  return {
    id: incident.id,
    createdAt: incident.createdAt,
    source: incident.source,
    categoryId: incident.category,
    categoryEmoji: emoji,
    categoryLabel: label,
    reporterName: incident.reporterName,
    reporterAddress: incident.reporterAddress,
    reporterKind: incident.reporterKind,
    lat: incident.lat,
    lon: incident.lon,
    simulatedBy: incident.simulatedBy,
    cancelledAt: incident.cancelledAt,
  };
}

/** The session the auth middleware puts on every request below it. */
type PanelEnv = { Variables: { session: PanelSession } };

/**
 * What the panel needs beyond storage in order to raise a real alarm.
 *
 * Optional because nothing else in the panel needs it: unwired, the simulate
 * route answers 503 rather than the panel failing to start.
 */
export interface PanelDeps {
  alerts?: AlertService;
}

export function createPanelApi(
  config: Config,
  store: Store,
  deps?: PanelDeps,
): Hono<PanelEnv> {
  const api = new Hono<PanelEnv>();
  const m = MESSAGES[config.village.locale];

  const view = (device: Device): DeviceView => ({
    ...device,
    status: deviceStatus(device, config.devices.proveWithinDays),
  });

  const isSecure = (url: string) => new URL(url).protocol === "https:";

  // ── Session ──
  //
  // No exchange route here any more (spec 2026-07-27 §5): the token-in-a-URL
  // flow is gone, and what replaces it — redeeming a code typed into the
  // public login page — lives outside /api entirely, at POST /panel (see
  // main.ts and src/web/login.ts). Every route below needs a session; there
  // is no longer an unauthenticated one to carve out of the gate.

  api.use("*", async (c, next) => {
    const token = tokenFromCookies(c.req.header("cookie") ?? null);
    const session = token ? await store.getSession(token) : null;
    if (!session) return c.json({ error: m.unauthorized, locale: config.village.locale }, 401);

    c.set("session", session);
    await next();
  });

  api.get("/session", (c) => {
    const session = c.get("session");
    return c.json({
      telegramId: session.telegramId,
      name: session.name,
      village: config.village.name,
      locale: config.village.locale,
      // Both village policy, like locale above — not sensitive, and the
      // History screen (§6) needs them to render times in the village's own
      // clock and to say honestly how far back the log reaches.
      timezone: config.village.timezone,
      retentionDays: config.data.retentionDays,
      // Deliberately the constant, not a config field (spec §7.3: "use
      // INBOX_RETENTION_DAYS, don't hardcode") — this window isn't a village
      // policy choice the way incident retention is, so there is nothing to
      // configure and nothing here to read config.data for.
      inboxRetentionDays: INBOX_RETENTION_DAYS,
    });
  });

  api.post("/session/logout", async (c) => {
    await store.deleteSession(c.get("session").token);
    c.header("set-cookie", clearedCookie(isSecure(c.req.url)));
    return c.body(null, 204);
  });

  // ── Devices ──

  api.get("/devices", async (c) => {
    const devices = await store.listDevices();
    return c.json(devices.map(view));
  });

  api.post("/devices", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = CreateDevice.safeParse(body);
    if (!parsed.success) return c.json({ error: m.invalid }, 400);

    const result = await registerDevice(store, parsed.data);
    if (!result.ok) {
      return c.json({ error: result.reason === "badMsisdn" ? m.badMsisdn : m.duplicate }, 400);
    }
    return c.json(view(result.device), 201);
  });

  api.patch("/devices/:msisdn", async (c) => {
    const device = await store.getDevice(normaliseMsisdn(c.req.param("msisdn")));
    if (!device) return c.json({ error: m.notFound }, 404);

    const body = await c.req.json().catch(() => null);
    const parsed = UpdateDevice.safeParse(body);
    if (!parsed.success) return c.json({ error: m.invalid }, 400);

    // msisdn is deliberately absent from UpdateDevice: it is the identity of
    // the record. Changing a household's number means removing and re-adding,
    // which is a decision someone should have to make deliberately.
    const updated: Device = { ...device, ...parsed.data };
    await store.putDevice(updated);
    return c.json(view(updated));
  });

  api.delete("/devices/:msisdn", async (c) => {
    const msisdn = normaliseMsisdn(c.req.param("msisdn"));
    if (!await store.getDevice(msisdn)) return c.json({ error: m.notFound }, 404);
    await store.deleteDevice(msisdn);
    return c.body(null, 204);
  });

  // ── Bridge inbox (spec 2026-07-27 §7) ──
  //
  // The gap the memo was reaching for: an unregistered caller has been
  // recorded by src/bridge/inbound.ts all along, but until this section
  // nothing ever read it back. Newest first, exactly as Store.listInbox
  // already orders it — no re-sorting here or in the SPA.

  api.get("/inbox", async (c) => {
    return c.json(await store.listInbox());
  });

  // "Register" from a specific inbox row — the number is the path param
  // (what rang), never part of the body, so there is no way to submit this
  // form against a different number than the one that reached the bridge.
  // Goes through registerDevice(), the exact same validation and duplicate
  // check as POST /devices — see that function's own doc for why this must
  // never be a second, looser copy of that logic.
  api.post("/inbox/:msisdn/register", async (c) => {
    const msisdn = normaliseMsisdn(c.req.param("msisdn"));

    // Consistent with dismiss below: this route only ever acts on a number
    // the bridge actually recorded. Without this, a stale second tab (or a
    // manufactured request) could register a row that was already dismissed
    // or registered elsewhere — a second, unguarded create path alongside
    // the one POST /devices provides (review 2026-07-28, F2).
    const exists = (await store.listInbox()).some((e) => e.msisdn === msisdn);
    if (!exists) return c.json({ error: m.inboxNotFound }, 404);

    const body = await c.req.json().catch(() => null);
    const parsed = RegisterFromInbox.safeParse(body);
    if (!parsed.success) return c.json({ error: m.invalid }, 400);

    const result = await registerDevice(store, { msisdn, ...parsed.data });
    if (!result.ok) {
      return c.json({ error: result.reason === "badMsisdn" ? m.badMsisdn : m.duplicate }, 400);
    }

    // Only removed once the device is safely created: if registerDevice
    // refused (most importantly, the duplicate case), the inbox entry must
    // stay exactly where it was — nothing above this line writes anything.
    await store.deleteInboxEntry(msisdn);
    return c.json(view(result.device), 201);
  });

  // "Dismiss" — a wrong number or a misdial. Removes the row and creates
  // nothing; there is no device write anywhere on this path.
  api.delete("/inbox/:msisdn", async (c) => {
    const msisdn = normaliseMsisdn(c.req.param("msisdn"));
    const exists = (await store.listInbox()).some((e) => e.msisdn === msisdn);
    if (!exists) return c.json({ error: m.inboxNotFound }, 404);
    await store.deleteInboxEntry(msisdn);
    return c.body(null, 204);
  });

  // ── History (spec 2026-07-27 §6) ──

  api.get("/incidents", async (c) => {
    const parsed = ListIncidentsQuery.safeParse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    if (!parsed.success) return c.json({ error: m.invalid }, 400);

    // An absent ?cursor and an empty one mean the same thing — the first
    // page — rather than handing an empty string down to the store as if it
    // were a real, if peculiar, cursor value.
    const cursor = parsed.data.cursor ? parsed.data.cursor : null;

    try {
      const page = await store.listIncidentsPage(HISTORY_PAGE_SIZE, cursor);
      return c.json({
        incidents: page.incidents.map((i) => incidentView(config, i)),
        nextCursor: page.nextCursor,
      });
    } catch (err) {
      // A cursor the store can't interpret — garbage, truncated, or replayed
      // against the wrong backend — is malformed input, same as any other
      // bad field on this API: a defined 400, never a bare 500 (review F1).
      if (err instanceof InvalidCursorError) return c.json({ error: m.invalid }, 400);
      throw err;
    }
  });

  // ── Raising an alert as a device ──
  //
  // What a coordinator needs before a village depends on this: to see the exact
  // message a given household produces, and to watch it arrive on real phones.
  // Guessing from the code is not the same thing, and the first time anyone sees
  // this message should not be the night it matters.
  //
  // Two modes, and the default is the harmless one. `preview` renders the alert
  // and returns it, touching nothing. Without it the alert is real: it posts to
  // the village group, logs an incident, and can be cancelled the ordinary way —
  // which is the only way to test that path too.
  api.post("/devices/:msisdn/simulate", async (c) => {
    if (!deps?.alerts) return c.json({ error: m.simulateUnavailable }, 503);

    const msisdn = normaliseMsisdn(c.req.param("msisdn"));
    const device = await store.getDevice(msisdn);
    if (!device) return c.json({ error: m.notFound }, 404);

    const parsed = simulateSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: m.invalid }, 400);

    const category = parsed.data.category ?? DEFAULT_CATEGORY;
    if (!config.categories.some((x) => x.id === category)) {
      return c.json({ error: m.invalid }, 400);
    }

    // Rendered from a throwaway incident that is never stored. Same function
    // the group message goes through, so what is shown is what would be sent.
    if (parsed.data.preview) {
      return c.json({
        preview: formatAlert(config, {
          id: "preview",
          source: "device",
          category,
          reporterRef: device.msisdn,
          reporterName: device.label,
          reporterAddress: device.address,
          reporterKind: device.kind,
          simulatedBy: c.get("session").name,
          groupMessageId: null,
          lat: null,
          lon: null,
          createdAt: new Date().toISOString(),
          cancelledAt: null,
          cancelledBy: null,
        }),
      });
    }

    const session = c.get("session");
    const result = await deps.alerts.raiseAlert({
      source: "device",
      category,
      reporterRef: device.msisdn,
      reporterName: device.label,
      reporterAddress: device.address,
      reporterKind: device.kind,
      simulatedBy: session.name,
    });

    // The group is not told this was a drill — an alert that announces itself as
    // practice tests nothing about how people react to a real one. What happened
    // is not lost, though: the incident is logged with `simulatedBy`, so the
    // panel's own record shows who ran the drill and when. Cancel it the ordinary
    // way when the test is done.
    //
    // A repeat press inside the dedupe window is reported honestly rather than as
    // a second success: the operator pressed a button and nothing new reached the
    // group, and they need to know which of those happened.
    return c.json({ status: result.status, incident: result.incident });
  });

  // ── Public profile (spec 2026-07-27 §3) ──
  //
  // Presentation only, for the welcome page (§4, not built here) and this
  // editor. See VillageProfile's own doc in src/store/types.ts for the hard
  // rule this section exists under: nothing here may be imported by, or
  // wired into, the alert path. The welcome page reads the record straight
  // off the store — it has no session, so it cannot and must not call
  // these routes.

  const isHttpsUrl = (value: string): boolean => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  };

  api.get("/village-profile", async (c) => {
    // A read failure here must surface as an error on the config screen and
    // nowhere else (spec 3.3) — every other route in this file is unaffected
    // by this one throwing, but a plain 500 would still deny the SPA a body
    // it can show. This is the one place in the API that expects the store
    // to possibly fail and says so in the village's own language.
    try {
      return c.json(await store.getVillageProfile());
    } catch {
      return c.json({ error: m.profileUnavailable }, 500);
    }
  });

  api.put("/village-profile", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = WriteVillageProfile.safeParse(body);
    if (!parsed.success) return c.json({ error: m.invalid }, 400);

    // Validated and normalised field by field, in the order a coordinator
    // fills the form, so a rejected edit says exactly which one was wrong
    // (spec 3.2) and — because nothing is written until every field has
    // passed — the stored record is untouched by a partially-valid submit.

    let escudoPhone: string | null = null;
    const rawPhone = parsed.data.escudoPhone.trim();
    if (rawPhone) {
      const normalised = normaliseMsisdn(rawPhone);
      if (!MSISDN.test(normalised)) {
        return c.json({ error: m.badMsisdn, field: "escudoPhone" }, 400);
      }
      escudoPhone = normalised;
    }

    let photoUrl: string | null = null;
    const rawPhoto = parsed.data.photoUrl.trim();
    if (rawPhoto) {
      if (rawPhoto.length > MAX_PHOTO_URL_LENGTH) {
        return c.json({ error: m.photoUrlTooLong, field: "photoUrl" }, 400);
      }
      if (!isHttpsUrl(rawPhoto)) {
        return c.json({ error: m.badPhotoUrl, field: "photoUrl" }, 400);
      }
      photoUrl = rawPhoto;
    }

    const rawIntro = parsed.data.introText.trim();
    if (rawIntro.length > MAX_INTRO_TEXT_LENGTH) {
      return c.json({ error: m.introTextTooLong, field: "introText" }, 400);
    }
    const introText = rawIntro || null;

    if (parsed.data.responsiblePeople.length > MAX_RESPONSIBLE_PEOPLE) {
      return c.json({ error: m.tooManyResponsiblePeople, field: "responsiblePeople" }, 400);
    }

    const responsiblePeople: ResponsiblePerson[] = [];
    for (let i = 0; i < parsed.data.responsiblePeople.length; i++) {
      const name = parsed.data.responsiblePeople[i].name.trim();
      const role = parsed.data.responsiblePeople[i].role.trim();
      if (!name) {
        return c.json({ error: m.personNameRequired, field: `responsiblePeople.${i}.name` }, 400);
      }
      if (name.length > MAX_PERSON_NAME_LENGTH) {
        return c.json({ error: m.personNameTooLong, field: `responsiblePeople.${i}.name` }, 400);
      }
      if (!role) {
        return c.json({ error: m.personRoleRequired, field: `responsiblePeople.${i}.role` }, 400);
      }
      if (role.length > MAX_PERSON_ROLE_LENGTH) {
        return c.json({ error: m.personRoleTooLong, field: `responsiblePeople.${i}.role` }, 400);
      }
      responsiblePeople.push({ name, role });
    }

    const profile: VillageProfile = { escudoPhone, photoUrl, introText, responsiblePeople };
    // Wrapped like the GET route: a KV write can fail (e.g. the 64 KiB value
    // cap, or the store being briefly unavailable), and that must surface as
    // a JSON error the config screen can show — not a bare, unlabelled 500.
    try {
      await store.putVillageProfile(profile);
    } catch {
      return c.json({ error: m.profileWriteFailed }, 500);
    }
    return c.json(profile);
  });

  return api;
}
