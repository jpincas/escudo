// Resolves who's signed in, if anyone, exactly once on mount — the only
// entry points are a Telegram magic link (?t=…) or an existing cookie.
// There is deliberately no login form: a village volunteer proves who they
// are in Telegram, not here.

import { useCallback, useEffect, useState } from "react";
import { ApiError, exchangeToken, fetchSession, logout as apiLogout } from "../api/client.ts";
import type { Me } from "../api/types.ts";
import { FALLBACK_LOCALE, type Locale } from "../i18n/mod.ts";

type SessionState =
  | { status: "loading" }
  | { status: "signedIn"; me: Me }
  | { status: "signedOut"; locale: Locale }
  | { status: "error"; message: string; locale: Locale };

export function useSession(): {
  state: SessionState;
  signOut: () => void;
} {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const url = new URL(window.location.href);
      const token = url.searchParams.get("t");

      try {
        const result = token ? await exchangeToken(token) : await fetchSession();

        // Strip the one-time token immediately, whether it worked or not —
        // it must never sit in the URL bar, browser history or a bookmark,
        // since anyone who reuses it could ride in on someone else's session.
        if (token) {
          url.searchParams.delete("t");
          window.history.replaceState({}, "", url.pathname + url.search + url.hash);
        }

        if (cancelled) return;
        setState(
          result.signedIn
            ? { status: "signedIn", me: result.me }
            : { status: "signedOut", locale: result.locale },
        );
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : String(err);
        // A locale on ApiError only ever comes from a 401 on a session
        // route (see client.ts) — anything else reaching here is a genuine
        // failure (network down, a 500, bad JSON) with no village to ask, so
        // the fallback is the only honest answer.
        const locale = err instanceof ApiError && err.locale ? err.locale : FALLBACK_LOCALE;
        setState({ status: "error", message, locale });
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(() => {
    // Best-effort: even if the network call fails, drop the local view of
    // the session so the signed-out screen shows immediately. The cookie is
    // HttpOnly and short-lived either way.
    apiLogout().catch(() => {});
    setState((prev) => ({
      status: "signedOut",
      // Carry the locale we already know from the session we're leaving,
      // rather than falling back — the village doesn't change language
      // because its admin signed out. `signOut` is only ever reachable from
      // a signed-in screen, but every branch is covered defensively.
      locale: prev.status === "signedIn"
        ? prev.me.locale
        : prev.status === "loading"
        ? FALLBACK_LOCALE
        : prev.locale,
    }));
  }, []);

  return { state, signOut };
}
