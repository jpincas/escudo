// The Zadarma bridge, end to end, without Zadarma and without a socket.
//
// createZadarmaBridge returns a bare fetch handler, so the real signature
// check, the real routing and the real AlertService run here — only the network
// and the Telegram API are missing.
//
// The rules being pinned down are the ones a village's safety rests on: an
// unsigned notification raises nothing, a call from a registered number raises
// everything, an unregistered number never reaches the group — and the alarm is
// raised on NOTIFY_START, which arrives while the phone is still ringing.

import { assertEquals, assertStringIncludes } from "@std/assert";
import { AlertService } from "../src/alerts.ts";
import { createZadarmaBridge, VOICE_PATH } from "../src/bridge/zadarma.ts";
import { MemoryStore } from "../src/store/memory.ts";
import type { Device, Store } from "../src/store/types.ts";
import { FakeNotifier, makeConfig } from "./helpers.ts";

const SECRET = "zadarma-api-secret";
const BASE = "https://escudo.example";
const IVR_ID = "42";

const CALLER = "+34600111222";
const DID = "+34987123456";
const CALL_START = "2026-07-23 09:00:00";

function device(overrides: Partial<Device> = {}): Device {
  return {
    msisdn: CALLER,
    label: "Casa de María",
    address: "Calle Real 14",
    kind: "base",
    lastProvenAt: null,
    registeredAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Zadarma's own signing scheme, reimplemented here rather than imported from
 * the code under test: a test that shares the implementation would pass just as
 * happily if both sides were wrong together.
 *
 * base64(HMAC-SHA1(caller_id + called_did + call_start, secret)).
 */
async function sign(params: Record<string, string>): Promise<string> {
  const payload = (params.caller_id ?? "") + (params.called_did ?? "") +
    (params.call_start ?? "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

function setup(now = new Date("2026-07-23T09:00:00.000Z")) {
  const config = makeConfig();
  const store: Store = new MemoryStore();
  const notifier = new FakeNotifier();
  const handle = createZadarmaBridge({
    config,
    store,
    alerts: new AlertService(config, store, notifier, () => now),
    apiSecret: SECRET,
    ivrPlayId: IVR_ID,
    now: () => now,
  });
  return { store, notifier, handle, now };
}

function startParams(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    event: "NOTIFY_START",
    caller_id: CALLER,
    called_did: DID,
    call_start: CALL_START,
    pbx_call_id: "abc123",
    ...overrides,
  };
}

/** POST a Zadarma notification, correctly signed unless told otherwise. */
async function post(
  handle: ReturnType<typeof createZadarmaBridge>,
  params: Record<string, string>,
  signature?: string | null,
): Promise<Response | null> {
  const url = BASE + VOICE_PATH;
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  const sig = signature === undefined ? await sign(params) : signature;
  if (sig !== null) headers.set("signature", sig);
  return await handle(
    new Request(url, { method: "POST", headers, body: new URLSearchParams(params) }),
    new URL(url),
  );
}

Deno.test("a path that isn't the bridge falls through", async () => {
  const { handle } = setup();
  const url = new URL(`${BASE}/panel`);
  assertEquals(await handle(new Request(url), url), null);
});

Deno.test("the zd_echo handshake returns the nonce verbatim", async () => {
  const { handle } = setup();
  const url = new URL(`${BASE}${VOICE_PATH}?zd_echo=1234567`);
  const res = await handle(new Request(url), url);
  assertEquals(res?.status, 200);
  assertEquals(await res?.text(), "1234567");
});

Deno.test("a signed call from a registered number raises the village", async () => {
  const { store, notifier, handle, now } = setup();
  await store.putDevice(device());

  const res = await post(handle, startParams());
  assertEquals(res?.status, 200);

  // The village heard about it.
  assertEquals(notifier.posted.length, 1);
  assertStringIncludes(notifier.posted[0].text, "Casa de María");

  // And the device is recorded as having proven itself.
  const saved = await store.getDevice(CALLER);
  assertEquals(saved?.lastProvenAt, now.toISOString());
});

Deno.test("the reply plays the recording and hangs up", async () => {
  const { store, handle } = setup();
  await store.putDevice(device());

  const res = await post(handle, startParams());
  assertEquals(await res?.json(), { ivr_play: IVR_ID, hangup: 1 });
});

Deno.test("with no recording configured the call is still hung up", async () => {
  const config = makeConfig();
  const store: Store = new MemoryStore();
  const now = new Date("2026-07-23T09:00:00.000Z");
  const handle = createZadarmaBridge({
    config,
    store,
    alerts: new AlertService(config, store, new FakeNotifier(), () => now),
    apiSecret: SECRET,
    now: () => now,
  });
  await store.putDevice(device());

  const res = await post(handle, startParams());
  assertEquals(await res?.json(), { hangup: 1 });
});

Deno.test("an unsigned notification raises nothing", async () => {
  const { store, notifier, handle } = setup();
  await store.putDevice(device());

  const res = await post(handle, startParams(), null);
  assertEquals(res?.status, 403);
  assertEquals(notifier.posted.length, 0);
});

Deno.test("a wrongly signed notification raises nothing", async () => {
  const { store, notifier, handle } = setup();
  await store.putDevice(device());

  const res = await post(handle, startParams(), "bm90LXRoZS1yaWdodC1zaWduYXR1cmU=");
  assertEquals(res?.status, 403);
  assertEquals(notifier.posted.length, 0);
});

Deno.test("a signature over different fields is refused", async () => {
  const { store, notifier, handle } = setup();
  await store.putDevice(device());

  // Correctly signed — for a different caller. Pinning down that the signature
  // actually covers caller_id, which is the field the whole alarm turns on.
  const signature = await sign(startParams({ caller_id: "+34600999888" }));
  const res = await post(handle, startParams(), signature);
  assertEquals(res?.status, 403);
  assertEquals(notifier.posted.length, 0);
});

Deno.test("events other than NOTIFY_START are acknowledged and ignored", async () => {
  const { store, notifier, handle } = setup();
  await store.putDevice(device());

  // No signature at all: these are signed over strings we never compute, so the
  // check must not run and must not fail.
  const res = await post(handle, startParams({ event: "NOTIFY_END" }), null);
  assertEquals(res?.status, 200);
  assertEquals(notifier.posted.length, 0);
});

Deno.test("an unregistered number reaches the inbox, never the group", async () => {
  const { store, notifier, handle } = setup();

  const res = await post(handle, startParams({ caller_id: "+34611000999" }));
  assertEquals(res?.status, 200);
  assertEquals(notifier.posted.length, 0);

  const inbox = await store.listInbox();
  assertEquals(inbox.length, 1);
  assertEquals(inbox[0].msisdn, "+34611000999");
  assertEquals(inbox[0].lastVia, "call");
});

Deno.test("a caller id that isn't a phone number raises nothing", async () => {
  const { store, notifier, handle } = setup();

  const res = await post(handle, startParams({ caller_id: "anonymous" }));
  assertEquals(res?.status, 200);
  assertEquals(notifier.posted.length, 0);
  // Not even the inbox: an unusable caller id is nothing we can act on later.
  assertEquals((await store.listInbox()).length, 0);
});

Deno.test("a GET that isn't the handshake is refused", async () => {
  const { handle } = setup();
  const url = new URL(`${BASE}${VOICE_PATH}`);
  const res = await handle(new Request(url), url);
  assertEquals(res?.status, 405);
});
