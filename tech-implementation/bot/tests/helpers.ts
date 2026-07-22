// Shared test fixtures.
//
// Tests never call loadConfig(): `deno test` does not load .env files, and a
// test that depended on a real bot token would be neither hermetic nor safe.

import type { Notifier } from "../src/alerts.ts";
import type { Config } from "../src/config.ts";

export function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    village: { name: "Ejemplo del Camino", locale: "es", timezone: "Europe/Madrid" },
    telegram: { groupChatId: -1001234567890, adminChatId: null },
    categories: [
      { id: "fuego", emoji: "🔥" },
      { id: "medico", emoji: "🚑" },
      { id: "delito", emoji: "🚔" },
      { id: "emergencia", emoji: "🆘" },
      { id: "ayuda", emoji: "🤝", urgency: "quiet" },
    ],
    alerts: { emergencyLine: "062 Guardia Civil · 112 Emergencias", dedupeSeconds: 60 },
    data: { retentionDays: 365 },
    devices: { proveWithinDays: 60 },
    secrets: {
      botToken: "test-token",
      webhookSecret: "test-secret",
      twilioAuthToken: undefined,
    },
    runtime: { kvPath: undefined, port: 8000, publicUrl: undefined },
    ...overrides,
  };
}

/** Records what the core asked Telegram to do, without talking to Telegram. */
export class FakeNotifier implements Notifier {
  posted: Array<{ text: string; incidentId: string; messageId: number; quiet: boolean }> = [];
  updated: Array<{ messageId: number; text: string }> = [];
  locations: Array<{ replyTo: number; lat: number; lon: number; caption: string }> = [];
  private nextMessageId = 1000;

  async postAlert(text: string, incidentId: string, quiet = false): Promise<number> {
    const messageId = this.nextMessageId++;
    this.posted.push({ text, incidentId, messageId, quiet });
    return messageId;
  }

  async updateAlert(messageId: number, text: string): Promise<void> {
    this.updated.push({ messageId, text });
  }

  async postLocation(
    replyTo: number,
    lat: number,
    lon: number,
    caption: string,
  ): Promise<void> {
    this.locations.push({ replyTo, lat, lon, caption });
  }
}

/** A clock the tests drive by hand, so the dedupe window can be tested. */
export class FakeClock {
  constructor(private current: Date) {}
  now = (): Date => this.current;
  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}
