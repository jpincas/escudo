// The bridge, end to end, without Twilio and without a socket.
//
// createBridge returns a bare fetch handler, so the real signature check, the
// real routing and the real AlertService run here — only the network and the
// Telegram API are missing.
//
// The rules being pinned down are the ones a village's safety rests on:
// an unsigned request raises nothing, any contact from a registered number
// raises everything, and an unregistered number never reaches the group.

import { assertEquals, assertStringIncludes } from "@std/assert";
import { AlertService } from "../src/alerts.ts";
import {
  createBridge,
  isLowBattery,
  parseLocation,
  pickCategory,
  SMS_PATH,
  VOICE_PATH,
} from "../src/bridge/twilio.ts";
import { MemoryStore } from "../src/store/memory.ts";
import type { Device, Store } from "../src/store/types.ts";
import { FakeNotifier, makeConfig } from "./helpers.ts";

const AUTH_TOKEN = "twilio-auth-token";
const PUBLIC_URL = "https://escudo.example";

function device(overrides: Partial<Device> = {}): Device {
  return {
    msisdn: "+34600111222",
    label: "Casa de María",
    address: "Calle Real 14",
    kind: "base",
    lastProvenAt: null,
    registeredAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Twilio's own signing scheme, reimplemented here rather than imported from the
 * code under test: a test that shares the implementation would pass just as
 * happily if both sides were wrong together.
 */
async function sign(url: string, params: Record<string, string>): Promise<string> {
  const payload = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(AUTH_TOKEN),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

function setup(now = new Date("2026-07-21T09:00:00.000Z")) {
  const config = makeConfig();
  const store: Store = new MemoryStore();
  const notifier = new FakeNotifier();
  const handle = createBridge({
    config,
    store,
    alerts: new AlertService(config, store, notifier, () => now),
    authToken: AUTH_TOKEN,
    publicUrl: PUBLIC_URL,
    now: () => now,
  });
  return { store, notifier, handle, now };
}

/** POST a Twilio webhook, correctly signed unless told otherwise. */
async function post(
  handle: ReturnType<typeof createBridge>,
  path: string,
  params: Record<string, string>,
  signature?: string | null,
): Promise<Response | null> {
  const url = PUBLIC_URL + path;
  const body = new URLSearchParams(params);
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  const sig = signature === undefined ? await sign(url, params) : signature;
  if (sig !== null) headers.set("x-twilio-signature", sig);
  return await handle(new Request(url, { method: "POST", headers, body }), new URL(url));
}

Deno.test("a path that isn't the bridge falls through", async () => {
  const { handle } = setup();
  const url = new URL(`${PUBLIC_URL}/panel`);
  assertEquals(await handle(new Request(url), url), null);
});

Deno.test("an unsigned request raises nothing", async () => {
  const { handle, store, notifier } = setup();
  await store.putDevice(device());

  for (const signature of [null, "not-base64-at-all!!", await sign("https://elsewhere", {})]) {
    const res = await post(handle, VOICE_PATH, { From: "+34600111222" }, signature);
    assertEquals(res?.status, 403);
  }
  // Nothing posted, and no inbox row either: an attacker must not be able to
  // fill the coordinator's inbox any more than they can raise the village.
  assertEquals(notifier.posted.length, 0);
  assertEquals((await store.listInbox()).length, 0);
});

Deno.test("a call from a registered number raises the alarm and is never answered", async () => {
  const { handle, store, notifier, now } = setup();
  await store.putDevice(device());

  const res = await post(handle, VOICE_PATH, {
    From: "+34600111222",
    To: "+34900000000",
    CallStatus: "ringing",
  });

  assertEquals(res?.status, 200);
  // <Reject> must be the first verb, or Twilio answers the call and bills for it.
  const twiml = await res!.text();
  assertStringIncludes(twiml, "<Response><Reject");

  assertEquals(notifier.posted.length, 1);
  const posted = notifier.posted[0].text;
  assertStringIncludes(posted, "Casa de María");
  // The address is the payload: a wall unit has no GPS, so this line is the
  // only thing that tells a responder where to go.
  assertStringIncludes(posted, "Calle Real 14");
  assertEquals(notifier.posted[0].quiet, false);

  const incidents = await store.listIncidents();
  assertEquals(incidents.length, 1);
  assertEquals(incidents[0].source, "device");
  assertEquals(incidents[0].category, "emergencia");
  assertEquals(incidents[0].reporterRef, "+34600111222");

  // Proof of life — the only evidence this system will ever get that a
  // shop-bought device still works.
  assertEquals((await store.getDevice("+34600111222"))?.lastProvenAt, now.toISOString());
});

Deno.test("a device's call and SMS become one incident, with a pin", async () => {
  const { handle, store, notifier } = setup();
  await store.putDevice(device());

  await post(handle, VOICE_PATH, { From: "+34600111222", CallStatus: "ringing" });
  await post(handle, SMS_PATH, {
    From: "+34600111222",
    Body: "SOS http://maps.google.com/?q=42.3512,-5.1174",
  });

  // Most devices call and text at once. The dedupe window collapses them, and
  // the SMS's position attaches to the alert the call already raised.
  assertEquals(notifier.posted.length, 1);
  assertEquals((await store.listIncidents()).length, 1);
  assertEquals(notifier.locations.length, 1);
  assertEquals(notifier.locations[0].lat, 42.3512);
  assertEquals(notifier.locations[0].lon, -5.1174);
});

Deno.test("an unregistered number lands in the panel inbox, never the group", async () => {
  const { handle, store, notifier } = setup();

  const res = await post(handle, SMS_PATH, { From: "+34600999888", Body: "test alarm" });
  assertEquals(res?.status, 200);

  // Alarming the village would make the number spammable by anyone who guesses
  // it; silence would hide an install that was never finished. So it reaches
  // neither the group nor any other message — only the panel inbox, where a
  // household is named and registered.
  assertEquals(notifier.posted.length, 0);

  const inbox = await store.listInbox();
  assertEquals(inbox.length, 1);
  assertEquals(inbox[0].msisdn, "+34600999888");
  assertEquals(inbox[0].lastBody, "test alarm");
});

Deno.test("a low-battery SMS is not an alarm, but still proves the device", async () => {
  const { handle, store, notifier, now } = setup();
  await store.putDevice(device());

  await post(handle, SMS_PATH, { From: "+34600111222", Body: "Bateria baja 15%" });

  // The village is not woken for a flat battery — that is the whole reason the
  // carve-out exists.
  assertEquals(notifier.posted.length, 0);
  // But the message travelled the whole path, which is exactly what proof-of-life
  // means: the device's lastProvenAt is stamped, and the panel shows it fresh.
  assertEquals((await store.getDevice("+34600111222"))?.lastProvenAt, now.toISOString());
});

Deno.test("a message naming a category refines it; a quiet one cannot", () => {
  const config = makeConfig();
  assertEquals(pickCategory(config, "FUEGO en la era"), "fuego");
  assertEquals(pickCategory(config, null), "emergencia");
  assertEquals(pickCategory(config, "alarm 01 triggered"), "emergencia");
  // A device has one button and no way to mean "this isn't urgent". A body
  // that happens to say "ayuda" must not silence an alarm nobody can hear.
  assertEquals(pickCategory(config, "necesito ayuda"), "emergencia");
});

Deno.test("locations are read from the shapes devices actually send", () => {
  assertEquals(parseLocation("lat:42.3512 lon:-5.1174"), { lat: 42.3512, lon: -5.1174 });
  assertEquals(parseLocation("Lat: 42.3512 Long: -5.1174"), { lat: 42.3512, lon: -5.1174 });
  assertEquals(parseLocation("42.3512,-5.1174"), { lat: 42.3512, lon: -5.1174 });
  assertEquals(parseLocation("SOS https://maps.google.com/?q=42.3512,-5.1174"), {
    lat: 42.3512,
    lon: -5.1174,
  });
  assertEquals(parseLocation("https://www.google.com/maps/@42.3512,-5.1174,17z"), {
    lat: 42.3512,
    lon: -5.1174,
  });
  // A decimal point on both halves is what stops a phone number or a serial
  // being read as a coordinate.
  assertEquals(parseLocation("Llame al +34600111222"), null);
  assertEquals(parseLocation("999.9,-5.1174"), null);
  assertEquals(parseLocation(null), null);
});

Deno.test("the low-battery denylist stays narrow", () => {
  for (const body of ["Bateria baja", "BATERÍA BAJA", "low battery", "Batt low", "pila baja"]) {
    assertEquals(isLowBattery(body), true, body);
  }
  // Anything unrecognised still raises the alarm — erring towards waking
  // people is the safe direction.
  for (const body of ["SOS", "ALM 01", "caida detectada", null]) {
    assertEquals(isLowBattery(body), false, String(body));
  }
});
