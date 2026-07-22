# Versioning

One version number covers the whole model — philosophy, protocols, artwork,
website and software. A village that adopted "Escudo v1.2" adopted a known
quantity; the number tells them, and us, how much has changed since.

Releases are git tags `vMAJOR.MINOR.PATCH` with notes in
[CHANGELOG.md](CHANGELOG.md), following [SemVer](https://semver.org/) adapted
to a model that is mostly prose:

- **MAJOR** — a change an adopted village must *act on* to stay current:
  a protocol changes, a non-negotiable rule is added or reworded, the bot's
  config or env contract breaks, signage copy changes in a way that obsoletes
  printed material.
- **MINOR** — new capability or content, nothing existing invalidated:
  a new protocol, a new language, a new device or alert path, a new section
  of the site, new artwork.
- **PATCH** — fixes and polish: copy edits, translation corrections, bug
  fixes, graphics regenerated. No village needs to do anything.

The question to ask of any change: *what does a village that adopted the
previous version have to do about it?* Nothing → PATCH. Nothing, but they
might want the new thing → MINOR. Something → MAJOR.

Pre-1.0, the site and this repo are the live proposal to Bercianos; MINOR
bumps may still move things around. v1.0.0 is the model as first formally
adopted by a village.
