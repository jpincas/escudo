// The pinned board of alert buttons, and the commands around it.

import { type Bot, InlineKeyboard, InputFile } from "grammy";
import type { Config } from "../config.ts";
import type { Store } from "../store/types.ts";
import { formatBoard, formatDrill } from "../format.ts";
import { strings, t } from "../i18n/mod.ts";
import { isGroupAdmin } from "./admin.ts";
import { welcome } from "./private.ts";

/**
 * The pinned board is a signpost, not a control panel: one button that opens
 * the member's own chat with the bot, where the alert buttons live permanently.
 *
 * Reporting deliberately does not happen here. A group cannot hold a keyboard
 * that stays on screen or ask for a location, so a second set of alert buttons
 * in the group would be a worse path competing with the good one.
 */
export function boardKeyboard(botUsername: string, config: Config): InlineKeyboard {
  return new InlineKeyboard().url(
    strings(config.village.locale).button.openBot,
    `https://t.me/${botUsername}`,
  );
}

export function registerBoard(bot: Bot, config: Config, store: Store): void {
  const s = strings(config.village.locale);

  // /chatid — the one piece of setup that can't be guessed from outside.
  // Works in any chat, because its whole purpose is telling you the id of a
  // chat you haven't configured yet.
  bot.command("chatid", async (ctx) => {
    await ctx.reply(t(s.cmd.chatId, { id: ctx.chat.id }), { parse_mode: "HTML" });
  });

  // Opening the bot is how a member gets their own reporting keyboard — the
  // main way to raise an alert. Pressing Start once is a step in joining the
  // Red, alongside signing the Carta.
  bot.command("start", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const { text, keyboard } = welcome(config);
    await ctx.reply(text, { reply_markup: keyboard });
  });

  // /pin — post the board and pin it. Admins only, in the village group.
  bot.command("pin", async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupChatId) {
      await ctx.reply(s.cmd.groupOnly);
      return;
    }
    if (!ctx.from || !await isGroupAdmin(ctx.api, ctx.chat.id, ctx.from.id)) {
      await ctx.reply(s.cmd.adminOnly);
      return;
    }

    const message = await ctx.reply(formatBoard(config), {
      parse_mode: "HTML",
      reply_markup: boardKeyboard(ctx.me.username, config),
    });
    // Pinning needs admin rights on the bot itself. If the village forgot to
    // grant them the board still works, it just won't stick to the top — but
    // say so plainly. Reporting success either way would leave a village
    // believing the alert buttons are permanently reachable when they will
    // scroll away within the hour.
    try {
      await ctx.api.pinChatMessage(ctx.chat.id, message.message_id, {
        disable_notification: true,
      });
      await ctx.reply(s.cmd.pinned);
    } catch (err) {
      console.error("Could not pin the board", err);
      await ctx.reply(s.cmd.pinFailed);
    }
  });

  // /sos — a fresh board at the bottom of the chat, for when the pinned one has
  // scrolled out of reach. Open to everyone: this is an alert path.
  bot.command("sos", async (ctx) => {
    // In the private chat this is the way back to the buttons if they've been
    // hidden or the history cleared.
    if (ctx.chat.type === "private") {
      const { keyboard } = welcome(config);
      await ctx.reply(s.board.hint, { reply_markup: keyboard });
      return;
    }
    if (ctx.chat.id !== config.telegram.groupChatId) {
      await ctx.reply(s.cmd.groupOnly);
      return;
    }
    await ctx.reply(formatBoard(config), {
      parse_mode: "HTML",
      reply_markup: boardKeyboard(ctx.me.username, config),
    });
  });

  // /test — a drill. Admin-only, because this is the one thing in the system
  // that deliberately makes every phone in the village ring for no emergency.
  // Members test nothing: a press from each of them would be an alarm each
  // (Protocolo Escudo — Pruebas y falsas alarmas).
  bot.command("test", async (ctx) => {
    if (!ctx.from || !await isGroupAdmin(ctx.api, config.telegram.groupChatId, ctx.from.id)) {
      await ctx.reply(s.cmd.adminOnly);
      return;
    }

    // Posted, not raised: no incident, no id, nothing to cancel. The numbers a
    // drill produces — phones that rang, minutes to the first reply — are
    // counted by the people in the group, not by us.
    await ctx.api.sendMessage(
      config.telegram.groupChatId,
      formatDrill(config, new Date().toISOString()),
      { parse_mode: "HTML" },
    );

    // In the group the drill is its own confirmation; saying so again is noise.
    if (ctx.chat.id !== config.telegram.groupChatId) await ctx.reply(s.cmd.testSent);
  });

  // /export — the incident log as JSON. Hosted Deno KV has no export path of
  // its own, and GDPR access requests are answered from this.
  bot.command("export", async (ctx) => {
    if (!ctx.from || !await isGroupAdmin(ctx.api, config.telegram.groupChatId, ctx.from.id)) {
      await ctx.reply(s.cmd.adminOnly);
      return;
    }
    const incidents = await store.listIncidents();
    const json = new TextEncoder().encode(JSON.stringify(incidents, null, 2));
    await ctx.replyWithDocument(new InputFile(json, "escudo-incidencias.json"), {
      caption: t(s.cmd.exported, { count: incidents.length }),
    });
  });
}
