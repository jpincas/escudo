// The panel API, end to end, without a socket or Telegram.
//
// Hono apps are just fetch handlers, so the real router, the real middleware
// and the real store run here — only the network is missing. The rule that
// matters most: nothing is readable without a session. (Code redemption
// itself — the exactly-once, expiry, supersession and attempt-cap behaviour
// — is a plain HTML form POST outside /api now, at POST /panel; see
// tests/panel_login_test.ts.)

import { assertEquals } from "@std/assert";
import { createPanelApi } from "../src/panel/api.ts";
import { SESSION_COOKIE } from "../src/panel/auth.ts";
import { KvStore } from "../src/store/kv.ts";
import { MemoryStore } from "../src/store/memory.ts";
import type { Store } from "../src/store/types.ts";
import { makeConfig } from "./helpers.ts";

const BASE = "http://localhost";

function setup(): { api: ReturnType<typeof createPanelApi>; store: Store } {
  const store = new MemoryStore();
  return { api: createPanelApi(makeConfig(), store), store };
}

/**
 * Same wiring as setup(), but backed by real Deno KV rather than MemoryStore.
 * Production always runs on KvStore (main.ts never opens a MemoryStore), so a
 * few things — like exactly which cursor strings KV's own decode rejects —
 * are only faithfully reproduced against it, not against the in-memory double.
 */
async function setupKv(): Promise<{ api: ReturnType<typeof createPanelApi>; store: Store }> {
  const store = new KvStore(await Deno.openKv(":memory:"));
  return { api: createPanelApi(makeConfig(), store), store };
}

/**
 * Create a session directly in the store — what a successful code
 * redemption at POST /panel would leave behind — without exercising that
 * endpoint here (it isn't part of this API; see panel_login_test.ts).
 */
async function signIn(store: Store): Promise<string> {
  const token = "test-session-token";
  await store.putSession({
    token,
    telegramId: "42",
    name: "Jon",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  });
  return `${SESSION_COOKIE}=${token}`;
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

// The panel SPA has no session yet at this point, so it can't read a locale
// off `Me` — this is the only place it can come from (panel §2.3). Not
// sensitive: it's the same locale the welcome page is about to show anyone.
Deno.test("a 401 on the session route carries the village's locale", async () => {
  const { api } = setup();

  const noSession = await api.request(`${BASE}/session`);
  assertEquals(noSession.status, 401);
  assertEquals((await noSession.json()).locale, "es");
});

// Spec 2026-07-27 §5: "the token-exchange endpoint that backs it is replaced
// by code redemption" — replaced, not left running alongside. Code
// redemption's own exactly-once, expiry, supersession and attempt-cap
// behaviour lives outside this API, at POST /panel; see
// tests/panel_login_test.ts.
Deno.test("the removed magic-link exchange route is gone", async () => {
  const { api } = setup();
  const res = await api.request(`${BASE}/session/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "anything" }),
  });
  // Falls through to the ordinary session gate, same as any other unknown
  // path under /api without a cookie.
  assertEquals(res.status, 401);
});

Deno.test("a device can be registered, edited and removed", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);
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
  const cookie = await signIn(store);

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

// ── Village profile (spec 2026-07-27 §3) ──

Deno.test("the village profile route is refused without a session", async () => {
  const { api } = setup();
  assertEquals((await api.request(`${BASE}/village-profile`)).status, 401);
  assertEquals(
    (await api.request(`${BASE}/village-profile`, { method: "PUT" })).status,
    401,
  );
});

Deno.test("a brand-new deployment's profile reads as empty, not an error", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  const res = await api.request(`${BASE}/village-profile`, { headers: { cookie } });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), {
    escudoPhone: null,
    photoUrl: null,
    introText: null,
    responsiblePeople: [],
  });
});

Deno.test("a full profile can be saved and read back, phone number normalised", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);
  const json = { "content-type": "application/json", cookie };

  const saved = await api.request(`${BASE}/village-profile`, {
    method: "PUT",
    headers: json,
    body: JSON.stringify({
      escudoPhone: "+34 600 111 222",
      photoUrl: "https://example.org/photo.jpg",
      introText: "Bienvenidos a la Red Escudo de este pueblo.",
      responsiblePeople: [
        { name: "María G.", role: "Coordinadora" },
        { name: "Luis P.", role: "Suplente" },
      ],
    }),
  });
  assertEquals(saved.status, 200);
  const body = await saved.json();
  assertEquals(body.escudoPhone, "+34600111222");
  assertEquals(body.responsiblePeople.length, 2);

  const reread = await api.request(`${BASE}/village-profile`, { headers: { cookie } });
  assertEquals((await reread.json()).responsiblePeople[0].name, "María G.");
});

Deno.test("every field is optional — an all-empty profile is accepted", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  const res = await api.request(`${BASE}/village-profile`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      escudoPhone: "",
      photoUrl: "",
      introText: "",
      responsiblePeople: [],
    }),
  });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), {
    escudoPhone: null,
    photoUrl: null,
    introText: null,
    responsiblePeople: [],
  });
});

Deno.test("a malformed Escudo phone number is refused, naming the field, and nothing is stored", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  const res = await api.request(`${BASE}/village-profile`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      escudoPhone: "600111222", // missing the country code
      photoUrl: "",
      introText: "",
      responsiblePeople: [],
    }),
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
  assertEquals(body.field, "escudoPhone");
  assertEquals(await store.getVillageProfile(), {
    escudoPhone: null,
    photoUrl: null,
    introText: null,
    responsiblePeople: [],
  });
});

Deno.test("a photo URL that is not https is refused, naming the field", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  const res = await api.request(`${BASE}/village-profile`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      escudoPhone: "",
      photoUrl: "http://example.org/photo.jpg",
      introText: "",
      responsiblePeople: [],
    }),
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.field, "photoUrl");
});

Deno.test("a responsible person with a blank role is refused, naming that person's field", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  const res = await api.request(`${BASE}/village-profile`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      escudoPhone: "",
      photoUrl: "",
      introText: "",
      responsiblePeople: [{ name: "María G.", role: "   " }],
    }),
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.field, "responsiblePeople.0.role");
  // Rejected — the stored record is untouched.
  assertEquals((await store.getVillageProfile()).responsiblePeople, []);
});

// ── Length bounds (review finding F2) ──
//
// A record over Deno KV's 64 KiB value cap must be refused with a
// field-named 400, not left to the write blow up as a bare 500.

Deno.test("an intro text over the length limit is refused, naming the field", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  const res = await api.request(`${BASE}/village-profile`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      escudoPhone: "",
      photoUrl: "",
      introText: "x".repeat(2001),
      responsiblePeople: [],
    }),
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.field, "introText");
  assertEquals((await store.getVillageProfile()).introText, null);
});

Deno.test("a photo URL over the length limit is refused, naming the field", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  const res = await api.request(`${BASE}/village-profile`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      escudoPhone: "",
      photoUrl: "https://example.org/" + "x".repeat(2000),
      introText: "",
      responsiblePeople: [],
    }),
  });
  assertEquals(res.status, 400);
  assertEquals((await res.json()).field, "photoUrl");
  assertEquals((await store.getVillageProfile()).photoUrl, null);
});

Deno.test("a person's name or role over the length limit is refused, naming that field", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  const badName = await api.request(`${BASE}/village-profile`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      escudoPhone: "",
      photoUrl: "",
      introText: "",
      responsiblePeople: [{ name: "x".repeat(201), role: "Coordinadora" }],
    }),
  });
  assertEquals(badName.status, 400);
  assertEquals((await badName.json()).field, "responsiblePeople.0.name");

  const badRole = await api.request(`${BASE}/village-profile`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      escudoPhone: "",
      photoUrl: "",
      introText: "",
      responsiblePeople: [{ name: "María G.", role: "x".repeat(201) }],
    }),
  });
  assertEquals(badRole.status, 400);
  assertEquals((await badRole.json()).field, "responsiblePeople.0.role");

  assertEquals((await store.getVillageProfile()).responsiblePeople, []);
});

Deno.test("more than the maximum number of responsible people is refused, naming the list", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  const tooMany = Array.from({ length: 51 }, (_, i) => ({
    name: `Persona ${i}`,
    role: "Voluntario",
  }));

  const res = await api.request(`${BASE}/village-profile`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      escudoPhone: "",
      photoUrl: "",
      introText: "",
      responsiblePeople: tooMany,
    }),
  });
  assertEquals(res.status, 400);
  assertEquals((await res.json()).field, "responsiblePeople");
  assertEquals((await store.getVillageProfile()).responsiblePeople, []);
});

Deno.test("a store failure while saving the profile surfaces as a JSON error, not a raw crash", async () => {
  const inner = new MemoryStore();
  // A test double that behaves exactly like `inner` (every call falls
  // through the prototype chain to it) except the one write we want to fail
  // — simpler than hand-writing a pass-through wrapper for all of Store.
  const failing = Object.create(inner) as Store;
  failing.putVillageProfile = () => Promise.reject(new Error("kv unavailable"));

  const api = createPanelApi(makeConfig(), failing);
  const cookie = await signIn(failing);

  const res = await api.request(`${BASE}/village-profile`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ escudoPhone: "", photoUrl: "", introText: "", responsiblePeople: [] }),
  });
  assertEquals(res.status, 500);
  assertEquals(typeof (await res.json()).error, "string");
});

// ── Unknown keys are stripped, not merely ignored (review finding F4) ──
//
// This rests on zod's default strip behaviour. A later `.passthrough()` or a
// hand-rolled parse would silently reopen exactly the door spec 3.1 and "no
// contact details" close, so it is worth its own regression test rather than
// resting on the schema being left alone.

Deno.test("unknown top-level and per-person keys are stripped from what is stored", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  const res = await api.request(`${BASE}/village-profile`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      escudoPhone: "",
      photoUrl: "",
      introText: "",
      // None of these belong in the editable config at all (spec 3.1's
      // "deliberately absent" list) or were ever meant to be writable here.
      villageName: "Should not exist here",
      retentionDays: 9999,
      emergencyLine: "999",
      categories: ["snuck-in"],
      responsiblePeople: [
        {
          name: "María G.",
          role: "Coordinadora",
          phone: "+34600111222",
          email: "maria@example.org",
        },
      ],
    }),
  });
  assertEquals(res.status, 200);

  const body = await res.json();
  assertEquals(Object.keys(body).sort(), [
    "escudoPhone",
    "introText",
    "photoUrl",
    "responsiblePeople",
  ]);
  assertEquals(body.responsiblePeople[0], { name: "María G.", role: "Coordinadora" });

  // Not just this response — the stored record itself.
  const stored = await store.getVillageProfile();
  assertEquals(Object.keys(stored).sort(), [
    "escudoPhone",
    "introText",
    "photoUrl",
    "responsiblePeople",
  ]);
  assertEquals(Object.keys(stored.responsiblePeople[0]).sort(), ["name", "role"]);
});

Deno.test("deleting a person removes them on the next read", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);
  const json = { "content-type": "application/json", cookie };

  await api.request(`${BASE}/village-profile`, {
    method: "PUT",
    headers: json,
    body: JSON.stringify({
      escudoPhone: "",
      photoUrl: "",
      introText: "",
      responsiblePeople: [
        { name: "María G.", role: "Coordinadora" },
        { name: "Luis P.", role: "Suplente" },
      ],
    }),
  });

  await api.request(`${BASE}/village-profile`, {
    method: "PUT",
    headers: json,
    body: JSON.stringify({
      escudoPhone: "",
      photoUrl: "",
      introText: "",
      responsiblePeople: [{ name: "María G.", role: "Coordinadora" }],
    }),
  });

  const res = await api.request(`${BASE}/village-profile`, { headers: { cookie } });
  const body = await res.json();
  assertEquals(body.responsiblePeople.map((p: { name: string }) => p.name), ["María G."]);
});

// ── History (spec 2026-07-27 §6) ──

Deno.test("the incidents route is refused without a session", async () => {
  const { api } = setup();
  assertEquals((await api.request(`${BASE}/incidents`)).status, 401);
});

Deno.test("session carries the village timezone and retention window", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  const res = await api.request(`${BASE}/session`, { headers: { cookie } });
  const body = await res.json();
  assertEquals(body.timezone, "Europe/Madrid");
  assertEquals(body.retentionDays, 365);
});

Deno.test("incidents come back newest-first, with the configured category and the snapshotted reporter", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  await store.putIncident({
    id: "aaaaaaaaa-0001",
    source: "device",
    category: "fuego",
    reporterRef: "+34600111222",
    reporterName: "Casa de María",
    reporterAddress: "Calle Real 14",
    reporterKind: "alarm",
    simulatedBy: null,
    groupMessageId: 10,
    lat: 42.5,
    lon: -5.2,
    createdAt: "2026-07-20T10:00:00.000Z",
    cancelledAt: null,
    cancelledBy: null,
  });
  await store.putIncident({
    id: "bbbbbbbbb-0002",
    source: "telegram",
    category: "medico",
    reporterRef: "42",
    reporterName: "Luis P.",
    reporterAddress: null,
    reporterKind: null,
    simulatedBy: null,
    groupMessageId: 11,
    lat: null,
    lon: null,
    createdAt: "2026-07-21T10:00:00.000Z",
    cancelledAt: null,
    cancelledBy: null,
  });

  const res = await api.request(`${BASE}/incidents`, { headers: { cookie } });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.incidents.map((i: { id: string }) => i.id), [
    "bbbbbbbbb-0002",
    "aaaaaaaaa-0001",
  ]);

  const device = body.incidents[1];
  assertEquals(device.categoryId, "fuego");
  assertEquals(device.categoryEmoji, "🔥");
  assertEquals(device.reporterName, "Casa de María");
  assertEquals(device.reporterAddress, "Calle Real 14");
  assertEquals(device.reporterKind, "alarm");
  assertEquals(device.lat, 42.5);
  assertEquals(device.lon, -5.2);
});

// Review finding (2026-07-28): reporterAddress and reporterKind are
// independent snapshotted fields (spec §6.1) — an incident can carry one
// without the other, and each must come back regardless of whether its
// sibling is set. IncidentTable.tsx's own rendering already guards this
// (`||`, not `&&` — see its "review F3" comment); this is the data-contract
// half, so the case doesn't depend on a live record sitting in a village's
// own incident log to stay proven.
Deno.test("an incident with an address but no kind still returns the address", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  await store.putIncident({
    id: "aaaaaaaaa-0001",
    source: "device",
    category: "fuego",
    reporterRef: "+34600999000",
    reporterName: "Sin tipo",
    reporterAddress: "Calle Sin Tipo 1",
    reporterKind: null,
    simulatedBy: null,
    groupMessageId: null,
    lat: null,
    lon: null,
    createdAt: "2026-07-20T10:00:00.000Z",
    cancelledAt: null,
    cancelledBy: null,
  });

  const res = await api.request(`${BASE}/incidents`, { headers: { cookie } });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.incidents[0].reporterAddress, "Calle Sin Tipo 1");
  assertEquals(body.incidents[0].reporterKind, null);
});

Deno.test("a drill and a cancellation are visible in what the route returns", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  await store.putIncident({
    id: "aaaaaaaaa-0001",
    source: "device",
    category: "emergencia",
    reporterRef: "+34600111222",
    reporterName: "Casa de María",
    reporterAddress: "Calle Real 14",
    reporterKind: "alarm",
    simulatedBy: "Jon",
    groupMessageId: null,
    lat: null,
    lon: null,
    createdAt: "2026-07-20T10:00:00.000Z",
    cancelledAt: null,
    cancelledBy: null,
  });
  await store.putIncident({
    id: "bbbbbbbbb-0002",
    source: "telegram",
    category: "fuego",
    reporterRef: "42",
    reporterName: "Luis P.",
    reporterAddress: null,
    reporterKind: null,
    simulatedBy: null,
    groupMessageId: 12,
    lat: null,
    lon: null,
    createdAt: "2026-07-21T10:00:00.000Z",
    cancelledAt: "2026-07-21T10:05:00.000Z",
    cancelledBy: "42",
  });

  const res = await api.request(`${BASE}/incidents`, { headers: { cookie } });
  const body = await res.json();
  const drill = body.incidents.find((i: { id: string }) => i.id === "aaaaaaaaa-0001");
  const cancelled = body.incidents.find((i: { id: string }) => i.id === "bbbbbbbbb-0002");
  assertEquals(drill.simulatedBy, "Jon");
  assertEquals(cancelled.cancelledAt, "2026-07-21T10:05:00.000Z");
});

Deno.test("incidents are paged, not returned as the whole log, and the second page continues where the first stopped", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  // One more than HISTORY_PAGE_SIZE (20), so a default-size first page must
  // leave exactly one incident for the second.
  for (let i = 0; i < 21; i++) {
    await store.putIncident({
      id: `id-${String(i).padStart(4, "0")}`,
      source: "telegram",
      category: "fuego",
      reporterRef: "42",
      reporterName: "Luis P.",
      reporterAddress: null,
      reporterKind: null,
      simulatedBy: null,
      groupMessageId: null,
      lat: null,
      lon: null,
      createdAt: `2026-07-${String(1 + i).padStart(2, "0")}T10:00:00.000Z`,
      cancelledAt: null,
      cancelledBy: null,
    });
  }

  const first = await api.request(`${BASE}/incidents`, { headers: { cookie } });
  const firstBody = await first.json();
  assertEquals(firstBody.incidents.length, 20);
  assertEquals(firstBody.nextCursor !== null, true);
  // Newest (day 21) first.
  assertEquals(firstBody.incidents[0].id, "id-0020");

  const second = await api.request(
    `${BASE}/incidents?cursor=${encodeURIComponent(firstBody.nextCursor)}`,
    { headers: { cookie } },
  );
  const secondBody = await second.json();
  assertEquals(secondBody.incidents.map((i: { id: string }) => i.id), ["id-0000"]);
  assertEquals(secondBody.nextCursor, null);
});

// Review F1: every one of these reached KV as a real cursor and threw a raw
// TypeError, caught only by Deno's default handler (500, not a JSON body).
// A cursor this API cannot interpret is malformed input like any other and
// must answer the same defined 400 shape as a bad phone number or a
// too-long name — never a crash.
Deno.test("an uninterpretable cursor is refused with a usable 400, never a 500", async () => {
  // Against real KV, not MemoryStore: this is the exact live reproduction
  // (§6 review, F1), and one of these strings — a well-formed MemoryStore
  // cursor — is only meaningless to *this* backend, not to every backend, so
  // testing it here is the only way to actually exercise that failure.
  const { api, store } = await setupKv();
  const cookie = await signIn(store);

  const badCursors = [
    "garbage",
    " ", // arrives as "%20"
    "0mrxtbg5c-097b7fea", // a well-formed MemoryStore cursor, meaningless to KV
    "AjIwMjYtMDctMjMAAjBtcnh0Ymc1Yy0wOTdiN2ZlYQ", // a truncated real KV cursor
  ];

  for (const cursor of badCursors) {
    const res = await api.request(
      `${BASE}/incidents?cursor=${encodeURIComponent(cursor)}`,
      { headers: { cookie } },
    );
    assertEquals(res.status, 400, `cursor ${JSON.stringify(cursor)} should be a 400`);
    assertEquals(typeof (await res.json()).error, "string");
  }
  store.close();
});

Deno.test("an empty cursor is treated as no cursor, not as a malformed one", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);
  await store.putIncident({
    id: "aaaaaaaaa-0001",
    source: "telegram",
    category: "fuego",
    reporterRef: "42",
    reporterName: "Luis P.",
    reporterAddress: null,
    reporterKind: null,
    simulatedBy: null,
    groupMessageId: null,
    lat: null,
    lon: null,
    createdAt: "2026-07-20T10:00:00.000Z",
    cancelledAt: null,
    cancelledBy: null,
  });

  const res = await api.request(`${BASE}/incidents?cursor=`, { headers: { cookie } });
  assertEquals(res.status, 200);
  assertEquals((await res.json()).incidents.length, 1);
});

// ── Bridge inbox (spec 2026-07-27 §7) ──

Deno.test("the inbox route is refused without a session", async () => {
  const { api } = setup();
  assertEquals((await api.request(`${BASE}/inbox`)).status, 401);
});

Deno.test("the inbox lists newest first", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  await store.noteInbound("+34600111111", "call", null, new Date("2026-07-01T10:00:00.000Z"));
  await store.noteInbound(
    "+34600222222",
    "sms",
    "SOS ALM 01",
    new Date("2026-07-02T10:00:00.000Z"),
  );
  await store.noteInbound("+34600333333", "call", null, new Date("2026-07-03T10:00:00.000Z"));

  const res = await api.request(`${BASE}/inbox`, { headers: { cookie } });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.map((e: { msisdn: string }) => e.msisdn), [
    "+34600333333",
    "+34600222222",
    "+34600111111",
  ]);
  assertEquals(body[1].lastVia, "sms");
  assertEquals(body[1].lastBody, "SOS ALM 01");
});

Deno.test("dismissing an inbox entry removes it and creates no device", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  await store.noteInbound("+34600444444", "call", null, new Date("2026-07-01T10:00:00.000Z"));

  const res = await api.request(`${BASE}/inbox/+34600444444`, {
    method: "DELETE",
    headers: { cookie },
  });
  assertEquals(res.status, 204);
  assertEquals(await store.listInbox(), []);
  assertEquals(await store.getDevice("+34600444444"), null);
});

Deno.test("dismissing an entry that no longer exists is refused", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  const res = await api.request(`${BASE}/inbox/+34600555555`, {
    method: "DELETE",
    headers: { cookie },
  });
  assertEquals(res.status, 404);
});

Deno.test("registering from the inbox creates the device and removes the inbox entry", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  await store.noteInbound("+34600666666", "call", null, new Date("2026-07-01T10:00:00.000Z"));

  const res = await api.request(`${BASE}/inbox/+34600666666/register`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ label: "Casa Nueva", address: "Calle Real 20", kind: "base" }),
  });
  assertEquals(res.status, 201);
  const device = await res.json();
  assertEquals(device.msisdn, "+34600666666");
  assertEquals(device.label, "Casa Nueva");

  assertEquals((await store.getDevice("+34600666666"))?.address, "Calle Real 20");
  assertEquals(await store.listInbox(), []);
});

// The single most dangerous case in this section (spec's "must not happen"):
// re-registering a number that is already a device would silently repoint a
// household's alarm at a different address. Both the existing device and the
// inbox entry must be left exactly as they were.
Deno.test("registering a number that is already a device is refused, and nothing is touched", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  await store.putDevice({
    msisdn: "+34600777777",
    label: "Casa de María",
    address: "Calle Real 14",
    kind: "base",
    lastProvenAt: null,
    registeredAt: "2026-06-01T10:00:00.000Z",
  });
  await store.noteInbound("+34600777777", "call", null, new Date("2026-07-01T10:00:00.000Z"));

  const res = await api.request(`${BASE}/inbox/+34600777777/register`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ label: "Otra casa", address: "Otra calle", kind: "phone" }),
  });
  assertEquals(res.status, 400);
  assertEquals(typeof (await res.json()).error, "string");

  // The original device is untouched...
  const device = await store.getDevice("+34600777777");
  assertEquals(device?.label, "Casa de María");
  assertEquals(device?.address, "Calle Real 14");
  // ...and the inbox entry is still there too — a refused registration must
  // not silently drop the very row it failed to act on.
  assertEquals((await store.listInbox()).map((e) => e.msisdn), ["+34600777777"]);
});

Deno.test("registering with a missing field is refused", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);
  await store.noteInbound("+34600888888", "call", null, new Date("2026-07-01T10:00:00.000Z"));

  const res = await api.request(`${BASE}/inbox/+34600888888/register`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ label: "Casa", kind: "base" }), // address missing
  });
  assertEquals(res.status, 400);
  assertEquals(await store.getDevice("+34600888888"), null);
  assertEquals((await store.listInbox()).map((e) => e.msisdn), ["+34600888888"]);
});

// Review 2026-07-28, F2: without this, registering a number the bridge never
// recorded (or one already dismissed / registered by another tab) is a
// second, unguarded way to create a device — the route's own comment claims
// there is exactly one, and this is what makes that true.
Deno.test("registering a number that never reached the inbox is refused", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  const res = await api.request(`${BASE}/inbox/+34600999111/register`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ label: "Casa", address: "Calle", kind: "base" }),
  });
  assertEquals(res.status, 404);
  assertEquals(await store.getDevice("+34600999111"), null);
});

// Spec §7.3: the session route is how the SPA learns the inbox's own
// retention window, since it is a fixed constant, not a village policy field.
Deno.test("session carries the inbox retention window", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  const res = await api.request(`${BASE}/session`, { headers: { cookie } });
  assertEquals((await res.json()).inboxRetentionDays, 30);
});

Deno.test("signing out kills the session immediately", async () => {
  const { api, store } = setup();
  const cookie = await signIn(store);

  assertEquals(
    (await api.request(`${BASE}/session/logout`, {
      method: "POST",
      headers: { cookie },
    })).status,
    204,
  );

  assertEquals((await api.request(`${BASE}/session`, { headers: { cookie } })).status, 401);
});
