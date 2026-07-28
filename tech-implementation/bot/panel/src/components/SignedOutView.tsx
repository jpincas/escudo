import { useStrings } from "../i18n/context.tsx";

/**
 * Shown on a 401 from the session route. There is no login form by design —
 * a code from the bot, typed into the public login page, is the only way in
 * (spec 2026-07-27 §5) — so the only useful thing this screen can do is
 * point back to Telegram and to that page. This is only ever reached via a
 * sub-path like /panel/devices with no session (a stale bookmark): bare
 * /panel itself is the login page, server-rendered, and never reaches the
 * SPA at all while signed out — see main.ts.
 */
export function SignedOutView() {
  const s = useStrings();
  return (
    <div className="signed-out">
      <h1>{s.signedOut.heading}</h1>
      <p>{s.signedOut.body}</p>
      <p>
        <a href="/panel">{s.signedOut.loginLink}</a>
      </p>
    </div>
  );
}
