# Escudo — website (v0.1 skeleton)

Static site built with [Hugo](https://gohugo.io/) (Extended) + the
[hugo-book](https://github.com/alex-shpak/hugo-book) theme. Left-sidebar docs
layout; the sidebar nav is generated automatically from the `content/` tree.

**Status:** structural skeleton. Real Spanish section/page titles from the
project brief; every page body is lorem-ipsum placeholder.

## Run locally

```bash
hugo server        # dev server with live reload → http://localhost:1313
hugo --gc --minify # production build → ./public
```

Hugo Extended is installed at `~/.local/bin/hugo`.

## Where things live

| Path | What |
|---|---|
| `content/` | The pages. One folder per section, `_index.md` = section landing, other `.md` = subsections. Order via `weight`; sections collapse via `bookCollapseSection: true`. |
| `hugo.toml` | Config. `BookTheme = 'escudo'` selects the custom brand; `BookSection = '*'` builds the sidebar from the whole tree. |
| `assets/_custom.scss` | The Escudo brand layer — palette, fonts, sidebar styling. The `theme-escudo` mixin holds all colour tokens. |
| `layouts/_partials/docs/brand.html` | Sidebar wordmark (shield mark + "Escudo" + tagline). |
| `layouts/_partials/escudo-mark.html` | The shield-beacon signature SVG. |
| `layouts/_partials/docs/inject/head.html` | Google Fonts + favicon. |
| `static/favicon.svg` | Shield favicon. |
| `themes/book/` | Upstream theme (plain copy, not a submodule). |

## Brand

- **Palette:** Verde Escudo `#153f32` · Ámbar/trigo `#e0a12e` · Papel `#f7f8f6` · Tinta `#22201c` · Piedra `#6b7770`.
- **Type:** Bricolage Grotesque (display/wordmark/headings) · Public Sans (body).
- **Signature:** shield + beacon = protection + a call fanning out to the network.

Fonts currently load from Google Fonts (needs internet). Self-host them before
going fully offline/production.

## To add a page

Create `content/<section>/<slug>.md` with front matter:

```yaml
---
title: "Título de la página"
weight: 40
---

# Título de la página

Contenido…
```

It appears in the sidebar automatically.
