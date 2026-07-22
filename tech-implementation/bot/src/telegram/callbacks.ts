// Button presses: raising an alert, and cancelling one.

import { type Api, type Bot, Keyboard } from "grammy";
import type { AlertService } from "../alerts.ts";
import type { Config } from "../config.ts";
import type { Store } from "../store/types.ts";
import { strings, t } from "../i18n/mod.ts";
import { displayName, isGroupAdmin } from "./admin.ts";

/**
 * Ask the reporter to share their location, privately.
 *
 * Telegram allows `request_location` buttons in private chats ONLY (asking in
 * the group fails outright with "location can be requested in private chats
 * only"), and a bot cannot open a private chat with someone who has never
 * messaged it first. So this works for anyone who has pressed Start on the bot
 * once — which is a step in joining the Red, alongside signing the Carta.
 *
 * If there is no private chat, we stay quiet. The alert is already posted and
 * it is the product; the location is a bonus, and a detour through a "Start the
 * bot" screen mid-emergency costs more than the pin is worth.
 */
async function requestLocation(
  ctx: { api: Api },
  config: Config,
  user: { id: number },
): Promise<void> {
  const s = strings(config.village.locale);
  const keyboard = new Keyboard().requestLocation(s.button.shareLocation).oneTime().resized();

  try {
    await ctx.api.sendMessage(user.id, s.dm.locationPrompt, { reply_markup: keyboard });
  } catch (err) {
    console.warn(
      `No private chat with user ${user.id} — no location asked. ` +
        `They should press Start on the bot once (see README, onboarding).`,
      err,
    );
  }
}

export function registerCallbacks(
  bot: Bot,
  config: Config,
  store: Store,
  alerts: AlertService,
): void {
  const s = strings(config.village.locale);

  bot.callbackQuery(/^sos:(.+)$/, async (ctx) => {
    const category = ctx.match![1];
    const user = ctx.from;

    // Answer first, before any I/O. Someone who has just fallen needs to see
    // that the press registered; the alert itself follows milliseconds later.
    await ctx.answerCallbackQuery({ text: s.toast.sent });

    const result = await alerts.raiseAlert({
      source: "telegram",
      category,
      reporterRef: String(user.id),
      reporterName: displayName(user),
    });

    // Roster is built from real use rather than a signup form — the people who
    // press buttons are the people the network is for.
    if (!await store.getMember(String(user.id))) {
      await store.putMember({
        telegramId: String(user.id),
        displayName: displayName(user),
        joinedAt: new Date().toISOString(),
      });
    }

    // A press inside the dedupe window is already covered by the live alert.
    if (result.status === "duplicate") return;

    await requestLocation(ctx, config, user);
  });

  bot.callbackQuery(/^cancel:(.+)$/, async (ctx) => {
    const incidentId = ctx.match![1];
    const user = ctx.from;

    const admin = await isGroupAdmin(ctx.api, config.telegram.groupChatId, user.id);
    const result = await alerts.cancelAlert(incidentId, String(user.id), admin);

    switch (result.status) {
      case "cancelled":
        await ctx.answerCallbackQuery({ text: s.toast.cancelled });
        break;
      case "already_cancelled":
        await ctx.answerCallbackQuery({ text: s.toast.cancelled });
        break;
      case "forbidden":
        await ctx.answerCallbackQuery({ text: s.toast.cancelNotAllowed, show_alert: true });
        break;
      case "not_found":
        // Survives a retention purge or a database reset: the button outlives
        // the record it points at.
        await ctx.answerCallbackQuery({ text: s.toast.expired });
        break;
    }
  });

  // Any other callback — an old button from a previous deployment, say.
  bot.on("callback_query:data", async (ctx) => {
    await ctx.answerCallbackQuery({ text: t(s.toast.expired) });
  });
}
