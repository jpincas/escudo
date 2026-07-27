// The bridge: a phone call to the village's León number becomes a village alarm.
//
// Zadarma holds the number (+34, geographic, in the cloud — no SIM, no radio,
// no hardware in the village; tech-spec §3). It POSTs here the moment a call
// arrives and the rule is deliberately blunt:
//
//   ANY call from a registered number is an alarm.
//
// Two things about the timing matter more than anything else in this file.
//
// NOTIFY_START fires at *ring*, not at answer. So the alert is raised while the
// phone is still ringing, and it survives the caller panicking and hanging up
// after two rings, the audio path failing, or the recording being missing. The
// alarm never waits on the answer.
//
// The answer then happens, and only afterwards. The reply to NOTIFY_START tells
// Zadarma to play a recording and hang up — "aviso recibido, viene ayuda" — so
// a frightened person on the floor hears that it worked instead of a ring-out
// tone that tells them nothing. If that reply were lost the alarm would still
// have gone; that ordering is the whole design.

import { handleInbound, type InboundDeps } from "./inbound.ts";

export const VOICE_PATH = "/bridge/voice";

/** The only event we act on. The rest of Zadarma's callbacks are ignored. */
const EVENT_START = "NOTIFY_START";

/**
 * Zadarma sends notifications from this range only.
 *
 * A cheap second lock, independent of the secret: a leaked key is useless from
 * the wrong address, and a misconfigured URL pointed at us by somebody else's
 * PBX never gets as far as the signature check.
 */
const ALLOWED_PREFIXES = ["185.45.152.", "185.45.153.", "185.45.154.", "185.45.155."];

export interface ZadarmaDeps extends InboundDeps {
  /**
   * Zadarma account secret. The same value that signs API calls also signs
   * these webhooks. Without it the bridge refuses to run at all.
   */
  apiSecret: string;
  /**
   * Id of the uploaded recording played back to the caller, from Zadarma's
   * PBX audio library. Unset means the call is simply hung up — the alarm is
   * unaffected, the caller just hears nothing.
   */
  ivrPlayId?: string;
  /** Trust the caller's IP claim only when we know the proxy sets it. */
  checkSourceIp?: boolean;
  /** Injectable for tests; production passes nothing. */
  now?: () => Date;
}

/**
 * Verify Zadarma signed this notification.
 *
 * Their scheme, from the reference implementation
 * (`Client::encodeSignature`, zadarma/user-api-v1): an HMAC-SHA1 over a
 * per-event string, keyed with the account secret, compared against the
 * `Signature` header. For NOTIFY_START that string is caller_id + called_did +
 * call_start, concatenated with no separator.
 *
 * **The digest is hex-encoded before it is base64'd.** PHP's `hash_hmac()`
 * returns lowercase hexits unless asked for binary, and Zadarma's library never
 * asks — so `base64_encode(hash_hmac(...))` is base64 over 40 ASCII characters,
 * not over the 20 raw bytes. Signing the bytes produces a completely different
 * string and fails every genuine call. Their own docs say only "SHA1, then
 * base64", which reads like the binary form; the library is what the server
 * actually matches.
 *
 * Note this signs the call's identity, not the whole body — so it proves the
 * caller and the time were not tampered with, which is exactly what the alarm
 * depends on.
 */
export async function verifyZadarmaSignature(
  apiSecret: string,
  signatureString: string,
  signature: string | null,
): Promise<boolean> {
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiSecret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signatureString),
  );
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(btoa(hex), signature);
}

/**
 * Compare without giving away how far the comparison got.
 *
 * The encoded signature is a fixed length, so returning early on a length
 * mismatch leaks nothing an attacker could not work out from the scheme.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Zadarma's signature covers these three fields, in this order. */
export function startSignatureString(params: Record<string, string>): string {
  return (params.caller_id ?? "") + (params.called_did ?? "") + (params.call_start ?? "");
}

function sourceIpAllowed(req: Request): boolean {
  // Deploy puts the real client first in x-forwarded-for.
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!forwarded) return false;
  return ALLOWED_PREFIXES.some((prefix) => forwarded.startsWith(prefix));
}

/**
 * What the proxy actually told us, for the log line.
 *
 * A refusal here means no alarm, so "outside the range" on its own is not
 * enough to act on: the whole question is *which* address arrived, and whether
 * the header was there at all.
 */
function sourceIpSeen(req: Request): string {
  return req.headers.get("x-forwarded-for") ?? "(no x-forwarded-for header)";
}

/**
 * A request handler for the Zadarma webhook.
 *
 * Returns null for any path that isn't ours, so the caller can fall through to
 * the rest of the app. Deliberately a bare fetch handler rather than a Hono
 * router: this is the alert path, and it shares no code with the panel.
 */
export function createZadarmaBridge(
  deps: ZadarmaDeps,
): (req: Request, url: URL) => Promise<Response | null> {
  const now = deps.now ?? (() => new Date());

  return async function handle(req: Request, url: URL): Promise<Response | null> {
    if (url.pathname !== VOICE_PATH) return null;

    // The one-off handshake Zadarma performs when the URL is first saved: it
    // calls with ?zd_echo=<nonce> and will not accept the URL unless the exact
    // value comes back. Unsigned by nature, and it reveals nothing.
    const echo = url.searchParams.get("zd_echo");
    if (echo !== null) {
      return new Response(echo, {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (req.method !== "POST") return json({}, 405);

    if (deps.checkSourceIp && !sourceIpAllowed(req)) {
      console.warn(
        `Bridge: rejected a notification from outside Zadarma's range — saw ${
          sourceIpSeen(req)
        }. ` +
          "Set ESCUDO_BRIDGE_CHECK_SOURCE_IP=false if this is genuine; the signature is the lock " +
          "that matters.",
      );
      return json({}, 403);
    }

    let params: Record<string, string>;
    try {
      params = Object.fromEntries(
        [...(await req.formData()).entries()].map(([k, v]) => [k, String(v)]),
      );
    } catch {
      return json({}, 400);
    }

    // Other events (NOTIFY_END, NOTIFY_ANSWER…) are signed over different
    // strings and mean nothing to us. Acknowledge and ignore, rather than
    // failing a signature check we were never going to pass.
    if (params.event !== EVENT_START) return json({}, 200);

    const signed = await verifyZadarmaSignature(
      deps.apiSecret,
      startSignatureString(params),
      req.headers.get("signature"),
    );
    if (!signed) {
      console.warn("Bridge: rejected an unsigned call notification");
      return json({}, 403);
    }

    // Everything past this point is authenticated, so a failure here is our bug
    // and not an attack. Reply regardless: the caller is on the line now, and a
    // 500 gets them silence rather than a second chance at the alarm.
    try {
      await handleInbound(deps, now(), {
        channel: "call",
        from: params.caller_id ?? "",
        body: null,
      });
    } catch (err) {
      console.error(`Bridge: call from ${params.caller_id} failed`, err);
    }

    return json(answer(deps), 200);
  };
}

/**
 * What Zadarma should do with the call now that the village has been raised.
 *
 * With a recording configured: play it, then hang up. `hangup` goes with it
 * because otherwise the call sits open on Zadarma's side after the message, and
 * an elderly caller listening to silence will assume it failed and dial again.
 *
 * With none configured, say nothing at all and let the PBX's own scenario run.
 * Bercianos has a text-to-speech greeting on the PBX main menu, which is what a
 * caller there actually hears; replying `hangup` would cut it off and leave them
 * with the silence this whole answer exists to prevent. An empty reply is not a
 * missing one — it means "carry on", and the alarm has already gone either way.
 */
function answer(deps: ZadarmaDeps): Record<string, unknown> {
  return deps.ivrPlayId ? { ivr_play: deps.ivrPlayId, hangup: 1 } : {};
}

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
