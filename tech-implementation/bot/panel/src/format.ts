// Date rendering for the panel.
//
// Two different rules for two different screens. Devices shows exactly one
// date — lastProvenAt — as an absolute date in the *browser's* local
// timezone: this is a desktop tool for a coordinator deciding whether a
// device is overdue, and for that one purpose the coordinator's own machine
// is close enough to the village. History (§6, spec 2026-07-27) is
// different: it must read the same regardless of where the admin happens to
// be sitting, so it renders in the *village's* configured timezone
// (config.village.timezone, carried down from GET /api/session — see
// village-context.tsx) — never the browser's.

import type { Locale } from "./i18n/mod.ts";

// "en" is generic international, not a translation of the Spanish (see
// CLAUDE.md's brand rules) — en-GB for the same reason the English signage
// uses UK-led emergency numbers, not US date conventions.
const INTL_LOCALE: Record<Locale, string> = {
  es: "es-ES",
  en: "en-GB",
};

/** `null` (never proven) is the caller's business to label — this only formats a real timestamp. */
export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** Same rendering as formatDateTime, pinned to a specific IANA timezone
 *  rather than the browser's — for History, where the village's own clock is
 *  the whole point, not whichever machine a coordinator is signed in from. */
export function formatDateTimeInZone(iso: string, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}
