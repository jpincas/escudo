import type { Strings } from "./types.ts";

// English is the project's source-of-truth wording per CLAUDE.md, but for the
// panel it is the *newer* locale — es.ts carries the copy Bercianos already
// reads, so this is a translation of that, not the other way round.
export const en: Strings = {
  appTitle: "Escudo — Panel",

  signedOut: {
    heading: "Signed out",
    body: "To open the panel, message /panel to the Escudo bot on Telegram. " +
      "It will send you a new login link.",
  },

  loading: "Loading…",
  genericError: "Something unexpected went wrong. Try again.",
  retry: "Retry",

  sidebar: {
    navLabel: "Panel sections",
    devices: "Devices",
    inbox: "Inbox",
    history: "History",
    config: "Config",
    signOut: "Sign out",
  },

  placeholder: {
    inbox: {
      heading: "Inbox",
      body: "Numbers that have called Escudo without being registered will " +
        "appear here, ready to register as a device. Not built yet.",
    },
    history: {
      heading: "History",
      body: "What has actually happened in the village will be listed here: " +
        "every alert, who raised it and when. Not built yet.",
    },
    config: {
      heading: "Config",
      body: "The village's public information will be editable here: name, " +
        "photo, phone number and the responsible people. Not built yet.",
    },
  },

  devices: {
    heading: "Devices",
    add: "Add device",
    empty: {
      heading: "No devices registered",
      body: "No device has been registered yet. Without at least one, " +
        'nobody at this address can raise the alarm. Use "Add device" ' +
        "to register the first one.",
    },
    columns: {
      label: "Label",
      address: "Address",
      msisdn: "Phone",
      kind: "Kind",
      status: "Status",
      lastProvenAt: "Last proven",
      actions: "Actions",
    },
    status: {
      ok: "OK",
      overdue: "Overdue",
      never: "Never proven",
    },
    kind: {
      base: "Base unit with pendant",
      wearable: "Pendant or watch",
      phone: "Phone",
      alarm: "House alarm",
      other: "Other",
    },
    edit: "Edit",
    delete: "Delete",
  },

  form: {
    addTitle: "Add device",
    editTitle: "Edit device",
    msisdn: "Phone",
    msisdnHelp: "International format, e.g. +34600111222. Cannot be changed afterwards.",
    label: "Label",
    labelHelp: 'For example, "María\'s house".',
    address: "Address",
    addressHelp: 'For example, "Calle Real 14".',
    kind: "Kind",
    save: "Save",
    cancel: "Cancel",
    saving: "Saving…",
  },

  deleteConfirm: {
    heading: "Delete device",
    body: 'You are about to delete "{label}". From that moment, this address ' +
      "will no longer be able to raise the alarm with this device. This cannot be undone.",
    confirm: "Delete device",
    cancel: "Cancel",
    deleting: "Deleting…",
  },

  testAlert: {
    action: "Test",
    heading: "Raise a test alert",
    intro: 'This is how the alert for "{label}" would look in the group:',
    loading: "Preparing the preview…",
    warning: "The group will receive this alert as a real one. Neighbours " +
      "won't know it's a test, and may set out. Warn them first.",
    category: "Category",
    confirm: "Send to the group",
    sending: "Sending…",
    cancel: "Cancel",
    sent: "Alert sent. Cancel it in the group when you're done.",
    duplicate: "There was already an open alert from this device, so another " +
      "was not sent.",
  },
};
