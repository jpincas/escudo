# Escudo — Technical Research Report for Implementation Spec
### Community emergency-alert system for Bercianos del Real Camino (León, ~200 residents, flat terrain, patchy mobile coverage)

## TL;DR — Firm Recommendations
- **Phone layer:** Build a **plain inline-keyboard bot**, not a Mini App. A pinned message (or `/sos`) with four big category buttons → one tap posts to the group; capture location with Telegram's **native "share location" keyboard button** (works on every client, one tap, returns a real map pin). The Mini App's LocationManager is broken on desktop and adds permission friction and dev effort for no elder-facing benefit. Build it in **grammY (TypeScript)** or **aiogram (Python)** — pick grammY if you want one language across bot + any future web UI.
- **Radio layer:** **Single-gateway private LoRaWAN**, not Meshtastic. Meshtastic has no off-the-shelf pressable SOS device an elder can use; LoRaWAN does. One **Dragino LPS8N** indoor gateway (~€129) on a high indoor mount / small outdoor antenna covers a 1–2 km flat village comfortably. Pressable device: **Dragino PB05-L** (wall-mount, built-in speaker that plays an **"ACK sound" when the server confirms receipt** — the single most important elder-reassurance feature found) for fixed homes; **MokoSmart LW004-PB** (~€77) or **Abeeway Smart Badge** (~€79) as wearable pendants with vibration/buzzer + LED.
- **Server:** One small **Hetzner VPS** (CX22, €3.79/month excl. VAT) running **self-hosted ChirpStack** (Docker Compose) + the bot + a webhook receiver + **SQLite** incident log. **Do NOT use The Things Network** for production: no SLA and a fair-use cap of **10 downlinks/day/device including confirmed-uplink ACKs** that would break the ACK feedback elders rely on. Watchdog with systemd + Docker `restart: always` + a **healthchecks.io dead-man's-switch**. **Skip SMS fallback for v1.** GDPR: rely on the **not-for-profit association member exemption** + **vital interests** for incidents, and **avoid Article 9 special-category (health) data entirely** by not storing vulnerability/health flags.

---

## Key Findings
1. **A plain bot beats a Mini App here on every axis that matters** (taps, elder-friendliness, dev effort, reliability). Telegram Mini Apps 2.0 (launched 17 November 2024) did add geolocation via the `LocationManager` field on the `WebApp` class, but it is disabled by default (per-app permission), does not work on Telegram Desktop, and on Android only refreshes when another app triggers a location fix. The native inline-keyboard + "share location" button flow is fewer taps, universally supported, and far less code.
2. **LoRaWAN is the correct radio layer, decisively** — not because it is technically "better" than Meshtastic, but because the project needs an *elder presses one physical button* device, and that product category only exists as commercial LoRaWAN hardware. Meshtastic assumes every participant carries a smartphone-paired node.
3. **Confirmation-to-presser is a solved problem on the right hardware.** The Dragino PB05-L plays a distinct sound when it receives the LoRaWAN downlink ACK from the server, so an elder hears "message received." This depends on **self-hosting ChirpStack** because TTN's fair-use policy caps downlinks at 10/day/device.
4. **Everything can run on one ~€4/month VPS.** The gateway needs internet regardless, and Telegram needs internet regardless, so co-locating ChirpStack in the village on a Pi buys little resilience — an internet outage disables the whole chain either way.
5. **The GDPR footprint can be kept tiny** by not storing any health/vulnerability data and leaning on the association-member and vital-interests bases.

---

## 1. Telegram: Mini App vs Plain Bot UI

### Recommendation: plain inline-keyboard bot (with native location sharing)
**Flow:** A permanently **pinned message** in the group carries four inline buttons — 🔥 Fuego / 🚑 Médico / 🚔 Delito / 🆘 Ayuda. One tap fires a `callback_query`; the bot immediately posts a formatted alert to the group with sender identity + timestamp, then (optionally) sends the presser a one-tap **`KeyboardButton(request_location=True)`** so they can attach a live map pin. Minimum path to a posted alert = **one tap**; alert-with-location = **two taps**.

**Why not the Mini App:**
- **Location is unreliable.** Mini Apps 2.0 added `WebApp.LocationManager` (17 Nov 2024, with `locationManagerUpdated`/`locationRequested` events), but community bug reports confirm it does **not prompt or work on Telegram Desktop** (Win/Mac/Linux) and on Android only updates when another service triggers a location fix. Per Telegram's own note, "Access to location data is disabled by default — you must specifically give location permissions to each individual mini app."
- **More taps & friction.** Launching a Mini App from a group needs a menu/keyboard button tap, a load screen, then the in-app taps and a separate OS-level location permission dialog.
- **More dev effort:** you must build and statically host a web app *and* the bot, versus just the bot.
- **Discoverability & elder-friendliness:** a pinned message with four large labelled buttons is visible and self-explanatory; a Mini App is a hidden extra layer.

**Attaching identity & location to the group post:** The bot reads `from_user` (first name / username / Telegram ID) from the callback and stamps it into the message. For location, either forward the user's shared-location message or call **`sendLocation(chat_id, lat, lon)`** to drop a native map pin, or **`sendVenue`** for a named place. Telegram also supports live location (`inputMediaGeoLive`) if you later want moving pins.

**Pitfalls that bite this design:**
- **Privacy mode is ON by default** — fine here, because the bot only needs to *post* and receive its own commands/callbacks, not read group chatter. Do not disable it; if you did, you'd have to remove/re-add the bot.
- **Bots cannot join groups themselves** — an admin must add the bot; in public groups only admins can add bots.
- **Rate limits (per Telegram's official Bots FAQ):** ~1 message/second per chat, **max 20 messages/minute to a single group**, ~30 messages/second globally for bulk. An alert system posts rarely, so this is a non-issue *except* if you ever loop broadcasts — handle `429 Too Many Requests` by reading the `retry_after` field (e.g. `{"error_code":429,"parameters":{"retry_after":5}}`), waiting that many seconds, then retrying (exponential backoff, never fixed delays).
- The bot does not need to be admin just to post messages.

**Prior art (reusable references, all GitHub):**
- `gcsecsey/ESP8266-Telegram-Panic-Button` — ESP8266 hardware button → Telegram message (good DIY-button reference, but WiFi-based, not the LoRa layer).
- `bkaraceylan/panic` — Arduino/ESP8266 + Telegram panic button.
- `weekian/telegram-sos-help-bot` — Telegram SOS bot prototype.
- `0mar/telegram-alert`, `megatolya/bot-alerts` — minimal Telegram alert-posting patterns.
No existing project matches Escudo's full LoRa→bot architecture, so these are pattern references rather than drop-in bases.

---

## 2. Radio Layer: LoRaWAN vs Meshtastic

### Recommendation: single-gateway private LoRaWAN
For a flat 1–2 km village whose radio users are **elderly non-smartphone residents pressing a physical button**, LoRaWAN wins decisively:
- **Meshtastic** is a decentralised, off-grid, peer-to-peer *messaging* ecosystem where each participant carries a phone-paired node (Heltec V3 ~€18–25, T-Echo, RAK WisBlock). There is **no elder-friendly pressable SOS pendant** in the Meshtastic ecosystem — you would have to design and build one. Its strength (works with no server/internet) is largely wasted here because Telegram delivery needs internet anyway.
- **LoRaWAN** has a mature market of certified, battery-friendly, wall/pendant SOS buttons with press/ACK feedback, and a clean star topology (button → one gateway → server) that suits a single small village. A single gateway is a feature, not a limitation, at this scale.

### Hardware shortlist for the pressable device (EU868, EU distributors)
| Device | Form factor | EU price | Battery | IP rating | Feedback to presser | Fall/man-down |
|---|---|---|---|---|---|---|
| **Dragino PB05-L** ⭐ | Wall-mount 5-button panel | ~€100–115 (UKIoT from £99.99 ex-VAT; exp-tech.de / molukas.com in EU) | 2×AA, ~30,000 presses | IP52 | **Built-in speaker: distinct press sound AND "ACK sound" when server downlink confirms receipt** | No |
| **Milesight WS101 (SOS)** | Portable/wall red button | **€60.57 incl. VAT** (iot-shop.de) | 1650 mAh, up to ~9 yr | IP30 (not waterproof) | LED + buzzer for press, network-join status, low battery | No |
| **MokoSmart LW004-PB** | Pendant/clip | **€77.23 incl. VAT** (iot-shop.de) | Rechargeable USB-C Li-Ion, ~weeks–months | IP65 (sources conflict IP65/66/67) | Vibration motor + LED (blinks/vibrates in alarm mode) | Man-down (3-axis accel) |
| **Abeeway Smart Badge** | ID-card/lanyard pendant | **€79 ex-VAT** (shopiot.eu) / €98.65 incl. VAT (iot-shop.de) | Rechargeable, >1.8 yr standby | IP64 (some rev. IP65) | Buzzer 80–96 dBA + bicolor LEDs + SOS button | Man-down (accel) |

**Complementary (non-wearable) option:** Milesight **VS373** ceiling-mounted mmWave **radar fall-detection** sensor (LoRaWAN EU868, IP65, claimed 99% accuracy) for a bedroom/bathroom of a high-risk resident — available at iot-shop.de (price not displayed at time of research). This is the only *validated* fall-detection option found; the wearables' "fall detection" is accelerometer man-down, not a validated algorithm.

**Star pick — Dragino PB05-L:** it is the only listed device whose speaker explicitly plays a sound **when it receives the server's reply (downlink ACK)**, closing the loop for an elder ("I pressed it, it beeped, then it beeped again — help is coming"). Downside: IP52 (indoor) and wall-mounted, so pair it with a wearable (LW004-PB / Abeeway) for people who move around or garden.

### Feedback to the presser & downlink timing
- LoRaWAN Class A devices open two short receive windows (**RX1 ≈ 1 s, RX2 ≈ 2 s**) *only* after they transmit an uplink. A **confirmed uplink** makes the network return an ACK downlink in that window; the device firmware maps that ACK to its buzzer/LED/vibration.
- **PB05-L**: press sound is immediate; ACK sound fires when the RX-window downlink arrives (sub-2 s in good coverage). This is the cleanest turnkey confirmation.
- **WS101**: LED + buzzer confirm the press and show join/network status and low battery, but no documented "operator-received" haptic beyond network status.
- **LW004-PB / Abeeway**: vibrate/LED on press and remain in alarm mode; an application-server downlink can be used to stop the alarm or drive buzzer/LED as an "acknowledged" cue — but this is application-layer logic you implement, **not** an automatic MAC-ACK→haptic feature out of the box. Confirm firmware specifics with MokoSmart/Actility.
- **Critical dependency:** confirmed-uplink ACKs consume a downlink per press. TTN caps this at **10 downlinks/day/device, explicitly "including the ACKs for confirmed uplinks"** — another reason to **self-host ChirpStack** (see §3).

### Device health monitoring
- Buttons send periodic **status/heartbeat uplinks** (PB05-L default every 20 min) carrying **battery voltage** and join state. Ingest these in ChirpStack and log them.
- Implement a **dead-device watcher**: if a device hasn't reported within N× its interval, or battery drops below a threshold, have the bot post a maintenance alert to a private admin chat. Monitor OTAA join failures the same way.

### Antenna / gateway placement
- Real-world LoRaWAN range: **2–5 km urban, 15 km+ rural line-of-sight**; a single indoor gateway typically covers a multi-floor building and, on flat open terrain, several km. For a ~1–2 km flat village, **one Dragino LPS8N is realistically sufficient.**
- **Height is the dominant factor** ("raising a gateway 10 m can double range"). Mount the gateway/antenna as high as possible — attic, church tower, or a short rooftop mast — with a clear-ish horizon.
- An indoor gateway with its stock antenna in a normal house *may* leave dead spots; the cheap, robust upgrade is to put a small **outdoor omni antenna high up with a short (<1 m) cable run** to the gateway (keep coax short — every metre costs signal). Do a quick walk-test with one button before finalising placement. Do not add RF amplifiers (illegal under EIRP limits).

---

## 3. Server & Hosting

### Minimal robust stack
- **Language/framework:** one service in **Python with aiogram** (async; cleanly co-hosts the ChirpStack HTTP webhook receiver in the same event loop) *or* **grammY (TypeScript)** if you prefer one language end-to-end. Both are actively maintained, well-documented 2026 choices; python-telegram-bot is an equally safe Python alternative. Avoid abandoned libs (e.g. telepot).
- **Incident log:** **SQLite** is entirely adequate for a 200-person village (roster, device→resident mapping, incident records).
- **LoRaWAN network server:** **ChirpStack**, deployed via the official **`chirpstack/chirpstack-docker`** Docker Compose (network server + app server + gateway bridge + Mosquitto + PostgreSQL). Configure the EU868 region and point the gateway's Semtech packet forwarder / Basics Station at it.
- **Data path:** button → gateway → ChirpStack (HTTP integration/webhook) → your webhook receiver → bot posts to group + writes SQLite row.

### VPS vs Raspberry Pi, and where ChirpStack lives
- **Recommendation: a single small VPS** — e.g. **Hetzner Cloud CX22 (2 vCPU, 4 GB RAM, 40 GB NVMe, 20 TB traffic) at €3.79/month excl. VAT** — hosting ChirpStack + bot + webhook + SQLite. Rationale: stable power, backups, static IP, better uptime than a Pi on village mains, and simpler to replicate for other villages. (Note: Hetzner announced a cloud price adjustment effective 15 June 2026; confirm current pricing at purchase.)
- The **gateway stays in the village** and forwards packets over the village internet to the VPS. Locating ChirpStack on a village Pi does **not** add meaningful resilience: if village internet is down, the gateway can't reach the VPS *and* the bot can't reach Telegram — the whole chain is down regardless. So put the brains where power/uptime are best (VPS).
- If village internet is genuinely flaky, spend on the **Dragino LPS8N-4G** variant (cellular backhaul) rather than moving ChirpStack local.

### TTN vs self-hosted ChirpStack
- **Self-host ChirpStack. Do not depend on TTN for production.** TTN's community network has **no SLA** and a Fair Access Policy of **"an average of 30 seconds uplink time on air per 24 hours per device, and at most 10 downlink messages per 24 hours, including the ACKs for confirmed uplinks."** That downlink cap directly throttles the confirmed-uplink ACK feedback that gives elders reassurance. A private ChirpStack has no such application cap (you still obey the regulatory ~1% duty cycle).

### Uptime / watchdog practice
- **Process supervision:** run everything under Docker Compose with **`restart: always`**, or wrap bare processes in **systemd** units with `Restart=always`.
- **External monitoring / dead-man's-switch:** use **healthchecks.io** (free tier: 20 checks, ~5-min setup; also fully open-source and self-hostable via Docker + Postgres). Have the bot/webhook **ping a healthchecks URL on a heartbeat**; if pings stop, healthchecks alerts you (email/Telegram/etc.) — this catches silent death that "alert on failure" misses. For endpoint/HTTP up-checks, **Uptime Kuma** (self-hosted Docker) is the complementary tool.
- **Alert-on-silence pattern:** route a constantly-firing "watchdog" heartbeat to an *off-box* service so that *silence* is the failure signal.

---

## 4. Failure Modes & Redundancy

| Failure | Likelihood | Consequence | Cheapest worthwhile mitigation |
|---|---|---|---|
| **Muted/DND phones** | **High** (daily reality) | Alert posted but not seen/heard | Designate a rotating set of **"responder" members** who keep the group un-muted with a loud/priority notification; brief everyone on notification settings; pin instructions |
| Village internet outage | Medium | Whole chain down (LoRa→server and Telegram both) | LPS8N-**4G** gateway with cellular backhaul; VPS is unaffected |
| Telegram outage | Low | No delivery | Accept for v1 (rare, short); document; responder phone-tree as human fallback |
| Power cut | Medium (rural) | Gateway/router down | Small **UPS/battery** on gateway + router (cheap); buttons are battery-powered and unaffected |
| Gateway death | Low | No LoRa alerts | Keep a **spare pre-configured gateway** on the shelf; health-monitor the gateway's own status |
| Elder presses button, no LoRa coverage | Low–Med | Silent failure | Coverage walk-test at install; ACK-sound devices (PB05-L) tell the elder it *didn't* confirm; add outdoor antenna |
| Server/bot process crash | Low | No delivery | systemd/Docker auto-restart + healthchecks dead-man's-switch |
| Dead button battery | Medium (slow) | Device silently offline | Battery telemetry + dead-device watcher posts maintenance alert |

**SMS fallback — honest recommendation: skip it for v1.** A Twilio integration or a GSM/LTE modem on the server adds real complexity (a paid account or SIM, delivery-status handling, another failure surface) to mitigate mainly the *Telegram outage* case, which is rare. The **bigger, cheaper-to-fix risk is muted phones**, addressed by the responder-roster + notification discipline above. Revisit SMS in v2 if a real Telegram-outage incident occurs. (Note: healthchecks.io itself can send SMS/phone-call alerts via Twilio for *operator* monitoring if you want that later.)

**What comparable volunteer/community alerting projects do:** they lean on **application auto-restart + external dead-man's-switch monitoring** (healthchecks.io / Uptime Kuma) rather than expensive multi-channel redundancy, and treat a human phone-tree as the ultimate backstop.

---

## 5. Data Protection (GDPR / Spanish LOPDGDD)

Escudo is run by a village association, so keep this **proportionate**, not enterprise-grade.

**What is stored:** member roster (name, Telegram ID, device→resident mapping) and an incident log (category, timestamp, location). **Avoid storing any health or vulnerability flags.**

**Lawful bases (minimal compliant shape):**
- **Roster / membership data:** GDPR **Art. 6(1)(f) legitimate interest** *or* consent, combined with the **Art. 9(2)(d) not-for-profit-body exemption**, which lets an association process its members' data for its own purposes **provided the data are not disclosed outside the body without consent**. This fits a neighbours' association well.
- **Incident processing (locations during an emergency):** **Art. 6(1)(d) vital interests** + **Art. 9(2)(c)** for any incidental health-relevant data — but note the AEPD stresses this is **narrowly scoped to genuine emergencies where the person cannot consent**, not routine processing ("the processing to protect a vital interest essential for the life of a natural person should be carried out as quickly as possible and should never be delayed by administrative hurdles"). Use it only for the live incident, not for ongoing profiling.
- **Vulnerability/health flags:** these are **Art. 9 special-category data** (two-layer test: Art. 6 basis *and* an Art. 9(2) condition). **Recommendation: avoid them entirely.** Model the data as neutral device facts — "resident X has a LoRa button mapped to device EUI Y" is not health data. If the association genuinely needs a "high-risk" list, obtain **explicit consent (Art. 9(2)(a))** in writing and store it separately with restricted access. Explicit consent, not legitimate interest, is the realistic Art. 9 basis here.

**Consent wording (roster/opt-in), plain-language template:**
> "I agree to join the Escudo emergency group. My name and Telegram account will be visible to other members of the group. If I raise an alert (by phone or button), my identity, the time, and my location will be shared with the group so neighbours can help. My data is used only for this purpose, kept by [Asociación …], not shared outside the group, and deleted when I leave or on request."

**Retention:** incident logs kept **short — e.g. 12 months, then deleted or anonymised** (data-minimisation/purpose-limitation). Roster data deleted on membership end or request.

**Telegram as processor/controller:** Telegram is an **independent controller** for the message data flowing through its platform (you don't control it); the association is controller for the roster + incident DB it holds. Note in the privacy notice that alerts are transmitted via Telegram, which processes data under its own policy.

**Proportionate paperwork:** a one-page **privacy notice**, a **consent/opt-in form**, and a simple **record of processing activities (RAT)**. No DPO required at this scale; no large-scale Art. 9 processing if you avoid health flags (which also avoids a mandatory DPIA).

---

## 6. Replicability — the "kit"

**What makes it a kit:**
- **Config-over-code:** a single `config.yaml` per village (village name, bot token, group chat ID, ChirpStack API keys, member roster, device→resident map, healthchecks URL). No code changes to deploy a new village.
- **Docker Compose everything:** ChirpStack stack + bot + webhook as one `docker compose up` with `restart: always`. This is the packaging model already proven by `chirpstack/chirpstack-docker`, Uptime Kuma, and self-hosted healthchecks.
- **One-command bootstrap** script + a short install runbook (add bot to group as admin, flash/register buttons via OTAA, walk-test coverage, mount gateway high).

**Honest per-village cost floor (EUR):**
| Item | Cost |
|---|---|
| VPS (Hetzner CX22, ChirpStack + bot) | €3.79/month excl. VAT (~€45–55/yr) |
| Gateway (Dragino LPS8N) | ~€129 |
| Optional outdoor antenna + short coax | ~€30–60 |
| Buttons | WS101 €60.57 / LW004-PB €77 / Abeeway €79 / PB05-L ~€100–115 each |
| Optional village Pi (if local hosting) | Raspberry Pi 5 ~€70–90 |

- **Absolute minimum viable deployment** (gateway + 1 button + first-year VPS): **~€250–300.**
- **Realistic village deployment** (gateway + ~15–20 buttons for non-smartphone elders): **~€1,200–2,000** one-off + ~€55/yr. Smartphone residents cost €0 (they just join the group).

**Packaging/onboarding approaches worth copying:**
- **Meshtastic's browser web-flasher** model — zero-driver, in-browser device flashing — is the gold standard for making hardware onboarding painless; mirror that ease in the button-registration runbook.
- **Uptime Kuma / self-hosted healthchecks.io** — single-container Docker deploys with sane defaults — are the packaging template for the server side.
- **`chirpstack/chirpstack-docker`** — the reference for shipping the whole LoRaWAN backend as one Compose file.

---

## Caveats & Genuinely Uncertain Points
- **PB05-L is wall-mounted and IP52 (indoor).** It's the best for *confirmation feedback* but not wearable/outdoor — the design needs a **mix**: PB05-L in homes + a wearable (LW004-PB/Abeeway) for mobile residents. There is no single device that is both cheap, waterproof, wearable, *and* has turnkey ACK-to-haptic feedback.
- **Wearable "fall detection" is accelerometer man-down, not a validated algorithm.** Only the fixed **Milesight VS373 radar** offers validated fall detection. Verify suitability with vendors before promising fall detection to families.
- **"Network-ACK → device buzzes" is turnkey only on the Dragino PB05-L.** On LW004-PB/Abeeway it requires application-layer downlink logic you must build and test; confirm firmware behaviour with MokoSmart/Actility.
- **iot-shop.de listings for LW004-PB and Abeeway Smart Badge read "Not Available For Sale" at time of research** — prices are catalogued but confirm stock/orderability; shopiot.eu had the Abeeway badge in stock.
- **IP ratings and battery capacities for LW004-PB and the Abeeway badge conflict across manufacturer revisions and resellers** — confirm the exact SKU spec before bulk purchase.
- **Single gateway = single point of failure for the radio layer.** Acceptable for v1 given a shelf spare; a second gateway is the obvious v2 redundancy step if budget allows.
- **Coverage in a specific house is never guaranteed on paper** — a physical walk-test at install is mandatory; budget for the outdoor antenna as the standard fix.
- **Hetzner pricing is subject to a June 2026 adjustment** — verify the current CX22 rate at purchase.