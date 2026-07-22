// Production entrypoint (Deno Deploy).
//
// Webhooks rather than polling: Deploy is request-driven, and a long-polling
// loop has nowhere to live there. Telegram POSTs each update to a secret path,
// grammY turns it back into the same handlers dev.ts uses.
//
// Point Telegram at this app once with:  deno task set-webhook <https-url>

import { webhookCallback } from "grammy";
import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { AlertService } from "./src/alerts.ts";
import { createBridge } from "./src/bridge/twilio.ts";
import { loadConfig } from "./src/config.ts";
import { createPanelApi } from "./src/panel/api.ts";
import { KvStore } from "./src/store/kv.ts";
import { createBot, publishCommands } from "./src/telegram/bot.ts";
import { TelegramAdminChannel, TelegramNotifier } from "./src/telegram/notifier.ts";
import { refreshKeyboards } from "./src/telegram/refresh.ts";
import { purgeExpiredIncidents } from "./src/jobs/retention.ts";

const config = await loadConfig();
const store = await KvStore.open(config.runtime.kvPath);
const bot = createBot(config, store);

// grammY needs the bot's own identity before it can dispatch updates, and on
// Deploy nothing calls start() to fetch it.
await bot.init();
await publishCommands(bot, config);

// A changed keyboard has to be pushed: it lives on the member's phone until we
// replace it. No-op unless the buttons actually changed, so restarts and cold
// starts cost one KV read.
try {
  const refresh = await refreshKeyboards(bot, config, store);
  if (refresh.changed) {
    console.log(`Keyboard changed — refreshed ${refresh.delivered} member(s)`);
    if (refresh.unreachable.length) {
      const names = refresh.unreachable.join(", ");
      console.warn(`Could not reach: ${names}`);
      // The coordinator needs to know: these members are holding a keyboard
      // whose buttons no longer raise anything, and they look signed up.
      if (config.telegram.adminChatId !== null) {
        await bot.api.sendMessage(
          config.telegram.adminChatId,
          `⚠️ ${refresh.unreachable.length} member(s) did not get the new buttons: ${names}`,
          { disable_notification: true },
        );
      }
    }
  }
} catch (err) {
  console.warn("Keyboard refresh failed; members keep their old buttons", err);
}

const handleUpdate = webhookCallback(bot, "std/http");

// The bridge: Twilio POSTs a call or an SMS, a registered household raises the
// alarm. Its AlertService is a second instance rather than the bot's — the
// class holds no state, everything lives in the store, so the dedupe window
// still collapses a device's simultaneous call and SMS into one incident.
//
// Mounted only when both halves are present. No auth token means no signature
// check, and an unauthenticated bridge is a phone number anyone can use to wake
// the village; no public URL means the signature can't be reconstructed at all.
const bridgeToken = config.secrets.twilioAuthToken;
const bridgeUrl = config.runtime.publicUrl;
const handleBridge = bridgeToken && bridgeUrl
  ? createBridge({
    config,
    store,
    alerts: new AlertService(config, store, new TelegramNotifier(bot.api, config)),
    admin: new TelegramAdminChannel(bot.api, config),
    authToken: bridgeToken,
    publicUrl: bridgeUrl,
  })
  : null;
if (!handleBridge) {
  console.warn(
    "Bridge disabled — set ESCUDO_TWILIO_AUTH_TOKEN and ESCUDO_PUBLIC_URL to accept " +
      "calls and SMS. Telegram alerts are unaffected.",
  );
}

// Retention runs on a schedule, not on request traffic — a quiet village would
// otherwise never purge. Deno.cron exists on Deploy and under --unstable-cron;
// where it doesn't, the boot-time purge below is the fallback.
try {
  Deno.cron("escudo-retention", "17 4 * * *", async () => {
    await purgeExpiredIncidents(store, config.data.retentionDays);
  });
} catch {
  console.warn("Deno.cron unavailable — retention runs at boot only");
  await purgeExpiredIncidents(store, config.data.retentionDays);
}

// The admin panel: a JSON API under /api and the built SPA under /panel.
//
// Kept behind its own router and reached only after the alert path above has
// declined the request. Nothing in here is imported by src/alerts.ts, and no
// alert can be delayed by a panel page failing.
const web = new Hono();
web.route("/api", createPanelApi(config, store));
web.use(
  "/panel/*",
  serveStatic({
    root: "./panel/dist",
    rewriteRequestPath: (path) => path.replace(/^\/panel/, "") || "/",
  }),
);
// Bare /panel, and anything below it that isn't a real file, fall through to
// index.html: the SPA boots and works out what to show, including exchanging a
// ?t= link. serveStatic calls next() when it finds nothing, so these run only
// for paths the middleware above couldn't satisfy.
const panelIndex = serveStatic({ path: "./panel/dist/index.html" });
web.get("/panel", panelIndex);
web.get("/panel/*", panelIndex);
web.notFound((c) => c.text("not found", 404));

Deno.serve({ port: config.runtime.port }, async (req) => {
  const url = new URL(req.url);

  // Telegram first, and reached without touching the web router: an alert must
  // never queue behind, or be broken by, anything added for the panel.
  if (req.method === "POST" && url.pathname === `/${config.secrets.webhookSecret}`) {
    try {
      return await handleUpdate(req);
    } catch (err) {
      // Always 200 back to Telegram. A non-2xx makes it retry the same update,
      // which during an incident means the alert posts twice.
      console.error("Webhook handler failed", err);
      return new Response("ok");
    }
  }

  // The bridge, second and still ahead of the web router: a call from a
  // pendant is an alarm, and it must not queue behind a panel page.
  if (handleBridge) {
    const bridged = await handleBridge(req, url);
    if (bridged) return bridged;
  }

  // Health endpoint for an external dead-man's-switch (spec §3). Deliberately
  // says nothing about the village.
  if (req.method === "GET" && url.pathname === "/health") {
    return new Response("ok", { headers: { "content-type": "text/plain" } });
  }

  return await web.fetch(req);
});

console.log(`Escudo bot serving ${config.village.name} on port ${config.runtime.port}`);
