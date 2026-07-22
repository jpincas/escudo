// Local development entrypoint.
//
// Long polling: the bot dials out to Telegram, so there is no public URL, no
// tunnel and no TLS to arrange. Run this on a laptop and the village group
// works immediately — which is also the honest answer for a village that wants
// to trial Phase 1 before paying for anything.
//
//   deno task dev
//
// Production uses main.ts (webhooks) instead. Same bot, different plumbing.

import { loadConfig } from "./src/config.ts";
import { KvStore } from "./src/store/kv.ts";
import { createBot, publishCommands } from "./src/telegram/bot.ts";
import { purgeExpiredIncidents } from "./src/jobs/retention.ts";

const config = await loadConfig();
const store = await KvStore.open(config.runtime.kvPath);
const bot = createBot(config, store);

await purgeExpiredIncidents(store, config.data.retentionDays);
await publishCommands(bot, config);

// Drop any updates that queued while the bot was offline. On startup they are
// stale by definition, and replaying an hours-old panic button into the village
// group would be worse than losing it.
await bot.start({
  drop_pending_updates: true,
  onStart: (me) => {
    console.log(`Escudo bot @${me.username} polling for ${config.village.name}`);
    console.log(`Alerts post to chat ${config.telegram.groupChatId}`);
  },
});
