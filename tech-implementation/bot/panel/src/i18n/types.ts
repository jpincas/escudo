// The full set of copy the panel can show, in one typed interface. Mirrors
// the bot's own src/i18n/types.ts: every locale must implement every field,
// so a half-translated locale is a `tsc` error — caught by `deno task build`
// (the panel's own gate; `deno task check` does not typecheck the panel) —
// not a blank spot a coordinator discovers in the village.
//
// Placeholders are {braced} and substituted by `t()` in mod.ts.

import type { DeviceKind, DeviceStatus } from "../api/types.ts";

export interface Strings {
  /** Browser tab title. */
  appTitle: string;

  /** Shown on a 401 from the session route — there is no login form here
   *  (spec 2026-07-27 §5); the code goes to the public login page instead. */
  signedOut: {
    heading: string;
    body: string;
    /** Link back to the public login page (bare /panel). */
    loginLink: string;
  };

  loading: string;
  genericError: string;
  retry: string;

  sidebar: {
    /** Accessible name for the <nav> landmark itself — distinct from any one
     *  section label, so a screen reader doesn't announce the whole sidebar
     *  as "Devices". */
    navLabel: string;
    devices: string;
    inbox: string;
    history: string;
    config: string;
    /** Foot of the sidebar, under the signed-in admin's name. */
    signOut: string;
  };

  /** Section placeholders — replaced one screen at a time by §3, §6 and §7.
   *  Config no longer has one: its real screen is below. */
  placeholder: {
    inbox: { heading: string; body: string };
    history: { heading: string; body: string };
  };

  devices: {
    heading: string;
    add: string;
    empty: { heading: string; body: string };
    columns: {
      label: string;
      address: string;
      msisdn: string;
      kind: string;
      status: string;
      lastProvenAt: string;
      actions: string;
    };
    status: Record<DeviceStatus, string>;
    kind: Record<DeviceKind, string>;
    edit: string;
    delete: string;
  };

  form: {
    addTitle: string;
    editTitle: string;
    msisdn: string;
    msisdnHelp: string;
    label: string;
    labelHelp: string;
    address: string;
    addressHelp: string;
    kind: string;
    save: string;
    cancel: string;
    saving: string;
  };

  deleteConfirm: {
    heading: string;
    /** {label} */
    body: string;
    confirm: string;
    cancel: string;
    deleting: string;
  };

  testAlert: {
    action: string;
    heading: string;
    /** {label} */
    intro: string;
    loading: string;
    warning: string;
    category: string;
    confirm: string;
    sending: string;
    cancel: string;
    sent: string;
    duplicate: string;
  };

  /**
   * The Config screen (spec 2026-07-27 §3): the deployment's public profile,
   * shown on the welcome page. Presentation only — no policy field (name,
   * locale, categories, retention…) belongs here, and none is offered.
   */
  config: {
    heading: string;
    intro: string;
    phoneLabel: string;
    phoneHelp: string;
    photoLabel: string;
    photoHelp: string;
    introTextLabel: string;
    introTextHelp: string;
    peopleHeading: string;
    /** Shown plainly next to the list (spec 3.4): these names are personal
     *  data published to the open web. */
    peopleNotice: string;
    peopleEmpty: string;
    nameLabel: string;
    roleLabel: string;
    addPerson: string;
    /** Accessible name for a row's remove button. */
    removePerson: string;
    /** Accessible name for a row's move-up button. */
    moveUp: string;
    /** Accessible name for a row's move-down button. */
    moveDown: string;
    save: string;
    saving: string;
    saved: string;
  };
}
