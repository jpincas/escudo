// Point Telegram at a deployed instance. Run once after the first deploy, and
// again whenever the URL or the webhook secret changes.
//
//   deno task set-webhook https://escudo-bot.<org>.deno.net
//
// Pass no argument to delete the webhook (which is what you want before going
// back to `deno task dev`, since polling and webhooks are mutually exclusive).

import { loadConfig } from "../src/config.ts";

const config = await loadConfig();
const base = Deno.args[0];
const api = `https://api.telegram.org/bot${config.secrets.botToken}`;

const response = base
  ? await fetch(`${api}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: `${base.replace(/\/$/, "")}/${config.secrets.webhookSecret}`,
      drop_pending_updates: true,
      allowed_updates: ["message", "callback_query"],
    }),
  })
  : await fetch(`${api}/deleteWebhook?drop_pending_updates=true`);

const result = await response.json();
console.log(base ? `setWebhook → ${base}` : "deleteWebhook", result);
if (!result.ok) Deno.exit(1);
