// Telegram implementation of the core's Notifier port.

import { type Api, InlineKeyboard } from "grammy";
import type { Config } from "../config.ts";
import type { Notifier } from "../alerts.ts";
import type { AdminChannel } from "../bridge/twilio.ts";
import { strings } from "../i18n/mod.ts";

/**
 * The coordinator's private chat, as the bridge's AdminChannel.
 *
 * Everything the bridge can't send to the village comes here: an unregistered
 * number, a low battery, a failure. Silent by design — none of it is an
 * emergency, and a bridge that pings someone's phone at 3am for a flat pendant
 * battery is a bridge whose notifications get turned off.
 *
 * With no admin chat configured this logs and moves on rather than throwing:
 * losing a maintenance notice is a nuisance, but letting it break the handler
 * that also raises alarms is not acceptable.
 */
export class TelegramAdminChannel implements AdminChannel {
  constructor(private api: Api, private config: Config) {}

  async notify(text: string): Promise<void> {
    const chatId = this.config.telegram.adminChatId;
    if (chatId === null) {
      console.warn(`No admin chat configured; dropping bridge notice: ${text}`);
      return;
    }
    await this.api.sendMessage(chatId, text, { disable_notification: true });
  }
}

export class TelegramNotifier implements Notifier {
  constructor(private api: Api, private config: Config) {}

  async postAlert(text: string, incidentId: string, quiet = false): Promise<number> {
    // A quiet request carries no false-alarm button: there is no alarm to
    // call off, and an unpressed button on every "can someone bring a ladder"
    // is clutter. It also sends with disable_notification — it lands, the
    // badge moves, nothing makes a sound.
    const keyboard = quiet ? undefined : new InlineKeyboard().text(
      strings(this.config.village.locale).button.falseAlarm,
      `cancel:${incidentId}`,
    );
    const message = await this.api.sendMessage(this.config.telegram.groupChatId, text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
      disable_notification: quiet,
    });
    return message.message_id;
  }

  async updateAlert(messageId: number, text: string): Promise<void> {
    // No reply_markup on the edit: a cancelled alert has nothing left to press.
    await this.api.editMessageText(this.config.telegram.groupChatId, messageId, text, {
      parse_mode: "HTML",
    });
  }

  async postLocation(
    replyToMessageId: number,
    lat: number,
    lon: number,
    caption: string,
  ): Promise<void> {
    // sendLocation carries no caption of its own, so the label goes in a short
    // message threaded under the alert, with the native pin beneath it.
    await this.api.sendMessage(this.config.telegram.groupChatId, caption, {
      parse_mode: "HTML",
      reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true },
    });
    await this.api.sendLocation(this.config.telegram.groupChatId, lat, lon, {
      reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true },
    });
  }
}
