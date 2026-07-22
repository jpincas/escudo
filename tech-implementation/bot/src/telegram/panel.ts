// /panel — hand a village admin a way into the admin panel.
//
// Private chat only, and never a group: the link is a bearer credential for
// thirty days of access, and posting one into the village group would sign in
// whoever tapped it first. Telegram is the authentication channel precisely
// because it is the one place we can already prove who someone is.

import type { Bot } from "grammy";
import type { Config } from "../config.ts";
import type { Store } from "../store/types.ts";
import { strings, t } from "../i18n/mod.ts";
import { isGroupAdmin } from "./admin.ts";
import { issueLink } from "../panel/auth.ts";

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

    if (!config.runtime.publicUrl) {
      await ctx.reply(s.cmd.panelNoUrl);
      return;
    }

    const link = await issueLink(
      store,
      String(ctx.from.id),
      ctx.from.first_name ?? String(ctx.from.id),
    );

    const url = new URL("/panel", config.runtime.publicUrl);
    url.searchParams.set("t", link.token);

    await ctx.reply(t(s.cmd.panelLink, { url: url.toString() }), {
      // No preview: this is a credential, and there is nothing to gain from
      // Telegram's crawler fetching it and holding it in a cache.
      link_preview_options: { is_disabled: true },
    });
  });
}
