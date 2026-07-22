---
translationKey: "prot-testing"
title: "Testing and false alarms"
weight: 50
---
# Testing and false alarms

An untested alert system is a rumour. The failure is always the same one — a
phone that didn't make a noise — and you only find it by looking.

<figure class="escudo-diagram">
  <img src="/img/diagrams/en/p-drill-1200.png" alt="Four steps: announce it, the Coordinator runs /test, count, fix.">
</figure>

## The drill, twice a year

1. **Announce it.** Say beforehand that there'll be a drill this month. Don't
   say which day.
2. **The Coordinator types `/test`.** Admins only — it's the one command in the
   system that makes every phone in the village ring for no emergency. The
   message says what it is in its first line, so nobody gets in a car.
3. **Count two things.** How many phones made a noise. How many minutes until
   the first reply.
4. **Fix the phones that stayed silent.** That's the entire job.

Those two numbers are the health of the Red Escudo. If the second one is getting
worse, don't reorganise anything — check notifications.

**Twice a year is a ceiling, not a target.** Test alerts are the only alarms the
village ever hears that aren't real, and every one of them costs a little of the
reflex that makes the system work. Nobody else raises one, ever — day-to-day
checks are done with an ordinary message in the group, which tests the same
notification and disturbs nobody
([how]({{< relref "onboarding-telegram" >}})).

Review the member list on the same day. People move, change phones, and die.

## False alarms

**A false alarm is a good sign.** It means somebody pressed the button when they
weren't sure, which is exactly the behaviour the whole system depends on.
Hesitation is what kills people.

So:

- Every alert has a **False alarm** button, pressable by whoever raised it or by
  any admin. The alert is struck through and everyone stands down.
- **Nobody is asked to explain**, ever. Not in the group, not in the bar.
- The record stays, without comment.
- A **pocket-dial** is just a false alarm. Press the button, move on.

The one thing that isn't a false alarm is pressing it as a joke. That's a
conversation the [Coordinator]({{< relref "/how-it-works/the-red-escudo" >}}) has
once, quietly.
