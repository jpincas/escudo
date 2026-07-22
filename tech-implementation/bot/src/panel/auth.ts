// Getting a coordinator into the admin panel.
//
// The bot is the authentication channel. It already knows who the village
// admins are — isGroupAdmin() reads that live from Telegram — and it already
// has a private, verified channel to each of them. So the panel needs no
// passwords, no email, no OAuth and no user table: an admin asks the bot for a
// link in a DM, and the link is proof enough that they are who Telegram says.
//
// Two short-lived objects, both in KV:
//   PanelLink    minted by the bot, valid once, minutes.
//   PanelSession created by spending a link, held in a cookie, weeks.

import type { PanelLink, PanelSession, Store } from "../store/types.ts";

/** A magic link is for walking from Telegram to a browser, nothing more. */
const LINK_TTL_MINUTES = 10;
/** Long enough that a coordinator isn't forever asking for links. */
const SESSION_TTL_DAYS = 30;

export const SESSION_COOKIE = "escudo_panel";

/**
 * 32 random bytes, base64url. Both link and session tokens are looked up as KV
 * keys rather than compared against a stored secret, so there is nothing here
 * for a timing attack to learn — the only requirement is that they cannot be
 * guessed.
 */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function isoIn(ms: number, now: Date): string {
  return new Date(now.getTime() + ms).toISOString();
}

/** Mint a one-time link for an admin the bot has already authorised. */
export async function issueLink(
  store: Store,
  telegramId: string,
  name: string,
  now: Date = new Date(),
): Promise<PanelLink> {
  const link: PanelLink = {
    token: newToken(),
    telegramId,
    name,
    expiresAt: isoIn(LINK_TTL_MINUTES * 60_000, now),
  };
  await store.putPanelLink(link);
  return link;
}

/**
 * Spend a link and open a session. Returns null if the token is unknown, already
 * used or expired — the caller must not distinguish between those cases to the
 * outside world.
 */
export async function exchangeLink(
  store: Store,
  token: string,
  now: Date = new Date(),
): Promise<PanelSession | null> {
  const link = await store.takePanelLink(token);
  if (!link) return null;

  const session: PanelSession = {
    token: newToken(),
    telegramId: link.telegramId,
    name: link.name,
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
    // Lax, not Strict: the coordinator arrives from a link in Telegram, and a
    // Strict cookie would not be sent on that first cross-site navigation.
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
