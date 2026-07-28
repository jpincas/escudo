// The public login page and its redemption logic (spec 2026-07-27 §5).
//
// Server-rendered, like the welcome page, rather than part of the panel SPA:
// the SPA is desktop-only by construction (min-width: 960px, viewport
// width=1024, spec 2.2), and this page has to be readable on the phone the
// code just arrived on — even though the ordinary flow types it into a
// computer instead (spec 5.1). main.ts serves this at GET /panel whenever
// there is no valid session, in place of the SPA's own signed-out explainer;
// a valid session falls straight through to the SPA, unchanged. POST /panel
// is what the <form> below submits to.
//
// There is no "request a code" form here, on purpose: the web cannot prove
// who anyone is, so the only thing this page can ever do is take a code that
// was already minted, over Telegram, and check it.

import type { Config } from "../config.ts";
import type { PanelSession, Store } from "../store/types.ts";
import { strings } from "../i18n/mod.ts";
import { redeemCode } from "../panel/auth.ts";
import { BRAND_ROOT_STYLE, CREST_SVG, escapeHtml } from "./welcome.ts";

const STYLE = `
  ${BRAND_ROOT_STYLE}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: var(--font);
    background: var(--papel);
    color: var(--tinta);
    line-height: 1.5;
  }
  main {
    max-width: 420px;
    margin: 0 auto;
    padding: 48px 20px;
    text-align: center;
  }
  .crest { margin: 4px 0 12px; }
  h1 {
    font-family: var(--font-display);
    font-weight: 700;
    color: var(--verde);
    font-size: 22px;
    margin: 0 0 12px;
  }
  .instructions {
    text-align: left;
    color: #55534c;
    margin: 0 0 20px;
    font-size: 15px;
  }
  .login-error {
    text-align: left;
    background: #fbe9e6;
    border: 1px solid var(--rojo-alarma);
    color: var(--rojo-alarma);
    border-radius: 8px;
    padding: 10px 14px;
    margin: 0 0 16px;
    font-size: 14px;
    font-weight: 600;
  }
  form {
    text-align: left;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    background: #fff;
  }
  label {
    display: block;
    font-weight: 600;
    font-size: 14px;
    margin: 0 0 8px;
  }
  input {
    width: 100%;
    font-size: 22px;
    font-family: var(--font-display);
    letter-spacing: 0.08em;
    text-align: center;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    margin: 0 0 8px;
  }
  .code-help {
    font-size: 13px;
    color: #55534c;
    margin: 0 0 16px;
  }
  button {
    width: 100%;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 16px;
    color: #fff;
    background: var(--verde);
    border: none;
    border-radius: 8px;
    padding: 14px;
    cursor: pointer;
  }
  .back {
    margin-top: 20px;
    font-size: 14px;
  }
  .back a { color: var(--verde); }
`;

/** Renders the login page. Pure — takes no store, no request. `failed`
 *  reflects a `?error=1` on the URL, never the code itself (spec 5.3: the
 *  code must never appear in a URL, query string, log line or error
 *  message) — and reads identically whichever of the failure reasons
 *  produced it (unknown, expired, used, superseded, or rate-limited), by
 *  construction: redeemCode() and handleLoginSubmit() below never
 *  distinguish them either. */
export function renderLoginPage(config: Config, opts: { failed?: boolean } = {}): string {
  const s = strings(config.village.locale);

  const errorHtml = opts.failed
    ? `<p class="login-error" role="alert">${escapeHtml(s.login.error)}</p>`
    : "";

  return `<!doctype html>
<html lang="${config.village.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(s.login.heading)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <div class="crest">${CREST_SVG}</div>
  <h1>${escapeHtml(s.login.heading)}</h1>
  <p class="instructions">${escapeHtml(s.login.instructions)}</p>
  ${errorHtml}
  <form method="post" action="/panel" autocomplete="off">
    <label for="code">${escapeHtml(s.login.codeLabel)}</label>
    <input
      id="code" name="code" type="text" inputmode="numeric"
      autocomplete="one-time-code" pattern="[0-9 -]*" maxlength="13"
      required autofocus
    >
    <p class="code-help">${escapeHtml(s.login.codeHelp)}</p>
    <button type="submit">${escapeHtml(s.login.submit)}</button>
  </form>
  <p class="back"><a href="/">${escapeHtml(s.login.backToWelcome)}</a></p>
</main>
</body>
</html>`;
}

// ── The rate limit: the sole guessing defence ──
//
// Removing the per-code attempt cap (see src/panel/auth.ts's header) leaves
// this the only thing standing between a guesser and the keyspace. It has
// to hold on its own, so it is not keyed by caller IP at all.
//
// `x-forwarded-for` cannot be trusted for that on this app's actual
// deployment target: DEPLOY.md and gotchas.md both record that the address
// Deno Deploy's proxy reports there is not the real caller's — verified
// directly, because the bridge's own IP allowlist built on the same header
// refused every genuine call and had to be turned off. Keying the login
// limiter on it inherits two failure modes, neither acceptable for the
// panel's only entrance: if Deploy's edge reports one address for every
// caller, the bucket is shared by accident and nobody notices until an
// unrelated flood locks the village out; if a client-supplied value is ever
// honoured as the first hop, an attacker gets a fresh, unlimited bucket for
// every request, for free, and the limit is not merely weak but void.
//
// So this is one fixed bucket for the whole deployment, keyed by a constant,
// not by anything a caller sends. That makes "an attacker with many source
// addresses" a non-issue by construction — there is no per-address
// partition to spread guesses across in the first place.
//
// The residual, stated plainly and without softening it: a global bucket
// can still be exhausted by a sustained flood, from anywhere, and while it
// is exhausted nobody — including a legitimate admin with the right code in
// hand — can log in. What that costs an attacker to hold open is the whole
// design question below; it is sized so that holding the village locked out
// requires a genuine, continuous flood (on the order of one request every
// second, forever, not an occasional curl), not the five- or thirty-request
// nuisance two earlier versions of this file allowed.
const LOGIN_RATE_LIMIT_KEY = "login";
/** Requests per window, for the whole deployment. See the arithmetic below
 *  for why this number and CODE_LENGTH were chosen together. "Survives
 *  across codes" (spec 5.2): the window is anchored to wall-clock time via
 *  Store.bumpRateLimit, not to any one code's lifecycle, so asking the bot
 *  for a fresh code never resets it. */
const LOGIN_RATE_LIMIT_MAX = 600;
const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60_000;

// The arithmetic (spec 5.2 requires this be shown, not asserted). Two
// numbers are chosen together here, not independently: the code length
// (src/panel/auth.ts's CODE_LENGTH, 9) carries the guessing defence: the
// rate limit is sized to make holding a lockout open expensive, not to be
// the thing standing between a guesser and the keyspace.
//
//   Keyspace:             10^9 (nine digits)
//   Rate limit:           600 requests / 10-minute window, global
//   A code's own life:    10 minutes, which can straddle two fixed windows
//
// Because the bucket is global, "an attacker with many source addresses"
// changes nothing: every request anywhere counts against the same ceiling,
// so spreading guesses across IPs buys no extra budget the way it did
// against the old per-code, per-guess design. The worst case is bounded by
// wall-clock time alone: at most two windows' worth of requests, 1,200, can
// ever land while one specific code is still alive, however many machines
// sent them.
//
//   P(a guesser lands on one specific live code within its 10-minute life)
//     ≤ 1,200 / 1,000,000,000 = 0.00012% — about 1 in 833,333.
//
// That is roughly 50× stronger than the six-digit, 30-per-window version
// this replaces (1 in 16,667), and it holds regardless of how the request
// volume is distributed across source addresses — the property F2 and F3
// required, which the old per-IP design did not have.
//
// What it costs an attacker to keep the village locked out: 600 requests
// land in the first ten-minute window almost as fast as they can be sent —
// that part is cheap and unchanged from before. Holding the block open
// *continuously* is the number that matters, and it did change: the bucket
// refills every window, so staying exhausted forever needs a sustained
// 600 requests every 600 seconds — one request per second, indefinitely,
// against a Deno Deploy endpoint, not an occasional script. That is a real
// denial-of-service mounted against the app's hosting, not a five-curl
// nuisance, and it is the honest, unhedged cost of the residual above: the
// bucket does not stop a determined, sustained flood, it only makes
// anything less than one into no threat at all.

/**
 * Everything the POST handler needs beyond parsing the form. The rate limit
 * is checked, and enforced, *before* the code is ever looked at, so an
 * over-limit request never calls redeemCode() and never consumes a real
 * code. Every failure returns null identically — over the limit, unknown,
 * expired, or used/superseded (spec 5.3).
 */
export async function handleLoginSubmit(
  store: Store,
  input: { code: string; existingSessionToken: string | null },
  now: Date = new Date(),
): Promise<PanelSession | null> {
  const count = await store.bumpRateLimit(LOGIN_RATE_LIMIT_KEY, LOGIN_RATE_LIMIT_WINDOW_MS, now);
  if (count > LOGIN_RATE_LIMIT_MAX) return null;

  const session = await redeemCode(store, input.code, now);
  if (!session) return null;

  // Typing a code while already signed in replaces that session, rather than
  // stacking a second one alongside it (spec 5.3).
  if (input.existingSessionToken) await store.deleteSession(input.existingSessionToken);

  return session;
}
