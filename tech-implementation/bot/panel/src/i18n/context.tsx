// Makes the active locale available to every component below it. There is
// exactly one provider, mounted by App.tsx as soon as a locale is known (from
// the session, or the fallback while none is known yet) — see the "where does
// the signed-out screen get its locale from" note in useSession.ts.

import { createContext, type ReactNode, useContext, useLayoutEffect } from "react";
import { strings } from "./mod.ts";
import type { Locale, Strings } from "./mod.ts";

const LocaleContext = createContext<Locale | null>(null);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  // Layout effect, not a plain effect: the <html lang> attribute and tab
  // title must be right before the browser paints, not a frame after.
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.title = strings(locale).appTitle;
  }, [locale]);

  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  const locale = useContext(LocaleContext);
  if (!locale) {
    throw new Error("useLocale() called outside <LocaleProvider>");
  }
  return locale;
}

/** The full string table for the active locale. */
export function useStrings(): Strings {
  return strings(useLocale());
}
