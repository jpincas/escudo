---
translationKey: "how-alert"
title: "How an alert flows"
weight: 20
---
# How an alert flows

From the moment something goes wrong to the moment it's closed off. The design
goal is one number: **how long until the first neighbour is at the door.**

<figure class="escudo-diagram">
  <img src="/img/diagrams/en/alert-flow-1200.png" alt="The six steps: raise it, it arrives, answer, go, stand down, close it off.">
</figure>

## 1. Raise it

Whoever notices presses the button — the person in trouble, a neighbour, a
passer-by, a family member on the phone from Madrid. It asks one question, *what
kind*, and offers four answers:
[fire, medical, crime, emergency]({{< relref "types-of-emergency" >}}). A
[registered device]({{< relref "/technology/devices" >}}) skips even that: one
press, alert sent.

**If it needs the authorities, call 062 or 112 first**, then press. If you're
alone with someone on the floor, press first and call while you wait; the press
takes a second. Whoever called says so in the group, so five people don't ring
the same operator.

Sharing a location is one more tap, and optional. In a village of two hundred the
name usually tells everyone the house. It matters out in the fields.

## 2. It arrives

Every member's phone, at once, with the category, the name, the time and the
emergency numbers. No dispatcher, no duty officer, no queue —
[on purpose]({{< relref "/philosophy/horizontal-not-top-down" >}}).

## 3. Answer

**Say in the group whether you're going.** One word does it.

This is the step people skip, and it's the one that makes the difference. It
tells the person in trouble that help is coming, and it stops the two failure
modes of a leaderless network: everybody assuming somebody else went, and eleven
people arriving in the same kitchen.

If nobody has answered within a couple of minutes, ring the nearest member
directly. Their phone is on silent.

## 4. Go

<figure class="escudo-fig">
  <img src="/img/scenes/first-neighbour.jpg" alt="A man stands in an empty village street at dusk with a torch, a lit porch and an open door behind him.">
  <figcaption>Standing at the road to wave the ambulance in is not a small
    contribution: on an unlit village lane, finding the right house costs
    minutes.
    <span class="credit">Illustration, generated. Not a real person or place.</span>
  </figcaption>
</figure>

The first neighbour there does the ordinary useful things: opens the door, puts
the light on, waits at the road to wave the ambulance in, moves the car, keeps
the person warm and talking.

**And nothing else.** Observe, report, help. Never intervene, pursue or detain —
[the Protocol]({{< relref "/protocols/response" >}}), and the reason
this is legal in Spain.

Say what's actually happening in the group as you find out, so the ones still on
their way know what they're walking into. Describe
[behaviour and vehicles, never people's origins]({{< relref "/protocols/response" >}}),
and don't post photographs of anyone.

## 5. Stand down

The alert has a **False alarm** button. Press it. The alert is struck through and
everyone knows to stand down.

Nobody is questioned about it, ever. A network where pressing the button is
embarrassing is a network people don't press —
[why false alarms are cheap]({{< relref "/protocols/testing-and-false-alarms" >}}).

## 6. Close it off

The [Coordinator]({{< relref "the-red-escudo" >}}#the-coordinator--one-person)
posts one line: what it was, who went, what happened. Not a report
— a full stop, so the group isn't left wondering at midnight.

Once a year, look at the log: how many alerts, of what kind, how fast, how many
false. Three numbers is the entire evaluation.

## When it doesn't work

- **A phone on silent.** By far the most common failure. Setup at sign-up,
  tested at drills.
- **No internet.** The fallback is the old phone tree, written down and stuck on
  the fridge. Have one.
- **The person can't reach a phone at all.** That's what
  [registered devices]({{< relref "/technology/devices" >}}) are for — a pendant
  round the neck, a unit on the wall, no screen to operate. Some raise the alarm
  with nobody pressing anything: fall detection does it by itself.
