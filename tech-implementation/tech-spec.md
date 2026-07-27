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
Registered phone ──────call──┐   │
                             ├──▶ bridge ──▶ Escudo bot ──▶ village group
Registered device ─────call──┘                   │
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

> It must be able to call a stored number.

That is all. Every domestic teleasistencia product on the Spanish market meets
it, in every form factor — mains base station with a pendant, GPS pendant, watch
with fall detection — and so does a fifteen-year-old Nokia. The person picks the
shape that suits them, which is the same principle as everything else here:
matched to the person, decided with them, one at a time, for years.

Some devices do things no button can. Fall detection raises an alarm with nobody
pressing anything, which covers the case this layer exists for. Voice activation
answers a shout from the floor when the pendant is on the bedside table. Where a
device has these, they come free; nothing depends on them.

### The bridge takes the first call, the responders take the rest

Devices of this class dial several stored numbers in sequence. Escudo uses that
deliberately:

- **The first stored number is the bridge.** Unconditional, instant, and it does
  not care whether anybody is awake. It raises the whole village, and it answers
  with a recording so the person knows it worked.
- **The numbers after it are responders.** Someone answers, and — because these
  units are hands-free at several metres — talks to the person while they are
  still on the floor. That call is the human acknowledgment, and it is a better
  one than any recording: a neighbour's voice, plus triage before anyone gets in
  a car.

One press, two jobs, in the order that matters: the village is raised before a
human has to be available.

### A call is the whole interface

Typing an SMS is six fine-motor steps — find phone, unlock, open messages, find
contact, type, send. A call is one, and on a dumbphone it is a speed-dial key.
That is the entire reason this layer is voice: it is the only action that
survives panic, arthritis, darkness and bad eyesight at once.

### One press, no category

An alarm raised through this layer carries identity, not a category, so it raises
the generic `emergencia`. A pressed button cannot say whether the house is on fire
or the hip is broken, and guessing would be worse than not knowing.

## 3. The bridge

**A León landline on Zadarma, and a call is the only trigger.** The number lives
in the cloud, not on a SIM: no hardware in the village, no radio, no box in
anybody's spare room. Zadarma POSTs the moment a call arrives and the bot turns
that into an alert.

**The alarm fires before the call is answered.** Zadarma's `NOTIFY_START` webhook
carries `caller_id` and the dialled number at ring time, not at pickup. So the
alert is already on its way while the phone is still ringing, and it does not
depend on the caller staying on the line, on the audio path, or on anything the
village cannot control. Someone who panics and hangs up after two rings has still
raised the alarm.

**Then the call is answered and says so.** A fixed recording, twice, then hang up:

> *Aviso recibido. Ya hemos avisado a sus vecinos. Quédese donde está, viene
> ayuda.*

This is the part that was missing. A ring-out tone tells a frightened person on
the floor nothing, which invites hanging up, redialling, or giving up. A voice is
the difference between hoping it worked and knowing. It is deliberately downstream
of the alarm: if the recording fails, the alert has already gone.

**Cost:** €0 to connect, €1.70/month on annual billing — about €20 a year, the
only running cost in the system. Zadarma's cloud PBX is free, incoming calls are
free, and ten concurrent lines come with the number, so a village-wide event that
has several people ringing at once does not queue. Nothing is charged per alarm.

Calling it is free from any contract tariff, where landline minutes are bundled.
A prepaid SIM pays *establecimiento de llamada* plus the minute once the call is
answered — a few cents, and it buys the reassurance rather than the alert, which
is the right way round.

### Why not the obvious alternatives

**A hosted +34 cannot receive SMS.** Twilio's Spanish inventory returns nothing
at all when filtered for voice *and* SMS, in both their US and EU regions. This
is not a Twilio gap: Spain routes inbound A2P SMS over short codes, which run to
twelve weeks of provisioning and enterprise pricing. Every provider selling +34
sits behind the same numbering policy, so shopping around does not fix it.

**A foreign number cannot receive the call.** Tested, 23 July 2026: an Estonian
mobile (+372) took an SMS from a Spanish handset intact — sender and body, seconds
later — which disproves the older claim here that international inbound SMS does
not work. The call placed to the same number from the same handset never reached
the carrier at all. Orange refused it inside Spain as *restricted*, the way
Spanish operators bar international dialling by default on consumer tariffs. It
unlocks per line, by ringing the operator, which makes it an onboarding step on
every pendant and every phone whose failure is silent: a line that quietly lacks
it raises nothing, and nobody learns that until the day it matters. **Bercianos
has Orange coverage and nothing else**, so that is not a tariff detail to route
around — it is the whole village.

**A SIM in a gateway cannot be trusted for voice here.** It was the answer for a
while, and the reasoning that killed it is worth keeping. Cellular voice means
either 2G, which Bercianos does not have usable coverage for, or VoLTE, which on
embedded modules is not dependable: Quectel's own forums carry repeated reports of
EC25-E and EG25-G units failing IMS registration in Europe, calls dropping one to
ten seconds after connect, and carrier-specific config files needed to register at
all. Separately, no cellular router forwards an *incoming call* to HTTP — Teltonika
staff confirm the modem terminates incoming calls without emitting `RING` or caller
ID, and their workaround is to answer the call, which is the one thing that must
not happen automatically. A radio in the village buys nothing here and adds every
failure mode a landline does not have.

**Which leaves SMS out of the design.** No +34 receives it, and the whole point of
this layer is a number that Spanish phones can reach without preparation. The cost
is the location pin: a device that texts its coordinates has nowhere to send them.
Alerts carry the registered house and address instead, which in a village of this
size is most of what a pin would have told anyone.

### Rules the bridge follows

**A call from a registered number is an alarm. There is nothing else to decide.**
No duration threshold, no ring count, no attempt to tell a deliberate call from a
fumbled one. The caller is on the floor or they are not, and the system is in no
position to judge which.

**An unregistered number does not reach the group.** It goes to the panel's
inbox (§5), where a household is named and registered. Silence would hide a
broken install; alarming the village would make the bot spammable by anyone who
guesses the number. Escudo has no private "admin" channel to notify — it speaks
to one place, the village group — so the inbox is where this surfaces.

**Every request is authenticated, and there is no unauthenticated mode.** An
unsigned or wrongly signed request raises nothing and doesn't even reach the
inbox; with no secret configured the route is not mounted at all. An open bridge
is a URL anyone can use to wake the village at 3am.

Zadarma authenticates in three layers, and the bridge uses all of them. A one-off
`zd_echo` handshake proves the URL is ours when the webhook is first configured.
Every subsequent request carries a `Signature` header — base64 of an HMAC-SHA1 over
the sorted parameters, keyed with the account secret — which is checked before
anything else happens. And their notifications originate from 185.45.152.40/30, so
anything from outside that range is refused on sight.

**The SMS rules are retained, dormant.** `/bridge/sms` and its handling — any
message from a registered number is an alarm, a lat/lon in the body becomes a pin,
a low-battery text (*batería baja*) is recorded as proof-of-life rather than
waking the village at 3am — stay in the code and stay correct. Nothing in Spain
can deliver to them today. If that changes, or if the model is adopted somewhere
that sells a mobile number with inbound SMS, the path is already built.

### As built

`POST /bridge/voice` and `POST /bridge/sms`, in `src/bridge/twilio.ts`. Matched
ahead of the web router and sharing no code with it, on the same rule as the
Telegram webhook: an alarm must never queue behind a panel page.

Written against Twilio, which is not the supplier any more. The shape survives —
a form POST carrying a sender, turned into an alert — so what changes is the
signature check, the field names (`caller_id` rather than `From`), the `zd_echo`
handshake, and the answer that plays the recording. `raiseAlert()`, the registry
lookup, the dedupe window and the unregistered-number path are all untouched.

`raiseAlert()`'s dedupe window still earns its place: a pendant that dials two or
three numbers in sequence, or a caller who redials because they are frightened,
produces one incident rather than a burst. Any accepted call sets `lastProvenAt`.

## 4. The registry

One record per registered number, held in KV — not in `config.yaml`, which is
committed to a public fork.

```ts
interface Device {
  msisdn: string;               // E.164. The key: what a call arrives from
  label: string;                // "Casa de María" — how the alert is headed
  address: string;              // where a responder actually goes
  kind: DeviceKind;             // base | wearable | phone | alarm | other
  lastProvenAt: string | null;  // last real alert or test that worked
  registeredAt: string;
}
```

**The address is the payload, not metadata.** A base station on a kitchen wall
carries no GPS. The address *is* the location, and it goes in the alert text.

**`kind` changes the icon and nothing else.** Every kind raises the same alarm
to the same people with the same urgency; what it changes is the character at
the front of the alert — 🛎️ base · ⌚ wearable · 📱 phone · 🏠 alarm · 📟 other.
Every bridge alert carries the same category, because a button cannot say
whether it is a fall or a fire, so the kind is the only thing distinguishing one
from another on a lock screen at three in the morning. It is snapshotted onto
the incident alongside the address, for the same reason: editing the registry
later must not rewrite what an alert said at the time.

**`alarm` is a domestic alarm panel wired to dial the bridge.** It is the only
kind where nobody chose to raise the alarm — no button was pressed and nobody
decided anything — and it may well be the most useful thing this system ends up
doing. A house that would otherwise ring into an empty street, or into a
call-centre contract nobody in the village pays for, instead reaches the
neighbours who can walk round and look.

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
*caducado*, where whoever opens the panel sees it. A device never yet proven is shown
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
- **The village pays:** about €20 a year — the León number, billed annually. That
  is the entire running cost of the system.

Which means the cheapest useful thing the village can do — register the phones
people already own — costs nothing at all and covers the largest group.

## Open items

- **Buy the León number and port the bridge to Zadarma.** The routes and the
  registry are written and tested; what changes is the signature check, the field
  names, the `zd_echo` handshake and the answer. The bar is a call from an Orange
  handset raising a real alert in the village group, and the recording playing
  back — not a documented webhook.
- **Record the message.** One take, Castilian, unhurried, no music. It is the
  first thing a frightened person hears, and it should sound like a neighbour
  rather than a call centre.
- **Build the inbox screen** (§5.1) — registration by ringing the bridge, not by
  typing. The store and the API behind it are done; the panel page is not.
- **The test window** (§6), which is the only thing that makes a green *Correcto*
  mean anything.
- **Verify a real device end to end** before recommending any specific model:
  does voice activation answer an elderly Spanish speaker with a television on,
  does the first stored number really get dialled first, and does the unit accept
  a landline number in its SOS list at all.
- **A branded unit to standardise on.** The €99 kits are white-labelled with no
  manufacturer, no model number, and a barcode the reseller reuses across
  products. Fine to probe with, not something to put in a proposal.
