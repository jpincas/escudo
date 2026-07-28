// The public welcome page — server-rendered HTML at the deployment's root.
//
// Spec 2026-07-27 §4. Unlike the panel (a gated SPA, desktop-only), this is
// the one surface a villager opens on their own phone with no session and no
// gate — mobile-first, indexable, and it must degrade to something sane even
// with an empty or unreadable profile. It reads the village's public profile
// (§3) but is not the profile's editor: nothing here writes to the store.

import { Hono } from "hono";
import type { Config } from "../config.ts";
import { emptyVillageProfile, type Store, type VillageProfile } from "../store/types.ts";
import { strings, t } from "../i18n/mod.ts";
import { formatPhoneReadable } from "../msisdn.ts";

/** Shared with src/web/login.ts, which reuses this page's mobile-first,
 *  inline-<style> idiom rather than the panel SPA's desktop-only CSS. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Copied from graphics/logo/green-pos.svg (the canonical source library —
// never hand-edit a copy, re-copy here if the crest changes). green-pos is
// the verde-on-paper disposition, matching this page's light background —
// the same choice CLAUDE.md records for the Hugo site's homepage hero.
// Inlined rather than served as a static asset: it avoids a second request
// and an asset route entirely for one small, never-changing image.
export const CREST_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="2 -2 196 238" width="72" height="88" role="img" aria-label="Escudo">
  <defs><clipPath id="s"><path d="M32 16 L168 16 Q180 16 180 28 L180 122 Q180 178 100 218 Q20 178 20 122 L20 28 Q20 16 32 16 Z"/></clipPath></defs>
  <path d="M32 16 L168 16 Q180 16 180 28 L180 122 Q180 178 100 218 Q20 178 20 122 L20 28 Q20 16 32 16 Z" fill="#153f32" stroke="#153f32" stroke-width="26" stroke-linejoin="round"/>
  <path d="M32 16 L168 16 Q180 16 180 28 L180 122 Q180 178 100 218 Q20 178 20 122 L20 28 Q20 16 32 16 Z" fill="none" stroke="#f7f8f6" stroke-width="12" stroke-linejoin="round"/>
  <path d="M32 16 L168 16 Q180 16 180 28 L180 122 Q180 178 100 218 Q20 178 20 122 L20 28 Q20 16 32 16 Z" fill="#153f32"/>
  <g clip-path="url(#s)" stroke="#f7f8f6" stroke-width="3">
    <line x1="100" y1="16" x2="100" y2="218"/>
    <line x1="20" y1="112" x2="180" y2="112"/>
  </g>
  <g fill="#f7f8f6"><g transform="translate(33.550 36.400) scale(2.30000)"><path d="M18 12.24V22H17.06V12.24C17.06 12.09 17 12 16.93 11.89C16.84 11.8 16.74 11.76 16.62 11.76C16.47 11.76 16.36 11.8 16.27 11.89C16.18 12 16.14 12.1 16.14 12.24V13.16H15.23V12.5C14.53 12.33 13.9 12.04 13.35 11.63C12.8 11.22 12.34 10.74 11.96 10.19L11.61 11.39C11.5 11.81 11.5 12.24 11.5 12.68L11.5 13L11.5 13.33L13.35 15.94V22H11.5V17.34L9.82 15L9.65 18.25L6.86 22L5.38 20.87L7.77 17.64V12.68C7.77 12.15 7.82 11.63 7.91 11.11L8.25 9.54L6.86 10.32V13.63H5V9.23L10 6.4C10.29 6.26 10.59 6.18 10.91 6.18C11.23 6.18 11.54 6.27 11.83 6.44C12.15 6.62 12.39 6.88 12.57 7.23L13.31 8.8C13.6 9.38 14.04 9.87 14.64 10.26C15.23 10.65 15.89 10.85 16.62 10.85C17 10.85 17.32 11 17.6 11.24C17.88 11.5 18 11.83 18 12.24M12 2C13.11 2 14 2.9 14 4C14 5.11 13.11 6 12 6C10.9 6 10 5.11 10 4C10 2.9 10.9 2 12 2Z"/></g><g transform="translate(114.909 38.909) scale(2.09091)"><path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,5A3,3 0 0,1 15,8A3,3 0 0,1 12,11A3,3 0 0,1 9,8A3,3 0 0,1 12,5M17.13,17C15.92,18.85 14.11,20.24 12,20.92C9.89,20.24 8.08,18.85 6.87,17C6.53,16.5 6.24,16 6,15.47C6,13.82 8.71,12.79 12,12.79C15.29,12.79 18,13.82 18,15.47C17.76,16 17.47,16.5 17.13,17Z"/></g><g transform="translate(35.550 122.650) scale(2.56250)"><path d="M20 14H14V20H10V14H4V10H10V4H14V10H20V14Z"/></g><g transform="translate(106.389 126.066) scale(2.27790)"><path d="M17.66 11.2C17.43 10.9 17.15 10.64 16.89 10.38C16.22 9.78 15.46 9.35 14.82 8.72C13.33 7.26 13 4.85 13.95 3C13 3.23 12.17 3.75 11.46 4.32C8.87 6.4 7.85 10.07 9.07 13.22C9.11 13.32 9.15 13.42 9.15 13.55C9.15 13.77 9 13.97 8.8 14.05C8.57 14.15 8.33 14.09 8.14 13.93C8.08 13.88 8.04 13.83 8 13.76C6.87 12.33 6.69 10.28 7.45 8.64C5.78 10 4.87 12.3 5 14.47C5.06 14.97 5.12 15.47 5.29 15.97C5.43 16.57 5.7 17.17 6 17.7C7.08 19.43 8.95 20.67 10.96 20.92C13.1 21.19 15.39 20.8 17.03 19.32C18.86 17.66 19.5 15 18.56 12.72L18.43 12.46C18.22 12 17.66 11.2 17.66 11.2M14.5 17.5C14.22 17.74 13.76 18 13.4 18.1C12.28 18.5 11.16 17.94 10.5 17.28C11.69 17 12.4 16.12 12.61 15.23C12.78 14.43 12.46 13.77 12.33 13C12.21 12.26 12.23 11.63 12.5 10.94C12.69 11.32 12.89 11.7 13.13 12C13.9 13 15.11 13.44 15.37 14.8C15.41 14.94 15.43 15.08 15.43 15.23C15.46 16.05 15.1 16.95 14.5 17.5H14.5Z"/></g></g>
</svg>`;

/**
 * The brand palette and faces as CSS custom properties, shared verbatim with
 * src/web/login.ts so the two server-rendered public pages can't drift apart
 * on rebrand. Nothing else here is shared: the two pages' actual layouts
 * differ enough (a page of content vs. a single form) that duplicating the
 * rest is simpler than a shared component system for two files.
 */
export const BRAND_ROOT_STYLE = `
  :root {
    --verde: #153f32;
    --ambar: #e0a12e;
    --papel: #f7f8f6;
    --tinta: #22201c;
    --rojo-alarma: #d24435;
    --border: #d8d6d0;
    --font: "Public Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica,
      Arial, sans-serif;
    --font-display: "Bricolage Grotesque", var(--font);
  }
`;

const STYLE = `
  ${BRAND_ROOT_STYLE}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: var(--font);
    background: var(--papel);
    color: var(--tinta);
    line-height: 1.5;
  }
  .topbar {
    display: flex;
    justify-content: flex-end;
    padding: 12px 16px;
  }
  .topbar a {
    color: var(--verde);
    font-weight: 600;
    font-size: 14px;
    text-decoration: none;
  }
  .topbar a:hover { text-decoration: underline; }
  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 0 20px 48px;
    text-align: center;
  }
  .crest { margin: 4px 0 12px; }
  h1 {
    font-family: var(--font-display);
    font-weight: 700;
    color: var(--verde);
    font-size: 24px;
    margin: 0 0 4px;
  }
  .tagline {
    color: #55534c;
    margin: 0 0 20px;
    font-size: 14px;
  }
  .intro {
    text-align: left;
    margin: 0 0 24px;
  }
  .photo {
    width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 0 0 24px;
  }
  section {
    text-align: left;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px 18px;
    margin: 0 0 16px;
    background: #fff;
  }
  section h2 {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 15px;
    color: var(--verde);
    margin: 0 0 8px;
  }
  .escudo-number {
    text-align: center;
    border-color: var(--rojo-alarma);
  }
  .escudo-number__label {
    font-weight: 600;
    color: var(--rojo-alarma);
    margin: 0 0 8px;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .escudo-number__link {
    display: inline-block;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 26px;
    color: #fff;
    background: var(--rojo-alarma);
    border-radius: 8px;
    padding: 12px 24px;
    text-decoration: none;
  }
  .emergency-line p { margin: 0 0 6px; }
  .emergency-line__numbers {
    font-weight: 700;
    font-size: 17px;
  }
  .people ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .people li {
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
  }
  .people li:last-child { border-bottom: none; }
  .people__role {
    color: #55534c;
    font-size: 13px;
  }
`;

/** Renders the welcome page for a given profile. Pure — takes no store, no request. */
export function renderWelcomePage(config: Config, profile: VillageProfile): string {
  const s = strings(config.village.locale);
  const villageName = escapeHtml(config.village.name);

  const introHtml = profile.introText
    ? `<p class="intro">${escapeHtml(profile.introText)}</p>`
    : "";

  // Removed entirely on error, not hidden: A10 forbids the server checking the
  // URL, and §3's stored test record deliberately points at one that doesn't
  // resolve, so this is exercised on every real deployment sooner or later.
  //
  // This relies on an inline event handler running, same as the inline
  // <style> block above relies on inline styles being allowed. Fine today —
  // there is no Content-Security-Policy on this page — but if one is ever
  // added without `unsafe-inline` for scripts (or styles), this degrades to
  // exactly the dead image frame spec 4.2 forbids, silently. Whoever adds a
  // CSP here needs to know that in advance, not from a villager.
  //
  // Same failure with JavaScript disabled in the visitor's own browser: with
  // no script execution at all, `onerror` never fires and a broken photo URL
  // shows as the browser's ordinary dead-image icon. Nothing on this page
  // otherwise depends on JavaScript, so this is the one place a no-JS visitor
  // sees something spec 4.2 forbids — accepted for now, same as the CSP gap
  // above, because A10 rules out the only server-side alternative (fetching
  // the URL to check it).
  const photoHtml = profile.photoUrl
    ? `<img class="photo" src="${escapeHtml(profile.photoUrl)}" alt="${
      escapeHtml(s.welcome.photoAlt)
    }" onerror="this.remove()">`
    : "";

  const escudoNumberHtml = profile.escudoPhone
    ? `<section class="escudo-number">
        <p class="escudo-number__label">${escapeHtml(s.welcome.escudoNumberLabel)}</p>
        <a class="escudo-number__link" href="tel:${escapeHtml(profile.escudoPhone)}">${
      escapeHtml(formatPhoneReadable(profile.escudoPhone))
    }</a>
      </section>`
    : "";

  const peopleHtml = profile.responsiblePeople.length
    ? `<section class="people">
        <h2>${escapeHtml(s.welcome.responsiblePeopleHeading)}</h2>
        <ul>
          ${
      profile.responsiblePeople.map((p) =>
        `<li>${escapeHtml(p.name)} <span class="people__role">— ${escapeHtml(p.role)}</span></li>`
      ).join("\n          ")
    }
        </ul>
      </section>`
    : "";

  return `<!doctype html>
<html lang="${config.village.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t(s.welcome.heading, { village: villageName })}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="topbar">
  <a href="/panel">${escapeHtml(s.welcome.adminLogin)}</a>
</div>
<main>
  <div class="crest">${CREST_SVG}</div>
  <h1>${t(s.welcome.heading, { village: villageName })}</h1>
  <p class="tagline">${escapeHtml(s.welcome.tagline)}</p>
  ${introHtml}
  ${photoHtml}
  ${escudoNumberHtml}
  <section class="emergency-line">
    <h2>${escapeHtml(s.welcome.emergencyLineIntro)}</h2>
    <p class="emergency-line__numbers">${escapeHtml(config.alerts.emergencyLine)}</p>
  </section>
  ${peopleHtml}
</main>
</body>
</html>`;
}

/** Mounted at the deployment's root (main.ts). Public: no session, no cookie, no gate. */
export function createWelcomeApi(config: Config, store: Store): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    // A KV read failure must render the static fallback, not error (spec 4.2).
    // emptyVillageProfile() is exactly that fallback: every optional field is
    // unset, so renderWelcomePage() already degrades to crest, village name,
    // emergency line and the login link with no extra branching.
    let profile: VillageProfile;
    try {
      profile = await store.getVillageProfile();
    } catch {
      profile = emptyVillageProfile();
    }
    return c.html(renderWelcomePage(config, profile));
  });

  return app;
}
