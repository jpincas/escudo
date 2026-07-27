// Assembles the bot: one place where config, storage, the alert core and the
// Telegram handlers meet. main.ts wires them to polling or a webhook
// use this same function — the only difference between them is how updates
// arrive.
//
// Note: the bot's Telegram *privacy mode* must stay ON (the BotFather default).
// It receives commands and button presses only, and never reads the village's
// ordinary chatter. That is a setting on the account, not something this code
// can enforce — see README.

import { Bot, GrammyError } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { AlertService } from "../alerts.ts";
import type { Config } from "../config.ts";
import type { Store } from "../store/types.ts";
import { strings } from "../i18n/mod.ts";
import { TelegramNotifier } from "./notifier.ts";
import { registerBoard } from "./board.ts";
import { registerCallbacks } from "./callbacks.ts";
import { registerLocation } from "./location.ts";
import { registerPrivateReporting } from "./private.ts";
import { registerPanel } from "./panel.ts";

export function createBot(config: Config, store: Store): Bot {
  const bot = new Bot(config.secrets.botToken);

  // Telegram allows ~20 messages/minute to one group. Village volume is far
  // below that, but a 429 during an incident is exactly when we can least
  // afford to drop a message — so honour retry_after rather than hand-rolling
  // backoff.
  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 10 }));

  const notifier = new TelegramNotifier(bot.api, config);
  const alerts = new AlertService(config, store, notifier);

  // Telegram migrates basic groups to supergroups on its own — adding a public
  // link, passing the member limit — and the chat id changes when it does.
  // Left undetected, alerts would post to an id nobody reads, with no error at
  // all. Shout instead.
  bot.on("message:migrate_to_chat_id", (ctx) => {
    console.error(
      `\n⚠  The village group became a supergroup. Its id changed:\n` +
        `     ${ctx.chat.id}  →  ${ctx.message.migrate_to_chat_id}\n` +
        `   Update the ESCUDO_GROUP_CHAT_ID env var and restart, or alerts\n` +
        `   will be posted where nobody can see them.\n`,
    );
  });

  registerBoard(bot, config, store);
  registerPrivateReporting(bot, config, store, alerts);
  registerCallbacks(bot, config, store, alerts);
  registerLocation(bot, config, alerts);
  registerPanel(bot, config, store);

  bot.catch(async (err) => {
    // A supergroup promotion usually arrives as an update, but if the bot was
    // offline when it happened the first sign is every send failing with this.
    // Without the explicit check it reads as a generic 400 and the village
    // quietly has no alerts.
    const migrated = err.error instanceof GrammyError
      ? err.error.parameters?.migrate_to_chat_id
      : undefined;
    if (migrated !== undefined) {
      console.error(
        `\n⚠  The village group is now a supergroup and its id has changed:\n` +
          `     ${config.telegram.groupChatId}  →  ${migrated}\n` +
          `   Update the ESCUDO_GROUP_CHAT_ID env var and restart. Until\n` +
          `   then, no alert reaches the group.\n`,
      );
      return;
    }

    console.error("Unhandled error while handling update", err.ctx.update.update_id, err.error);

    // Never leave a press unacknowledged: an unanswered callback query spins on
    // the presser's screen, which reads as "it didn't work" during an
    // emergency.
    if (err.ctx.callbackQuery) {
      try {
        await err.ctx.answerCallbackQuery({
          text: strings(config.village.locale).error.generic,
          show_alert: true,
        });
      } catch {
        // The query has already been answered or has expired.
      }
    }
  });

  return bot;
}

/**
 * Publish the command list, so the ☰ menu beside the text input always offers a
 * way back to the buttons. Unlike the keyboard, this survives the member
 * clearing their chat history.
 *
 * Everyone sees the commands they might need; group admins also see the ones
 * that run the network, so the coordinator can find /test without keeping a
 * note of it.
 *
 * Scope is *visibility only* — Telegram has no admin-only commands. A hidden
 * command still runs if typed, so every privileged handler checks
 * isGroupAdmin() for itself and would be safe with no scoping at all.
 */
export async function publishCommands(bot: Bot, config: Config): Promise<void> {
  const s = strings(config.village.locale);
  const sos = { command: "sos", description: s.cmd.menuSos };
  const start = { command: "start", description: s.cmd.menuStart };
  const test = { command: "test", description: s.cmd.menuTest };
  const exported = { command: "export", description: s.cmd.menuExport };

  // A menu entry that does nothing where it is offered is worse than no entry:
  // it gets tried during an emergency. So each scope lists only what actually
  // works in that kind of chat — /start and /panel are private-only, /pin and
  // /chatid are for the group.
  const inGroup = [sos];
  const inPrivate = [sos, start];
  const groupAdmins = [
    sos,
    test,
    exported,
    { command: "pin", description: s.cmd.menuPin },
    { command: "chatid", description: s.cmd.menuChatId },
  ];
  const privateAdmins = [
    sos,
    start,
    test,
    exported,
    { command: "panel", description: s.cmd.menuPanel },
  ];

  try {
    await bot.api.setMyCommands(inGroup);
    await bot.api.setMyCommands(inPrivate, { scope: { type: "all_private_chats" } });
    await bot.api.setMyCommands(groupAdmins, { scope: { type: "all_chat_administrators" } });
  } catch (err) {
    console.warn("Could not publish the command list", err);
  }

  // The admins' own DMs, individually — `all_chat_administrators` covers group
  // and supergroup chats only and has no effect on a private menu, and there is
  // no "all private chats of admins" scope. For a DM, chat_id is the user's id.
  // This is why /panel was listed solely in the group, where its handler
  // ignores it, and hidden in the DM, where it works.
  //
  // Best-effort and separately tolerant: an admin who has never opened a
  // private chat with the bot errors here, exactly as they do for the location
  // DM, and that must not cost the other admins their menu.
  try {
    const admins = await bot.api.getChatAdministrators(config.telegram.groupChatId);
    for (const member of admins) {
      if (member.user.is_bot) continue;
      try {
        await bot.api.setMyCommands(privateAdmins, {
          scope: { type: "chat", chat_id: member.user.id },
        });
      } catch { /* No private chat with this admin yet. */ }
    }
  } catch (err) {
    console.warn("Could not publish the admin command list to private chats", err);
  }
}
