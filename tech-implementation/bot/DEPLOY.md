# Deployment (Deno Deploy)

Phase 1 needs nothing more than a process that stays running. `deno task dev` on a laptop is a
legitimate way to trial it. This document covers making it always-on.

Org and app name live in `deno.json`'s `"deploy"` block. **Run every command below from this
directory** (`tech-implementation/bot/`) — the app is a subdirectory of the repo, not its root.

```bash
deno deploy --prod
```

## First-time setup

```bash
# 1. Provision KV and attach it to the app. NOT automatic on the new platform.
deno deploy database provision escudo --kind=denokv --org=<org>
deno deploy database assign escudo --org=<org> --app=escudo-bot

# 2. The bot token and the chat ids. .env / .env.local are NOT read on Deploy.
deno deploy env add ESCUDO_BOT_TOKEN "123456:ABC…" --org=<org> --app=escudo-bot
deno deploy env add ESCUDO_GROUP_CHAT_ID "-1001234567890" --org=<org> --app=escudo-bot
# Optional — private chat for maintenance alerts:
# deno deploy env add ESCUDO_ADMIN_CHAT_ID "…" --org=<org> --app=escudo-bot

# 3. Where the app is reachable from a browser. /panel needs it to build the
#    admin link, and the bridge needs it to verify Twilio's signatures — those
#    are signed over the URL Twilio was configured with, not the one Deploy's
#    proxy hands us. Without it, no panel links and no bridge.
deno deploy env add ESCUDO_PUBLIC_URL "https://escudo-bot.<org>.deno.net" --org=<org> --app=escudo-bot

# 4. The Twilio account auth token, if the village has a number yet. This is
#    what signs the /bridge webhooks; unset, the two routes are not mounted and
#    calls and SMS raise nothing. Telegram alerts are unaffected either way.
deno deploy env add ESCUDO_TWILIO_AUTH_TOKEN "…" --org=<org> --app=escudo-bot

# 5. Deploy.
deno deploy --prod

# 6. Point Telegram at it (once, and after any URL or secret change).
deno task set-webhook https://escudo-bot.<org>.deno.net
```

## The bridge

In the Twilio console, on the number itself:

- **A call comes in** → Webhook, `https://escudo-bot.<org>.deno.net/bridge/voice`, HTTP POST
- **A message comes in** → Webhook, `https://escudo-bot.<org>.deno.net/bridge/sms`, HTTP POST

Both URLs must match `ESCUDO_PUBLIC_URL` exactly, character for character — the signature is
computed over the URL as configured, so a trailing slash or a `www.` that differs makes every
genuine call fail the check and raise nothing.

The voice webhook replies `<Reject/>`, so the call is released before answer: never answered, never
billed, and the caller hears it ring out.

In the dashboard's build config: entrypoint `main.ts`, App Directory `tech-implementation/bot`,
**build command `deno task build`** — that installs the admin panel's npm dependencies and builds it
to `panel/dist`, which the app then serves at `/panel`. `panel/dist` is gitignored, so the build
step is not optional: skip it and `/panel` 404s while the bot itself works normally.

Confirm it's alive: `curl https://escudo-bot.<org>.deno.net/health` → `ok`.

## Traps

These cost real time on the sibling `calstakk` project. They are not obvious and they are not
documented anywhere near each other.

- **Use the bundled `deno deploy` CLI, not `deployctl`.** They target different generations of the
  platform and are not interchangeable. `deployctl`'s classic org/project model doesn't match a
  current account at all — using it once created a stray duplicate "classic" org.
- **The deploy command may never exit.** The upload spinner sticks at "0/1 files uploaded" and spins
  forever while the deploy completes server-side in ~30s. Wrap it (`timeout 90 deno deploy --prod`)
  or Ctrl-C once the preview URL prints, then confirm with
  `deno deploy deployments list --org=<org>
  --app=escudo-bot` — a revision with STATUS `routed` is
  live. **The PROD column reads "no" even for the live production revision; don't trust it.**
- **Org slug ≠ org display name.** They differ. Read the slug from the dashboard URL or an existing
  `deno.json`, don't infer it from the name.
- **The dashboard's "Retry" button reuses the previously uploaded source.** It does not pick up
  local changes. After editing anything — including `deno.json` — run `deno deploy --prod` again.
- **`deno deploy env add` is the only way to set variables.** `.env` and `.env.local` are
  local-only.
- **Polling and webhooks are mutually exclusive.** Before going back to `deno task dev`, clear the
  webhook: `deno task set-webhook` with no argument. Otherwise Telegram keeps POSTing to the
  deployed app and the local bot sees nothing.
- **Authentication.** `DENO_DEPLOY_TOKEN` in the environment is the reliable path; the browser-based
  interactive login fails on machines without a working Secret-Service/keychain daemon. Note that an
  agent shell only inherits an export added to your shell profile if the shell was restarted
  afterwards.

## Self-hosting instead

Nothing here requires Deno Deploy. On any always-on box:

```bash
ESCUDO_KV_PATH=./data/escudo.db deno task dev     # polling, no public URL at all
```

Local Deno KV is SQLite on disk, so this is the same code against a file you own. This is the right
answer for a community that needs its data kept in-country.

## The admin panel

`/panel` is a React SPA served by this same app; `/api/*` is its JSON API. There is no login form
and no user table — an admin DMs the bot `/panel`, and the bot replies with a one-time link that
opens a session. Authority is read live from Telegram (`isGroupAdmin`), so **removing someone as a
group admin removes their panel access**; there is no second list to remember.

The link expires in ten minutes and works exactly once, which means it is safe to send over Telegram
and unsafe to forward. Sessions last 30 days.

## Phase 2 (device layer)

Alarm devices — pendants, wall units, watches, or just a neighbour's own phone — reach the village
by calling or texting a bridge number, which POSTs to this app. Nothing else moves: the bridge
resolves the caller against the device registry and raises the same alert, through the same
`raiseAlert()`, in the same group. See `../tech-spec.md`.
