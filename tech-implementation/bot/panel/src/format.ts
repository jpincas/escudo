// Date rendering for the panel. There is exactly one date the UI shows —
// lastProvenAt — and it must read as an absolute date: this is a desktop
// tool for a coordinator deciding whether a device is overdue, not a social
// feed where "3 weeks ago" is good enough.
//
// The backend gives no village timezone (unlike the bot itself, which has
// `village.timezone` in config.yaml — see the bot's own src/format.ts). The
// panel renders in the browser's local timezone; that's the coordinator's
// own machine, which for this single-village tool is the village.

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
