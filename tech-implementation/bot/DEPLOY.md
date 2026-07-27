# Deployment (Deno Deploy)

## The one command

```bash
deno task deploy
```

From this directory (`tech-implementation/bot/`), with `DENO_DEPLOY_TOKEN` in the environment. That
is the whole procedure. The task (`scripts/deploy.ts`) preflights the app's server-side build
configuration and repairs it if missing, deploys, waits out the build, and then verifies the live
app: production serves the new revision, `/health` answers `ok`, `/panel` serves the built SPA. It
prints `✔ Deployed and verified` or names the exact step that failed. Do not run
`deno deploy --prod` by hand — the raw CLI is where every trap below lives.

Everything else in this document is context: first-time setup, and the traps the task exists to
absorb.

Phase 1 needs nothing more than a process that stays running. `deno task dev` on a laptop is a
legitimate way to trial it. This document covers making it always-on.

Org and app name live in `deno.json`'s `"deploy"` block. **Run every command below from this
directory** — the app is a subdirectory of the repo, not its root.

## First-time setup

```bash
# 1. Provision KV and attach it to the app. NOT automatic on the new platform.
deno deploy database provision escudo --kind=denokv --org=<org>
deno deploy database assign escudo --org=<org> --app=escudo-bot

# 2. The bot token and the chat ids. .env / .env.local are NOT read on Deploy.
deno deploy env add ESCUDO_BOT_TOKEN "123456:ABC…" --org=<org> --app=escudo-bot
deno deploy env add ESCUDO_GROUP_CHAT_ID "-1001234567890" --org=<org> --app=escudo-bot

# 3. Where the app is reachable from a browser. /panel needs it to build the
#    admin link, and the bridge needs it to verify Twilio's signatures — those
#    are signed over the URL Twilio was configured with, not the one Deploy's
#    proxy hands us. Without it, no panel links and no bridge.
deno deploy env add ESCUDO_PUBLIC_URL "https://escudo-bot.<org>.deno.net" --org=<org> --app=escudo-bot

# 4. The Twilio account auth token, if the village has a number yet. This is
#    what signs the /bridge webhooks; unset, the two routes are not mounted and
#    calls and SMS raise nothing. Telegram alerts are unaffected either way.
deno deploy env add ESCUDO_TWILIO_AUTH_TOKEN "…" --org=<org> --app=escudo-bot

# 5. Deploy. This also registers the panel's server-side build command on the
#    app the first time (see the first trap below for why that matters).
deno task deploy

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

The app's registered build command (`deno task build`, step 5 above) installs the admin panel's npm
dependencies and builds it to `panel/dist` on the platform's build machines, which the app then
serves at `/panel`. It is not optional: without it `/panel` 404s while the bot itself works
normally.

Confirm it's alive: `curl https://escudo-bot.<org>.deno.net/health` → `ok`.

## Traps

These cost real time here and on the sibling `calstakk` project. They are not obvious and they are
not documented anywhere near each other. `deno task deploy` absorbs the first two and the fourth;
they are recorded so nobody rediscovers them by hand.

- **`/panel` 404 in production = no build command registered on the app.** The CLI upload honours
  `.gitignore` (verify with `deno deploy --debug`, which prints the manifest — `panel/dist` is
  absent), so a locally built panel never uploads and rebuilding/redeploying locally changes
  nothing. The panel must be built server-side, which only happens if the app has a build command
  registered — and `deno deploy create` is the only CLI path that can set one, so an app created
  without it stays broken silently. The tell: revisions complete in ~4 seconds, while a real build
  takes minutes. `deno task deploy` detects the missing command and registers `deno task build`
  itself (via the console API — `scripts/deploy.ts` shows the call).
- **The CLI rewrites `deno.json`'s `deploy` block after each deploy** and knows only `org`/`app` — a
  hand-added `build` key there does nothing and gets dropped.
- **Use the bundled `deno deploy` CLI, not `deployctl`.** They target different generations of the
  platform and are not interchangeable. `deployctl`'s classic org/project model doesn't match a
  current account at all — using it once created a stray duplicate "classic" org.
- **The raw deploy command may never exit.** The upload spinner sticks at "0/1 files uploaded" and
  spins forever after the deploy has already completed server-side. `deno task deploy` parses the
  result and kills the child; if you must run the CLI raw, wrap it in `timeout` and confirm with
  `deno deploy deployments list` — a revision with STATUS `routed` is live. **The PROD column reads
  "no" even for the live production revision; don't trust it.**
- **Org slug ≠ org display name.** They differ. Read the slug from the dashboard URL or an existing
  `deno.json`, don't infer it from the name.
- **The dashboard's "Retry" button reuses the previously uploaded source.** It does not pick up
  local changes. After editing anything — including `deno.json` — run `deno task deploy` again.
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
