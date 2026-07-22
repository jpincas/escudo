// The keyboard refresh, and the retired-label safety net behind it.
//
// Both exist for one failure: a member holding last version's keyboard, whose
// press raises nothing. It is silent, it looks like it worked, and it would
// happen during an emergency. These tests are the reason it can't.

import { assertEquals } from "@std/assert";
import type { Bot } from "grammy";
import { keyboardFingerprint, refreshKeyboards } from "../src/telegram/refresh.ts";
import { MemoryStore } from "../src/store/memory.ts";
import type { Config } from "../src/config.ts";
import { makeConfig } from "./helpers.ts";

interface Sent {
  chatId: number;
  silent: boolean;
}

/** Just enough of a Bot to record what would have been sent. */
function fakeBot(failFor: string[] = []): { sent: Sent[]; bot: Bot } {
  const sent: Sent[] = [];
  const bot = {
    api: {
      sendMessage(chatId: number, _text: string, opts?: { disable_notification?: boolean }) {
        if (failFor.includes(String(chatId))) return Promise.reject(new Error("blocked"));
        sent.push({ chatId, silent: Boolean(opts?.disable_notification) });
        return Promise.resolve({});
      },
    },
  } as unknown as Bot;
  return { sent, bot };
}

async function storeWith(ids: string[]) {
  const store = new MemoryStore();
  for (const id of ids) {
    await store.putMember({
      telegramId: id,
      displayName: `Member ${id}`,
      joinedAt: `2026-01-0${id}T00:00:00.000Z`,
    });
  }
  return store;
}

Deno.test("the fingerprint tracks what a member sees, not the config's shape", async () => {
  const base = makeConfig();
  // A label change is visible, so it must change the fingerprint.
  const renamed = makeConfig({
    categories: base.categories.map((c) => c.id === "fuego" ? { ...c, label: "Incendio" } : c),
  } as Partial<Config>);
  // Moving a category to the quiet tier moves it to another row: also visible.
  const requiet = makeConfig({
    categories: base.categories.map((c) =>
      c.id === "delito" ? { ...c, urgency: "quiet" as const } : c
    ),
  } as Partial<Config>);

  assertEquals(keyboardFingerprint(base), keyboardFingerprint(makeConfig()));
  assertEquals(keyboardFingerprint(base) === keyboardFingerprint(renamed), false);
  assertEquals(keyboardFingerprint(base) === keyboardFingerprint(requiet), false);
});

Deno.test("an unchanged keyboard messages nobody, however often we boot", async () => {
  const config = makeConfig();
  const store = await storeWith(["1", "2", "3"]);
  const { sent, bot } = fakeBot();

  const first = await refreshKeyboards(bot, config, store);
  assertEquals([first.changed, first.delivered], [true, 3]);

  // Cold starts and restarts are routine on Deploy. They must be free.
  for (let i = 0; i < 3; i++) {
    const again = await refreshKeyboards(bot, config, store);
    assertEquals([again.changed, again.delivered], [false, 0]);
  }
  assertEquals(sent.length, 3);
});

Deno.test("the refresh is silent — housekeeping never makes a phone ring", async () => {
  // A village whose phones chirp after every deploy mutes the bot, which is
  // the exact failure the whole design is built to avoid.
  const store = await storeWith(["1", "2"]);
  const { sent, bot } = fakeBot();

  await refreshKeyboards(bot, makeConfig(), store);

  assertEquals(sent.map((s) => s.silent), [true, true]);
});

Deno.test("a member who blocked the bot is reported, not fatal", async () => {
  const store = await storeWith(["1", "2", "3"]);
  const { bot } = fakeBot(["2"]);

  const result = await refreshKeyboards(bot, makeConfig(), store);

  assertEquals(result.delivered, 2);
  assertEquals(result.unreachable, ["Member 2"]);
  // Recorded anyway: retrying the village on every restart would re-message
  // the people who are already correct.
  const again = await refreshKeyboards(bot, makeConfig(), store);
  assertEquals(again.changed, false);
});
