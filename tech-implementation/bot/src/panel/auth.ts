// Getting a coordinator into the admin panel.
//
// The bot is the authentication channel. It already knows who the village
// admins are — isGroupAdmin() reads that live from Telegram — and it already
// has a private, verified channel to each of them. So the panel needs no
// passwords, no email, no OAuth and no user table: an admin asks the bot for
// a code in a DM, and the code is proof enough that they are who Telegram
// says (spec 2026-07-27 §5).
//
// Two short-lived objects, both in KV:
//   PanelCode    minted by the bot, valid once, minutes. Digits only, no URL.
//   PanelSession created by spending a code, held in a cookie, weeks.
//
// A 32-byte token needs no defence beyond being unguessable: it is looked up
// as a KV key, so there is nothing for a timing attack to learn from a
// mismatch, and the keyspace alone (2^256) makes guessing hopeless. A 9-digit
// code is short enough to guess (10^9, see newCode()), and an earlier version
// of this file got the consequence backwards:
//
//   REJECTED DESIGN, kept here as a warning. redeemCode() used to compare a
//   guess against *every currently-live* code (not look one up by value),
//   because a bare submission carries no other identifying field, and charge
//   a miss against every one of them via a per-code attempt cap. That made a
//   wrong guess a *shared* event: one guesser, needing no knowledge of who
//   the admin was or when their code was minted, could kill anyone's fresh
//   code from anywhere on the internet — reproduced live as five wrong
//   guesses from five different IPs, after which the admin's own correct
//   code was refused (review finding F1). The fix is not a bigger cap; it is
//   this file's actual invariant: a wrong guess must never invalidate,
//   degrade or consume anything belonging to another admin's code.
//
// That invariant is why PanelCode is looked up by its own value as a KV key
// (Store.takePanelCode): a guess that matches nothing *is* nothing — no
// record exists to charge, corrupt or delete, for this code or any other.
// It also removes the timing question a content comparison would have
// raised, since a keyed lookup's cost doesn't scale with how much of a wrong
// guess happened to be right, or with how many codes are currently live.
//
// With no per-code cap left to lean on, guessing is defended by exactly one
// thing: the rate limit in src/web/login.ts, sized in that file's own
// comment against an attacker who is not limited to one address.

import type { PanelCode, PanelSession, Store } from "../store/types.ts";

/** A code is for walking from Telegram to a browser, nothing more. */
const CODE_TTL_MINUTES = 10;
/** Long enough that a coordinator isn't forever asking for codes. */
const SESSION_TTL_DAYS = 30;
/** Digits, no letters — "no characters that can be confused for one
 *  another" (spec 5.2) is satisfied by there being no letters to confuse a
 *  digit with, rather than by curating an alphabet. Nine, grouped in threes
 *  (`123 456 789`), is the shape of a Spanish phone number — demonstrably
 *  typeable, grouped for legibility, by exactly the population spec 5.2
 *  names (an older volunteer reading a phone at arm's length), and it costs
 *  nothing to read off, unlike a longer alphanumeric string would. Review
 *  finding F1's second round found six digits too small a keyspace to carry
 *  the guessing defence on its own once the rate limit had to be sized
 *  small enough not to be a lockout itself — see src/web/login.ts for the
 *  arithmetic this length is chosen from. */
const CODE_LENGTH = 9;
/** 10^CODE_LENGTH — the size of the guessing space newCode() draws from. */
const CODE_SPACE = 10 ** CODE_LENGTH;

export const SESSION_COOKIE = "escudo_panel";

/**
 * 32 random bytes, base64url. Session tokens are looked up as KV keys rather
 * than compared against a stored secret, so there is nothing here for a
 * timing attack to learn — the only requirement is that they cannot be
 * guessed. (Login codes are a different, deliberately shorter, guessable-by-
 * design object — see this file's header for how those are defended.)
 */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * A uniformly random 9-digit code. Rejection sampling, not a plain
 * `% CODE_SPACE`: the modulo of a uniform 32-bit value over a divisor that
 * doesn't evenly divide 2^32 is very slightly biased towards the low end of
 * the range, and there is no reason to accept even that much when discarding
 * the (rare) out-of-range draws costs nothing observable. CODE_SPACE
 * (10^9) still fits inside a 32-bit draw (2^32 ≈ 4.29 × 10^9), so one
 * `Uint32Array` value is enough — no need for a wider random source.
 */
export function newCode(): string {
  const upperBound = Math.floor(0x1_0000_0000 / CODE_SPACE) * CODE_SPACE;
  let value: number;
  do {
    value = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (value >= upperBound);
  return String(value % CODE_SPACE).padStart(CODE_LENGTH, "0");
}

/** "123456789" → "123 456 789" — grouped in threes for legibility (spec
 *  5.2), display only: never used for comparison or storage, so the spaces
 *  are purely cosmetic. */
export function formatCodeForDisplay(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3, 6)} ${code.slice(6)}`;
}

/**
 * Strips everything but digits from what a human typed or pasted — the
 * display grouping's own space, a phone's autofill inserting a hyphen,
 * whitespace around a copy-paste.
 */
export function normaliseCode(input: string): string {
  return input.replace(/\D/g, "");
}

function isoIn(ms: number, now: Date): string {
  return new Date(now.getTime() + ms).toISOString();
}

/** Mint a code for an admin the bot has already authorised live. */
export async function issueCode(
  store: Store,
  telegramId: string,
  name: string,
  now: Date = new Date(),
): Promise<PanelCode> {
  const entry: PanelCode = {
    code: newCode(),
    telegramId,
    name,
    expiresAt: isoIn(CODE_TTL_MINUTES * 60_000, now),
  };
  // Supersedes any code already outstanding for this admin (A6) as part of
  // the same write — see kv.ts / memory.ts.
  await store.putPanelCode(entry);
  return entry;
}

/**
 * Spend a code and open a session. Returns null for every failure — unknown,
 * expired, or already used/superseded (all three collapse into the same
 * "no such live code" outcome at the store) — and the caller must not
 * distinguish between those cases to the outside world (spec 5.3).
 *
 * A single keyed lookup, deliberately: see this file's header for why a scan
 * that compares a guess against every live code is the design this replaces,
 * and must not come back.
 */
export async function redeemCode(
  store: Store,
  candidateRaw: string,
  now: Date = new Date(),
): Promise<PanelSession | null> {
  const candidate = normaliseCode(candidateRaw);

  // Consumed atomically at the store: a second request racing the same
  // correct code must not also open a session. A guess that matches nothing
  // returns null here having touched no record at all — not this code, not
  // any other admin's.
  const taken = await store.takePanelCode(candidate, now);
  if (!taken) return null;

  const session: PanelSession = {
    token: newToken(),
    telegramId: taken.telegramId,
    name: taken.name,
    createdAt: now.toISOString(),
    expiresAt: isoIn(SESSION_TTL_DAYS * 86_400_000, now),
  };
  await store.putSession(session);
  return session;
}

/** Cookie attributes for a session. `secure` is off only for local http dev. */
export function sessionCookie(token: string, secure: boolean): string {
  const maxAge = SESSION_TTL_DAYS * 86_400;
  return cookieString(token, maxAge, secure);
}

/** The same cookie, expired — what signing out sends. */
export function clearedCookie(secure: boolean): string {
  return cookieString("", 0, secure);
}

function cookieString(value: string, maxAge: number, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    // Lax, not Strict: the coordinator arrives at the login page from
    // Telegram (or types the URL directly), and a Strict cookie would not be
    // sent back on the form's own POST if that ever counted as cross-site.
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Read the session token out of a Cookie header, if present. */
export function tokenFromCookies(header: string | null): string | null {
  if (!header) return null;
  for (const pair of header.split(";")) {
    const [name, ...rest] = pair.trim().split("=");
    if (name === SESSION_COOKIE) {
      const value = rest.join("=");
      return value.length > 0 ? value : null;
    }
  }
  return null;
}
