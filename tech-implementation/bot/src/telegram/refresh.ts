// Pushing a changed keyboard out to everyone who already has the old one.
//
// A Telegram reply keyboard lives on the member's phone until the bot sends a
// message carrying a new one. There is no API to replace it otherwise. So a
// deploy that changes the buttons leaves every member holding the old set —
// for months, if they don't happen to open the chat.
//
// That is not cosmetic. An old button sends its old label, which no longer
// matches any category, so the press raises no alert at all. The member sees a
// fresh keyboard appear and reasonably assumes it worked.
//
// The fix is to message everyone once, silently, whenever the layout changes.
// Silently because this is housekeeping: a village whose phones all chirp after
// every deploy learns to mute the bot, which is the failure we spend the whole
// design avoiding.

import type { Bot } from "grammy";
import type { Config } from "../config.ts";
import type { Store } from "../store/types.ts";
import { strings } from "../i18n/mod.ts";
import { reportingKeyboard } from "./private.ts";

const META_KEY = "keyboard_fingerprint";

/**
 * What the member actually sees, as a string: the button labels, in order, in
 * this village's language. Renaming a category, adding one, or reordering the
 * rows all change it; deploying unrelated code does not, so restarts and cold
 * starts don't broadcast anything.
 */
export function keyboardFingerprint(config: Config): string {
  return reportingKeyboard(config).build()
    .map((row) => row.map((button) => typeof button === "string" ? button : button.text).join("|"))
    .join("//");
}

export interface RefreshResult {
  /** False when the keyboard is unchanged — the usual case on a restart. */
  changed: boolean;
  delivered: number;
  /** Members the bot could not message: almost always someone who blocked it. */
  unreachable: string[];
}

/**
 * Called once at boot. Cheap and idempotent when nothing has changed.
 */
export async function refreshKeyboards(
  bot: Bot,
  config: Config,
  store: Store,
): Promise<RefreshResult> {
  const fingerprint = keyboardFingerprint(config);
  if (await store.getMeta(META_KEY) === fingerprint) {
    return { changed: false, delivered: 0, unreachable: [] };
  }

  const s = strings(config.village.locale);
  const members = await store.listMembers();
  const keyboard = reportingKeyboard(config);
  const unreachable: string[] = [];
  let delivered = 0;

  for (const member of members) {
    try {
      await bot.api.sendMessage(Number(member.telegramId), s.dm.buttonsChanged, {
        reply_markup: keyboard,
        disable_notification: true,
      });
      delivered++;
    } catch {
      // Blocked, deactivated, or Telegram is having a moment. Never fatal:
      // a failed refresh must not stop the bot from starting.
      unreachable.push(member.displayName);
    }
  }

  // Recorded even on partial failure. Retrying the whole village on the next
  // restart would message everyone again, and the members who did get it are
  // already correct — the ones who didn't are covered by the legacy labels in
  // private.ts and by their next press.
  await store.setMeta(META_KEY, fingerprint);

  return { changed: true, delivered, unreachable };
}
