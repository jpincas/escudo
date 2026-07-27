// Wire types for the admin API — kept in lockstep with the Deno backend's own
// definitions by hand, since the two apps don't share a build. If the backend
// changes a shape, this file has to change with it.

import type { Locale } from "../i18n/mod.ts";

export interface Me {
  telegramId: string;
  name: string;
  village: string;
  locale: Locale;
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

/** A name and a role, nothing more — the public page never shows contact details. */
export interface ResponsiblePerson {
  name: string;
  role: string;
}

/**
 * The deployment's public profile — presentation only for the welcome page
 * (a separate, unbuilt piece of work). Every field is independently optional;
 * all-empty is the valid state for a brand-new deployment.
 */
export interface VillageProfile {
  /** E.164, e.g. "+34600111222", or null if not set. */
  escudoPhone: string | null;
  /** An https URL, or null if not set. */
  photoUrl: string | null;
  introText: string | null;
  /** Ordered — this is the order the welcome page shows them in. */
  responsiblePeople: ResponsiblePerson[];
}

/**
 * Body for PUT /api/village-profile. Every field is a plain string — the form
 * always has a value for each, and an empty one means "not set". Sent whole:
 * there is no PATCH, because the record itself has no history to preserve.
 */
export interface VillageProfileWrite {
  escudoPhone: string;
  photoUrl: string;
  introText: string;
  responsiblePeople: ResponsiblePerson[];
}
