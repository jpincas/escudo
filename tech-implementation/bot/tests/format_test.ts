import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  escapeHtml,
  formatAlert,
  formatBoard,
  formatDrill,
  formatTime,
  isQuiet,
  resolveCategory,
} from "../src/format.ts";
import type { Incident } from "../src/store/types.ts";
import { makeConfig } from "./helpers.ts";

function incident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: "aaaaaaaaa-0001",
    source: "telegram",
    category: "fuego",
    reporterRef: "42",
    reporterName: "María G.",
    reporterAddress: null,
    groupMessageId: 1000,
    lat: null,
    lon: null,
    createdAt: "2026-07-20T14:32:00.000Z",
    cancelledAt: null,
    cancelledBy: null,
    ...overrides,
  };
}

Deno.test("an alert carries category, reporter, time and emergency numbers", () => {
  const config = makeConfig();
  const text = formatAlert(config, incident());

  assertStringIncludes(text, "🔥");
  assertStringIncludes(text, "FUEGO");
  assertStringIncludes(text, "María G.");
  assertStringIncludes(text, "062 Guardia Civil · 112 Emergencias");
});

Deno.test("the timestamp is the village's wall clock, not the server's", () => {
  const config = makeConfig();
  // 14:32 UTC in July is 16:32 in Madrid. A responder reads the sign on their
  // own clock; getting this wrong makes an alert look two hours stale.
  assertEquals(formatTime(config, "2026-07-20T14:32:00.000Z"), "16:32");
});

Deno.test("a cancelled alert is struck through, not deleted", () => {
  const config = makeConfig();
  const text = formatAlert(config, incident({ cancelledAt: "2026-07-20T14:40:00.000Z" }));

  assertStringIncludes(text, "<s>");
  assertStringIncludes(text, "</s>");
  assertStringIncludes(text, "Alerta cancelada");
  // The original alert stays legible — the record is the point.
  assertStringIncludes(text, "FUEGO");
  assertStringIncludes(text, "María G.");
});

Deno.test("names with HTML characters cannot break the message", () => {
  const config = makeConfig();
  const text = formatAlert(config, incident({ reporterName: "<b>Ana</b> & Co" }));

  assertStringIncludes(text, "&lt;b&gt;Ana&lt;/b&gt; &amp; Co");
  assertEquals(text.includes("<b>Ana</b>"), false);
});

Deno.test("escapeHtml handles the three characters Telegram cares about", () => {
  assertEquals(escapeHtml("a & b < c > d"), "a &amp; b &lt; c &gt; d");
});

Deno.test("a village's own category label wins over the built-in one", () => {
  const config = makeConfig({
    categories: [{ id: "fuego", emoji: "🔥", label: "Incendio" }],
  });
  assertEquals(resolveCategory(config, "fuego").label, "Incendio");
  assertStringIncludes(formatAlert(config, incident()), "INCENDIO");
});

Deno.test("an unknown category still renders rather than crashing", () => {
  const config = makeConfig();
  const text = formatAlert(config, incident({ category: "inundacion" }));
  assertStringIncludes(text, "INUNDACION");
  assertStringIncludes(text, "🚨");
});

Deno.test("English renders without any Spanish emergency numbers", () => {
  const config = makeConfig({
    village: { name: "Anyvillage", locale: "en", timezone: "Europe/London" },
    alerts: { emergencyLine: "999 · 112", dedupeSeconds: 60 },
  });
  const text = formatAlert(config, incident());

  assertStringIncludes(text, "FIRE");
  assertStringIncludes(text, "999 · 112");
  assertEquals(text.includes("062"), false);
});

Deno.test("the board renders bold markup as HTML", () => {
  const text = formatBoard(makeConfig());
  assertStringIncludes(text, "<b>Red Escudo</b>");
  assertEquals(text.includes("*"), false);
});

Deno.test("a quiet request loses the siren, the shouting and the emergency numbers", () => {
  // The whole point of the tier: it must not be mistakable for an alarm.
  const config = makeConfig();
  const text = formatAlert(config, incident({ category: "ayuda" }));

  assertStringIncludes(text, "🤝 Pedir ayuda");
  assertEquals(text.includes("🚨"), false);
  assertEquals(text.includes("PEDIR AYUDA"), false);
  assertEquals(text.includes(config.alerts.emergencyLine), false);
  assertStringIncludes(text, "No es una emergencia");
});

Deno.test("an emergency still shouts and still carries the numbers", () => {
  const config = makeConfig();
  const text = formatAlert(config, incident({ category: "emergencia" }));

  assertStringIncludes(text, "🚨 🆘 EMERGENCIA");
  assertStringIncludes(text, config.alerts.emergencyLine);
});

Deno.test("isQuiet treats an unknown category as an alarm", () => {
  // Erring towards waking people is the safe direction.
  assertEquals(isQuiet(makeConfig(), "inventada"), false);
});

Deno.test("a drill says what it is before it says anything else", () => {
  // The whole risk of a drill is somebody getting in a car. It is loud on
  // purpose, so the label has to do the work the quiet tier can't.
  const config = makeConfig();
  const text = formatDrill(config, "2026-07-21T14:32:00.000Z");

  assertStringIncludes(text, "SIMULACRO");
  assertStringIncludes(text, "no es una emergencia");
  assertStringIncludes(text, config.village.name);
  assertStringIncludes(text, "16:32");
  // Never mistakable for the real thing, and never carrying its numbers.
  assertEquals(text.includes("🚨"), false);
  assertEquals(text.includes(config.alerts.emergencyLine), false);
});
