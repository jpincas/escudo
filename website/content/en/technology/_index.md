---
translationKey: "technology"
title: "Technical implementation"
weight: 50
bookCollapseSection: true
---
# Technical implementation

Get an alert from the person who needs help to the neighbours who can give it, in
seconds. No app to install, no dashboard, no accounts, no control room.

**One alert path, three doors.** However an alarm is raised it becomes the same
message, in the same village group, in the same format:

```mermaid
flowchart LR
  ph["☎️ Registered phone<br/><i>speed-dial, no app</i>"]
  dev["🔘 Registered device<br/><i>pendant · base unit</i>"]
  tg["📱 Neighbour<br/>on Telegram"]

  tw["Twilio<br/><i>holds the +34<br/>Escudo number</i>"]
  tgapi["Telegram<br/>Bot API"]

  subgraph srv["The Escudo server — one Deno app"]
    routes["Webhook routes<br/><i>/bridge/voice · /bridge/sms<br/>/&lt;telegram secret&gt;</i>"]
    core["AlertService<br/><i>dedupe · find the house<br/>write the log</i>"]
    web["Admin panel<br/><i>/panel · /api</i>"]
    kv["🗄 Deno KV<br/><i>devices · incidents<br/>members · sessions</i>"]
    routes --> core
    core --> kv
    web --> kv
  end

  group["👥 Red Escudo<br/><i>the village group</i>"]
  nb["🏃 Neighbours<br/>respond"]
  coord["👤 Coordinator"]

  ph -.-> tw
  dev -.-> tw
  tg --> tgapi
  tw <-.->|"webhook in<br/>Reject out"| routes
  tgapi <-->|"updates in<br/>sendMessage out"| routes
  tgapi --> group
  group --> nb
  dev -.->|"also rings 2–3<br/>neighbours direct"| nb
  coord --> web

  classDef done fill:#153f32,stroke:#153f32,color:#f7f8f6
  classDef todo fill:#f7f8f6,stroke:#9aa39b,color:#6b7770,stroke-dasharray:5 4
  classDef out fill:#e0a12e,stroke:#a9701a,color:#22201c
  classDef store fill:#ffffff,stroke:#153f32,color:#22201c
  class tg,tgapi,routes,core,web done
  class ph,dev,tw todo
  class group,nb,coord out
  class kv store
  style srv fill:#f7f8f6,stroke:#153f32,stroke-width:2px
```

Solid lines are built and in use. Dashed lines are written and tested, and go
live the day the village has a phone number of its own.

**The Telegram bot is not the centre of this system.** It is one way in and the
way messages get out — a transport, not a router. The centre is a single small
program, the Escudo server, and everything else plugs into it:

- **Three inbound webhooks, one process.** Telegram POSTs button presses to a
  secret path; Twilio POSTs calls to `/bridge/voice` and texts to `/bridge/sms`.
  The Twilio routes verify a signature on every request and are not mounted at
  all without a key, because an open bridge is a phone number anyone can use to
  wake the village.
- **`AlertService` is where an alarm becomes an alert** — it dedupes repeat
  presses, turns a phone number into a household and an address, writes the
  incident, and hands the finished message to Telegram to post.
- **The voice call is never answered.** The server's reply to Twilio's webhook
  is a rejection, which releases the call before it connects — so no one is
  billed and the caller hears it ring out.
- **The admin panel is part of the same program**, but deliberately not part of
  the alert path: it shares the database and nothing else, and the alert routes
  are matched before it, so a panel page failing cannot delay an alarm.
- **A device's other calls skip all of this.** After texting the Escudo number
  it rings two or three neighbours directly, over the ordinary phone network.
  That call is the acknowledgment, and it works even if this server is down.

The doors exist because they serve different people:

| Door | Who it's for | What it costs |
|---|---|---|
| **Telegram** | Anyone with a smartphone who uses it | Nothing |
| **A registered phone** | Has a phone, isn't on Telegram — a dumbphone, or a smartphone used only for calls | Nothing |
| **A registered device** | Can't work a phone in a crisis, or is unconscious | The family buys it |

Nothing downstream branches on which door an alarm came through. A call or a text
from a registered number becomes an ordinary alert, with the same dedupe, the
same false-alarm button, the same log.

## Where it stands

**[The Telegram layer]({{< relref "/technology/telegram" >}}) is built and in
use.** One button, the whole village knows. It costs nothing to run, works on any
phone, and a community adopts it by editing one configuration file.

**[The device layer]({{< relref "/technology/devices" >}}) is written and
tested, and waiting on a phone number.** It covers everyone a smartphone
doesn't: the neighbour who has a phone but not Telegram, and the person who
can't work a phone while lying on the kitchen floor. Escudo doesn't sell or
choose hardware — it publishes one requirement, *it must be able to call or send
an SMS to a stored number*, and anything meeting it can join. The registry, the
alert path and the admin panel are all built; what remains is buying the number,
which in Spain takes a tax ID and a village address rather than money.


## Rollout

1. **Telegram only, no hardware.** Cost: nothing. *Done.*
2. **Register the phones people already own.** No purchase, no fitting, and it
   reaches the largest group in the village. This is the cheapest useful thing
   the village can do.
3. **Devices, one household at a time**, as and when a family decides one is
   worth it — [chosen with the person]({{< relref "/protocols/onboarding-physical-buttons" >}}),
   never handed out from a list.

Running through all three is the
[test rota]({{< relref "/protocols/onboarding-physical-buttons" >}}#the-test-rota).
A shop-bought device reports nothing about itself: it sits in a drawer, the SIM
expires, the battery dies, and the village finds out on the day it matters. A
scheduled test is the only proof a device still works, so the bot keeps that rota
rather than trusting anyone to remember.

The hard problems aren't technical: phones on silent at three in the morning,
false alarms that feel embarrassing, people waiting rather than being a nuisance.
Better hardware fixes none of them.
