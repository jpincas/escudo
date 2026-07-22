# Escudo — bot de avisos / alert bot

The phone layer of [Escudo](../../README.md): a Telegram bot that turns one tap into an alert posted
to the village group. This is **Phase 1** of [`../tech-spec.md`](../tech-spec.md) — no hardware, no
server, nothing to buy.

A neighbour presses a button on a pinned message. The alert appears in the village group within a
second, stamped with who and when. The bot then offers a one-tap location share. Every alert carries
a _Falsa alarma_ button, because false alarms have to stay cheap.

The radio layer (LoRaWAN buttons for people who don't use phones) is Phase 2. The core in
`src/alerts.ts` is already shaped for it: alerts have a `source`, and the ChirpStack webhook will
call the same `raiseAlert()`.

## Quickstart

You need [Deno](https://deno.com/) 2.x and a Telegram account.

**1. Make a bot.** Message [@BotFather](https://t.me/BotFather), send `/newbot`, and keep the token.
Leave **privacy mode ON** (the default) — the bot should never read the village's ordinary chatter,
only commands and button presses.

**2. Configure.**

```bash
cp config.example.yaml config.yaml     # edit: village name, timezone, categories
echo 'ESCUDO_BOT_TOKEN=123456:ABC…' > .env.local
```

**3. Run it.**

```bash
deno task dev
```

**4. Wire it to the group.** Add the bot to your village group, make it an admin (needed only to
pin), then in the group:

- `/chatid` → set the id as `ESCUDO_GROUP_CHAT_ID` in `.env.local`, and restart.
- `/pin` → posts the button board and pins it.

That's it. Phase 1 runs on a laptop for free. When you want it always-on, see
[DEPLOY.md](./DEPLOY.md).

## Commands

| Command   | Who    | Where    | What                                                         |
| --------- | ------ | -------- | ------------------------------------------------------------ |
| `/pin`    | admins | group    | Post the alert board and pin it                              |
| `/sos`    | anyone | group    | A fresh board at the bottom, if the pinned one scrolled away |
| `/chatid` | anyone | any chat | Print the chat's id, for `ESCUDO_GROUP_CHAT_ID`              |
| `/export` | admins | any chat | The incident log as JSON (also answers GDPR access requests) |
| `/start`  | anyone | DM       | What the bot is and how to raise an alarm                    |

## Adopting this for your own village

Edit `config.yaml` and set two env vars. That's the whole contract — no code changes.

```yaml
village: { name, locale (es|en), timezone }
categories: [{ id, emoji, label? }, …] # rename, reorder, add, remove
alerts: { emergency_line, dedupe_seconds } # YOUR national numbers
data: { retention_days }
```

`config.yaml` is **committed** — it is village *policy*, none of it identifies a deployment, and
Deno Deploy only ever sees uploaded source. Everything that wires up *your* deployment lives in
the environment: `ESCUDO_BOT_TOKEN` (the one real secret) and `ESCUDO_GROUP_CHAT_ID` (plus
optional `ESCUDO_ADMIN_CHAT_ID`).

To add a language, copy `src/i18n/es.ts`, translate it, and register it in `src/i18n/mod.ts`.
`Strings` is a type, so a half-finished translation fails `deno task check` rather than reaching a
village.

## How it's put together

```
main.ts / dev.ts     webhook (production) / polling (local) — same bot
src/alerts.ts        THE CORE: raise, cancel, attach location, log
src/format.ts        how an alert reads in the group
src/config.ts        config.yaml + env, validated at boot
src/store/           Store interface · kv.ts (production & self-host) · memory.ts (tests)
src/telegram/        buttons, commands, admin checks — transport only
src/i18n/            every user-facing string, typed
src/jobs/retention.ts  the 12-month delete
```

`src/alerts.ts` talks to a `Notifier` port, not to Telegram. That's what lets Phase 2's radio layer
reuse the formatting, the incident log, the cancellation rules and retention without touching any of
them.

## Development

```bash
deno task dev          # run locally (long polling — no public URL needed)
deno task iterate      # fast typecheck
deno task check        # the whole gate: lint + typecheck + tests
```

Tests are hermetic — `deno test` does not load `.env` files, and nothing in the suite talks to
Telegram.

## Data protection

The spec's §4 posture, implemented:

- **Members** are a name and a Telegram id. There are deliberately **no health or vulnerability
  flags anywhere** in the data model — modelling "who is frail" would pull the whole system into
  GDPR Article 9 special-category processing. Don't add one.
- **Incidents** are deleted after `retention_days` (default 365), on a schedule.
- **`/export`** produces the full incident log, so an access request can be answered in a minute.
- **Telegram is an independent controller** for anything flowing through its platform. Say so in the
  village's privacy notice.
- **If you host on Deno Deploy**, the roster and incident log sit on infrastructure run by a US
  company, and the new Deploy platform doesn't let you pick a KV region. It's minimal,
  non-special-category data and defensible under standard contractual clauses — but name the
  provider in your privacy notice. If your community needs the data kept in-country, self-host: set
  `ESCUDO_KV_PATH` and the same code runs against a local file.

## Licence

MIT (see [LICENSE](./LICENSE)). Take it, fork it, run your own.
