// The one-time login code, end to end (spec 2026-07-27 §5) — the security-
// sensitive replacement for the magic link. Exercises the store-level
// mechanics directly (issueCode/redeemCode from src/panel/auth.ts, and
// handleLoginSubmit/renderLoginPage from src/web/login.ts) rather than over
// HTTP, since none of this depends on Hono; main.ts's POST /panel is a thin
// wrapper around handleLoginSubmit and is exercised live in the self-verify
// pass instead of here.
//
// The genuinely concurrent regression for the KV race review finding F2
// exposed lives in tests/store_test.ts, against KvStore specifically — a
// race that only shows up under real, cross-isolate concurrency is not
// observable against MemoryStore's synchronous Map, so it has no business
// being asserted here.

import { assertEquals, assertMatch, assertNotEquals, assertStringIncludes } from "@std/assert";
import {
  formatCodeForDisplay,
  issueCode,
  newCode,
  normaliseCode,
  redeemCode,
} from "../src/panel/auth.ts";
import { handleLoginSubmit, renderLoginPage } from "../src/web/login.ts";
import { MemoryStore } from "../src/store/memory.ts";
import { makeConfig } from "./helpers.ts";

Deno.test("newCode produces distinct, uniformly-shaped 9-digit codes", () => {
  const codes = new Set(Array.from({ length: 200 }, () => newCode()));
  // Collisions are possible in principle (1,000,000,000 possible values) but
  // vanishingly unlikely across 200 draws — this is really a shape check.
  assertEquals(codes.size, 200);
  for (const code of codes) assertMatch(code, /^\d{9}$/);
});

Deno.test("formatCodeForDisplay groups for legibility; normaliseCode undoes it", () => {
  assertEquals(formatCodeForDisplay("123456789"), "123 456 789");
  assertEquals(normaliseCode("123 456 789"), "123456789");
  // Tolerates however a human types or pastes it.
  assertEquals(normaliseCode(" 123-456-789 "), "123456789");
});

Deno.test("a code redeems exactly once", async () => {
  const store = new MemoryStore();
  const now = new Date("2026-07-27T10:00:00.000Z");
  const issued = await issueCode(store, "42", "Jon", now);

  const session = await redeemCode(store, issued.code, now);
  assertEquals(session?.telegramId, "42");
  assertEquals(session?.name, "Jon");

  // Spent. Forwarded, screenshotted or pasted twice, it works once.
  assertEquals(await redeemCode(store, issued.code, now), null);
});

Deno.test("exactly one of two concurrent redemptions of the same code succeeds", async () => {
  const store = new MemoryStore();
  const now = new Date("2026-07-27T10:00:00.000Z");
  const issued = await issueCode(store, "42", "Jon", now);

  const [a, b] = await Promise.all([
    redeemCode(store, issued.code, now),
    redeemCode(store, issued.code, now),
  ]);
  const successes = [a, b].filter((s) => s !== null);
  assertEquals(successes.length, 1);
});

Deno.test("an expired code does not redeem", async () => {
  const store = new MemoryStore();
  const issuedAt = new Date("2026-07-27T10:00:00.000Z");
  const issued = await issueCode(store, "42", "Jon", issuedAt);

  const elevenMinutesLater = new Date(issuedAt.getTime() + 11 * 60_000);
  assertEquals(await redeemCode(store, issued.code, elevenMinutesLater), null);
});

Deno.test("asking for a new code kills any code already outstanding for that admin (A6)", async () => {
  const store = new MemoryStore();
  const now = new Date("2026-07-27T10:00:00.000Z");

  const first = await issueCode(store, "42", "Jon", now);
  const second = await issueCode(store, "42", "Jon", now);

  assertNotEquals(first.code, second.code);
  // A code scrolled back to in an old Telegram message must not work.
  assertEquals(await redeemCode(store, first.code, now), null);
  assertEquals((await redeemCode(store, second.code, now))?.telegramId, "42");
});

Deno.test("a code superseding another admin's live code leaves that other one untouched", async () => {
  const store = new MemoryStore();
  const now = new Date("2026-07-27T10:00:00.000Z");

  await issueCode(store, "1", "María", now);
  const luis = await issueCode(store, "2", "Luis", now); // different admin

  await issueCode(store, "1", "María", now); // María asks again; supersedes only her own
  assertEquals((await redeemCode(store, luis.code, now))?.telegramId, "2");
});

// ── The invariant review finding F1 exists to protect ──
//
// The whole point of looking a code up by its own value (rather than
// scanning and comparing against everything live) is that a wrong guess
// cannot touch a code it didn't name — not the guesser's target, and
// certainly not some other admin's. This is what a shared per-code attempt
// cap got backwards.

Deno.test("wrong guesses against one admin's code never touch another admin's live code", async () => {
  const store = new MemoryStore();
  const now = new Date("2026-07-27T10:00:00.000Z");

  const target = await issueCode(store, "1", "María", now);
  await issueCode(store, "2", "Luis", now); // a second, unrelated live code

  // A guesser fires many wrong values at the endpoint, none of which name
  // María's code. None of this is charged against it anywhere — there is no
  // record keyed by "wrong guesses so far" for redeemCode() to consult.
  for (let i = 0; i < 50; i++) {
    assertEquals(await redeemCode(store, String(i).padStart(9, "0"), now), null);
  }

  // María's code is exactly as valid as the moment it was minted.
  assertEquals((await redeemCode(store, target.code, now))?.telegramId, "1");
});

Deno.test("every failure reason is the identical, information-free null", async () => {
  const store = new MemoryStore();
  const now = new Date("2026-07-27T10:00:00.000Z");

  // Unknown.
  assertEquals(await redeemCode(store, "999999999", now), null);

  // Expired.
  const expired = await issueCode(store, "1", "A", now);
  assertEquals(await redeemCode(store, expired.code, new Date(now.getTime() + 700_000)), null);

  // Already used.
  const used = await issueCode(store, "2", "B", now);
  await redeemCode(store, used.code, now);
  assertEquals(await redeemCode(store, used.code, now), null);

  // Superseded.
  const superseded = await issueCode(store, "3", "C", now);
  await issueCode(store, "3", "C", now);
  assertEquals(await redeemCode(store, superseded.code, now), null);

  // Every one of the above returned exactly `null` — there is no separate
  // shape or message that could leak which reason it was; that guarantee
  // lives in redeemCode()'s return type, not in this test.
});

Deno.test("handleLoginSubmit signs in on a correct code", async () => {
  const store = new MemoryStore();
  const now = new Date("2026-07-27T10:00:00.000Z");
  const issued = await issueCode(store, "42", "Jon", now);

  const session = await handleLoginSubmit(
    store,
    { code: issued.code, existingSessionToken: null },
    now,
  );
  assertEquals(session?.telegramId, "42");
});

Deno.test("typing a code while already signed in replaces that session", async () => {
  const store = new MemoryStore();
  const now = new Date("2026-07-27T10:00:00.000Z");

  await store.putSession({
    token: "old-session",
    telegramId: "1",
    name: "Old",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
  });

  const issued = await issueCode(store, "42", "Jon", now);
  const session = await handleLoginSubmit(
    store,
    { code: issued.code, existingSessionToken: "old-session" },
    now,
  );

  assertEquals(session?.telegramId, "42");
  assertEquals(await store.getSession("old-session"), null);
});

// The limit itself: 600 per 10-minute window (src/web/login.ts). Exhausting
// it 600 times per test is deliberate, not excessive — the whole point of
// F1's second round is that the number has to be big enough that this loop
// is a meaningfully expensive thing to do, not a rounding error.
const RATE_LIMIT = 600;

Deno.test("the login endpoint's rate limit survives across codes", async () => {
  const store = new MemoryStore();
  const now = new Date("2026-07-27T10:00:00.000Z");

  await issueCode(store, "42", "Jon", now);
  // Exhaust the global limit with wrong attempts.
  for (let i = 0; i < RATE_LIMIT; i++) {
    await handleLoginSubmit(store, { code: "000000000", existingSessionToken: null }, now);
  }

  // A fresh, objectively correct code still fails — the limit is anchored
  // to the clock alone, not to any one code, and not reset by minting a
  // new one.
  const second = await issueCode(store, "42", "Jon", now);
  const session = await handleLoginSubmit(
    store,
    { code: second.code, existingSessionToken: null },
    now,
  );
  assertEquals(session, null);
});

Deno.test("the rate limit is global: it cannot be dodged by presenting as a different caller", async () => {
  // There is no caller-derived key any more (review finding F3): the limit
  // is one fixed bucket for the whole deployment. handleLoginSubmit's own
  // input type no longer accepts anything like a client IP, so there is
  // nothing for a caller to vary in the first place — this test pins that
  // by construction, not by simulating two different addresses.
  const store = new MemoryStore();
  const now = new Date("2026-07-27T10:00:00.000Z");

  for (let i = 0; i < RATE_LIMIT; i++) {
    await handleLoginSubmit(store, { code: "000000000", existingSessionToken: null }, now);
  }

  const issued = await issueCode(store, "42", "Jon", now);
  const session = await handleLoginSubmit(
    store,
    { code: issued.code, existingSessionToken: null },
    now,
  );
  // Still blocked — nothing about how this request was made can exempt it.
  assertEquals(session, null);
});

Deno.test("under the limit, a correct code still succeeds", async () => {
  const store = new MemoryStore();
  const now = new Date("2026-07-27T10:00:00.000Z");

  // Comfortably under 600 — a realistic handful of typos, not the whole
  // budget.
  for (let i = 0; i < 5; i++) {
    await handleLoginSubmit(store, { code: "000000000", existingSessionToken: null }, now);
  }

  const issued = await issueCode(store, "42", "Jon", now);
  const session = await handleLoginSubmit(
    store,
    { code: issued.code, existingSessionToken: null },
    now,
  );
  assertEquals(session?.telegramId, "42");
});

// ── The login page itself ──

Deno.test("the login page states where the code comes from, and posts to /panel", () => {
  const html = renderLoginPage(makeConfig());
  assertStringIncludes(html, "<svg"); // crest, inlined
  assertStringIncludes(html, "/panel"); // instructions name the bot command
  assertMatch(html, /<form[^>]*method="post"[^>]*action="\/panel"/);
  // The stylesheet always defines the .login-error rule; the marker that
  // matters is the rendered error paragraph itself, absent here.
  assertEquals(html.includes('role="alert"'), false);
});

Deno.test("a failed attempt shows the one generic error, in the deployment's locale", () => {
  const es = renderLoginPage(
    makeConfig({ village: { name: "Ejemplo", locale: "es", timezone: "Europe/Madrid" } }),
    {
      failed: true,
    },
  );
  assertStringIncludes(es, "Ese código no es válido");

  const en = renderLoginPage(
    makeConfig({ village: { name: "Example", locale: "en", timezone: "Europe/Madrid" } }),
    {
      failed: true,
    },
  );
  assertStringIncludes(en, "That code is not valid");
});

Deno.test("the login page never contains a code — only ever a bare error flag reaches it", () => {
  // renderLoginPage's only "did this fail" input is the boolean `failed`,
  // never a code value (spec 5.3: the code must never appear in a URL, a
  // query string, a log line or an error message) — this is a shape
  // guarantee of the function's own signature, asserted here so a future
  // change can't quietly add a code-carrying parameter unnoticed.
  const html = renderLoginPage(makeConfig(), { failed: true });
  assertEquals(/\d{9}/.test(html), false);
});
