// Shared locations.
//
// No pending-request state is kept: a location from someone who has an open
// alert belongs to that alert. The 📍 button lives permanently on the same
// keyboard as the alert buttons, so sharing is one more tap in the chat the
// member is already in — no navigation, no keyboard swap, nothing to find.

import type { Bot } from "grammy";
import type { AlertService } from "../alerts.ts";
import type { Config } from "../config.ts";
import { strings } from "../i18n/mod.ts";
import { reportingKeyboard } from "./private.ts";

export function registerLocation(bot: Bot, config: Config, alerts: AlertService): void {
  const s = strings(config.village.locale);

  bot.on("message:location", async (ctx) => {
    const isPrivate = ctx.chat.type === "private";
    if (!isPrivate && ctx.chat.id !== config.telegram.groupChatId) return;

    const incident = await alerts.latestOpenFor(String(ctx.from.id));
    if (!incident) {
      // A location with no live alert behind it. Ignored in the group (people
      // share pins for ordinary reasons); acknowledged privately so the sender
      // isn't left wondering.
      if (isPrivate) {
        await ctx.reply(s.toast.expired, { reply_markup: reportingKeyboard(config) });
      }
      return;
    }

    const { latitude, longitude } = ctx.message.location;
    await alerts.attachLocation(incident.id, latitude, longitude);

    if (isPrivate) {
      await ctx.reply(s.dm.locationThanks, { reply_markup: reportingKeyboard(config) });
    }
  });
}
