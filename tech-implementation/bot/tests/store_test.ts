// One suite, both backends.
//
// KvStore runs production; MemoryStore runs the other tests. A divergence
// between them passes everything else and breaks the village — so every
// behavioural rule the core relies on is asserted against both here.

import { assertEquals } from "@std/assert";
import { KvStore } from "../src/store/kv.ts";
import { MemoryStore } from "../src/store/memory.ts";
import { type Device, type Incident, normaliseKind, type Store } from "../src/store/types.ts";

const backends: Array<[string, () => Promise<Store>]> = [
  ["MemoryStore", async () => new MemoryStore()],
  ["KvStore", async () => new KvStore(await Deno.openKv(":memory:"))],
];

function incident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: "aaaaaaaaa-0001",
    source: "telegram",
    category: "fuego",
    reporterRef: "42",
    reporterName: "María G.",
    reporterAddress: null,
    reporterKind: null,
    simulatedBy: null,
    groupMessageId: null,
    lat: null,
    lon: null,
    createdAt: "2026-07-20T14:32:00.000Z",
    cancelledAt: null,
    cancelledBy: null,
    ...overrides,
  };
}

for (const [name, open] of backends) {
  Deno.test(`${name}: stores and reads back an incident`, async () => {
    const store = await open();
    await store.putIncident(incident());
    assertEquals((await store.getIncident("aaaaaaaaa-0001"))?.reporterName, "María G.");
    assertEquals(await store.getIncident("nope"), null);
    store.close();
  });

  Deno.test(`${name}: finds an open incident by reporter and category`, async () => {
    const store = await open();
    await store.putIncident(incident());
    assertEquals((await store.findOpenIncident("42", "fuego"))?.id, "aaaaaaaaa-0001");
    assertEquals(await store.findOpenIncident("42", "medico"), null);
    assertEquals(await store.findOpenIncident("99", "fuego"), null);
    store.close();
  });

  Deno.test(`${name}: a cancelled incident is no longer open`, async () => {
    const store = await open();
    await store.putIncident(incident());
    await store.putIncident(
      incident({ cancelledAt: "2026-07-20T14:40:00.000Z", cancelledBy: "42" }),
    );
    assertEquals(await store.findOpenIncident("42", "fuego"), null);
    store.close();
  });

  Deno.test(`${name}: lists incidents newest first`, async () => {
    const store = await open();
    await store.putIncident(
      incident({ id: "aaaaaaaaa-0001", createdAt: "2026-07-18T10:00:00.000Z" }),
    );
    await store.putIncident(
      incident({ id: "bbbbbbbbb-0002", createdAt: "2026-07-19T10:00:00.000Z" }),
    );
    await store.putIncident(
      incident({ id: "ccccccccc-0003", createdAt: "2026-07-20T10:00:00.000Z" }),
    );
    const ids = (await store.listIncidents()).map((i) => i.id);
    assertEquals(ids, ["ccccccccc-0003", "bbbbbbbbb-0002", "aaaaaaaaa-0001"]);
    store.close();
  });

  Deno.test(`${name}: purges only incidents older than the cutoff`, async () => {
    const store = await open();
    await store.putIncident(
      incident({ id: "aaaaaaaaa-0001", createdAt: "2025-01-01T00:00:00.000Z" }),
    );
    await store.putIncident(
      incident({ id: "bbbbbbbbb-0002", createdAt: "2026-07-19T23:00:00.000Z" }),
    );
    await store.putIncident(
      incident({ id: "ccccccccc-0003", createdAt: "2026-07-20T12:00:00.000Z" }),
    );

    // Cutoff falls mid-day, so the day index alone can't decide it.
    const deleted = await store.purgeIncidentsBefore("2026-07-20T06:00:00.000Z");
    assertEquals(deleted, 2);
    const ids = (await store.listIncidents()).map((i) => i.id);
    assertEquals(ids, ["ccccccccc-0003"]);
    store.close();
  });

  Deno.test(`${name}: stores and reads back a member`, async () => {
    const store = await open();
    await store.putMember({
      telegramId: "42",
      displayName: "María G.",
      joinedAt: "2026-07-20T14:32:00.000Z",
    });
    assertEquals((await store.getMember("42"))?.displayName, "María G.");
    assertEquals(await store.getMember("99"), null);
    store.close();
  });
}

for (const [name, open] of backends) {
  Deno.test(`${name}: lists members, and keeps meta separate from them`, async () => {
    const store = await open();
    try {
      await store.putMember({
        telegramId: "2",
        displayName: "Luis P.",
        joinedAt: "2026-02-01T00:00:00.000Z",
      });
      await store.putMember({
        telegramId: "1",
        displayName: "María G.",
        joinedAt: "2026-01-01T00:00:00.000Z",
      });

      const members = await store.listMembers();
      assertEquals(members.map((m) => m.displayName), ["María G.", "Luis P."]);

      assertEquals(await store.getMeta("keyboard_fingerprint"), null);
      await store.setMeta("keyboard_fingerprint", "abc");
      assertEquals(await store.getMeta("keyboard_fingerprint"), "abc");
      assertEquals((await store.listMembers()).length, 2);
    } finally {
      store.close();
    }
  });
}

// ── Devices and panel access ──
//
// The registry is what turns an anonymous inbound call or SMS into a named
// alert, so a divergence here means an alarm posted with the wrong address —
// or none at all.

function device(overrides: Partial<Device> = {}): Device {
  return {
    msisdn: "+34600111222",
    label: "Casa de María",
    address: "Calle Real 14",
    kind: "base",
    lastProvenAt: null,
    registeredAt: "2026-07-20T10:00:00.000Z",
    ...overrides,
  };
}

for (const [name, open] of backends) {
  Deno.test(`${name}: registers, updates, lists and removes devices`, async () => {
    const store = await open();
    try {
      assertEquals(await store.getDevice("+34600111222"), null);

      await store.putDevice(device());
      await store.putDevice(device({ msisdn: "+34600333444", label: "Casa de Antonio" }));

      assertEquals((await store.getDevice("+34600111222"))?.address, "Calle Real 14");

      // Sorted by label, which is the order a coordinator reads them in.
      assertEquals(
        (await store.listDevices()).map((d) => d.label),
        ["Casa de Antonio", "Casa de María"],
      );

      // Re-putting the same number replaces it rather than adding a second.
      await store.putDevice(device({ address: "Calle Real 16" }));
      assertEquals((await store.listDevices()).length, 2);
      assertEquals((await store.getDevice("+34600111222"))?.address, "Calle Real 16");

      await store.deleteDevice("+34600111222");
      assertEquals(await store.getDevice("+34600111222"), null);
      assertEquals((await store.listDevices()).length, 1);
    } finally {
      store.close();
    }
  });

  Deno.test(`${name}: the bridge inbox coalesces repeat callers`, async () => {
    const store = await open();
    try {
      const t1 = new Date("2026-07-20T10:00:00.000Z");
      const t2 = new Date("2026-07-20T10:05:00.000Z");
      const t3 = new Date("2026-07-20T11:00:00.000Z");

      await store.noteInbound("+34600999888", "sms", "SOS from device", t1);
      await store.noteInbound("+34600999888", "call", null, t2);
      await store.noteInbound("+34600777666", "call", null, t3);

      const inbox = await store.listInbox();
      // Newest first: the number that just rang is the one being registered.
      assertEquals(inbox.map((e) => e.msisdn), ["+34600777666", "+34600999888"]);

      // One row per number, however many times it rings — a device stuck in a
      // loop must not bury the rest of the inbox.
      const repeat = inbox.find((e) => e.msisdn === "+34600999888")!;
      assertEquals(repeat.count, 2);
      assertEquals(repeat.firstSeenAt, t1.toISOString());
      assertEquals(repeat.lastSeenAt, t2.toISOString());
      assertEquals(repeat.lastVia, "call");
      // A later call clears the old SMS text rather than leaving it stale.
      assertEquals(repeat.lastBody, null);

      await store.deleteInboxEntry("+34600999888");
      assertEquals((await store.listInbox()).map((e) => e.msisdn), ["+34600777666"]);

      assertEquals(await store.purgeInboxBefore("2026-07-20T10:30:00.000Z"), 0);
      assertEquals(await store.purgeInboxBefore("2026-07-21T00:00:00.000Z"), 1);
      assertEquals(await store.listInbox(), []);
    } finally {
      store.close();
    }
  });

  Deno.test(`${name}: a panel code works exactly once`, async () => {
    const store = await open();
    try {
      const now = new Date();
      const future = new Date(now.getTime() + 600_000).toISOString();
      await store.putPanelCode({
        code: "123456789",
        telegramId: "42",
        name: "Jon",
        expiresAt: future,
      });

      assertEquals((await store.takePanelCode("123456789", now))?.telegramId, "42");
      // Spent. A forwarded, screenshotted or re-pasted code must not open a
      // second session.
      assertEquals(await store.takePanelCode("123456789", now), null);
      assertEquals(await store.takePanelCode("never-existed", now), null);
    } finally {
      store.close();
    }
  });

  // Review finding F2: two concurrent redemptions of the *same* correct code
  // must not both succeed. This is only observable against real concurrency
  // — MemoryStore's synchronous Map can't exhibit the race a naive KV
  // get-then-set would, so running this against KvStore specifically is the
  // point. (Confirmed by hand against the pre-fix code: takePanelCode's
  // `.check(entry).delete(key).commit()` was already correct before this
  // finding — the race F2 found was in bumpRateLimit, tested below — but a
  // regression here would be exactly as dangerous, so it stays pinned.)
  Deno.test(`${name}: exactly one of many concurrent redemptions of one code succeeds`, async () => {
    const store = await open();
    try {
      const now = new Date();
      const future = new Date(now.getTime() + 600_000).toISOString();
      await store.putPanelCode({
        code: "778899001",
        telegramId: "42",
        name: "Jon",
        expiresAt: future,
      });

      const results = await Promise.all(
        Array.from({ length: 200 }, () => store.takePanelCode("778899001", now)),
      );
      const successes = results.filter((r) => r !== null);
      assertEquals(successes.length, 1);
    } finally {
      store.close();
    }
  });

  Deno.test(`${name}: issuing a new code supersedes any code already outstanding for that admin`, async () => {
    const store = await open();
    try {
      const now = new Date();
      const future = new Date(now.getTime() + 600_000).toISOString();
      await store.putPanelCode({
        code: "111111111",
        telegramId: "42",
        name: "Jon",
        expiresAt: future,
      });
      await store.putPanelCode({
        code: "222222222",
        telegramId: "42",
        name: "Jon",
        expiresAt: future,
      });

      // A6: the old code is dead the moment the new one is minted — a code
      // scrolled back to in an old message must not work.
      assertEquals(await store.takePanelCode("111111111", now), null);
      assertEquals((await store.takePanelCode("222222222", now))?.telegramId, "42");
    } finally {
      store.close();
    }
  });

  Deno.test(`${name}: bumpRateLimit counts within a window and resets after it`, async () => {
    const store = await open();
    try {
      const t0 = new Date("2026-07-27T10:00:00.000Z");
      assertEquals(await store.bumpRateLimit("login", 60_000, t0), 1);
      assertEquals(await store.bumpRateLimit("login", 60_000, t0), 2);

      // A different key is a different bucket entirely.
      assertEquals(await store.bumpRateLimit("something-else", 60_000, t0), 1);

      // Still within the window: keeps climbing.
      const t1 = new Date(t0.getTime() + 30_000);
      assertEquals(await store.bumpRateLimit("login", 60_000, t1), 3);

      // Past the window: starts over, independent of anything issued in the
      // meantime — the rate limit "survives across codes" (spec 5.2) because
      // it is anchored to wall-clock time, not to a code's own lifecycle.
      const t2 = new Date(t0.getTime() + 61_000);
      assertEquals(await store.bumpRateLimit("login", 60_000, t2), 1);
    } finally {
      store.close();
    }
  });

  // Review finding F2, reproduced and pinned: a plain `get` then `set` with
  // no compare-and-swap let 200 concurrent callers land as few as 4 — 196
  // free, uncounted guesses, since a losing racer's increment was simply
  // discarded rather than retried. This must fail against that version and
  // pass against the atomic retry-loop version (verified by hand: reverting
  // bumpRateLimit to a bare get-then-set reliably drops this test's count
  // well below 200 against KvStore).
  Deno.test(`${name}: bumpRateLimit is exact under real concurrency, not approximate`, async () => {
    const store = await open();
    try {
      const now = new Date();
      const CONCURRENT = 200;
      const results = await Promise.all(
        Array.from({ length: CONCURRENT }, () => store.bumpRateLimit("login", 600_000, now)),
      );
      // Every one of 200 concurrent bumps must be counted — the highest
      // value handed back must be exactly the number of callers, and the
      // values handed back must be the 200 distinct integers 1..200 with no
      // collisions (which is what "some got silently dropped" looks like:
      // duplicates and a low ceiling instead of a clean run).
      assertEquals(Math.max(...results), CONCURRENT);
      assertEquals(new Set(results).size, CONCURRENT);
    } finally {
      store.close();
    }
  });

  Deno.test(`${name}: expired sessions are refused`, async () => {
    const store = await open();
    try {
      const past = new Date(Date.now() - 1_000).toISOString();
      const future = new Date(Date.now() + 600_000).toISOString();

      await store.putSession({
        token: "s-old",
        telegramId: "42",
        name: "Jon",
        createdAt: past,
        expiresAt: past,
      });
      assertEquals(await store.getSession("s-old"), null);

      await store.putSession({
        token: "s-live",
        telegramId: "42",
        name: "Jon",
        createdAt: past,
        expiresAt: future,
      });
      assertEquals((await store.getSession("s-live"))?.name, "Jon");

      await store.deleteSession("s-live");
      assertEquals(await store.getSession("s-live"), null);
    } finally {
      store.close();
    }
  });
}

// ── Public profile (spec 2026-07-27 §3) ──
//
// Presentation only — the point being tested here is that "nothing has ever
// been written" is a valid, empty state rather than null or a throw, and
// that a write replaces the row wholesale (no merge, no history).

for (const [name, open] of backends) {
  Deno.test(`${name}: an unwritten village profile reads as empty, not null`, async () => {
    const store = await open();
    try {
      assertEquals(await store.getVillageProfile(), {
        escudoPhone: null,
        photoUrl: null,
        introText: null,
        responsiblePeople: [],
      });
    } finally {
      store.close();
    }
  });

  Deno.test(`${name}: a village profile write replaces the row wholesale`, async () => {
    const store = await open();
    try {
      await store.putVillageProfile({
        escudoPhone: "+34600111222",
        photoUrl: "https://example.org/photo.jpg",
        introText: "Bienvenidos a la Red Escudo.",
        responsiblePeople: [{ name: "María G.", role: "Coordinadora" }],
      });
      assertEquals((await store.getVillageProfile()).responsiblePeople.length, 1);

      // A second write with fewer people replaces the first entirely — there
      // is no history and no merge (spec 3.2).
      await store.putVillageProfile({
        escudoPhone: null,
        photoUrl: null,
        introText: null,
        responsiblePeople: [],
      });
      assertEquals(await store.getVillageProfile(), {
        escudoPhone: null,
        photoUrl: null,
        introText: null,
        responsiblePeople: [],
      });
    } finally {
      store.close();
    }
  });
}

Deno.test("a device stored under the old kinds comes back as wearable", () => {
  // Registries in the field predate the July 2026 merge of pendant and watch.
  assertEquals(normaliseKind("pendant"), "wearable");
  assertEquals(normaliseKind("watch"), "wearable");
  assertEquals(normaliseKind("alarm"), "alarm");
  // Anything unrecognised degrades to a valid kind rather than failing the
  // next panel edit on a record whose job is to raise alarms.
  assertEquals(normaliseKind("teleporter"), "other");
});
