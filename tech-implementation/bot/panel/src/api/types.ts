// Wire types for the admin API — kept in lockstep with the Deno backend's own
// definitions by hand, since the two apps don't share a build. If the backend
// changes a shape, this file has to change with it.

import type { Locale } from "../i18n/mod.ts";

export interface Me {
  telegramId: string;
  name: string;
  village: string;
  locale: Locale;
  /** IANA timezone, e.g. "Europe/Madrid" — village policy, not the browser's
   *  own. The History screen renders every timestamp in it. */
  timezone: string;
  /** Days the incident log is kept before retention deletes it — shown on
   *  the History screen so "not a permanent archive" is a fact, not a guess. */
  retentionDays: number;
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

// ── History (spec 2026-07-27 §6) ──

export type IncidentSource = "telegram" | "device";

/**
 * One row of the History screen, as GET /api/incidents returns it. Two
 * different rules for two different fields (mirrors the backend's own
 * IncidentView doc in src/panel/api.ts): reporterName/reporterAddress/
 * reporterKind/lat/lon/simulatedBy/cancelledAt are the values snapshotted on
 * the incident at the time — the view must show what the alert said then,
 * not what the registry says now — while categoryEmoji/categoryLabel are
 * resolved against the deployment's *current* configured categories.
 */
export interface Incident {
  id: string;
  /** ISO 8601 UTC — rendered in the village timezone, not the browser's. */
  createdAt: string;
  source: IncidentSource;
  categoryId: string;
  categoryEmoji: string;
  categoryLabel: string;
  reporterName: string;
  reporterAddress: string | null;
  reporterKind: DeviceKind | null;
  lat: number | null;
  lon: number | null;
  /** Set when an admin raised this from the panel as a drill; who ran it. */
  simulatedBy: string | null;
  /** ISO 8601 UTC, or null if this alert is still active. */
  cancelledAt: string | null;
}

/** Response shape of GET /api/incidents. */
export interface IncidentPage {
  incidents: Incident[];
  /** Opaque; pass back as `?cursor=` to fetch the next page. Null means this
   *  page reached the end of the log. */
  nextCursor: string | null;
}
