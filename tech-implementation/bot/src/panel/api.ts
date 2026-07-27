// The admin panel's HTTP API.
//
// Mounted under /api and used only by the SPA in panel/. Deliberately separate
// from everything on the alert path: no handler here is reachable from Telegram
// or from the bridge, and nothing here is imported by src/alerts.ts. A panel
// route failing must never be able to stop an alarm being raised.
//
// Every route except the link exchange requires a session cookie. Authority
// comes from having been an admin at the moment the link was minted; see auth.ts.

import { Hono } from "hono";
import { z } from "zod";
import type { Config } from "../config.ts";
import type { Device, DeviceKind, PanelSession, Store } from "../store/types.ts";
import { clearedCookie, exchangeLink, sessionCookie, tokenFromCookies } from "./auth.ts";
import type { AlertService } from "../alerts.ts";
import { DEFAULT_CATEGORY } from "../bridge/inbound.ts";
import { formatAlert } from "../format.ts";
import { MSISDN, normaliseMsisdn } from "../msisdn.ts";

/**
 * Panel copy lives here rather than in src/i18n, which types every string the
 * *bot* can say to the village. These are operator-facing messages in a tool
 * only admins ever open; keeping them out avoids growing that interface — and
 * its "a half-translated locale fails deno check" guarantee — with strings the
 * village will never see.
 */
const MESSAGES = {
  es: {
    unauthorized: "Sesión caducada. Pide un enlace nuevo al bot con /panel.",
    badLink: "Este enlace ya se ha usado o ha caducado. Pide otro con /panel.",
    badMsisdn: "El teléfono debe estar en formato internacional, por ejemplo +34600111222.",
    duplicate: "Ese número ya está registrado.",
    notFound: "No existe ningún dispositivo con ese número.",
    invalid: "Faltan datos o no son válidos.",
    simulateUnavailable: "Las alertas de prueba no están disponibles en esta instalación.",
  },
  en: {
    unauthorized: "Session expired. Ask the bot for a new link with /panel.",
    badLink: "That link has already been used or has expired. Ask for another with /panel.",
    badMsisdn: "The phone number must be in international format, e.g. +34600111222.",
    duplicate: "That number is already registered.",
    notFound: "No device is registered with that number.",
    invalid: "Something is missing or invalid.",
    simulateUnavailable: "Test alerts are not available in this deployment.",
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

  api.post("/session/exchange", async (c) => {
    const body = await c.req.json().catch(() => null);
    const token = z.object({ token: z.string().min(1) }).safeParse(body);
    // `locale` on a 401 here is not sensitive — it's how the panel's
    // signed-out screen knows which language to use before any session
    // exists (spec 2.3). See panel/src/api/client.ts's SessionResult.
    if (!token.success) {
      return c.json({ error: m.badLink, locale: config.village.locale }, 401);
    }

    const session = await exchangeLink(store, token.data.token);
    if (!session) return c.json({ error: m.badLink, locale: config.village.locale }, 401);

    c.header("set-cookie", sessionCookie(session.token, isSecure(c.req.url)));
    return c.json({
      telegramId: session.telegramId,
      name: session.name,
      village: config.village.name,
      locale: config.village.locale,
    });
  });

  // Everything below this point needs a session.
  api.use("*", async (c, next) => {
    if (c.req.path.endsWith("/session/exchange")) return await next();

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

    const msisdn = normaliseMsisdn(parsed.data.msisdn);
    if (!MSISDN.test(msisdn)) return c.json({ error: m.badMsisdn }, 400);

    // The number is the key, and re-registering one would silently repoint a
    // household's alarm at a different address.
    if (await store.getDevice(msisdn)) return c.json({ error: m.duplicate }, 400);

    const device: Device = {
      msisdn,
      label: parsed.data.label,
      address: parsed.data.address,
      kind: parsed.data.kind as DeviceKind,
      lastProvenAt: null,
      registeredAt: new Date().toISOString(),
    };
    await store.putDevice(device);
    return c.json(view(device), 201);
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

  return api;
}
