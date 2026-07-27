// The entrypoint. One app, one file, dev and production alike.
//
// There is deliberately no separate dev entrypoint. There was one, and it
// drifted: it never served the panel or mounted the bridge, so "run it locally"
// quietly meant "run something else". The only thing that legitimately differs
// between a laptop and Deploy is how Telegram reaches us, and that is a runtime
// decision here rather than a second file to keep in step.
//
//   ESCUDO_PUBLIC_URL set    → webhooks. Telegram POSTs to a secret path.
//   ESCUDO_PUBLIC_URL unset  → long polling. No public URL, no tunnel, no TLS.
//   ESCUDO_TELEGRAM=off      → offline. No bot at all; the alert path prints to
//                              the terminal. This is `deno task dev`: work on
//                              the panel without a token, a group, or any risk
//                              of waking the real village.
//
// Everything else — the panel API, the SPA, the bridge, retention — is the same
// code in all three, because there is only one copy of it.
//
// Point Telegram at a deployment once with:  deno task set-webhook <https-url>

import { type Bot, webhookCallback } from "grammy";
import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { AlertService, type Notifier } from "./src/alerts.ts";
import { createBridge } from "./src/bridge/twilio.ts";
import { createZadarmaBridge } from "./src/bridge/zadarma.ts";
import { loadConfig } from "./src/config.ts";
import { createPanelApi } from "./src/panel/api.ts";
import { KvStore } from "./src/store/kv.ts";
import { issueLink } from "./src/panel/auth.ts";
import { createBot, publishCommands } from "./src/telegram/bot.ts";
import { ConsoleNotifier } from "./src/telegram/console.ts";
import { TelegramNotifier } from "./src/telegram/notifier.ts";
import { refreshKeyboards } from "./src/telegram/refresh.ts";
import { purgeExpiredIncidents } from "./src/jobs/retention.ts";

const config = await loadConfig();
const store = await KvStore.open(config.runtime.kvPath);

// In offline mode there is no bot: the alert path speaks to the terminal, not
// to Telegram, and none of the network setup below runs. Everywhere else the
// bot is real and gets its identity, commands and keyboards before we serve.
const offline = config.runtime.telegramMode === "offline";
let bot: Bot | undefined;

if (offline) {
  console.warn(
    "⚠  Telegram is OFFLINE (ESCUDO_TELEGRAM=off). No bot, no group — alerts " +
      "print to this terminal. This is dev mode for the panel.",
  );

  // With no bot there is no /panel command to mint a login link, so the panel
  // would be unreachable past its login screen. Mint one here and print it: the
  // SPA spends a ?t= token exactly as it would one from Telegram, and the
  // resulting session persists in KV — so this is a once-per-checkout step, not
  // once per restart. Guarded by `offline`; it never runs against a real village.
  const link = await issueLink(store, "dev", "Dev");
  const base = config.runtime.publicUrl ?? `http://localhost:${config.runtime.port}`;
  console.log(`\n🔑 Open the panel (valid 10 min, session then lasts 30 days):`);
  console.log(`   ${base}/panel?t=${link.token}\n`);
} else {
  bot = createBot(config, store);

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
        // These members are holding a keyboard whose buttons no longer raise
        // anything, and they look signed up. Logged, not messaged: Escudo has
        // one chat, the village group, and this is not something to post there.
        console.warn(
          `${refresh.unreachable.length} member(s) did not get the new buttons: ` +
            refresh.unreachable.join(", "),
        );
      }
    }
  } catch (err) {
    console.warn("Keyboard refresh failed; members keep their old buttons", err);
  }
}

// The alert path's outward port: what posts to the village group. Real Telegram,
// or — offline — the console fake, so a panel test alert is fully exercised
// without reaching a phone. A factory, not a shared instance: the bridge and the
// panel each get their own, matching how the real ones are wired (see below).
const makeNotifier = (): Notifier =>
  offline ? new ConsoleNotifier() : new TelegramNotifier(bot!.api, config);

// Which way Telegram reaches us. A public URL means Deploy (or anything with
// TLS and a stable hostname) and webhooks; without one we dial out instead.
// Offline is neither, and mounts no update handler at all.
const webhookMode = config.runtime.telegramMode === "webhook";
const handleUpdate = webhookMode ? webhookCallback(bot!, "std/http") : null;

// The bridge: Twilio POSTs a call or an SMS, a registered household raises the
// alarm. Its AlertService is a second instance rather than the bot's — the
// class holds no state, everything lives in the store, so the dedupe window
// still collapses a device's simultaneous call and SMS into one incident.
//
// Mounted only when the supplier's secret is present. No secret means no
// signature check, and an unauthenticated bridge is a URL anyone can use to
// wake the village.
//
// Zadarma is the supplier in Bercianos and takes precedence. Twilio stays
// wired for anywhere that can buy a number doing both calls and SMS, which
// Spain cannot (tech-spec §3); it additionally needs the public URL, because
// its signature is computed over the URL it was configured with.
const bridgeDeps = {
  config,
  store,
  alerts: new AlertService(config, store, makeNotifier()),
};
const zadarmaSecret = config.secrets.zadarmaApiSecret;
const twilioToken = config.secrets.twilioAuthToken;
const bridgeUrl = config.runtime.publicUrl;

const handleBridge = zadarmaSecret
  ? createZadarmaBridge({
    ...bridgeDeps,
    apiSecret: zadarmaSecret,
    ivrPlayId: config.secrets.zadarmaIvrPlayId,
    checkSourceIp: config.runtime.checkSourceIp,
  })
  : twilioToken && bridgeUrl
  ? createBridge({ ...bridgeDeps, authToken: twilioToken, publicUrl: bridgeUrl })
  : null;

if (zadarmaSecret && twilioToken) {
  console.warn(
    "Both bridge suppliers are configured; Zadarma owns /bridge/voice and Twilio is ignored. " +
      "Unset one of them.",
  );
}
if (!handleBridge) {
  console.warn(
    "Bridge disabled — set ESCUDO_ZADARMA_API_SECRET to accept calls. " +
      "Telegram alerts are unaffected.",
  );
}
if (zadarmaSecret && !config.secrets.zadarmaIvrPlayId) {
  console.warn(
    "No ESCUDO_ZADARMA_IVR_PLAY_ID — callers will hear nothing before the line drops. " +
      "Alarms are raised regardless.",
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
// The panel can raise a real alert as a registered device (§5.2), so it gets
// the same alert service the bridge uses. Its own instance, like the bridge's:
// the class holds no state, and a panel request must not be able to interfere
// with one arriving from a phone.
web.route(
  "/api",
  createPanelApi(config, store, {
    alerts: new AlertService(config, store, makeNotifier()),
  }),
);
// Anchor the SPA's files to this module's own directory, not the process CWD.
// hono's serveStatic resolves a relative `root` against Deno.cwd(), which is not
// guaranteed to be the app directory on Deploy — and a wrong CWD is a silent
// 404, not an error. An absolute path derived from import.meta is correct in
// every environment.
const panelDist = `${import.meta.dirname}/panel/dist`;
web.use(
  "/panel/*",
  serveStatic({
    root: panelDist,
    rewriteRequestPath: (path) => path.replace(/^\/panel/, "") || "/",
  }),
);
// Bare /panel, and anything below it that isn't a real file, fall through to
// index.html: the SPA boots and works out what to show, including exchanging a
// ?t= link. serveStatic calls next() when it finds nothing, so these run only
// for paths the middleware above couldn't satisfy.
const panelIndex = serveStatic({ path: `${panelDist}/index.html` });
web.get("/panel", panelIndex);
web.get("/panel/*", panelIndex);
web.notFound((c) => c.text("not found", 404));

Deno.serve({ port: config.runtime.port }, async (req) => {
  const url = new URL(req.url);

  // Telegram first, and reached without touching the web router: an alert must
  // never queue behind, or be broken by, anything added for the panel.
  if (
    webhookMode && handleUpdate && req.method === "POST" &&
    url.pathname === `/${config.secrets.webhookSecret}`
  ) {
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

console.log(`Escudo serving ${config.village.name} on port ${config.runtime.port}`);
console.log(`  panel   http://localhost:${config.runtime.port}/panel`);
console.log(`  bridge  ${handleBridge ? "mounted" : "disabled — no supplier secret"}`);

// Polling starts last, after the server is already answering: the panel and the
// bridge must not wait on Telegram being reachable. bot.start() only resolves
// when the bot stops, so nothing may follow it.
if (offline) {
  console.log(`  telegram  offline — alerts print to this terminal`);
} else if (webhookMode) {
  console.log(`  telegram  webhook at ${config.runtime.publicUrl}`);
} else {
  // Drop any updates that queued while the bot was offline. On startup they are
  // stale by definition, and replaying an hours-old panic button into the
  // village group would be worse than losing it.
  await bot!.start({
    drop_pending_updates: true,
    onStart: (me) => {
      console.log(`  telegram  polling as @${me.username}`);
      console.log(`  alerts    post to chat ${config.telegram.groupChatId}`);
    },
  });
}
