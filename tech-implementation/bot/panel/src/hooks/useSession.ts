// Resolves who's signed in, if anyone, exactly once on mount — the only
// entry points are a Telegram magic link (?t=…) or an existing cookie.
// There is deliberately no login form: a village volunteer proves who they
// are in Telegram, not here.

import { useCallback, useEffect, useState } from "react";
import { ApiError, exchangeToken, fetchSession, logout as apiLogout } from "../api/client.ts";
import type { Me } from "../api/types.ts";

type SessionState =
  | { status: "loading" }
  | { status: "signedIn"; me: Me }
  | { status: "signedOut" }
  | { status: "error"; message: string };

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
        const me = token ? await exchangeToken(token) : await fetchSession();

        // Strip the one-time token immediately, whether it worked or not —
        // it must never sit in the URL bar, browser history or a bookmark,
        // since anyone who reuses it could ride in on someone else's session.
        if (token) {
          url.searchParams.delete("t");
          window.history.replaceState({}, "", url.pathname + url.search + url.hash);
        }

        if (cancelled) return;
        setState(me ? { status: "signedIn", me } : { status: "signedOut" });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : String(err);
        setState({ status: "error", message });
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
    setState({ status: "signedOut" });
  }, []);

  return { state, signOut };
}
