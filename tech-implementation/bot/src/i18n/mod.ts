import type { Strings } from "./types.ts";
import { es } from "./es.ts";
import { en } from "./en.ts";

export type { Strings };

export const LOCALES = { es, en } as const;
export type Locale = keyof typeof LOCALES;

export function isLocale(value: string): value is Locale {
  return value in LOCALES;
}

export function strings(locale: Locale): Strings {
  return LOCALES[locale];
}

/**
 * Substitute {placeholders} in a template. Unknown placeholders are left as
 * they are rather than rendered as "undefined" — a visible `{who}` in a village
 * group is a bug report; a silent "undefined" is just confusing.
 */
export function t(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = vars[key];
    return value === undefined ? whole : String(value);
  });
}
