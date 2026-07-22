// Config validation. A village adopting Escudo edits YAML by hand, so the
// failure these tests protect is "the bot booted with a subtly wrong config and
// nobody noticed until an emergency".

import { assertEquals, assertThrows } from "@std/assert";
import { chatId, parseVillageConfig } from "../src/config.ts";

const valid = `
village:
  name: "Ejemplo del Camino"
  locale: es
  timezone: Europe/Madrid
categories:
  - id: fuego
    emoji: "🔥"
alerts:
  emergency_line: "062 Guardia Civil · 112 Emergencias"
  dedupe_seconds: 60
data:
  retention_days: 365
`;

Deno.test("a well-formed config parses", () => {
  const config = parseVillageConfig(valid);
  assertEquals(config.village.name, "Ejemplo del Camino");
  assertEquals(config.categories.length, 1);
});

Deno.test("the shipped example config is valid", async () => {
  const yaml = await Deno.readTextFile(new URL("../config.example.yaml", import.meta.url));
  const config = parseVillageConfig(yaml);
  assertEquals(config.categories.length, 5);
  // Four alarms and exactly one quiet tier: the shipped default is the design.
  assertEquals(config.categories.filter((c) => c.urgency === "quiet").length, 1);
  assertEquals(config.categories.at(-1)?.id, "ayuda");
});

Deno.test("a category with no urgency is an alarm, not a quiet one", () => {
  const config = parseVillageConfig(valid);
  assertEquals(config.categories[0].urgency, undefined);
});

Deno.test("an unknown locale is rejected", () => {
  assertThrows(
    () => parseVillageConfig(valid.replace("locale: es", "locale: fr")),
    Error,
    "village.locale",
  );
});

Deno.test("a bogus timezone is rejected", () => {
  assertThrows(
    () => parseVillageConfig(valid.replace("Europe/Madrid", "Middle/Earth")),
    Error,
    "not a known IANA timezone",
  );
});

Deno.test("duplicate category ids are rejected", () => {
  const duplicated = valid.replace(
    `  - id: fuego\n    emoji: "🔥"`,
    `  - id: fuego\n    emoji: "🔥"\n  - id: fuego\n    emoji: "🚑"`,
  );
  assertThrows(() => parseVillageConfig(duplicated), Error, 'duplicate id "fuego"');
});

Deno.test("a config with no categories is rejected", () => {
  const noCategories = valid.replace(`  - id: fuego\n    emoji: "🔥"\n`, "");
  assertThrows(() => parseVillageConfig(noCategories), Error, "categories");
});

Deno.test("a chat id env var parses, and a malformed one is rejected", () => {
  assertEquals(chatId("ESCUDO_GROUP_CHAT_ID", "-1001234567890"), -1001234567890);
  assertThrows(
    () => chatId("ESCUDO_GROUP_CHAT_ID", "not-a-number"),
    Error,
    "ESCUDO_GROUP_CHAT_ID",
  );
});

Deno.test("optional fields take their documented defaults", () => {
  const minimal = valid
    .replace("  dedupe_seconds: 60\n", "")
    .replace("  retention_days: 365", "  retention_days: 365");
  const config = parseVillageConfig(minimal);
  assertEquals(config.alerts.dedupe_seconds, 60);
});
