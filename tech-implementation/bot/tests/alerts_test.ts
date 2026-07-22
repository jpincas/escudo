import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { AlertService, newIncidentId } from "../src/alerts.ts";
import { MemoryStore } from "../src/store/memory.ts";
import { purgeExpiredIncidents } from "../src/jobs/retention.ts";
import { FakeClock, FakeNotifier, makeConfig } from "./helpers.ts";

function setup(at = "2026-07-20T14:32:00.000Z") {
  const config = makeConfig();
  const store = new MemoryStore();
  const notifier = new FakeNotifier();
  const clock = new FakeClock(new Date(at));
  const alerts = new AlertService(config, store, notifier, clock.now);
  return { config, store, notifier, clock, alerts };
}

const maria = {
  source: "telegram" as const,
  category: "fuego",
  reporterRef: "42",
  reporterName: "María G.",
};

Deno.test("raising an alert posts it and logs it", async () => {
  const { store, notifier, alerts } = setup();

  const result = await alerts.raiseAlert(maria);

  assertEquals(result.status, "raised");
  assertEquals(notifier.posted.length, 1);
  assertStringIncludes(notifier.posted[0].text, "FUEGO");

  // The message id must be persisted, or the alert can never be cancelled.
  const stored = await store.getIncident(result.incident.id);
  assertEquals(stored?.groupMessageId, notifier.posted[0].messageId);
});

Deno.test("a second press inside the dedupe window does not post again", async () => {
  const { notifier, alerts, clock } = setup();

  const first = await alerts.raiseAlert(maria);
  clock.advanceSeconds(20);
  const second = await alerts.raiseAlert(maria);

  assertEquals(second.status, "duplicate");
  assertEquals(second.incident.id, first.incident.id);
  assertEquals(notifier.posted.length, 1);
});

Deno.test("a press after the dedupe window raises a fresh alert", async () => {
  const { notifier, alerts, clock } = setup();

  await alerts.raiseAlert(maria);
  clock.advanceSeconds(61);
  const second = await alerts.raiseAlert(maria);

  assertEquals(second.status, "raised");
  assertEquals(notifier.posted.length, 2);
});

Deno.test("dedupe is per category — a different emergency still gets through", async () => {
  const { notifier, alerts } = setup();

  await alerts.raiseAlert(maria);
  const medical = await alerts.raiseAlert({ ...maria, category: "medico" });

  assertEquals(medical.status, "raised");
  assertEquals(notifier.posted.length, 2);
});

Deno.test("the person who raised an alert can cancel it", async () => {
  const { notifier, alerts } = setup();
  const { incident } = await alerts.raiseAlert(maria) as { incident: { id: string } };

  const result = await alerts.cancelAlert(incident.id, "42", false);

  assertEquals(result.status, "cancelled");
  assertEquals(notifier.updated.length, 1);
  assertStringIncludes(notifier.updated[0].text, "<s>");
  assertStringIncludes(notifier.updated[0].text, "Alerta cancelada");
});

Deno.test("an admin can cancel someone else's alert", async () => {
  const { alerts } = setup();
  const { incident } = await alerts.raiseAlert(maria) as { incident: { id: string } };

  assertEquals((await alerts.cancelAlert(incident.id, "999", true)).status, "cancelled");
});

Deno.test("an unrelated member cannot cancel an alert", async () => {
  const { notifier, alerts } = setup();
  const { incident } = await alerts.raiseAlert(maria) as { incident: { id: string } };

  const result = await alerts.cancelAlert(incident.id, "999", false);

  assertEquals(result.status, "forbidden");
  assertEquals(notifier.updated.length, 0);
});

Deno.test("cancelling an unknown incident is reported, not thrown", async () => {
  const { alerts } = setup();
  assertEquals((await alerts.cancelAlert("does-not-exist", "42", true)).status, "not_found");
});

Deno.test("cancelling twice is harmless", async () => {
  const { alerts } = setup();
  const { incident } = await alerts.raiseAlert(maria) as { incident: { id: string } };

  await alerts.cancelAlert(incident.id, "42", false);
  assertEquals((await alerts.cancelAlert(incident.id, "42", false)).status, "already_cancelled");
});

Deno.test("a cancelled alert frees the dedupe window immediately", async () => {
  const { notifier, alerts, clock } = setup();
  const { incident } = await alerts.raiseAlert(maria) as { incident: { id: string } };

  await alerts.cancelAlert(incident.id, "42", false);
  clock.advanceSeconds(5);
  const again = await alerts.raiseAlert(maria);

  // Cancelling a false alarm and then pressing again for a real one must work.
  assertEquals(again.status, "raised");
  assertEquals(notifier.posted.length, 2);
});

Deno.test("a shared location is attached and pinned under the alert", async () => {
  const { store, notifier, alerts } = setup();
  const { incident } = await alerts.raiseAlert(maria) as { incident: { id: string } };

  await alerts.attachLocation(incident.id, 42.3521, -5.1234);

  const stored = await store.getIncident(incident.id);
  assertEquals(stored?.lat, 42.3521);
  assertEquals(notifier.locations.length, 1);
  assertEquals(notifier.locations[0].replyTo, notifier.posted[0].messageId);
});

Deno.test("a location for a cancelled alert is ignored", async () => {
  const { notifier, alerts } = setup();
  const { incident } = await alerts.raiseAlert(maria) as { incident: { id: string } };
  await alerts.cancelAlert(incident.id, "42", false);

  assertEquals(await alerts.attachLocation(incident.id, 42.35, -5.12), null);
  assertEquals(notifier.locations.length, 0);
});

Deno.test("latestOpenFor finds the most recent open alert across categories", async () => {
  const { alerts, clock } = setup();

  await alerts.raiseAlert(maria);
  clock.advanceSeconds(30);
  const medical = await alerts.raiseAlert({ ...maria, category: "medico" });

  const found = await alerts.latestOpenFor("42");
  assertEquals(found?.id, medical.incident.id);
  assertEquals(await alerts.latestOpenFor("999"), null);
});

Deno.test("incident ids sort by time", () => {
  const earlier = newIncidentId(new Date("2026-07-20T14:00:00.000Z"));
  const later = newIncidentId(new Date("2026-07-20T14:00:01.000Z"));
  assert(earlier < later);
});

Deno.test("retention deletes incidents past the window and keeps the rest", async () => {
  const { store, alerts, clock } = setup("2025-07-01T10:00:00.000Z");
  await alerts.raiseAlert(maria);

  clock.advanceSeconds(400 * 24 * 60 * 60);
  await alerts.raiseAlert({ ...maria, category: "medico" });

  const deleted = await purgeExpiredIncidents(store, 365, clock.now());

  assertEquals(deleted, 1);
  assertEquals((await store.listIncidents()).length, 1);
});

Deno.test("a quiet category is posted without notification", async () => {
  const { alerts, notifier } = setup();

  await alerts.raiseAlert({
    source: "telegram",
    category: "ayuda",
    reporterRef: "1",
    reporterName: "María G.",
  });
  await alerts.raiseAlert({
    source: "telegram",
    category: "fuego",
    reporterRef: "2",
    reporterName: "Luis P.",
  });

  assertEquals(notifier.posted.map((p) => p.quiet), [true, false]);
});
