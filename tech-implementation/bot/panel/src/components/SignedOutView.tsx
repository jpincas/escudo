import { useStrings } from "../i18n/context.tsx";

/**
 * Shown on a 401 from either session endpoint. There is no login form by
 * design — a magic link from the bot is the only way in, so the only useful
 * thing this screen can do is point back to Telegram.
 */
export function SignedOutView() {
  const s = useStrings();
  return (
    <div className="signed-out">
      <h1>{s.signedOut.heading}</h1>
      <p>{s.signedOut.body}</p>
    </div>
  );
}
