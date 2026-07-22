import { DevicesScreen } from "./components/DevicesScreen.tsx";
import { ErrorView } from "./components/ErrorView.tsx";
import { LoadingView } from "./components/LoadingView.tsx";
import { SignedOutView } from "./components/SignedOutView.tsx";
import { useSession } from "./hooks/useSession.ts";

/**
 * The whole app is one screen behind one gate: resolve the session, then
 * show either the signed-out explainer or the devices roster. There is no
 * router — a second screen, if one is ever added, is the point to introduce
 * one, not before.
 */
export function App() {
  const { state, signOut } = useSession();

  switch (state.status) {
    case "loading":
      return <LoadingView />;
    case "error":
      // A session-resolution failure has no in-app retry path (there's no
      // separate "reload the session" action) — a page reload replays the
      // same mount logic, which is the correct retry here.
      return <ErrorView message={state.message} onRetry={() => window.location.reload()} />;
    case "signedOut":
      return <SignedOutView />;
    case "signedIn":
      return <DevicesScreen me={state.me} onSignOut={signOut} />;
  }
}
