// The offline Telegram transport: dev mode.
//
// Working on the panel's UI shouldn't need a bot, a group, or a network — and
// it must never touch the real village group. So in offline mode the port the
// alert path speaks through — the Notifier that posts to the group — is this,
// which prints to the terminal instead of Telegram.
//
// What you'd have sent to Bercianos lands in your console, HTML tags and all,
// so a test alert from the panel is fully exercised — rendered, deduped,
// logged — without a single Telegram call.

import type { Notifier } from "../alerts.ts";

/** Notifier that prints what would have gone to the village group. */
export class ConsoleNotifier implements Notifier {
  private nextMessageId = 1;

  // deno-lint-ignore require-await
  async postAlert(text: string, _incidentId: string, quiet = false): Promise<number> {
    const id = this.nextMessageId++;
    console.log(
      `\n📣 [offline] group post ${quiet ? "(quiet)" : "(alarm)"} · msg #${id}\n` +
        indent(text) + "\n",
    );
    return id;
  }

  // deno-lint-ignore require-await
  async updateAlert(messageId: number, text: string): Promise<void> {
    console.log(`\n✏️  [offline] edit msg #${messageId}\n` + indent(text) + "\n");
  }

  // deno-lint-ignore require-await
  async postLocation(
    replyTo: number,
    lat: number,
    lon: number,
    caption: string,
  ): Promise<void> {
    console.log(
      `\n📍 [offline] location on msg #${replyTo}: ${lat},${lon} — ${caption}\n`,
    );
  }
}

const indent = (text: string) => text.split("\n").map((line) => "   " + line).join("\n");
