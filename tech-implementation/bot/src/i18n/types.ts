// The full set of strings the bot can say. Every locale must supply all of
// them — that is the point of typing this rather than loading loose YAML:
// a half-translated locale fails `deno check`, not the village.
//
// Placeholders are {braced} and substituted by `t()` in mod.ts.

export interface Strings {
  /** Labels for the default categories. A village may override any of these
   *  per-button with `label:` in config.yaml. */
  categories: Record<string, string>;

  board: {
    /** Text of the pinned message that carries the alert buttons. */
    title: string;
    /** Small print under the buttons. */
    hint: string;
  };

  alert: {
    /** Headline. {emoji} {category} */
    header: string;
    /** Headline for a quiet category — no siren, sentence case. {emoji} {category} */
    quietHeader: string;
    fromDevice: string;
    /** Closing line on a quiet request, in place of `respond`. */
    quietRespond: string;
    /** Attribution line. {who} {time} */
    from: string;
    /**
     * Where to go, for an alert raised by a registered device. {address}
     *
     * Not decoration: a wall unit has no GPS, so this line is the whole
     * location. Shown only when the incident carries an address.
     */
    at: string;
    /** Closing instruction line. */
    respond: string;
    /** Replaces the headline when an alert is cancelled. */
    cancelled: string;
    /** Caption on the map pin posted after a location is shared. */
    locationCaption: string;
  };

  /** The drill message, posted by /test. Never an incident — see board.ts. */
  drill: {
    /** Headline. Must be unmistakable: people are meant to hear it, not act. */
    header: string;
    /** Attribution. {village} {time} */
    from: string;
    /** What to do about it, which is nearly nothing. */
    body: string;
  };

  button: {
    falseAlarm: string;
    shareLocation: string;
    /** On the pinned group message: opens the member's private chat with the bot. */
    openBot: string;
  };

  /** Ephemeral toasts shown on the presser's own screen. */
  toast: {
    sent: string;
    cancelled: string;
    cancelNotAllowed: string;
    expired: string;
  };

  dm: {
    /** Confirmation in the private chat once an alert has gone to the group. */
    alertSent: string;
    /** Same, when the press fell inside the dedupe window. */
    alreadySent: string;
    /** Confirmation for a quiet request — which made no noise anywhere. */
    helpSent: string;
    /** Sent after an alert raised from the group board, where we can't ask inline. */
    locationPrompt: string;
    /** Confirmation once the pin has been posted to the group. */
    locationThanks: string;
    /** Reply to /start in a private chat. {village} */
    welcome: string;
    /** Silent message sent to every member when the buttons change. */
    buttonsChanged: string;
  };

  cmd: {
    /** Description shown in Telegram's ☰ command menu. */
    menuSos: string;
    menuStart: string;
    /** Admin-scope menu entries. */
    menuPin: string;
    menuTest: string;
    menuExport: string;
    menuChatId: string;
    menuPanel: string;
    /** The one-time login code (spec 2026-07-27 §5), and nothing else — no
     *  URL. {code} */
    panelCode: string;
    /** Confirmation to an admin who ran /test from outside the group. */
    testSent: string;
    pinned: string;
    /** The board posted but couldn't be pinned — almost always missing rights. */
    pinFailed: string;
    adminOnly: string;
    groupOnly: string;
    /** {id} */
    chatId: string;
    /** {count} */
    exported: string;
  };

  error: {
    generic: string;
  };

  /**
   * The public welcome page (spec 2026-07-27 §4) — the deployment's own root,
   * open to anyone, no session. Distinct in kind from everything else in this
   * file (which the *bot* says over Telegram): this is what a visitor's
   * browser renders. Kept here anyway, deliberately, for the one guarantee
   * that matters more than the boundary — a locale missing a string below
   * fails `deno check`, not a villager's phone.
   */
  welcome: {
    /** <title> and page heading. {village} */
    heading: string;
    /** The brand tagline, shown under the heading — also present with an
     *  empty profile, so the page never looks bare. */
    tagline: string;
    /** Link at the top of the page to the admin login (→ /panel). */
    adminLogin: string;
    /** Label over the Escudo phone number — the page's most important line. */
    escudoNumberLabel: string;
    /** Heading over the official emergency line. Must say plainly that
     *  Escudo supplements the authorities and never replaces them. */
    emergencyLineIntro: string;
    /** Alt text for the village photo, if one is set. */
    photoAlt: string;
    /** Heading over the list of responsible people. */
    responsiblePeopleHeading: string;
  };

  /**
   * The public login page (spec 2026-07-27 §5) — where an admin types the
   * code /panel just sent them. Server-rendered and mobile-readable, like
   * `welcome` above and for the same reason: the code lands on a phone, even
   * though the ordinary flow types it into a computer.
   */
  login: {
    /** <title> and page heading. */
    heading: string;
    /** Says plainly where the code comes from. There is no "request a code"
     *  form on this page, so this is the only instruction it gives. */
    instructions: string;
    codeLabel: string;
    /** Help text under the input. */
    codeHelp: string;
    submit: string;
    /** Shown on every failure, worded identically regardless of cause
     *  (spec 5.3): unknown, expired, used, superseded, or rate-limited. The
     *  caller must learn nothing about which one it was. */
    error: string;
    /** Link back to the welcome page. */
    backToWelcome: string;
  };
}
