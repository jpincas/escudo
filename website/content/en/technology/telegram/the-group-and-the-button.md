---
translationKey: "tech-telegram"
title: "The group and the button"
weight: 10
---
# The group and the button

Two Telegram elements, two jobs:

<div class="escudo-avatars">
  <figure>
    <img src="/img/telegram/group-icon-512.png" alt="Group icon: an amber shield ringed by linked nodes.">
    <figcaption><b>Red Escudo &lt;Village&gt;</b><span>The group. Alerts arrive, neighbours organise.</span></figcaption>
  </figure>
  <figure>
    <img src="/img/telegram/bot-icon-512.png" alt="Bot icon: SOS on a red button.">
    <figcaption><b>Botón Escudo</b><span>The bot. One tap raises the alarm.</span></figcaption>
  </figure>
</div>

**The bot is the virtual version of a panic button** — not an assistant, and not
a chat you converse with. It lives on the phone, always in the same place, and
pressing it tells the village.

## Why they're separate

Telegram imposes both limits:

- **A group can't hold buttons on screen.** The nearest thing is a pinned
  message: on a phone, a thin bar at the top that you tap, jump from, then press.
- **A group can't ask for a location.** The "share location" button works in
  private chats only; in a group the request fails.

A private chat has neither limit. Buttons stay fixed above the keyboard, and a
location is one tap. **Raise the alert in the bot, respond in the group.**

## What a neighbour sees

Six buttons that never go away, in two tiers:

<div class="escudo-shot-single">
  <img src="/img/screenshots/telegram/bot-teclado.png" alt="The fixed buttons: Fuego, Médico, Delito and Emergencia, then Compartir mi ubicación, then Pedir ayuda on its own row.">
  <span class="caption">Fixed above the keyboard. Open and press.</span>
</div>

The four alarm categories come from the village's configuration — rename them,
drop them, add others. Below the location button sits **🤝 Pedir ayuda**, which
is [a different thing](#the-quiet-tier).

Telegram allows no styling on these buttons at all — no colour, no size, no
weight. Rows, emoji and capitalisation are the whole toolkit, which is why the
quiet one is set below the location button rather than tinted.

One tap sends the alert. The bot confirms in the same chat:

<div class="escudo-shot-single">
  <img src="/img/screenshots/telegram/bot-confirmacion.png" alt="The bot confirms the alert was sent and offers to share a location.">
  <span class="caption">Location is optional, and sits on the same keyboard.</span>
</div>

## What the village sees

Who raised it, when — in the village's own time — and the emergency numbers:

<div class="escudo-shot-single">
  <img src="/img/screenshots/telegram/grupo-alerta.png" alt="A fire alert in the group, with a false-alarm button and the location on a map.">
  <span class="caption">If a location is shared, the map pin threads underneath.</span>
</div>

```
🚨 🔥 FIRE
From: María G. · 16:32

Reply in the group if you can go.
062 Guardia Civil · 112 Emergencias
```

The emergency numbers appear on every alert. Escudo supplements 062 and 112; it
never replaces them.

## The quiet tier

**🤝 Pedir ayuda** reaches the same group and the same people, and makes no
sound anywhere. It's for a door that won't open, a ladder, a lift to town — real
needs that are not emergencies.

```
🤝 Ask for help
From: María G. · 16:32

Not an emergency. Answer when someone can.
```

No 🚨, no shouting, no emergency numbers, and no false-alarm button — there's no
alarm to call off. Technically it's one flag in the config and
`disable_notification` on the send:

```yaml
- { id: ayuda, emoji: "🤝", urgency: quiet }
```

**It exists to protect the loud tier.** People mute groups that make noise, and a
muted group is the biggest failure this system has. Giving ladders and lifts a
silent channel is what lets a village leave the group audible all year.

## The false alarm

Every alert carries a **❌ False alarm** button, pressable by whoever raised it or
by any group admin. The message stays, struck through, with a plain line
underneath: the record survives and nobody is told off. False alarms have to stay
cheap ([Escudo Protocol]({{< relref "/protocols/testing-and-false-alarms" >}})).

## The drill

`/test`, typed by an admin, posts the one message in the system that makes every
phone ring without an emergency:

```
🧪 DRILL — this is not an emergency
Escudo Network test · Bercianos del Real Camino · 16:32

If your phone made a noise, it is set up correctly. Reply in the group
so we know how many of you got it.

Nothing else to do. Don't go anywhere.
```

It's loud on purpose — the only thing a drill tests is whether phones make a
noise — and it says what it is in its first line, so nobody gets in a car. It
**creates no incident**: a drill in the log would spoil the very numbers the
drill exists to produce.

Members raise no tests of their own. A press each would be an alarm each
([the protocol]({{< relref "/protocols/testing-and-false-alarms" >}})).

## Location

📍 sits on the same keyboard as the alert buttons: one more tap, same chat. The
pin appears attached to the alert in the group.

It's optional. In a village of two hundred the name usually tells you the house;
location matters when someone is out in the fields or on a track.

**Telegram never releases a location unless the person shares it.** A bot cannot
fetch it.

## The two of them, together

<div class="escudo-shot-single">
  <img src="/img/screenshots/telegram/lista-chats.png" alt="The Red Escudo Bercianos group and Botón Escudo, side by side in a chat list.">
  <span class="caption">The group and the button in a chat list, at real size.</span>
</div>

## What this layer doesn't solve

- **Silenced phones — the biggest risk by far.** An alert only works if it makes
  a noise in somebody's house. The
  [Red Escudo]({{< relref "/how-it-works/the-red-escudo" >}}) makes notification
  setup part of joining, and proves it twice a year at a
  [drill]({{< relref "/protocols/testing-and-false-alarms" >}}).
- **No internet, no alert.** The fallback is the old phone tree.
- **You need a phone, and to be able to open it.** Everyone else is covered by
  [phones and devices]({{< relref "/technology/devices" >}}) — a pendant, a wall
  unit, or a dumbphone that only has to make one call.

## What gets stored

Name and Telegram id, plus an incident log: category, time, who, location if
shared, whether it was cancelled. Incidents delete themselves after a year, and
anyone can ask to see or remove their data.

**No health or vulnerability flag is stored anywhere.** Recording who is frail
would make this special-category data under GDPR. A roster of names is not a
register of the vulnerable.
