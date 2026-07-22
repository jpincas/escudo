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
| The Escudo server, deployed and reachable at a fixed `https://` address | Twilio has to POST to it, and it must be the *same* address every time |
| A Twilio account | Or another provider that POSTs inbound calls and texts to a URL |
| A Spanish tax ID — CIF for an association, NIF for a person | Required to hold a +34 number. Not a Twilio rule: it's CNMC numbering policy, so every provider asks |
| Proof of an address in the village | Utility bill, tax notice, rent receipt, title deed. A **certificado de empadronamiento** is worth trying if the bill isn't in your name. No PO boxes |

The paperwork is the slow part — expect a document review, not an instant
purchase. Nothing else here takes more than ten minutes.

## 2. Buy the number

A **mobile** number, not a geographic one. Geographic numbers in Spain often
can't receive SMS at all, and the device layer needs both channels.

Check before buying that the number is enabled for **Voice *and* SMS**. A
voice-only number still works — a missed call is the primary trigger — but you
lose the position pin and the low-battery warning.

## 3. Point the two webhooks at your server

In the Twilio console, on the number itself:

| Setting | Value | Method |
|---|---|---|
| **A call comes in** | `https://<your-app>/bridge/voice` | HTTP POST |
| **A message comes in** | `https://<your-app>/bridge/sms` | HTTP POST |

## 4. Set two environment variables

```bash
# What Twilio signs its webhooks with. Found in the Twilio console.
ESCUDO_TWILIO_AUTH_TOKEN="…"

# Where this server is reachable, exactly as typed into Twilio above.
ESCUDO_PUBLIC_URL="https://<your-app>"
```

**Without the auth token the two routes are not mounted at all.** That is
deliberate: there is no unauthenticated mode, because an open bridge is a phone
number anyone who finds it can use to wake the village at three in the morning.
The Telegram layer carries on working either way.

**The URLs must match character for character.** Twilio computes its signature
over the URL as configured, so a trailing slash, or a `www.` on one side and not
the other, makes every genuine call fail the check and raise nothing. This is
the single most common way to end up with a bridge that looks configured and
does nothing.

## 5. Put the number in the device

Whatever the family bought, the setup is the same shape:

1. **The Escudo number goes first** in the device's list of stored numbers.
2. **Two or three neighbours after it**, family last. The device rings these in
   order after texting Escudo, and whoever answers talks to the person over the
   hands-free speaker. That call is the acknowledgment.
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
| The number | ~$1.15 / month |
| An inbound SMS | ~$0.0075 |
| An alarm call | **nothing** — it is rejected before it connects |
| The server | Free tier on Deno Deploy |

About a euro a month for the village, and nothing per alarm. The devices
themselves are [bought by families]({{< relref "choosing-one" >}}).

## Details that cause trouble

**A number that isn't registered raises nothing in the group.** It goes to the
coordinator and into the panel's inbox instead. This is correct — otherwise
anyone who guessed the number could alarm the village — but it means a device
that was fitted and never registered *looks* installed and does nothing. That is
what the inbox exists to surface.

**A low-battery text does not wake the village.** Several devices send one, and
under the ordinary rule that would be a siren at 3am. Those go to the
coordinator. Anything the server doesn't recognise still raises the alarm.

**A call and a text from the same device are one alert, not two.** They arrive a
second or two apart; the server folds the second into the first, and uses the
text only to add a map pin.

**Ringing the number from your own phone won't do anything** unless your phone is
registered. Test from the device, not from the coordinator's mobile.

**Check the number can be dialled from the device's SIM.** Some teleasistencia
SIMs sold with a subscription are locked to a whitelist of numbers.

## The code

MIT licensed:
[github.com/jpincas/escudo](https://github.com/jpincas/escudo), under
`tech-implementation/bot`. The bridge is `src/bridge/twilio.ts` — about two
hundred lines, with the signature check, the registered-number lookup and the
one low-battery exception all in one file.
