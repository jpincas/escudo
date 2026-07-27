import { Shell } from "./components/Shell.tsx";
import { ErrorView } from "./components/ErrorView.tsx";
import { LoadingView } from "./components/LoadingView.tsx";
import { SignedOutView } from "./components/SignedOutView.tsx";
import { useSession } from "./hooks/useSession.ts";
import { FALLBACK_LOCALE } from "./i18n/mod.ts";
import { LocaleProvider } from "./i18n/context.tsx";

/**
 * Resolve the session, then show one of: loading, the signed-out explainer,
 * an error, or the signed-in shell (sidebar + the section the URL points at
 * — see router.ts and sections.tsx). Only the signed-in branch gets the
 * sidebar; the other three keep the plain full-page treatment they've always
 * had, wrapped in ".page" for the centred, padded layout the shell itself
 * doesn't use (it lays out sidebar + main directly against #root).
 *
 * Every branch is wrapped in a LocaleProvider, because copy exists on all
 * four of them (spec 2.3) — including signed-out, which has never had a
 * session to read a locale from. See useSession.ts for where that locale
 * actually comes from.
 */
export function App() {
  const { state, signOut } = useSession();

  switch (state.status) {
    case "loading":
      return (
        <LocaleProvider locale={FALLBACK_LOCALE}>
          <div className="page">
            <LoadingView />
          </div>
        </LocaleProvider>
      );
    case "error":
      return (
        <LocaleProvider locale={state.locale}>
          <div className="page">
            {/* A session-resolution failure has no in-app retry path (there's
                no separate "reload the session" action) — a page reload
                replays the same mount logic, which is the correct retry here. */}
            <ErrorView message={state.message} onRetry={() => window.location.reload()} />
          </div>
        </LocaleProvider>
      );
    case "signedOut":
      return (
        <LocaleProvider locale={state.locale}>
          <div className="page">
            <SignedOutView />
          </div>
        </LocaleProvider>
      );
    case "signedIn":
      return (
        <LocaleProvider locale={state.me.locale}>
          <Shell me={state.me} onSignOut={signOut} />
        </LocaleProvider>
      );
  }
}
