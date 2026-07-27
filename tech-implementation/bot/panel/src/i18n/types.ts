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

  /** Shown on a 401 from either session endpoint — there is no login form. */
  signedOut: {
    heading: string;
    body: string;
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

  /** Section placeholders — replaced one screen at a time by §3, §6 and §7. */
  placeholder: {
    inbox: { heading: string; body: string };
    history: { heading: string; body: string };
    config: { heading: string; body: string };
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
}
