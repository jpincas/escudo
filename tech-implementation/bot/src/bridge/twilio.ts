// The Twilio bridge. NOT the supplier in Bercianos — see ./zadarma.ts.
//
// Kept, working and tested, because the reason it was abandoned is geographic
// rather than technical (tech-spec §3): Twilio sells no Spanish number that can
// receive an SMS, and a foreign number cannot receive the call because Orange
// bars international dialling by default. Neither is true everywhere. A village
// in a country where Twilio sells a mobile number with inbound SMS gets both
// doors from this file and no new code.
//
// Where it differs from Zadarma: two paths rather than one, form posts rather
// than JSON, a signature over the URL plus every parameter, and a call that is
// rejected rather than answered — <Reject/> must stay the first TwiML verb or
// Twilio answers the call and bills for it.
//
// The rule and everything downstream of it live in ./inbound.ts.

import { handleInbound, type InboundDeps } from "./inbound.ts";
import type { BridgeChannel } from "../store/types.ts";

// The alert-raising logic moved to ./inbound.ts when Zadarma became the
// supplier — two bridges, one copy of the path that matters. Re-exported here
// because these are what the tests and the rest of the app already import.
export { isLowBattery, parseLocation, pickCategory } from "./inbound.ts";

export const VOICE_PATH = "/bridge/voice";
export const SMS_PATH = "/bridge/sms";

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

export interface BridgeDeps extends InboundDeps {
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
      await handleInbound(deps, now(), {
        channel,
        from: params.From ?? "",
        body: channel === "sms" ? (params.Body ?? null) : null,
      });
    } catch (err) {
      console.error(`Bridge: ${channel} from ${params.From} failed`, err);
    }
    return twiml(channel, 200);
  };
}

/**
 * The TwiML reply.
 *
 * For a call, <Reject> must be the first verb: Twilio's documentation is
 * explicit that any other response answers the call, which both bills the
 * village per minute and leaves the caller listening to silence.
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
