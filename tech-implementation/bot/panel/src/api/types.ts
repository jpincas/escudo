// Wire types for the admin API — kept in lockstep with the Deno backend's own
// definitions by hand, since the two apps don't share a build. If the backend
// changes a shape, this file has to change with it.

export interface Me {
  telegramId: string;
  name: string;
  village: string;
  locale: "es" | "en";
}

export type DeviceKind = "base" | "wearable" | "phone" | "alarm" | "other";

export type DeviceStatus = "ok" | "overdue" | "never";

export interface Device {
  /** E.164, e.g. "+34600111222". The key — immutable once created. */
  msisdn: string;
  label: string;
  address: string;
  kind: DeviceKind;
  /** ISO 8601 UTC, or null if the device has never proven itself. */
  lastProvenAt: string | null;
  /** ISO 8601 UTC. */
  registeredAt: string;
  /** Computed server-side; display only, never sent back on write. */
  status: DeviceStatus;
}

/** Body for POST /api/devices. */
export interface NewDevice {
  msisdn: string;
  label: string;
  address: string;
  kind: DeviceKind;
}

/** Body for PATCH /api/devices/:msisdn — msisdn itself is never patchable. */
export interface DeviceEdit {
  label?: string;
  address?: string;
  kind?: DeviceKind;
}
