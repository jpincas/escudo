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
import { createZadarmaBridge, startSignatureString, VOICE_PATH } from "../src/bridge/zadarma.ts";
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
 * base64(hex(HMAC-SHA1(caller_id + called_did + call_start, secret))).
 *
 * The hex step is not decoration — see the note in zadarma.ts. Reimplementing
 * it here was not enough on its own: the first version of this helper repeated
 * the same wrong assumption as the bridge, so both agreed and every real call
 * would have been refused in Bercianos. Hence the golden vector below, computed
 * outside this codebase against PHP's semantics.
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
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return btoa(hex);
}

Deno.test("the signature matches Zadarma's own encoding, byte for byte", async () => {
  // base64_encode(hash_hmac('sha1', "+34600111222+349871234562026-07-23 09:00:00",
  // 'zadarma-api-secret')) — PHP's hash_hmac returns hexits, so this is base64
  // over 40 characters, not over 20 bytes. If this constant ever has to change,
  // the bridge has stopped speaking Zadarma's language.
  assertEquals(
    startSignatureString(startParams()),
    "+34600111222+349871234562026-07-23 09:00:00",
  );
  assertEquals(
    await sign(startParams()),
    "ZGE1ZTQwZWMwOTNhYTI3MzkyYjgwZWNmZDQwZWYwMzQ0YWMzMGQ2Ng==",
  );
});

Deno.test("a signature over the raw digest, as their docs read, is refused", async () => {
  const { store, notifier, handle } = setup();
  await store.putDevice(device());

  // The plausible misreading: base64 of the 20 HMAC bytes. It must not pass, or
  // the check would accept two different encodings and prove nothing.
  const res = await post(handle, startParams(), "2l5A7Ak6onOSuA7P1A7wNErDDWY=");
  assertEquals(res?.status, 403);
  assertEquals(notifier.posted.length, 0);
});

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

Deno.test("with no recording configured the PBX's own greeting is left to run", async () => {
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

  // Empty, not `{hangup: 1}` — hanging up here would cut off the greeting the
  // PBX is about to play, which is the caller's only confirmation it worked.
  const res = await post(handle, startParams());
  assertEquals(await res?.json(), {});
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

// The source-IP check. It is off in every test above, which is how the bridge
// runs locally and self-hosted; these two pin down what it does when it is on.
function setupWithIpCheck() {
  const config = makeConfig();
  const store: Store = new MemoryStore();
  const notifier = new FakeNotifier();
  const now = new Date("2026-07-23T09:00:00.000Z");
  const handle = createZadarmaBridge({
    config,
    store,
    alerts: new AlertService(config, store, notifier, () => now),
    apiSecret: SECRET,
    checkSourceIp: true,
    now: () => now,
  });
  return { store, notifier, handle };
}

async function postFrom(
  handle: ReturnType<typeof createZadarmaBridge>,
  ip: string | null,
): Promise<Response | null> {
  const url = BASE + VOICE_PATH;
  const params = startParams();
  const headers = new Headers({
    "content-type": "application/x-www-form-urlencoded",
    "signature": await sign(params),
  });
  if (ip !== null) headers.set("x-forwarded-for", `${ip}, 10.0.0.1`);
  return await handle(
    new Request(url, { method: "POST", headers, body: new URLSearchParams(params) }),
    new URL(url),
  );
}

Deno.test("with the IP check on, a correctly signed call from Zadarma's range is accepted", async () => {
  const { store, notifier, handle } = setupWithIpCheck();
  await store.putDevice(device());

  // 185.45.152.40/30 is the documented range.
  const res = await postFrom(handle, "185.45.152.41");
  assertEquals(res?.status, 200);
  assertEquals(notifier.posted.length, 1);
});

Deno.test("with the IP check on, a correctly signed call from anywhere else raises nothing", async () => {
  const { store, notifier, handle } = setupWithIpCheck();
  await store.putDevice(device());

  // A valid signature is not enough — this is the second lock, and a leaked
  // secret must still be useless from the wrong address.
  assertEquals((await postFrom(handle, "203.0.113.9"))?.status, 403);
  // No header at all: reached directly, with nothing to check. Refused, which is
  // why the check must stay off unless a proxy is known to set it.
  assertEquals((await postFrom(handle, null))?.status, 403);
  assertEquals(notifier.posted.length, 0);
});

Deno.test("a GET that isn't the handshake is refused", async () => {
  const { handle } = setup();
  const url = new URL(`${BASE}${VOICE_PATH}`);
  const res = await handle(new Request(url), url);
  assertEquals(res?.status, 405);
});
