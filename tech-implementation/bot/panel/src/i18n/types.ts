// The full set of copy the panel can show, in one typed interface. Mirrors
// the bot's own src/i18n/types.ts: every locale must implement every field,
// so a half-translated locale is a `tsc` error — caught by `deno task build`
// (the panel's own gate; `deno task check` does not typecheck the panel) —
// not a blank spot a coordinator discovers in the village.
//
// Placeholders are {braced} and substituted by `t()` in mod.ts.

import type { BridgeChannel, DeviceKind, DeviceStatus, IncidentSource } from "../api/types.ts";

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
    /** Title when the form was opened from the Inbox's "Register" action
     *  (spec 2026-07-27 §7.2) — same form, same fields, different title so an
     *  admin knows which flow they're in. */
    registerTitle: string;
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

  /**
   * The Inbox screen (spec 2026-07-27 §7): unregistered callers waiting to be
   * named, or dismissed. This is the documented way a household actually
   * joins — see InboxEntry's own doc in the backend's src/store/types.ts.
   */
  inbox: {
    heading: string;
    /** States the retention window plainly — {days}. An inbox row is a
     *  stranger's phone number until named, so it is kept for far less time
     *  than an incident. */
    intro: string;
    empty: { heading: string; body: string };
    columns: {
      msisdn: string;
      count: string;
      firstSeen: string;
      lastSeen: string;
      channel: string;
      lastBody: string;
      actions: string;
    };
    channel: Record<BridgeChannel, string>;
    register: string;
    dismiss: string;
  };

  dismissConfirm: {
    heading: string;
    /** {msisdn} */
    body: string;
    confirm: string;
    cancel: string;
    dismissing: string;
  };

  /**
   * The History screen (spec 2026-07-27 §6): what has actually happened in
   * the village, newest first, read-only, paged.
   */
  history: {
    heading: string;
    /** States the retention window plainly — {days}. Not a permanent
     *  archive: what has aged out is gone, by design and by law. */
    intro: string;
    empty: { heading: string; body: string };
    columns: {
      when: string;
      category: string;
      source: string;
      who: string;
      location: string;
      drill: string;
      cancelled: string;
    };
    source: Record<IncidentSource, string>;
    locationLink: string;
    /** {name} — who ran the drill. */
    drillBy: string;
    /** {when} — already formatted in the village timezone. */
    cancelledAt: string;
    pagination: { prev: string; next: string };
  };
}
