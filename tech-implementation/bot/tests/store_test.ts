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

  Deno.test(`${name}: a panel link works exactly once`, async () => {
    const store = await open();
    try {
      const future = new Date(Date.now() + 600_000).toISOString();
      await store.putPanelLink({ token: "t1", telegramId: "42", name: "Jon", expiresAt: future });

      assertEquals((await store.takePanelLink("t1"))?.telegramId, "42");
      // Spent. A forwarded or re-pasted link must not open a second session.
      assertEquals(await store.takePanelLink("t1"), null);
      assertEquals(await store.takePanelLink("never-existed"), null);
    } finally {
      store.close();
    }
  });

  Deno.test(`${name}: expired links and sessions are refused`, async () => {
    const store = await open();
    try {
      const past = new Date(Date.now() - 1_000).toISOString();
      const future = new Date(Date.now() + 600_000).toISOString();

      await store.putPanelLink({ token: "old", telegramId: "42", name: "Jon", expiresAt: past });
      assertEquals(await store.takePanelLink("old"), null);

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
