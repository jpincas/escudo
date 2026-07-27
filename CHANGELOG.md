# Changelog

All notable changes to the Escudo model — prose, protocols, artwork and
software together. Format follows [Keep a Changelog](https://keepachangelog.com/);
versioning is explained in [VERSIONING.md](VERSIONING.md).

## [Unreleased]

### Added

- **The call bridge is live in Bercianos.** The village has a León number on
  Zadarma; ringing it raises the group. The alarm goes out at ring rather than
  at answer, so a caller who hangs up after two rings has still raised it, and
  the call is then answered with a message so they know it worked.
- `deno task test-call`, which sends what Zadarma sends — signature and all —
  so the bridge can be exercised without a handset.

### Fixed

- **The webhook signature was computed the wrong way and would have refused
  every genuine call.** Zadarma signs the hex of the HMAC-SHA1, not the raw
  digest; their documentation implies otherwise. The test reimplemented the
  same misreading, so it agreed with the bug — there is now a golden vector
  computed outside the codebase.
- **The source-IP allowlist refused every genuine call** on Deno Deploy, where
  the forwarded address is not one of Zadarma's, and did so invisibly: the
  phone rang, the greeting played, and nobody was told. It is off by default.
- With no recording configured the bridge hung the call up, cutting off the
  greeting that is the caller's only confirmation. It now lets the PBX answer.

### Changed

- The website, `tech-spec.md` and the bot's runbook documented Twilio and a
  bridge that was never answered. All rewritten for what is actually running,
  in both languages — including that no Spanish number can receive an SMS, so
  the device layer is voice-only and the location pin is not available.

## [0.1.0] — 2026-07-22

First public release: the model as proposed to Bercianos del Real Camino.

- The website — philosophy, how it works, worldwide examples and evidence,
  the five protocols, technical implementation, downloadable resources.
  Complete in both languages, English and Spanish, and published at
  [escudo.red](https://escudo.red).
- The Telegram alert layer, live in Bercianos: four alarm categories, the
  quiet *pedir ayuda* tier, location sharing, dedupe, drills, GDPR retention.
- The device bridge (Twilio) for pendants, wall units and ordinary phones,
  and the admin panel — built, awaiting a phone number.
- The graphics library: crest, signage in ES and EN, Telegram icons,
  diagrams, all script-generated.
- The commissioned research: worldwide schemes, honest evidence, Spanish
  legal ground.
- Licensing: content and artwork CC BY-SA 4.0, `tech-implementation/` MIT.
