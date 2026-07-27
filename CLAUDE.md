# Escudo

An open-source, reusable model for **community-organised emergency response** — built by and for small rural communities. Started in Bercianos del Real Camino (León); designed to be adopted and adapted by any village or group.

## What it is (and isn't)

Escudo is the answer to a simple question: **when something goes wrong in a village, how does the community respond in the first crucial minutes — before, or alongside, the authorities?** "Something" is any emergency:

- **Medical** — a fall, a collapse, a stroke. Someone who can't reach a phone.
- **Fire** — a house or field fire the village fights together (this happened 30 min after our research was commissioned).
- **Crime** — muggers targeting elders, fake "technicians" talking their way into homes.
- **Welfare** — an isolated elder no one has heard from; a missing person.

It is **horizontal, not top-down.** Alerting the authorities is a solved problem (112, 062, AlertCops) and doesn't help a rural village much on its own — so that's a *small* part of Escudo, not its spine. The spine is neighbours organised to help neighbours: a network of willing responders, a way to raise the alarm that works for people who can't operate a phone in a crisis, and the protocols/tech/signage that make it repeatable.

**Framing note:** the initial research (`research/`) over-indexed on crime and deterrence — partly a steer in the original prompt. Read it for the excellent legal, technical and worldwide-scheme detail, but treat crime as **one use case among several**, not the purpose. Escudo is community response, full stop.

## Naming

- **`Escudo`** — the brand. Used alone. Tagline: *Comunidades que responden* (en: *Communities that respond*) / *respuesta comunitaria*.
- **`Red Escudo`** — the network of people (responders + the vulnerable they cover). "Montar una Red Escudo" = a community adopting the model.
- The parts nest under the brand: **la Carta Escudo** (charter), **el Protocolo Escudo** (rules of engagement), **las señales / pegatinas Escudo** (signage), **el kit técnico** (the tech layer).
- Never frame Escudo as a "patrulla" or vigilante group — legally exposed and against the philosophy. It's *eyes, ears and hands* — a village that calls the Guardia Civil faster and with better information, never a substitute for them.

## Deliverable: v0.1 website

The near-term output is a **v0.1 website that IS the proposal to the Ayuntamiento / Junta Vecinal** and doubles as the project's living document. It fully details the model so a community — or an official — can understand and adopt it.

**Write English first, then translate to Spanish.** Every page exists in both (`content/en/`, `content/es/`, paired by `translationKey`). English is the source of truth and the site default; Spanish is the version Bercianos actually reads, so a page isn't done until both exist.

Planned sections (a skeleton, not fixed):
1. **Filosofía** — the why: community response, horizontal, dignity of elders, inclusion as half the value.
2. **Cómo funciona** — the model end to end: the Red, roles, how an alert flows to responders.
3. **Ejemplos en el mundo** — what others do (UK Neighbourhood Watch, Dutch WhatsApp Buurtpreventie/SAAR, GoodSAM volunteer responders) and the honest evidence.
4. **Carta** — the charter: principles + membership rules.
5. **Protocolos** — five: introducing the scheme, Telegram onboarding, physical-button onboarding, response (observe & report, 062/112 first, behaviour & vehicles never ethnicity, no images), testing & false alarms.
6. **Implementación técnica** — the alert layer, matched to the person: no-subscription 4G SOS wearables, phone apps, and the DIY LoRaWAN/self-hosted backbone for village-wide coverage.
7. **Recursos** — reusable, open graphics: signs, stickers, printable charter, onboarding sheets.

## Principles baked in (from the research — non-negotiable)

- **Observe and report — never intervene, pursue or detain.** React only from safety.
- **Call 062 (Guardia Civil) / 112 first.** Escudo supplements official channels; it never bypasses them.
- **Behaviour and vehicles, never ethnicity.** Anti-discrimination is both law (LO 4/2015, GDPR) and simply more effective. No exceptions.
- **No sharing of suspect images** in groups or online (Ley Orgánica 1/1982, CP art. 197, GDPR — real AEPD fines).
- **Data protection is a live duty** once you hold phone numbers, health/vulnerability status and location — consent, minimise, secure, retention limits.
- **Legitimacy comes from behaviour, not permission.** Start with the Junta Vecinal and the Ayuntamiento — the village's own institutions. **Do not go to the Guardia Civil puesto to introduce the scheme**: neighbours helping each other isn't a policing activity, so nobody has to authorise it, and asking makes it sound as if somebody does — which in practice gets you told not to. (The research advised the opposite; overruled on the ground in July 2026.) They meet a Red Escudo the ordinary way: by being called, faster and with better information.
- **Inclusion is half the value**, but it is not ours to run. Neighbours keeping an eye on people who live alone cuts loneliness *and* is a safety tripwire — **nobody answering is itself an alert**. Say that; don't write a protocol prescribing how a village does it (removed from the site in July 2026: out of remit).

## Repository layout

- `research/` — commissioned landscape survey (read it; treat crime as one use case).
- `website/` — the v0.1 Hugo site. `static/img/` holds only site-served *copies*; regenerate with `graphics/sync-to-site.py` (never hand-edit, never copy site → graphics). Signage lives at `/img/signage/<lang>/`, mockups at `/img/signage/<lang>/mockups/*.jpg` (downsized from the 2–3 MB masters).
- `graphics/` — **canonical source library for all artwork.** Masters live here; the site copies from here — never the reverse.
  - `export-png.py` — **the one rasteriser for the whole library.** Families `logo` · `signage` · `telegram` · `diagrams`, each with its own size ladder; always writes to `<svg's folder>/png/`. Run bare for everything, or name families (`export-png.py telegram`).
  - `logo/` — the crest, `<colour>-<pos|neg>.svg` (6: bw/green/yellow × positive/inverted). `bw-pos.svg` is the base. `png/` holds rasterised exports.
  - `telegram/` — circular avatars for the two Telegram elements: `group-icon` (shield ringed by linked nodes) and `bot-icon` (SOS on a rojo-alarma button). **Generated** by `telegram/generate.py` — edit the script, not the SVG. Upload `png/<icon>-512.png`.
  - `diagrams/` — explanatory diagrams for the site (`the-button`, `alert-flow`, `roles`, and one `p-*` per protocol), one set per language. **Generated** by `diagrams/generate.py` — edit the script, never the SVG; all copy lives in its `STRINGS` dict. Pages use the PNG (an `<img>`-loaded SVG can't reach the site's webfonts). Keep them ~900px wide and two columns: a wide strip scales down until the body text is unreadable in a reading column.
  - `photos-originals/` — untouched source photographs of the village. Never overwrite; mockups are generated *from* these.
  - `photos-generated/` — illustrative scenes from OpenAI `gpt-image-1`, prompts in `manifest.json`. **Nobody in them is a real person and nowhere is a real place, and every caption must say so.** Prefer a real photograph whenever one exists.
  - `photos-mockups/<lang>/` — **generated**, don't hand-edit. `render.py` sends each scene in `mockups.json` (photo + the live artwork export for a language + a placement prompt) to OpenAI `images/edits`. `python3 render.py` does every scene × `es,en`, skipping what exists; `--force`, `--langs`, `--only`, `--dry-run`. Needs `OPENAI_API_KEY`.
  - `signs-stickers/<lang>/{sticker,plaque,sign}/` — signage drafts (window/bin sticker · property plaque · village-entrance roadsign), one set per language (`es`, `en`).

## Brand

- **Palette** (also in `website/assets/_custom.scss`): verde `#153f32` · ámbar `#e0a12e` · papel `#f7f8f6` · tinta `#22201c` · **rojo alarma `#d24435`**.
  - **Rojo alarma is for the alarm itself** — the SOS button, live-alert states, danger callouts. Never decoration, never a general accent: used loosely it stops reading as *emergency*. Ámbar remains the everyday accent.
- **Type:** Bricolage Grotesque (display) · Public Sans (body).
- **Crest:** quartered shield — figures on top (elder w/ cane · person-in-shield), symbols below (medical cross · flame); double border. Icons are Material Design Icons (Apache-2.0). Built by a Python generator, not by hand — edit the script, don't nudge paths.
- **Signage copy:** eyebrow `ZONA PROTEGIDA`; slogan `PUEBLO ADHERIDO A LA RED ESCUDO` (en: `THIS VILLAGE IS PART OF THE ESCUDO NETWORK`); bullets *Respuesta comunitaria inmediata · Aviso inmediato a las autoridades · Vecindario atento y organizado*; line `062 Guardia Civil · 112 Emergencias`. Imposing but never police/patrol — deterrence = "organised and reports fast".
  - **Keep `adherido` — settled, don't "fix" it.** Strictly, a village doesn't join an external network, it forms its own; possessive alternatives (`este pueblo tiene su Red Escudo`) were tried and rejected by native speakers as weaker. `Adherido` reads stronger and implies a movement worth belonging to. Signage rhetoric beats technical precision here.
  - **`en` is generic international, not a translation of the Spanish.** Same design, same bullets in English; emergency line is `999 · 112` (UK-led, 112 as the European fallback) — never the Spanish numbers.
- **Tooling:** SVG→PNG via `cairosvg` (in a scratch venv, not installed system-wide). Brand fonts are installed system-wide in `~/.local/share/fonts/escudo/` (Bricolage Grotesque + Public Sans statics, OFL) — signage renders in the real faces; display weights (700+) use Bricolage, body copy Public Sans. For print, still export a text-as-paths variant so the printer needs no fonts.
  - **Artwork pipeline, in order:** edit the SVG (or, for the Telegram icons, `telegram/generate.py`) → `export-png.py` → `photos-mockups/render.py` → `sync-to-site.py`. Mockups take artwork from the PNG exports, so a copy change must be re-exported before mockups are re-rendered. gpt-image-1 sometimes garbles the small type on the distant-sign scenes — proofread each render and re-roll (`render.py --force --only <scene> --langs <lang>`) until it reads clean; realism beats pixel-perfect type in these illustrative shots.

## Status

- ☑ Research commissioned and read (`research/`).
- ☑ Named and framed (this brief).
- ☑ Logo/crest designed + 6 variants + PNG exports (`graphics/logo/`).
- ☑ Crest wired into the site: `green-neg` in the sidebar, `green-pos` hero on the homepage.
- ◐ Signage — drafts done in `es` + `en` (`graphics/signs-stickers/`), rendering in the real brand fonts; iterate copy later.
- ☑ Mockups — automated for both languages (`graphics/photos-mockups/render.py`); re-runnable whenever artwork changes.
- ☑ v0.1 website — Hugo + hugo-book, multilingual, written throughout in both languages. Signage pages carry per-language artwork and mockups. See `website/README.md` to run it. **Every change to a page must be mirrored in the other language before it is done** — the two are paired by `translationKey`, and `hugo` will build happily with them out of step.
- ☑ Telegram alert layer **live in Bercianos** (`tech-implementation/bot/`, Deno Deploy). Two urgency tiers: four alarm categories (`fuego` `medico` `delito` `emergencia`) that notify, plus `ayuda` (`urgency: quiet`) which posts silently below the location button — it exists to protect the alarm, because people mute noisy groups. `/test` posts an admin-only drill (no incident logged). Keyboards are pushed to every member automatically at boot when the layout changes (`src/telegram/refresh.ts`), since a reply keyboard otherwise lives on the phone for ever and a retired button label raises nothing.
- ☑ Call bridge **live in Bercianos** — a León number on Zadarma (`src/bridge/zadarma.ts`). A call from a registered number raises the group; an unregistered one lands in the panel inbox. The alarm fires on `NOTIFY_START`, at ring rather than at answer, so hanging up after two rings still raises it. Two traps are written up in `bot/gotchas.md` and cost a morning between them: the signature is base64 of the **hex** HMAC-SHA1 (not the raw digest, whatever the docs imply), and the source-IP allowlist refused every real call on Deno Deploy — it is off by default and should stay off unless verified with an actual call. `deno task test-call` exercises the path without a handset, but cannot prove the two Zadarma-side settings that matter: the number routed to the PBX, and `notify_start` enabled.
- ◐ Screenshots — `bot-teclado.png` is current; `bot-confirmacion`, `grupo-alerta` and `lista-chats` still show the pre-quiet-tier bot and need re-shooting.
