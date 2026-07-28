// The one place that talks to the backend. Every screen goes through these
// functions rather than calling fetch directly, so the error contract
// ({error: string} on any non-2xx) is honoured in exactly one spot.

import type {
  Device,
  DeviceEdit,
  IncidentPage,
  Me,
  NewDevice,
  VillageProfile,
  VillageProfileWrite,
} from "./types.ts";
import { FALLBACK_LOCALE, type Locale } from "../i18n/mod.ts";

/**
 * Thrown for any non-2xx response. `message` is always the server's own
 * `{error}` string where the backend supplied one — the UI must show that
 * verbatim, never invent its own wording, since it may name the exact
 * validation problem (e.g. "msisdn already registered"). `locale` is carried
 * only by the session route (see SessionResult below) — it's how a
 * signed-out visitor's screen knows which language to use, since there is no
 * session yet to read a locale from. `field` is carried only by the village
 * profile's write endpoint (spec 2026-07-27 §3): which field was rejected, so
 * the config form can show the error against that field rather than a
 * generic banner.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly locale?: Locale,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** A fallback for the rare case a non-2xx body isn't the {error} JSON shape. */
const GENERIC_ERROR = "Ha ocurrido un error inesperado.";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 204) {
    // No body to parse — callers of a 204 endpoint expect `void`.
    return undefined as T;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null) as
      | { error?: string; locale?: Locale; field?: string }
      | null;
    throw new ApiError(res.status, body?.error ?? GENERIC_ERROR, body?.locale, body?.field);
  }

  return res.json() as Promise<T>;
}

/**
 * Either an admin, or the deployment's locale with nobody signed in. Unlike a
 * bare `Me | null`, the "not signed in" case still carries something — the
 * one piece of the session response that isn't sensitive and is needed
 * before any session exists: which language to greet the visitor in. The
 * backend puts it on the 401 body precisely so this works (see
 * src/panel/api.ts's `MESSAGES` + the `locale` field on that 401).
 */
export type SessionResult =
  | { signedIn: true; me: Me }
  | { signedIn: false; locale: Locale };

/**
 * Resolves the session. A 401 here is an expected, everyday outcome (the
 * cookie expired, or this is a first visit) — it is not surfaced as an error.
 */
export async function fetchSession(): Promise<SessionResult> {
  try {
    const me = await request<Me>("/api/session");
    return { signedIn: true, me };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return { signedIn: false, locale: err.locale ?? FALLBACK_LOCALE };
    }
    throw err;
  }
}

export async function logout(): Promise<void> {
  await request<void>("/api/session/logout", { method: "POST" });
}

export async function listDevices(): Promise<Device[]> {
  return request<Device[]>("/api/devices");
}

export async function createDevice(body: NewDevice): Promise<Device> {
  return request<Device>("/api/devices", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateDevice(msisdn: string, body: DeviceEdit): Promise<Device> {
  return request<Device>(`/api/devices/${encodeURIComponent(msisdn)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteDevice(msisdn: string): Promise<void> {
  await request<void>(`/api/devices/${encodeURIComponent(msisdn)}`, { method: "DELETE" });
}

/** Render the alert this device would produce, without sending anything. */
export async function previewAlert(msisdn: string, category?: string): Promise<string> {
  const res = await request<{ preview: string }>(
    `/api/devices/${encodeURIComponent(msisdn)}/simulate`,
    { method: "POST", body: JSON.stringify({ preview: true, category }) },
  );
  return res.preview;
}

/**
 * Raise a real alert as this device. The village group receives an ordinary
 * alert — indistinguishable from a genuine one, which is the entire point of
 * testing with it.
 */
export async function sendTestAlert(
  msisdn: string,
  category?: string,
): Promise<{ status: "raised" | "duplicate" }> {
  return request<{ status: "raised" | "duplicate" }>(
    `/api/devices/${encodeURIComponent(msisdn)}/simulate`,
    { method: "POST", body: JSON.stringify({ category }) },
  );
}

// ── Village profile (spec 2026-07-27 §3) ──
//
// Presentation only for the (separately built) welcome page and this editor.
// Nothing about the alert path reads this — see the same rule spelled out on
// VillageProfile in the backend's src/store/types.ts.

export async function fetchVillageProfile(): Promise<VillageProfile> {
  return request<VillageProfile>("/api/village-profile");
}

export async function saveVillageProfile(body: VillageProfileWrite): Promise<VillageProfile> {
  return request<VillageProfile>("/api/village-profile", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

// ── History (spec 2026-07-27 §6) ──
//
// A bounded, newest-first page — never the whole log. There is no
// listAllIncidents() here on purpose: the export endpoint that needs the
// whole log is a Telegram command (/export), not something this SPA calls.

export async function fetchIncidents(cursor: string | null = null): Promise<IncidentPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request<IncidentPage>(`/api/incidents${query}`);
}
