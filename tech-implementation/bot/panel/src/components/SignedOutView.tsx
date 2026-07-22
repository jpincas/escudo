import { strings } from "../strings.ts";

/**
 * Shown on a 401 from either session endpoint. There is no login form by
 * design — a magic link from the bot is the only way in, so the only useful
 * thing this screen can do is point back to Telegram.
 */
export function SignedOutView() {
  return (
    <div className="signed-out">
      <h1>{strings.signedOut.heading}</h1>
      <p>{strings.signedOut.body}</p>
    </div>
  );
}
