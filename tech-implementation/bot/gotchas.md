# Gotchas

Traps that `deno task check` can't catch. Hand-maintained — add new ones as you hit them, under the
relevant heading.

## The alert path

- **Answer the callback query first, before any I/O.** An unanswered button press spins on the
  presser's screen, which during an emergency reads as "it didn't work". `src/telegram/callbacks.ts`
  answers immediately and does the work afterwards.

- **The DM is the only place we deliberately swallow an error.** A user who has never opened a
  private chat with the bot yields 403 when we try to ask for their location. The group alert is
  already posted; failing the handler there would turn a bonus into an outage. Everywhere else, let
  errors surface.

- **Log the incident before posting it.** If the post fails we still hold the record. The reverse
  order loses the incident entirely.

- **Cancelling must clear the "open" pointer.** The double-tap guard reads
  `["incident_open", ref, category]`. Leave it pointing at a cancelled incident and the next press
  within the dedupe window silently attaches to a dead alert instead of raising a new one. There's a
  test for this ("a cancelled alert frees the dedupe window immediately") — don't delete it.

- **Never delete a cancelled alert's message.** It's struck through and left in place. Deleting
  erases the record; scolding about the false alarm makes the next person hesitate before pressing.
  Both are against the Protocolo Escudo.

## Telegram

- **Parse mode is HTML, not MarkdownV2.** MarkdownV2 requires escaping sixteen characters including
  `.` and `-`, which occur in ordinary names and timestamps. HTML needs three. Any new user-supplied
  text must go through `escapeHtml()` in `src/format.ts`.

- **Privacy mode must stay ON** (BotFather default). The bot receives commands and callbacks only,
  never group chatter. This is an account setting; no code here can enforce it.

- **The bot needs admin rights only to pin.** `/pin` tolerates their absence — the board still
  works, it just won't stick to the top.

- **Always return 200 to the webhook.** A non-2xx makes Telegram retry the same update, which during
  an incident means the alert posts twice. `main.ts` catches and returns "ok".

- **`bot.init()` is required in webhook mode.** grammY normally learns the bot's identity during
  `start()`, which never runs on Deploy.

- **A basic group's id changes if Telegram promotes it to a supergroup.** Basic groups look like
  `-5301262830`; supergroups start `-100`. The promotion happens by itself (public link, member
  limit, some admin features) and the old id then goes nowhere — silently. `src/telegram/bot.ts`
  logs loudly on `migrate_to_chat_id`; `config.yaml` still has to be updated by hand.

- **`sendLocation` takes no caption.** The label goes in a separate message threaded under the
  alert, with the pin beneath it.

## Storage

- **Two backends, one interface.** A change to `KvStore` that isn't mirrored in `MemoryStore` passes
  every test and breaks production, or vice versa. `tests/store_test.ts` runs one suite against both
  — add cases there, not to one backend's own file.

- **Incident ids are time-ordered on purpose.** `newIncidentId()` prefixes base36 milliseconds so a
  reverse KV range scan returns newest-first with no sort. Change the format and `listIncidents()` /
  `latestOpenFor()` silently reorder.

- **The day index narrows the retention scan; `createdAt` decides the boundary.** Purging by day
  alone deletes up to 24 hours too much.

- **No health or vulnerability flags. Ever.** Modelling "who is frail" pulls the whole system into
  GDPR Article 9 special-category processing, and with it DPIA/DPO obligations. The device→resident
  map in Phase 2 is a neutral device fact for the same reason.

## Config and i18n

- **`config.yaml` is committed, not gitignored.** Deno Deploy only sees uploaded source, so a
  gitignored config is simply absent in production. Nothing in it is secret; the bot token is the
  only secret and lives in the environment.

- **`Strings` is a type, not a bag.** Adding a key means adding it to every locale, and
  `deno task check` enforces that. This is why the copy isn't loose YAML — a half-translated locale
  should fail the build, not the village.

- **Timestamps render in the village's timezone, never the server's.** On Deploy the server is
  elsewhere. `formatTime()` handles it; don't reach for `toLocaleTimeString()` without a `timeZone`.

- **English is generic international, not a translation.** No country's emergency numbers belong in
  `en.ts` — they come from `alerts.emergency_line` in the village's config.

## Deploy

See [DEPLOY.md](./DEPLOY.md) — the CLI traps are all recorded there.
