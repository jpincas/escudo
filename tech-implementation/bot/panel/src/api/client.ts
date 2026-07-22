// The one place that talks to the backend. Every screen goes through these
// functions rather than calling fetch directly, so the error contract
// ({error: string} on any non-2xx) is honoured in exactly one spot.

import type { Device, DeviceEdit, Me, NewDevice } from "./types.ts";

/**
 * Thrown for any non-2xx response. `message` is always the server's own
 * `{error}` string where the backend supplied one — the UI must show that
 * verbatim, never invent its own wording, since it may name the exact
 * validation problem (e.g. "msisdn already registered").
 */
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
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
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? GENERIC_ERROR);
  }

  return res.json() as Promise<T>;
}

/**
 * The current admin, or `null` if signed out. A 401 here is an expected,
 * everyday outcome (the cookie expired, or this is a first visit) — it is
 * not surfaced as an error.
 */
export async function fetchSession(): Promise<Me | null> {
  try {
    return await request<Me>("/api/session");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

/**
 * Trades the one-time token from the Telegram magic link for a session
 * cookie. A 401 means the token was invalid or already used — treated the
 * same as "signed out", not as a fetch failure, since the fix is the same
 * either way: go back to Telegram for a fresh link.
 */
export async function exchangeToken(token: string): Promise<Me | null> {
  try {
    return await request<Me>("/api/session/exchange", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
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
