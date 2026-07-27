// Mirrors the bot's own src/i18n/mod.ts: a typed LOCALES map plus a plain
// accessor, rather than loose JSON — a missing key in either implementation
// of Strings fails `tsc` (run by `deno task build`), not a village asking
// why half the panel is in the wrong language.

import type { Strings } from "./types.ts";
import { es } from "./es.ts";
import { en } from "./en.ts";

export type { Strings };

export const LOCALES = { es, en } as const;
export type Locale = keyof typeof LOCALES;

/** Used only when a locale genuinely cannot be known (a total network or
 *  parse failure before the deployment has said anything about itself) —
 *  never for an ordinary signed-out visitor, whose locale comes from the
 *  server. See panel/src/hooks/useSession.ts. */
export const FALLBACK_LOCALE: Locale = "es";

export function strings(locale: Locale): Strings {
  return LOCALES[locale];
}

/**
 * Substitute {placeholders} in a template. Same syntax and the same "leave
 * unknown placeholders as they are" rule as the bot's own `t()` — a visible
 * `{label}` is a bug report, a silent "undefined" is just confusing.
 */
export function t(template: string, vars: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = vars[key];
    return value === undefined ? whole : value;
  });
}
