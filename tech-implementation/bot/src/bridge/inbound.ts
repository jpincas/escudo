// What every bridge does once it knows who called.
//
// Supplier-agnostic on purpose. Twilio signed form posts; Zadarma signs a
// different string and speaks JSON; a future one will do neither. None of that
// changes what happens next, and the part that must not be duplicated across
// suppliers is this part — resolving a number to a household and raising the
// alarm. One copy, one set of tests, one place to be wrong.
//
// The rule it enforces is deliberately blunt (tech-spec §3):
//
//   ANY contact from a registered number is an alarm.
//
// Not "a message that parses as an alarm". Devices phrase things differently,
// firmware changes without warning, and a pendant that starts sending "SOS ALM
// 01" instead of "EMERGENCIA" must not go quiet. Parsing happens only to
// enrich — a lat/lon becomes a map pin, a named category refines the heading —
// and never to decide.

import type { AlertService } from "../alerts.ts";
import type { Config } from "../config.ts";
import { MSISDN, normaliseMsisdn } from "../msisdn.ts";
import type { BridgeChannel, Store } from "../store/types.ts";

/**
 * Raised when no category can be inferred. A device press says "help", not
 * "help, and it's a fire" — one button cannot carry a category, and guessing
 * one would send responders looking for the wrong emergency.
 */
export const DEFAULT_CATEGORY = "emergencia";

/**
 * The one exception to "never parse to decide".
 *
 * Several devices send a low-battery SMS. Under the blunt rule that is a
 * village-wide siren at three in the morning, which teaches people to mute the
 * group — the single worst outcome in this system. These go to the coordinator
 * instead.
 *
 * Kept short and literal on purpose. Anything unrecognised still raises the
 * alarm: erring towards waking people is the safe direction, and a false alarm
 * costs far less than a missed one.
 */
const LOW_BATTERY = [
  /bater[ií]a\s*baja/i,
  /low\s*batt/i,
  /batt(?:ery)?\s*low/i,
  /\bbat\.?\s*(?:low|baja)\b/i,
  /pila\s*baja/i,
];

export function isLowBattery(body: string | null): boolean {
  if (!body) return false;
  return LOW_BATTERY.some((pattern) => pattern.test(body));
}

/**
 * Pull a position out of an SMS body.
 *
 * Devices send this three ways: a bare pair, a labelled pair, or a maps link.
 * All three end up as two decimal numbers, so one pattern covers them — with a
 * decimal point required on both, which is what stops a phone number or a
 * device serial being read as a coordinate.
 *
 * Dormant while the bridge is voice-only: no Spanish number can receive an SMS
 * (tech-spec §3). Kept because the day one can, this is already right.
 */
export function parseLocation(body: string | null): { lat: number; lon: number } | null {
  if (!body) return null;

  // Ordered most specific first. A maps URL usually also carries a zoom level
  // and sometimes a place id, either of which the looser patterns would happily
  // read as half a coordinate.
  const query = body.match(/[?&]q=(-?\d{1,3}\.\d+)[,%2C\s]+(-?\d{1,3}\.\d+)/i) ??
    body.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/) ??
    body.match(/lat\w*\s*[:=]?\s*(-?\d{1,3}\.\d+)\D{0,12}?(-?\d{1,3}\.\d+)/i) ??
    body.match(/(-?\d{1,3}\.\d+)\s*[,;]\s*(-?\d{1,3}\.\d+)/);
  if (!query) return null;

  const lat = Number(query[1]);
  const lon = Number(query[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/**
 * If the message happens to name a category, use it; otherwise don't be clever.
 *
 * Quiet categories are deliberately not matchable. A device has one button and
 * no way to mean "this isn't urgent", so a body that happens to contain the
 * word *ayuda* must not silence an alarm nobody can hear.
 */
export function pickCategory(config: Config, body: string | null): string {
  if (!body) return DEFAULT_CATEGORY;
  const haystack = body.toLowerCase();
  const named = config.categories.find((c) =>
    c.urgency !== "quiet" &&
    new RegExp(`\\b${c.id.toLowerCase()}\\b`).test(haystack)
  );
  return named?.id ?? DEFAULT_CATEGORY;
}

export interface InboundDeps {
  config: Config;
  store: Store;
  alerts: AlertService;
}

/** What the bridge learned. `body` is always null on a call. */
export interface Inbound {
  channel: BridgeChannel;
  /** As the supplier reported it; normalised and validated here. */
  from: string;
  body: string | null;
}

/**
 * Turn an authenticated inbound contact into an alert.
 *
 * Callers must have verified the request before reaching this. Everything here
 * assumes the contact is genuine.
 */
export async function handleInbound(
  deps: InboundDeps,
  at: Date,
  inbound: Inbound,
): Promise<void> {
  const { channel, body } = inbound;
  const from = normaliseMsisdn(inbound.from ?? "");

  if (!MSISDN.test(from)) {
    console.warn(`Bridge: ${channel} with an unusable caller "${inbound.from}"`);
    return;
  }

  const device = await deps.store.getDevice(from);

  // An unregistered number never reaches the group — otherwise the alarm is
  // raisable by anyone who guesses the number — but it is never dropped either.
  // It lands in the panel inbox, which is how a household actually joins:
  // someone presses the new pendant in the kitchen and it appears in the panel
  // to be named. No message goes out: there is no one to send it to, only the
  // group, and an unregistered number is exactly what must not reach the group.
  if (!device) {
    await deps.store.noteInbound(from, channel, body, at);
    console.log(`Bridge: unregistered ${channel} from ${from} — noted in the panel inbox`);
    return;
  }

  // Proof of life. This is the only evidence the system will ever get that a
  // shop-bought device still works — they send no heartbeat and no telemetry —
  // so it is recorded for a low-battery SMS too: that message travelled the
  // whole path, which is exactly what a test is trying to establish.
  await deps.store.putDevice({ ...device, lastProvenAt: at.toISOString() });

  // A low-battery text is proof the device works (its lastProvenAt is already
  // recorded above) but is not an emergency, so it must not wake the group. It
  // stops here. The maintenance signal is left to the panel, where the device's
  // freshly updated proof-of-life is what a household actually acts on.
  if (isLowBattery(body)) {
    console.log(`Bridge: low-battery text from ${device.label} (${device.address}) — not an alarm`);
    return;
  }

  const result = await deps.alerts.raiseAlert({
    source: "device",
    category: pickCategory(deps.config, body),
    reporterRef: from,
    reporterName: device.label,
    reporterAddress: device.address,
    reporterKind: device.kind,
  });

  // A GPS pendant's SMS usually lands a second behind its call, so this often
  // attaches to an incident the call already raised. That is the intended
  // shape: the pin refines the address, it doesn't replace it.
  const position = parseLocation(body);
  if (position) {
    await deps.alerts.attachLocation(result.incident.id, position.lat, position.lon);
  }
}
