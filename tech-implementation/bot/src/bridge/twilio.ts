// The bridge: a phone call or an SMS becomes a village alarm.
//
// Twilio holds a Spanish number. Anything arriving at it is POSTed here, and
// the rule is deliberately blunt (tech-spec §3):
//
//   ANY contact from a registered number is an alarm.
//
// Not "a message that parses as an alarm". Devices phrase things differently,
// firmware changes without warning, and a pendant that starts sending "SOS ALM
// 01" instead of "EMERGENCIA" must not go quiet. Parsing happens only to
// enrich — a lat/lon becomes a map pin, a named category refines the heading —
// and never to decide.
//
// The call is the primary door and it is never answered. <Reject/> as the first
// TwiML verb means Twilio releases the call before answer, so neither the
// village nor the caller is billed, and an elder with a dumbphone raises the
// alarm with one speed-dial key. The SMS carries the extras.
//
// Both arrive at once from most devices; raiseAlert()'s dedupe window collapses
// them into one incident, and the SMS's location attaches to the alert the call
// already raised.

import type { AlertService } from "../alerts.ts";
import type { Config } from "../config.ts";
import { MSISDN, normaliseMsisdn } from "../msisdn.ts";
import type { BridgeChannel, Store } from "../store/types.ts";

/** Where a bridge message goes when it isn't for the village. */
export interface AdminChannel {
  /** Plain text, no parse mode. Never seen by the group. */
  notify(text: string): Promise<void>;
}

export const VOICE_PATH = "/bridge/voice";
export const SMS_PATH = "/bridge/sms";

/**
 * Raised when no category can be inferred. A device press says "help", not
 * "help, and it's a fire" — one button cannot carry a category, and guessing
 * one would send responders looking for the wrong emergency.
 */
const DEFAULT_CATEGORY = "emergencia";

/**
 * The one exception to "never parse to decide".
 *
 * Several devices send a low-battery SMS. Under the blunt rule that is a
 * village-wide siren at three in the morning, which teaches people to mute the
 * group — the single worst outcome in this system. These go to the coordinator
 * instead.
 *
 * Kept short and literal on purpose. Anything unrecognised still raises the
 * alarm: erring towards waking people is the safe direction, and a false alarm
 * costs far less than a missed one.
 */
const LOW_BATTERY = [
  /bater[ií]a\s*baja/i,
  /low\s*batt/i,
  /batt(?:ery)?\s*low/i,
  /\bbat\.?\s*(?:low|baja)\b/i,
  /pila\s*baja/i,
];

export function isLowBattery(body: string | null): boolean {
  if (!body) return false;
  return LOW_BATTERY.some((pattern) => pattern.test(body));
}

/**
 * Pull a position out of an SMS body.
 *
 * Devices send this three ways: a bare pair, a labelled pair, or a maps link.
 * All three end up as two decimal numbers, so one pattern covers them — with a
 * decimal point required on both, which is what stops a phone number or a
 * device serial being read as a coordinate.
 */
export function parseLocation(body: string | null): { lat: number; lon: number } | null {
  if (!body) return null;

  // Ordered most specific first. A maps URL usually also carries a zoom level
  // and sometimes a place id, either of which the looser patterns would happily
  // read as half a coordinate.
  const query = body.match(/[?&]q=(-?\d{1,3}\.\d+)[,%2C\s]+(-?\d{1,3}\.\d+)/i) ??
    body.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/) ??
    body.match(/lat\w*\s*[:=]?\s*(-?\d{1,3}\.\d+)\D{0,12}?(-?\d{1,3}\.\d+)/i) ??
    body.match(/(-?\d{1,3}\.\d+)\s*[,;]\s*(-?\d{1,3}\.\d+)/);
  if (!query) return null;

  const lat = Number(query[1]);
  const lon = Number(query[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/**
 * If the message happens to name a category, use it; otherwise don't be clever.
 *
 * Quiet categories are deliberately not matchable. A device has one button and
 * no way to mean "this isn't urgent", so a body that happens to contain the
 * word *ayuda* must not silence an alarm nobody can hear.
 */
export function pickCategory(config: Config, body: string | null): string {
  if (!body) return DEFAULT_CATEGORY;
  const haystack = body.toLowerCase();
  const named = config.categories.find((c) =>
    c.urgency !== "quiet" &&
    new RegExp(`\\b${c.id.toLowerCase()}\\b`).test(haystack)
  );
  return named?.id ?? DEFAULT_CATEGORY;
}

/**
 * Verify Twilio signed this request.
 *
 * The scheme (documented by Twilio): HMAC-SHA1 over the exact URL Twilio was
 * configured with, followed by every POST parameter appended as key then value
 * in alphabetical order, keyed by the account's auth token.
 *
 * The URL is rebuilt from the configured public base rather than taken from the
 * incoming request. Behind Deploy's proxy the request's own host and scheme are
 * not what Twilio signed, and using them is the classic way to end up with a
 * bridge that rejects every genuine call.
 */
export async function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | null,
): Promise<boolean> {
  if (!signature) return false;

  const payload = Object.keys(params).sort().reduce(
    (acc, key) => acc + key + params[key],
    url,
  );

  let provided: Uint8Array<ArrayBuffer>;
  try {
    const raw = atob(signature);
    provided = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) provided[i] = raw.charCodeAt(i);
  } catch {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["verify"],
  );
  // subtle.verify rather than comparing base64 strings: it compares in constant
  // time, which is the whole reason this check is worth anything.
  return await crypto.subtle.verify(
    "HMAC",
    key,
    provided,
    new TextEncoder().encode(payload),
  );
}

export interface BridgeDeps {
  config: Config;
  store: Store;
  alerts: AlertService;
  admin: AdminChannel;
  /** Twilio account auth token. Without it the bridge refuses to run at all. */
  authToken: string;
  /** Base URL Twilio was configured with, e.g. https://escudo-bot.deno.net */
  publicUrl: string;
  /** Injectable for tests; production passes nothing. */
  now?: () => Date;
}

/**
 * A request handler for the two Twilio webhooks.
 *
 * Returns null for any path that isn't ours, so the caller can fall through to
 * the rest of the app. Deliberately a bare fetch handler rather than a Hono
 * router: this is the alert path, and it shares no code with the panel.
 */
export function createBridge(
  deps: BridgeDeps,
): (req: Request, url: URL) => Promise<Response | null> {
  const now = deps.now ?? (() => new Date());

  return async function handle(req: Request, url: URL): Promise<Response | null> {
    const channel: BridgeChannel | null = url.pathname === VOICE_PATH
      ? "call"
      : url.pathname === SMS_PATH
      ? "sms"
      : null;
    if (channel === null) return null;
    if (req.method !== "POST") return twiml(channel, 405);

    let params: Record<string, string>;
    try {
      params = Object.fromEntries(
        [...(await req.formData()).entries()].map(([k, v]) => [k, String(v)]),
      );
    } catch {
      return twiml(channel, 400);
    }

    const signed = await verifyTwilioSignature(
      deps.authToken,
      deps.publicUrl.replace(/\/$/, "") + url.pathname,
      params,
      req.headers.get("x-twilio-signature"),
    );
    if (!signed) {
      console.warn(`Bridge: rejected an unsigned ${channel} on ${url.pathname}`);
      return twiml(channel, 403);
    }

    // Everything past this point is authenticated, so a failure here is our bug
    // and not an attack. Answer Twilio regardless — retrying a voice webhook
    // gets the caller a Twilio error, not a second chance at the alarm.
    try {
      await route(deps, now(), channel, params);
    } catch (err) {
      console.error(`Bridge: ${channel} from ${params.From} failed`, err);
      await deps.admin.notify(
        `⚠️ El puente recibió un aviso de ${params.From ?? "?"} y no pudo darle curso. ` +
          `Comprueba el grupo y llama a esa persona.`,
      ).catch(() => {});
    }
    return twiml(channel, 200);
  };
}

async function route(
  deps: BridgeDeps,
  at: Date,
  channel: BridgeChannel,
  params: Record<string, string>,
): Promise<void> {
  const from = normaliseMsisdn(params.From ?? "");
  const body = channel === "sms" ? (params.Body ?? null) : null;

  if (!MSISDN.test(from)) {
    console.warn(`Bridge: ${channel} with an unusable From "${params.From}"`);
    return;
  }

  const device = await deps.store.getDevice(from);

  // An unregistered number never reaches the group — otherwise the alarm is
  // raisable by anyone who guesses the number — but it is never dropped either.
  // It lands in the panel inbox, which is how a household actually joins:
  // someone presses the new pendant in the kitchen and the coordinator names
  // the number that appears.
  if (!device) {
    await deps.store.noteInbound(from, channel, body, at);
    await deps.admin.notify(
      `📥 Número sin registrar en el puente: ${from} (${channel === "call" ? "llamada" : "SMS"})` +
        (body ? `\n${body.slice(0, 200)}` : "") +
        `\n\nSi es un aparato nuevo, regístralo en el panel.`,
    );
    return;
  }

  // Proof of life. This is the only evidence the system will ever get that a
  // shop-bought device still works — they send no heartbeat and no telemetry —
  // so it is recorded for a low-battery SMS too: that message travelled the
  // whole path, which is exactly what a test is trying to establish.
  await deps.store.putDevice({ ...device, lastProvenAt: at.toISOString() });

  if (isLowBattery(body)) {
    await deps.admin.notify(
      `🔋 Batería baja: ${device.label} (${device.address}).\n` +
        `Mensaje del aparato: ${body?.slice(0, 200)}`,
    );
    return;
  }

  const result = await deps.alerts.raiseAlert({
    source: "device",
    category: pickCategory(deps.config, body),
    reporterRef: from,
    reporterName: device.label,
    reporterAddress: device.address,
  });

  // A GPS pendant's SMS usually lands a second behind its call, so this often
  // attaches to an incident the call already raised. That is the intended
  // shape: the pin refines the address, it doesn't replace it.
  const position = parseLocation(body);
  if (position) {
    await deps.alerts.attachLocation(result.incident.id, position.lat, position.lon);
  }
}

/**
 * The TwiML reply.
 *
 * For a call, <Reject> must be the first verb: Twilio's documentation is
 * explicit that any other response answers the call, which both bills the
 * village per minute and leaves the caller listening to silence instead of
 * hearing the reassuring ring-out that tells them it went through.
 */
function twiml(channel: BridgeChannel, status: number): Response {
  const body = channel === "call"
    ? '<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="busy"/></Response>'
    : '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  return new Response(body, {
    status,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}
