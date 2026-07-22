// The panel API, end to end, without a socket or Telegram.
//
// Hono apps are just fetch handlers, so the real router, the real middleware
// and the real store run here — only the network is missing. These assert the
// two rules that matter most: nothing is readable without a session, and a
// magic link opens exactly one.

import { assertEquals } from "@std/assert";
import { createPanelApi } from "../src/panel/api.ts";
import { MemoryStore } from "../src/store/memory.ts";
import type { Store } from "../src/store/types.ts";
import { makeConfig } from "./helpers.ts";

const BASE = "http://localhost";

function setup(): { api: ReturnType<typeof createPanelApi>; store: Store } {
  const store = new MemoryStore();
  return { api: createPanelApi(makeConfig(), store), store };
}

/** Mint a link the way the bot does, then spend it the way the SPA does. */
async function signIn(
  api: ReturnType<typeof createPanelApi>,
  store: Store,
): Promise<string> {
  await store.putPanelLink({
    token: "link-token",
    telegramId: "42",
    name: "Jon",
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  });

  const res = await api.request(`${BASE}/session/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "link-token" }),
  });
  assertEquals(res.status, 200);

  const cookie = res.headers.get("set-cookie") ?? "";
  return cookie.split(";")[0];
}

Deno.test("everything is refused without a session", async () => {
  const { api } = setup();
  for (const path of ["/session", "/devices"]) {
    assertEquals((await api.request(`${BASE}${path}`)).status, 401);
  }
  const post = await api.request(`${BASE}/devices`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      msisdn: "+34600111222",
      label: "Casa",
      address: "Calle",
      kind: "base",
    }),
  });
  assertEquals(post.status, 401);
});

Deno.test("a magic link signs in once and only once", async () => {
  const { api, store } = setup();
  const cookie = await signIn(api, store);

  const me = await api.request(`${BASE}/session`, { headers: { cookie } });
  assertEquals(me.status, 200);
  assertEquals((await me.json()).name, "Jon");

  // The same link again is dead — forwarded or re-pasted, it opens nothing.
  const replay = await api.request(`${BASE}/session/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "link-token" }),
  });
  assertEquals(replay.status, 401);
});

Deno.test("a device can be registered, edited and removed", async () => {
  const { api, store } = setup();
  const cookie = await signIn(api, store);
  const json = { "content-type": "application/json", cookie };

  const created = await api.request(`${BASE}/devices`, {
    method: "POST",
    headers: json,
    // Typed the way a human types it, spaces and all.
    body: JSON.stringify({
      msisdn: "+34 600 111 222",
      label: "Casa de María",
      address: "Calle Real 14",
      kind: "base",
    }),
  });
  assertEquals(created.status, 201);
  const device = await created.json();
  assertEquals(device.msisdn, "+34600111222");
  // Never tested yet — the state a coordinator has to act on.
  assertEquals(device.status, "never");

  // The number is the identity: registering it twice would silently repoint a
  // household's alarm at another address.
  const duplicate = await api.request(`${BASE}/devices`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({
      msisdn: "+34600111222",
      label: "Otra casa",
      address: "Otra calle",
      kind: "phone",
    }),
  });
  assertEquals(duplicate.status, 400);

  const patched = await api.request(`${BASE}/devices/+34600111222`, {
    method: "PATCH",
    headers: json,
    body: JSON.stringify({ address: "Calle Real 16" }),
  });
  assertEquals(patched.status, 200);
  assertEquals((await patched.json()).address, "Calle Real 16");

  const listed = await api.request(`${BASE}/devices`, { headers: { cookie } });
  assertEquals((await listed.json()).length, 1);

  const removed = await api.request(`${BASE}/devices/+34600111222`, {
    method: "DELETE",
    headers: { cookie },
  });
  assertEquals(removed.status, 204);
  assertEquals(await store.getDevice("+34600111222"), null);
});

Deno.test("a malformed phone number is refused with a usable message", async () => {
  const { api, store } = setup();
  const cookie = await signIn(api, store);

  const res = await api.request(`${BASE}/devices`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    // Missing the country code: the bridge would never match this.
    body: JSON.stringify({
      msisdn: "600111222",
      label: "Casa",
      address: "Calle",
      kind: "base",
    }),
  });
  assertEquals(res.status, 400);
  assertEquals(typeof (await res.json()).error, "string");
});

Deno.test("signing out kills the session immediately", async () => {
  const { api, store } = setup();
  const cookie = await signIn(api, store);

  assertEquals(
    (await api.request(`${BASE}/session/logout`, {
      method: "POST",
      headers: { cookie },
    })).status,
    204,
  );

  assertEquals((await api.request(`${BASE}/session`, { headers: { cookie } })).status, 401);
});
