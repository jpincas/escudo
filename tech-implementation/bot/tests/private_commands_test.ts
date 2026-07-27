// Commands typed in a DM must reach their handler.
//
// The reporting catch-all listens to every private text message, because a
// member who has lost the keyboard gets it back by typing anything at all. It
// therefore sits in front of every command handler registered after it, and if
// it returns instead of calling next(), those commands vanish: no reply, no
// error, nothing in the logs. That is exactly what happened to /panel, the one
// command that only works in a private chat — it was dead in production while
// every other command worked, because the others happen to be registered first.
//
// Registration order is not something to rely on remembering, so this test
// pins the behaviour instead.

import { assert, assertEquals } from "@std/assert";
import { Bot } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";
import { registerPrivateReporting } from "../src/telegram/private.ts";
import { MemoryStore } from "../src/store/memory.ts";
import { AlertService } from "../src/alerts.ts";
import { FakeNotifier, makeConfig } from "./helpers.ts";

const BOT_INFO = {
  id: 1,
  is_bot: true,
  first_name: "Escudo",
  username: "escudo_test_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
} as UserFromGetMe;

/** A bot whose outgoing API calls are recorded rather than sent. */
function testBot(): { bot: Bot; calls: string[] } {
  const calls: string[] = [];
  const bot = new Bot("0:TEST", { botInfo: BOT_INFO });
  bot.api.config.use((_prev, method) => {
    calls.push(method);
    return Promise.resolve({ ok: true, result: true } as never);
  });
  return { bot, calls };
}

function privateText(text: string): Update {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      text,
      // Telegram marks a command with an entity, and that is what grammY's
      // command() filter matches on — plain text starting with "/" is not
      // enough, in the test or in production.
      entities: text.startsWith("/")
        ? [{ type: "bot_command", offset: 0, length: text.length }]
        : undefined,
      chat: { id: 42, type: "private", first_name: "Ana" },
      from: { id: 42, is_bot: false, first_name: "Ana" },
    },
  } as Update;
}

function wire(bot: Bot) {
  const config = makeConfig();
  const store = new MemoryStore();
  const alerts = new AlertService(config, store, new FakeNotifier());
  // The same order as createBot(): the catch-all first, commands after it.
  registerPrivateReporting(bot, config, store, alerts);
}

Deno.test("a command in a DM reaches a handler registered after the reporting catch-all", async () => {
  const { bot } = testBot();
  wire(bot);

  let reached = false;
  bot.command("panel", () => {
    reached = true;
    return Promise.resolve();
  });
  await bot.init();

  await bot.handleUpdate(privateText("/panel"));

  assert(reached, "/panel never reached its handler — the catch-all swallowed it");
});

Deno.test("ordinary text in a DM still gets the keyboard back, and goes no further", async () => {
  const { bot, calls } = testBot();
  wire(bot);

  let reached = false;
  bot.command("panel", () => {
    reached = true;
    return Promise.resolve();
  });
  await bot.init();

  await bot.handleUpdate(privateText("hola"));

  assertEquals(calls, ["sendMessage"], "the hint (with the keyboard) should be the only call");
  assert(!reached, "plain text must not fall through to a command handler");
});
