// Raising an alert as a device, from the panel.
//
// This is the one route in the panel that can wake a village, so it is tested
// over real HTTP with a real session and a real AlertService — only Telegram is
// faked. What matters here: it needs a session, it renders the same message the
// group would get, a preview posts nothing, and a send is indistinguishable in
// the group while still being recorded as a drill in the log.

import { assertEquals, assertStringIncludes } from "@std/assert";
import { AlertService } from "../src/alerts.ts";
import { createPanelApi } from "../src/panel/api.ts";
import { MemoryStore } from "../src/store/memory.ts";
import type { Device, Store } from "../src/store/types.ts";
import { FakeNotifier, makeConfig } from "./helpers.ts";

const TOKEN = "session-token-under-test";
const MSISDN = "+34600111222";

function device(overrides: Partial<Device> = {}): Device {
  return {
    msisdn: MSISDN,
    label: "Casa de María",
    address: "Calle Real 14",
    kind: "alarm",
    lastProvenAt: null,
    registeredAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

async function setup() {
  const config = makeConfig();
  const store: Store = new MemoryStore();
  const notifier = new FakeNotifier();
  const api = createPanelApi(config, store, {
    alerts: new AlertService(config, store, notifier),
  });
  await store.putDevice(device());
  await store.putSession({
    token: TOKEN,
    telegramId: "42",
    name: "Jon",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  return { config, store, notifier, api };
}

function post(
  api: ReturnType<typeof createPanelApi>,
  body: unknown,
  { authenticated = true, msisdn = MSISDN } = {},
): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json" });
  if (authenticated) headers.set("cookie", `escudo_panel=${TOKEN}`);
  return Promise.resolve(api.request(`/devices/${encodeURIComponent(msisdn)}/simulate`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }));
}

Deno.test("simulating requires a session", async () => {
  const { api, notifier } = await setup();
  const res = await post(api, { preview: true }, { authenticated: false });
  assertEquals(res.status, 401);
  assertEquals(notifier.posted.length, 0);
});

Deno.test("a preview renders the message and posts nothing", async () => {
  const { api, notifier, store } = await setup();
  const res = await post(api, { preview: true });
  assertEquals(res.status, 200);

  const body = await res.json();
  assertStringIncludes(body.preview, "Casa de María");
  assertStringIncludes(body.preview, "Calle Real 14");
  // The device kind's icon, so what you see is what the village would get.
  assertStringIncludes(body.preview, "🏠");

  // Nothing happened: no post, no incident.
  assertEquals(notifier.posted.length, 0);
  assertEquals((await store.listIncidents()).length, 0);
});

Deno.test("a send reaches the group looking like an ordinary alert", async () => {
  const { api, notifier } = await setup();
  const res = await post(api, {});
  assertEquals(res.status, 200);
  assertEquals((await res.json()).status, "raised");

  assertEquals(notifier.posted.length, 1);
  const text = notifier.posted[0].text;
  assertStringIncludes(text, "Casa de María");
  assertStringIncludes(text, "🏠");
  // The group is not told it is a drill: an alert that announces itself as
  // practice tests nothing about how people react to a real one.
  assertEquals(text.toLowerCase().includes("prueba"), false);
  assertEquals(text.toLowerCase().includes("simulacro"), false);
});

Deno.test("a send is recorded as a drill in the log", async () => {
  const { api, store } = await setup();
  await post(api, {});

  const incidents = await store.listIncidents();
  assertEquals(incidents.length, 1);
  // The log knows what the group was not told. Without this the incident record
  // is a lie about what happened in the village — and, since Escudo sends
  // nothing to any private chat, this record is the only trace of who ran it.
  assertEquals(incidents[0].simulatedBy, "Jon");
});

Deno.test("an unknown device is a 404, and raises nothing", async () => {
  const { api, notifier } = await setup();
  const res = await post(api, {}, { msisdn: "+34699000111" });
  assertEquals(res.status, 404);
  assertEquals(notifier.posted.length, 0);
});

Deno.test("an unknown category is refused rather than guessed", async () => {
  const { api, notifier } = await setup();
  const res = await post(api, { category: "invasion" });
  assertEquals(res.status, 400);
  assertEquals(notifier.posted.length, 0);
});

Deno.test("a chosen category is honoured", async () => {
  const { api, notifier } = await setup();
  const res = await post(api, { category: "fuego" });
  assertEquals(res.status, 200);
  assertEquals(notifier.posted.length, 1);
  assertStringIncludes(notifier.posted[0].text.toUpperCase(), "FUEGO");
});

Deno.test("a repeat inside the dedupe window is reported as a duplicate", async () => {
  const { api, notifier } = await setup();
  await post(api, {});
  const res = await post(api, {});

  assertEquals((await res.json()).status, "duplicate");
  // And crucially the group was not woken twice for the same test.
  assertEquals(notifier.posted.length, 1);
});

Deno.test("without an alert service wired the route refuses rather than 500s", async () => {
  const config = makeConfig();
  const store: Store = new MemoryStore();
  await store.putDevice(device());
  await store.putSession({
    token: TOKEN,
    telegramId: "42",
    name: "Jon",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  const api = createPanelApi(config, store);

  const res = await post(api, { preview: true });
  assertEquals(res.status, 503);
});
