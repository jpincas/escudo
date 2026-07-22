# Escudo — Technical Specification (v0.2)

Alert system for the Red Escudo in Bercianos del Real Camino (~200 residents, flat
terrain). Supersedes v0.1, which specified a LoRaWAN radio layer — see §7 for why
that was dropped.

## The shape of it

**One alert path, three doors.** However an alarm is raised it becomes the same
message, in the same village group, in the same format, through the same
`raiseAlert()`.

```
Telegram user ──tap──────────────┐
                                 │
Registered phone ──call/SMS──┐   │
                             ├──▶ bridge ──▶ Escudo bot ──▶ village group
Registered device ──call/SMS─┘                   │
                                            incident log
```

The doors exist because they serve different people, and the middle one is the
largest group in the village:

| Door | Who it is for | Costs |
|---|---|---|
| **Telegram** | Anyone with a smartphone who uses it | Nothing |
| **A registered phone** | Has a phone, isn't on Telegram — a dumbphone, or a smartphone used only for calls | Nothing |
| **A registered device** | Can't work a phone in a crisis, or is unconscious | The family buys it |

Nothing in the system branches on which door an alarm came through. The bridge
resolves a phone number to a household and raises an ordinary alert; every rule
already in `src/alerts.ts` — dedupe, cancellation, the incident log, retention —
applies unchanged.

## 1. The phone layer (built, in use)

A Telegram bot on Deno Deploy. A pinned board and a private keyboard carry five
buttons: four alarm categories (`fuego` `medico` `delito` `emergencia`) that post
with notification, and `ayuda` (`urgency: quiet`) which posts silently.

The quiet tier exists to protect the loud one. People mute groups that make
noise, and a muted group is the single largest failure in the whole system.

Detail lives in `bot/README.md`. Nothing below changes it.

## 2. The device layer

### The interface, not the device

**Escudo does not choose or supply hardware.** Families buy their own, so the
village has no procurement, no committee deciding who is frail, and no list of
the vulnerable — which the philosophy refuses anyway.

Instead Escudo publishes a contract, and any device meeting it can join:

> It must be able to call or send an SMS to a stored number.

That is all. Every domestic teleasistencia product on the Spanish market meets
it, in every form factor — mains base station with a pendant, GPS pendant, watch
with fall detection — and so does a fifteen-year-old Nokia. The person picks the
shape that suits them, which is the same principle as everything else here:
matched to the person, decided with them, one at a time, for years.

Some devices do things no button can. Fall detection raises an alarm with nobody
pressing anything, which covers the case this layer exists for. Voice activation
answers a shout from the floor when the pendant is on the bedside table. Where a
device has these, they come free; nothing depends on them.

### A call and an SMS do different jobs

Devices of this class do both at once, to the same stored numbers. Escudo uses
that deliberately:

- **The SMS goes to the bridge.** Unconditional, instant, and it does not care
  whether anybody is awake. It raises the whole village.
- **The calls go to responders.** Someone answers, and — because these units are
  hands-free at several metres — talks to the person while they are still on the
  floor. That call is the acknowledgment, and it is a better one than any device
  can give: a neighbour's voice, plus triage before anyone gets in a car.

Two channels, two failure modes, no overlap.

### A missed call is an alarm

The bridge treats an incoming call from a registered number exactly as it treats
an SMS, and never answers it.

Typing an SMS is six fine-motor steps — find phone, unlock, open messages, find
contact, type, send. A call is one, and on a dumbphone it is a speed-dial key.
Not answering means it costs the caller nothing.

### One press, no category

An alarm raised through this layer carries identity and location, not a
category, so it raises the generic `emergencia`. If an SMS body happens to name
one (*fuego*, *médico*), use it; otherwise do not try to be clever.

## 3. The bridge

**A hosted Spanish number on Twilio.** It POSTs every inbound call and SMS to
the bot, which is where all of the above becomes an alert.

The alternative was an old Android phone on a charger running an SMS-forwarding
app. It is free and needs no paperwork, and it was rejected on reliability. No
maintained app forwards both SMS *and* calls, so it takes two — one of which
(CallGate) has had no release since April 2025 and retries once. Android 15
capped foreground services and a battery-optimisation exemption no longer buys
immunity, so the realistic failure is the OS killing the bridge silently, in
somebody's spare room, discovered on the day it matters. That is the wrong
failure mode for the only path a person on the floor has.

**A rejected call costs nothing.** Telephony bills on answer supervision, and
`<Reject/>` as the first TwiML verb releases the call before answer — so Twilio
never picks up, the village is billed no voice minutes, and the caller pays no
*establecimiento de llamada*. Ringing the Escudo number is free to everyone.
This is what makes the missed-call door viable, and it is why the call, not the
SMS, is the primary trigger.

**Cost:** about $1.15/month for the number, $0.0075 per inbound SMS, nothing per
alarm.

**A +34 number needs a Spanish NIF/CIF and a local address with documentary
proof.** This is CNMC numbering policy, not a Twilio rule, so every provider
selling +34 asks for the same thing. Foreign numbers avoid it — a UK or Dutch
mobile takes any worldwide address and no documents — and were rejected too:
Twilio does not support international inbound SMS, intra-EU calls cost the
caller ~€0.23/min where a national call is bundled, and teleasistencia SIMs are
often whitelisted to national numbers, which would silently break the door for
exactly the households it exists for.

### Rules the bridge follows

**Do not parse the message to decide whether it is an alarm.** Devices phrase
things differently and firmware changes without warning. *Any* call or SMS from
a registered number is an alarm. Parse only to enrich: a lat/lon or a maps URL
in the body becomes a pin.

**One exception, because it bites.** Several devices send a low-battery SMS,
which under the rule above is a village-wide alarm at 3am. A short denylist of
patterns (*batería baja*, *low battery*) routes those to the admin chat instead.
Anything unrecognised still raises the alarm — the same "err towards waking
people" default as `isQuiet()`.

**An unregistered number does not reach the group.** It goes to the panel's
inbox (§5) and the admin chat. Silence would hide a broken install; alarming the
village would make the bot spammable by anyone who guesses the number.

**Every request is signature-checked.** Twilio signs each webhook with the
account auth token; an unsigned or wrongly signed request raises nothing and
doesn't even reach the inbox. With no auth token configured the two routes are
not mounted at all — there is deliberately no unauthenticated mode, because an
open bridge is a phone number anyone can use to wake the village at 3am.

### As built

`POST /bridge/voice` and `POST /bridge/sms`, in `src/bridge/twilio.ts`. Matched
ahead of the web router and sharing no code with it, on the same rule as the
Telegram webhook: an alarm must never queue behind a panel page.

A device's call and SMS usually arrive together. `raiseAlert()`'s existing
dedupe window collapses them into one incident, and the SMS's position attaches
as a pin to the alert the call already raised. Any accepted contact — including
a low-battery SMS, which proves the whole path — sets `lastProvenAt`.

## 4. The registry

One record per registered number, held in KV — not in `config.yaml`, which is
committed to a public fork.

```ts
interface Device {
  msisdn: string;               // E.164. The key: what a call or SMS arrives from
  label: string;                // "Casa de María" — how the alert is headed
  address: string;              // where a responder actually goes
  kind: DeviceKind;             // base | pendant | watch | phone | other
  lastProvenAt: string | null;  // last real alert or test that worked
  registeredAt: string;
}
```

**The address is the payload, not metadata.** A base station on a kitchen wall
carries no GPS. The address *is* the location, and it goes in the alert text.

**A device fact, not a person fact.** "This number belongs to this house" says
nothing about anyone's health. There is deliberately no field recording why
someone has a device; adding one would move the whole system into Article 9
special-category processing.

## 5. The admin panel

A React SPA at `/panel`, served by the same Deno app, with a JSON API at
`/api/*`. Kept off the alert path: the Telegram webhook is matched before the
web router, and no panel module is imported by `src/alerts.ts`.

**No login form and no user table.** An admin DMs the bot `/panel`; it checks
`isGroupAdmin()` — read live from Telegram — and replies with a one-time link,
valid ten minutes, that opens a 30-day session. Revoking panel access is the
same action as removing someone as a group admin, so there is no second list to
drift.

Built: the device registry, with add, edit, remove, and derived status.
Planned, in order:

1. **Inbox** — unregistered numbers that have called or texted, one click to
   register. This is how a household actually joins: they ring the bridge from
   the new device, and the coordinator names it. Nobody types a phone number.
2. **Incidents** — a readable log, replacing `/export`.
3. **The test rota** — see below.

## 6. Testing, and why it is the hard part

A LoRaWAN button heartbeats every twenty minutes with its battery voltage.
**A shop-bought device tells us nothing at all.** It sits in a drawer, its SIM
expires, its battery dies, and the village finds out on the day it matters.

So the scheduled test is not hygiene. It is the only liveness proof in the
system, and it cannot depend on anyone remembering.

**The bot owns the rota.** `lastProvenAt` is updated by a real alert or a test.
Past `devices.prove_within_days` (default 60) the panel marks the household
*caducado* and the coordinator is told. A device never yet proven is shown
separately as *nunca probado*: that is an install that was never finished, which
is a different problem from a routine that has slipped.

**A test window, not a test button.** The coordinator opens a window for one
household from the panel; the next alarm from that number is logged silently,
confirmed privately, and never posted to the group.

This is better than a dedicated hardware test button, which is what v0.1
specified:

- It works on any device, including the single-button ones — and a €99 kit has
  exactly one button.
- The resident's experience during the drill is **identical to a real
  emergency** — they press, the phone rings, a neighbour talks to them — minus
  the village noise. A dedicated test button rehearses pressing a button they
  will never press in anger.
- It depends on no hardware feature, so it cannot be lost to a stock change.

Separately, `/test` posts an admin-triggered drill to the group. That tests
something different and equally important: whether phones make a noise.

## 7. LoRaWAN: considered and rejected

v0.1 specified a village LoRaWAN network — a gateway, a mast, and Dragino PB05-L
wall buttons. It was researched thoroughly and it works. It was dropped because
every advantage it has is a **fleet** advantage, and there is no fleet:

- Its low marginal cost per button only matters if the village buys the buttons.
- Its uniform battery chemistry and telemetry only matter across a managed fleet.
- Buying that fleet means deciding who gets one, which means the list the
  philosophy refuses to keep.

Against that it needs the village to own infrastructure: a gateway, permission
to mount an antenna high on somebody's building, a UPS, a lightning arrestor,
and a single point of failure for the whole village. And it cannot serve one
house on a Tuesday, which is the test every part of this model has to pass.

**What would reopen it:** mobile coverage failing at floor level in the houses
that matter, or a power-resilience requirement the mains-powered kits cannot
meet. Both are real. Neither applies in Bercianos today — Orange coverage is
good.

The research remains in `research/technical-research.md` and is sound; treat its
conclusions as correct for a village where the above is false.

## 8. Failure modes

| Failure | Mitigation |
|---|---|
| Muted/DND phones (still the top risk) | The quiet tier protects the alarm tier; drills via `/test`; notification setup at onboarding |
| **A device silently dead** — flat battery, expired SIM, in a drawer | The test rota. There is no telemetry; this is the whole reason §6 exists |
| Mains cut takes out a base station | Internal backup is hours, not days. Honest limitation; a phone in a pocket is unaffected |
| Prepaid SIM expires unnoticed | Owned by the coordinator, tracked per household. Spanish prepago dies after 4–9 months without a recharge |
| Bridge dies | Whatever is chosen must itself heartbeat, or its silence is invisible |
| No credit on a prepaid phone | Cannot ring the bridge. 112 works with no credit and no SIM — which is why the emergency line stays on every alert |
| Village internet / Telegram outage | Accept; the human phone tree is the backstop |
| Server crash | Deploy restarts; healthchecks.io dead-man's-switch |

## 9. What it costs

**Families pay for their own devices**, so cost is not a village budget line and
not a reason to choose one technology over another.

- **Telegram door:** nothing.
- **Registered phone door:** nothing. Everyone already owns this.
- **Device door:** roughly €99 for a mains base station with a pendant, less for
  a plain GPS pendant, more for a watch with fall detection. Plus a prepaid SIM,
  around €10/year.
- **The village pays:** nothing, unless it chooses to host the bridge.

Which means the cheapest useful thing the village can do — register the phones
people already own — costs nothing at all and covers the largest group.

## Open items

- **Buy the number.** The code is written and tested; the bridge is dark until a
  Spanish NIF/CIF and an address with documentary proof clear Twilio's review.
- **Build the inbox screen** (§5.1) — registration by ringing the bridge, not by
  typing. The store and the API behind it are done; the panel page is not.
- **The test window** (§6), which is the only thing that makes a green *Correcto*
  mean anything.
- **Verify a real device end to end** before recommending any specific model:
  does voice activation answer an elderly Spanish speaker with a television on,
  and does the SMS actually arrive at the bridge.
- **A branded unit to standardise on.** The €99 kits are white-labelled with no
  manufacturer, no model number, and a barcode the reseller reuses across
  products. Fine to probe with, not something to put in a proposal.
