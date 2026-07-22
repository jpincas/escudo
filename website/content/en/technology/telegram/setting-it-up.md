---
translationKey: "tech-telegram-setup"
title: "Setting it up in your village"
weight: 20
---
# Setting it up in your village

Nothing to buy and nothing to subscribe to. **This layer runs on a laptop for
nothing**, and only needs somewhere permanent once the community decides to carry
on.

## 1. The names

| Element | Name | Notes |
|---|---|---|
| The group | `Red Escudo <Village>` | e.g. *Red Escudo Bercianos*. |
| The bot, display name | `Botón Escudo` | The same in every village. |
| The bot, username | `@Escudo<Village>Bot` | e.g. `@EscudoBercianosBot`. |

A bot has two names. The `@username` is unique across all of Telegram and must
end in `bot`, so every village registers its own. The display name can repeat, so
`Botón Escudo` works everywhere — it's what appears in each neighbour's chat
list.

## 2. Create the bot

Talk to [@BotFather](https://t.me/BotFather):

1. `/newbot` → display name `Botón Escudo` → username `@Escudo<Village>Bot`.
2. Keep the **token**. It is the only password in the system: anyone holding it
   can speak as the bot. Never post it in the group or in any public document.
3. `/setuserpic` → the bot icon ([PNG 512](/img/telegram/bot-icon-512.png)).
4. `/setdescription` → what people read before pressing Start:
   > Alert button for the Red Escudo of &lt;Village&gt;. If you need help, press
   > a button and the whole village will know instantly.
5. `/setabouttext` → for the profile card:
   > Red Escudo &lt;Village&gt; · Neighbourhood alerts

**Leave privacy mode on** (BotFather's default). The bot then reads only commands
and button presses, never the group's conversation.

## 3. Create the group

1. A new group, `Red Escudo <Village>`.
2. Group photo: the network icon
   ([PNG 512](/img/telegram/group-icon-512.png)).
3. Add the bot.
4. **Make the bot an admin** with permission to pin. It needs no other
   permission.

## 4. Configure it

One file, `config.yaml`, plus two environment variables. Adopting Escudo means
editing the file and setting the variables — no code changes.

```yaml
village:
  name: "Bercianos del Real Camino"
  locale: es                    # es | en
  timezone: Europe/Madrid       # the clock shown on every alert

categories:                     # change these if your village needs others
  - { id: fuego,      emoji: "🔥" }
  - { id: medico,     emoji: "🚑" }
  - { id: delito,     emoji: "🚔" }
  - { id: emergencia, emoji: "🆘" }
  - { id: ayuda,      emoji: "🤝", urgency: quiet }   # silent; not an emergency

alerts:
  emergency_line: "062 Guardia Civil · 112 Emergencias"
  dedupe_seconds: 60            # repeat presses don't duplicate the alert

data:
  retention_days: 365           # incidents are deleted after a year
```

The environment variables wire up *your* deployment, and are never committed:
`ESCUDO_BOT_TOKEN` (the token BotFather gave you — the one real secret) and
`ESCUDO_GROUP_CHAT_ID` — type **`/chatid`** in the group to get it.

## 5. Pin the message

An admin types **`/pin`**. The bot posts the group message with a button opening
each neighbour's own *Botón Escudo*, and pins it. That pinned message handles
onboarding: join the group, tap once, buttons are a chat away.

## 6. Sign your neighbours up

At the sign-up meeting, with phones in hand — and again for every new
neighbour and every new phone, for as long as the village runs this
([the protocol]({{< relref "/protocols/onboarding-telegram" >}})):

1. **Join the group** `Red Escudo <Village>`.
2. **Open Botón Escudo and press START, once.** Until they do, the chat is empty
   and they have no buttons — so they can still *receive* alerts through the
   group while being unable to *raise* one. It looks like nothing is wrong.
3. **Set notifications to make a noise** for the group and the bot.
4. **Show them the buttons. Nobody presses one.** Every press alarms the whole
   village, so a room of twenty people each having a go is twenty alarms.
5. **At the end, post one ordinary message in the group** and watch the table.
   An alert arrives as a group message, so this tests the same thing without
   alerting anyone. Fix every phone that stayed quiet before people leave.

Test *alerts* belong to announced drills and nowhere else
([the protocol]({{< relref "/protocols/onboarding-telegram" >}})).

## The commands

| Command | Who | Where | What it does |
|---|---|---|---|
| `/sos` | anyone | group or bot | In the bot, brings the buttons back |
| `/start` | anyone | bot | Sign up, and get the buttons |
| `/pin` | admins | group | Post and pin the group's message |
| `/test` | admins | any chat | Post a drill to the group — the only test alert there is |
| `/export` | admins | any chat | Download the incident log |
| `/chatid` | anyone | any chat | Show the chat's id |

**Admin-only is enforced by the bot, not by Telegram.** Telegram has no concept
of a privileged command: anyone can type `/export` and it reaches the bot, which
checks their status in the village group and refuses. What Telegram *does* offer
is menu scoping — the four admin commands appear in the ☰ menu only for group
admins, which is discoverability, not security.

`/test` is the drill, and it is deliberately the only way to make every phone in
the village ring without an emergency. It posts a message that says what it is
in its first line, and it creates **no incident** — the numbers a drill produces
are counted by the people in the group
([the protocol]({{< relref "/protocols/testing-and-false-alarms" >}})).

## Details that cause trouble

**The bot must be an admin to pin.** Without it, the bot posts the message, says
it couldn't pin, and waits for you to grant the permission and run `/pin` again.

**Clearing your chat history with the bot takes the buttons with it.** They come
back three ways: Telegram's *Start* button, the ☰ menu, or typing anything at all
to the bot.

**A keyboard lives on the member's phone until the bot replaces it.** So a
deploy that changes the buttons doesn't reach anyone by itself — they'd keep the
old set for months, and an old button's label no longer matches a category, so
pressing it would raise *nothing*. The bot handles this on its own: at boot it
fingerprints the keyboard, and if the layout has changed it silently messages
every member with the new one. Restarts and cold starts cost one database read
and send nothing. Anyone it can't reach — someone who blocked the bot — is
reported to the admin chat (`ESCUDO_ADMIN_CHAT_ID`), and retired button labels stay mapped to their
category as a safety net.

**A group's id changes if Telegram promotes it to a supergroup.** This happens by
itself — a public link, a member count. Ordinary groups look like `-5301262830`;
supergroups start `-100`. Update `ESCUDO_GROUP_CHAT_ID` when it does.

**Pressing twice doesn't send two alerts.** Repeat presses from the same person
in the same category within `dedupe_seconds` fold into the live alert.

**Cancelling an alert frees the button immediately**, so a real emergency
straight after a false alarm goes out without waiting.

## Where the system lives

A small program that needs to be running.

- **To try it:** a laptop. No domain, no certificates, no open ports.
- **To rely on it:** any always-on machine — a small server, a Raspberry Pi — or
  free hosting such as [Deno Deploy](https://deno.com/deploy).

On Deno Deploy, three things are needed beyond pushing the code, and it fails
without them:

1. **A KV database, provisioned and assigned to the app.** It isn't automatic,
   and the free plan allows one per organisation.
2. **The bot token set as an environment variable** on the app. Local `.env`
   files are not read there.
3. **The webhook pointed at the deployed URL**, once: `deno task set-webhook
   https://<your-app>.deno.net`. Polling and webhooks are mutually exclusive, so
   clear it again before running locally.

This layer costs nothing. The only village expense in the whole system is the
[Escudo number]({{< relref "/technology/devices" >}}) — about a euro a month —
and even that is optional until a household wants a device.

## Data and responsibility

- Stores **the minimum**: name, Telegram id, incident log. **No health or
  vulnerability data.**
- Incidents **delete themselves** after `retention_days` (a year by default).
- `/export` produces the complete log, so a data request takes a minute.
- **Telegram is an independent controller** for messages on its platform. Say so
  in your privacy notice, with who hosts the system.

## The code

MIT licensed, built to be lifted as-is:
[github.com/jpincas/escudo](https://github.com/jpincas/escudo), under
`tech-implementation/bot`, with its own install and deployment guide.
