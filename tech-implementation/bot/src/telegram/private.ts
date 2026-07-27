// Reporting from the private chat with the bot.
//
// This is the primary way to raise an alert. A private chat can do two things a
// group cannot: carry a *persistent* keyboard that sits above the text input
// and never scrolls away, and request a location. Together those turn reporting
// into "open the bot, press the button" with no hunting for a pinned message
// and no bouncing between chats.
//
// The group keeps its own board as a safety net for anyone who hasn't opened
// the bot yet, but it can only raise a bare alert — no location.

import { type Bot, Keyboard } from "grammy";
import type { AlertService } from "../alerts.ts";
import type { Config } from "../config.ts";
import type { Store } from "../store/types.ts";
import { isQuiet, resolveCategory } from "../format.ts";
import { strings, t } from "../i18n/mod.ts";
import { displayName } from "./admin.ts";

/** Label as it appears on a button — also what Telegram sends back as text. */
function buttonLabel(config: Config, categoryId: string): string {
  const { emoji, label } = resolveCategory(config, categoryId);
  return `${emoji} ${label}`;
}

/**
 * The permanent keyboard, laid out by urgency rather than by config order:
 *
 *     🔥 FUEGO      🚑 MÉDICO      ← alarms, two per row
 *     🚔 DELITO     🆘 EMERGENCIA
 *     📍 Compartir mi ubicación    ← utilities, full width
 *     🤝 Pedir ayuda               ← quiet, full width, well clear of the rest
 *
 * Telegram offers no styling on keyboard buttons — no colour, no size, no
 * weight. Rows, emoji and capitalisation are the entire toolkit, so the tiers
 * are separated with all three, and the quiet button sits below the location
 * button where nobody reaching for the alarm will hit it.
 *
 * It is persistent rather than one-time so it never collapses — someone who
 * needs it is not in a state to work out that the keyboard icon brings it back.
 */
export function reportingKeyboard(config: Config): Keyboard {
  const s = strings(config.village.locale);
  const keyboard = new Keyboard();

  const alarms = config.categories.filter((c) => c.urgency !== "quiet");
  const quiet = config.categories.filter((c) => c.urgency === "quiet");

  alarms.forEach((category, index) => {
    keyboard.text(buttonLabel(config, category.id));
    if (index % 2 === 1) keyboard.row();
  });
  if (alarms.length % 2 === 1) keyboard.row();

  keyboard.requestLocation(s.button.shareLocation).row();

  for (const category of quiet) {
    keyboard.text(buttonLabel(config, category.id)).row();
  }

  return keyboard.persistent().resized();
}

/**
 * Labels this bot used to send, and the category a press of one still means.
 *
 * A reply keyboard persists on the member's phone until the bot replaces it
 * (see telegram/refresh.ts). Until that lands — or for anyone it couldn't
 * reach — a press arrives carrying a label that no longer exists in config,
 * and would otherwise fall through as "unrecognised text" and raise no alert
 * at all. Silently dropping an emergency because we renamed a button is not an
 * acceptable failure, so old labels stay mapped.
 *
 * Both locales, because the label was fixed at the moment it was sent. Entries
 * can be deleted once no phone in any village can still be holding them.
 */
const RETIRED_LABELS: Record<string, string> = {
  "🆘 Ayuda": "emergencia",
  "🆘 Help": "emergencia",
};

export function registerPrivateReporting(
  bot: Bot,
  config: Config,
  store: Store,
  alerts: AlertService,
): void {
  const s = strings(config.village.locale);

  // Button text → category id. Built once from config, so a village renaming a
  // category renames the button and the lookup together.
  const byLabel = new Map(
    config.categories.map((c) => [buttonLabel(config, c.id), c.id]),
  );

  bot.chatType("private").on("message:text", async (ctx, next) => {
    const pressed = ctx.message.text.trim();
    const category = byLabel.get(pressed) ??
      // Only consulted if the current keyboard doesn't know the label, so a
      // village that reuses a retired name keeps its own meaning.
      (RETIRED_LABELS[pressed] && config.categories.some((c) => c.id === RETIRED_LABELS[pressed])
        ? RETIRED_LABELS[pressed]
        : undefined);

    // Anything else typed here restores the keyboard rather than being ignored.
    // It can vanish — clearing the chat history takes it with it, and members
    // can hide it by hand — and someone who needs it will not know that
    // /start brings it back. Any message at all is enough.
    if (!category) {
      // Commands are handled elsewhere — and "elsewhere" includes handlers
      // registered after this one, so the chain must be passed on rather than
      // returned from. Returning here silently swallowed every command whose
      // handler is registered below this middleware; /panel was the only one,
      // and it did nothing at all in a DM, which is the one place it works.
      if (pressed.startsWith("/")) return await next();
      await ctx.reply(s.board.hint, { reply_markup: reportingKeyboard(config) });
      return;
    }

    const user = ctx.from;
    const result = await alerts.raiseAlert({
      source: "telegram",
      category,
      reporterRef: String(user.id),
      reporterName: displayName(user),
    });

    if (!await store.getMember(String(user.id))) {
      await store.putMember({
        telegramId: String(user.id),
        displayName: displayName(user),
        joinedAt: new Date().toISOString(),
      });
    }

    // Confirm in the same chat, keyboard still in place. The location button is
    // already on it — no swapping, nothing to find.
    // A quiet request gets its own confirmation: telling someone "your
    // neighbours are seeing it now" when nothing made a sound is a lie.
    const confirmation = isQuiet(config, category)
      ? s.dm.helpSent
      : result.status === "duplicate"
      ? s.dm.alreadySent
      : s.dm.alertSent;

    await ctx.reply(confirmation, { reply_markup: reportingKeyboard(config) });
  });
}

/** Welcome text plus the reporting keyboard. Used by /start. */
export function welcome(config: Config): {
  text: string;
  keyboard: Keyboard;
} {
  const s = strings(config.village.locale);
  return {
    text: t(s.dm.welcome, { village: config.village.name }),
    keyboard: reportingKeyboard(config),
  };
}
