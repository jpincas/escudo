---
translationKey: "tech-devices-section"
title: "Phones and devices"
weight: 20
bookCollapseSection: true
---
# Phones and devices

The second alert layer, for everyone a smartphone app doesn't reach. **One press,
or one missed call, and the whole village knows** — the same alert, in the same
group, as a tap in Telegram.

## Why a phone number

Telegram covers the people who already use it. A phone number covers everyone
else, because a phone number is the one interface that every phone and every
alarm device in Spain already speaks. Nothing to install, nothing to log into,
nothing new to learn at four in the morning.

That gives us, for free:

- **A door for people who aren't on Telegram** — a dumbphone, or a smartphone
  used only for calls. They cost nothing to add and there are more of them than
  anything else.
- **A door for people who can't work a phone at all** — a pendant, a watch, a
  unit on the kitchen wall. No screen, one button.
- **Alarms nobody has to raise.** Fall detection fires with nobody pressing
  anything, which is the case this whole layer exists for.
- **No lock-in to any manufacturer.** Escudo publishes a requirement, not a
  product.

## The interface, not the device

Escudo doesn't choose or supply hardware. Families buy their own. That means no
village purchase, no committee deciding who is frail, and
[no list of the vulnerable]({{< relref "/philosophy/dignity-and-inclusion" >}}) —
which this project refuses to keep anyway.

What Escudo publishes instead is one requirement, and anything that meets it can
join:

> **It must be able to call a stored number.**

That's the whole specification. Every domestic alarm product sold in Spain meets
it, in every shape, and so does a fifteen-year-old Nokia.

## Three doors

| Door | Who it's for | What it costs |
|---|---|---|
| **Telegram** | Anyone with a smartphone who uses it | Nothing |
| **A registered phone** | Has a phone, isn't on Telegram — a dumbphone, or a smartphone used only for calls | Nothing |
| **A registered device** | Can't work a phone in a crisis, or is unconscious | The family buys it |

The middle door is the one that changes the arithmetic. In a village like ours a
lot of people own a phone and don't use Telegram on it, and until now every one
of them was invisible to Escudo. Registering the phone somebody already carries
costs nothing — no purchase, no fitting, no visit from a technician — so this is
the cheapest useful thing the village can do, and probably the one that reaches
the most people.

Nothing downstream branches on which door an alarm came through. A call or a text
from a registered number becomes an ordinary alert, with the same dedupe, the
same false-alarm button, the same log.

## In this section

- **[Choosing one, with the person]({{< relref "/technology/devices/choosing-one" >}})**
  — what qualifies, what the shapes are good for, and why nobody is handed one.
- **[The Escudo number]({{< relref "/technology/devices/the-escudo-number" >}})**
  — how an alarm actually travels, hop by hop, and what this layer doesn't solve.
- **[Setting it up in your village]({{< relref "/technology/devices/setting-it-up" >}})**
  — the runbook: the number, the two webhooks, the device, the registration.

Getting a household onto it is also a
[protocol of its own]({{< relref "/protocols/onboarding-physical-buttons" >}}).
