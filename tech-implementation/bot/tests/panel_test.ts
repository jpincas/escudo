// The panel's decision logic, away from HTTP.
//
// deviceStatus is the only thing in the whole system that will ever say a
// device has gone quiet — shop-bought alarm devices send no heartbeat — so the
// boundary it draws is worth pinning down.

import { assertEquals } from "@std/assert";
import { deviceStatus } from "../src/panel/api.ts";
import { normaliseMsisdn } from "../src/msisdn.ts";
import { clearedCookie, newToken, sessionCookie, tokenFromCookies } from "../src/panel/auth.ts";
import type { Device } from "../src/store/types.ts";

const NOW = new Date("2026-07-21T12:00:00.000Z");

function device(lastProvenAt: string | null): Device {
  return {
    msisdn: "+34600111222",
    label: "Casa de María",
    address: "Calle Real 14",
    kind: "base",
    lastProvenAt,
    registeredAt: "2026-01-01T00:00:00.000Z",
  };
}

Deno.test("a device that has never been proven is never, not overdue", () => {
  // The two mean different things to a coordinator: one is an install that was
  // never finished, the other a routine that has slipped.
  assertEquals(deviceStatus(device(null), 60, NOW), "never");
});

Deno.test("a device proven inside the window is ok, outside it is overdue", () => {
  assertEquals(deviceStatus(device("2026-07-20T12:00:00.000Z"), 60, NOW), "ok");
  assertEquals(deviceStatus(device("2026-06-01T12:00:00.000Z"), 60, NOW), "ok");
  assertEquals(deviceStatus(device("2026-01-01T12:00:00.000Z"), 60, NOW), "overdue");
});

Deno.test("the window boundary is inclusive — exactly on time is still ok", () => {
  const exactly60DaysAgo = "2026-05-22T12:00:00.000Z";
  assertEquals(deviceStatus(device(exactly60DaysAgo), 60, NOW), "ok");
});

Deno.test("phone numbers are normalised to one stored form", () => {
  // The bridge matches by equality against whatever the network hands it, so
  // every way a human might type the same number has to collapse to one string.
  for (const typed of ["+34 600 111 222", "+34-600-111-222", "+34 (600) 111.222"]) {
    assertEquals(normaliseMsisdn(typed), "+34600111222");
  }
});

Deno.test("session tokens are unguessable and distinct", () => {
  const tokens = new Set(Array.from({ length: 100 }, () => newToken()));
  assertEquals(tokens.size, 100);
  // 32 bytes, base64url, unpadded.
  for (const token of tokens) assertEquals(/^[A-Za-z0-9_-]{43}$/.test(token), true);
});

Deno.test("the session cookie is HttpOnly and same-site, and Secure only on https", () => {
  const secure = sessionCookie("abc", true);
  assertEquals(secure.includes("HttpOnly"), true);
  assertEquals(secure.includes("SameSite=Lax"), true);
  assertEquals(secure.includes("Secure"), true);

  // Local http dev would otherwise never see the cookie come back.
  assertEquals(sessionCookie("abc", false).includes("Secure"), false);

  assertEquals(clearedCookie(true).includes("Max-Age=0"), true);
});

Deno.test("the session token is read out of a crowded cookie header", () => {
  assertEquals(tokenFromCookies("other=1; escudo_panel=abc123; more=2"), "abc123");
  assertEquals(tokenFromCookies("other=1"), null);
  assertEquals(tokenFromCookies(null), null);
  // An empty value is a cleared cookie, not a session.
  assertEquals(tokenFromCookies("escudo_panel="), null);
});
