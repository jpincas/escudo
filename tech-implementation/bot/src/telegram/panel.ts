// /panel — hand a village admin a way into the admin panel.
//
// Private chat only, and never a group: the code is a bearer credential —
// ten minutes to be typed in, then thirty days of session — and posting one
// into the village group would sign in whoever typed it first. Telegram is
// the authentication channel precisely because it is the one place we can
// already prove who someone is.
//
// The reply carries the code and nothing else — no URL, no tappable link
// (spec 2026-07-27 §5.1). The admin opens the login page themselves (from
// the welcome page, or by navigating to /panel directly) and types it in.

import type { Bot } from "grammy";
import type { Config } from "../config.ts";
import type { Store } from "../store/types.ts";
import { strings, t } from "../i18n/mod.ts";
import { isGroupAdmin } from "./admin.ts";
import { formatCodeForDisplay, issueCode } from "../panel/auth.ts";
import { reportingKeyboard } from "./private.ts";

export function registerPanel(bot: Bot, config: Config, store: Store): void {
  bot.chatType("private").command("panel", async (ctx) => {
    const s = strings(config.village.locale);
    if (!ctx.from) return;

    // Admin status is read live from the village group, so revoking someone's
    // panel access is the same action as removing them as a group admin —
    // there is no second list to remember to update.
    if (!await isGroupAdmin(ctx.api, config.telegram.groupChatId, ctx.from.id)) {
      await ctx.reply(s.cmd.adminOnly);
      return;
    }

    const issued = await issueCode(
      store,
      String(ctx.from.id),
      ctx.from.first_name ?? String(ctx.from.id),
    );

    await ctx.reply(t(s.cmd.panelCode, { code: formatCodeForDisplay(issued.code) }), {
      // Re-send the keyboard with the code. A reply carrying no markup leaves
      // Telegram Desktop showing the buttons collapsed behind the icon in the
      // input bar, and an admin who has just used /panel would be looking at a
      // plain text box. The buttons are the alert path; they go back up.
      reply_markup: reportingKeyboard(config),
    });
  });
}
