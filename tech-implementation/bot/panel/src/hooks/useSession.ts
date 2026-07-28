// Resolves who's signed in, if anyone, on mount by asking the session
// endpoint — the cookie is the only credential the SPA ever reads. There is
// deliberately no login form and no ?t= token exchange here (spec
// 2026-07-27 §5): a village volunteer proves who they are to the bot, then
// types the code it sends into the public login page, which is
// server-rendered and lives outside this app entirely — see
// src/web/login.ts. This hook only ever reads the session that results.

import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchSession, logout as apiLogout } from "../api/client.ts";
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
      try {
        const result = await fetchSession();
        if (cancelled) return;
        setState(
          result.signedIn
            ? { status: "signedIn", me: result.me }
            : { status: "signedOut", locale: result.locale },
        );
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : String(err);
        // A locale on ApiError only ever comes from a 401 on the session
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
