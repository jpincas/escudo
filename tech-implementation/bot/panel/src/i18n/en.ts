import type { Strings } from "./types.ts";

// English is the project's source-of-truth wording per CLAUDE.md, but for the
// panel it is the *newer* locale — es.ts carries the copy Bercianos already
// reads, so this is a translation of that, not the other way round.
export const en: Strings = {
  appTitle: "Escudo — Panel",

  signedOut: {
    heading: "Signed out",
    body: "To open the panel, message /panel to the Escudo bot on Telegram. " +
      "It will send you a 9-digit code — enter it on the login page.",
    loginLink: "Go to the login page",
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

  config: {
    heading: "Config",
    intro: "This information appears on the village's public welcome page.",
    phoneLabel: "Escudo phone number",
    phoneHelp: "The number a neighbour calls to raise the alarm. " +
      "International format, e.g. +34600111222. Leave blank if this village " +
      "has no call bridge yet.",
    photoLabel: "Photo (URL)",
    photoHelp: "A link to an image hosted elsewhere. Must start with " +
      "https://. There is no upload.",
    introTextLabel: "Intro text",
    introTextHelp: "A short paragraph introducing this village's Red Escudo.",
    peopleHeading: "Responsible people",
    peopleNotice: "These names are published on the village's public page, " +
      "which search engines can index: anyone on the internet can see them, " +
      "not only people with the link. Before adding someone, tell them their " +
      "name and role will appear there.",
    peopleEmpty: "No responsible people have been added yet.",
    nameLabel: "Name",
    roleLabel: "Role",
    addPerson: "Add person",
    removePerson: "Remove",
    moveUp: "Move up",
    moveDown: "Move down",
    save: "Save",
    saving: "Saving…",
    saved: "Saved.",
  },

  history: {
    heading: "History",
    intro: "This history covers the last {days} days. It is not a " +
      "permanent archive — anything older than that is deleted " +
      "automatically, by design and by law.",
    empty: {
      heading: "No incidents recorded",
      body: "When an alert happens — from Telegram or from a device — it " +
        "will appear here.",
    },
    columns: {
      when: "When",
      category: "Category",
      source: "Source",
      who: "Who / where",
      location: "Location",
      drill: "Drill",
      cancelled: "Cancelled",
    },
    source: {
      telegram: "Telegram",
      device: "Device",
    },
    locationLink: "View location",
    drillBy: "Drill — {name}",
    cancelledAt: "Cancelled · {when}",
    pagination: {
      prev: "Previous",
      next: "Next",
    },
  },
};
