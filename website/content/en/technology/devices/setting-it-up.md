---
translationKey: "tech-devices-setup"
title: "Setting it up in your village"
weight: 30
---
# Setting it up in your village

The runbook for the second alert layer. It assumes
[the Telegram layer]({{< relref "/technology/telegram/setting-it-up" >}}) is
already running, because this one posts into the same group through the same
server.

**One number for the whole village**, not one per household. Every device and
every registered phone stores the same number.

## 1. What you need first

| | Why |
|---|---|
| The Escudo server, deployed and reachable at a fixed `https://` address | The provider has to POST to it, and it must be live *before* you configure the webhook |
| A [Zadarma](https://zadarma.com) account | Or another provider that POSTs inbound calls to a URL. Bercianos uses Zadarma: the cloud PBX is free and incoming calls are free |
| A Spanish tax ID — CIF for an association, NIF for a person | Required to hold a +34 number. Not a provider rule: it's CNMC numbering policy, so every provider asks |
| Proof of an address in the village | Utility bill, tax notice, rent receipt, title deed. A **certificado de empadronamiento** is worth trying if the bill isn't in your name. No PO boxes |

The paperwork is the slow part — expect a document review, not an instant
purchase. Nothing else here takes more than ten minutes.

## 2. Buy the number

A **geographic** number for your own province — Bercianos has a León one. Don't
pay extra for a mobile number hoping to get SMS: no +34 number of any kind can
receive a text from a device like this, because inbound A2P messages in Spain
route over short codes that take months to provision and are priced for
enterprises. Voice is the whole of this layer.

Then **enable the free cloud PBX and route the number to it.** This matters more
than it sounds: the PBX is the part that notifies your server. A number pointed
straight at a SIP line or a call-forward rings perfectly well and tells the
village nothing.

## 3. Point the webhook at your server

Deploy the server first. Saving the URL makes Zadarma call it immediately with a
one-off handshake, and it won't accept a URL that doesn't answer.

| Setting | Value |
|---|---|
| Notification URL | `https://<your-app>/bridge/voice` |
| Notification types | **`notify_start`** — the only one that matters |

Both are in the account's integrations settings, or over the API
(`/v1/pbx/callinfo/url/` and `/v1/pbx/callinfo/notifications/`).

`notify_start` fires at *ring*, which is the entire reason this layer is built on
it. Wait for the answer event instead and you lose every caller who hangs up
after two rings.

## 4. Set the environment variables

```bash
# The Zadarma account secret, from Settings → API. This signs the webhook.
ESCUDO_ZADARMA_API_SECRET="…"

# Optional: an audio file uploaded in the PBX voice menu, played to the caller.
# Its id is a hex string, not a number. Leave it unset and the PBX's own
# greeting runs instead.
ESCUDO_ZADARMA_IVR_PLAY_ID="a6842305f1996e34"
```

**Without the secret the bridge is not mounted at all.** That is deliberate:
there is no unauthenticated mode, because an open bridge is a phone number
anyone who finds it can use to wake the village at three in the morning. The
Telegram layer carries on working either way.

## 5. Put the number in the device

Whatever the family bought, the setup is the same shape:

1. **The Escudo number goes first** in the device's list of stored numbers.
2. **Two or three neighbours after it**, family last. The device rings these in
   order after the Escudo number, and whoever answers talks to the person over
   the hands-free speaker. That call is the acknowledgment.
3. **A prepaid Spanish SIM**, topped up. Note whose it is and when — Spanish
   prepago dies after four to nine months without a recharge, silently.

Most kits are programmed by texting them configuration commands, which are in
the box, usually badly translated. Some have an app. Either is fine.

## 6. Register the household

**Nobody types a phone number into anything.** The device rings the Escudo
number, the call lands in the coordinator's panel as an unregistered number, and
the coordinator gives it a name and an address:

| Field | Example | Why |
|---|---|---|
| **Label** | `Casa de María` | How the alert is headed in the group |
| **Address** | `Calle Real 14, la puerta de atrás` | This is the payload — a wall unit has no GPS, so this is where neighbours run |
| **Kind** | base · pendant · watch · phone | Only for the coordinator, so they know what they're testing. Nothing on the alert path branches on it |

It can't get a digit wrong, because the number came from the device itself.
There is deliberately **no field for why somebody has a device** — recording that
would make this health data, and the whole system is designed to avoid holding
any.

## 7. Prove it works, then keep proving it

Press it once for real, in the house, with the family there. Let them hear a
neighbour's voice answer. That is the moment they learn the thing costs nothing
to use.

After that it's the
[test rota]({{< relref "/protocols/onboarding-physical-buttons" >}}#the-test-rota),
and it is not optional: a shop-bought device sends no heartbeat and no battery
telemetry, so a scheduled test is the *only* evidence it still works. The bot
keeps that rota, marks a household proven on every real alert and every test,
and flags it after sixty days without either.

## What it costs

| | |
|---|---|
| The number | €1.70 / month, billed yearly |
| The cloud PBX, and ten simultaneous lines | free |
| An alarm call, to the village | **nothing** |
| An alarm call, to the caller | free on any contract with bundled landline minutes; a few cents on prepaid, once the message is answered |
| The server | Free tier on Deno Deploy |

About €20 a year for the village, and nothing per alarm. The devices themselves
are [bought by families]({{< relref "choosing-one" >}}).

## Details that cause trouble

**A number that isn't registered raises nothing in the group.** It goes to the
coordinator and into the panel's inbox instead. This is correct — otherwise
anyone who guessed the number could alarm the village — but it means a device
that was fitted and never registered *looks* installed and does nothing. That is
what the inbox exists to surface.

**A silent group is almost always an unregistered number.** Before suspecting the
webhook, check the panel inbox — that is where an unknown caller lands, by
design.

**Repeat calls from the same device are one alert, not several.** A pendant that
dials its list in sequence, or a frightened caller who redials, produces one
incident rather than a burst.

**Ringing the number from your own phone won't raise anything** unless your phone
is registered. Test from the device, or register the coordinator's mobile first.

**Check the number can be dialled from the device's SIM.** Some teleasistencia
SIMs sold with a subscription are locked to a whitelist of numbers.

**Everything above is downstream of two settings you can't test from the server:**
that the number is routed to the PBX, and that `notify_start` is on. A bridge
that passes every other check still stays silent without them.

## The code

MIT licensed:
[github.com/jpincas/escudo](https://github.com/jpincas/escudo), under
`tech-implementation/bot`. The bridge is `src/bridge/zadarma.ts` — about two
hundred lines, with the signature check and the answer; the registered-number
lookup and the one low-battery exception are shared with any other provider in
`src/bridge/inbound.ts`. `DEPLOY.md` records the traps, including the signature
encoding, which is not what the provider's own documentation implies.
