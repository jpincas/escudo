// The core: an alert happened → post it, log it, let it be cancelled.
//
// This module knows nothing about Telegram, and nothing about phones. It talks
// to a Notifier, which the Telegram layer implements. That is the whole reason
// it exists: the Twilio bridge calls raiseAlert() with source "device" and a
// registered household, and every rule below — dedupe, formatting, cancellation
// authority, the incident log, retention — applies unchanged.

import type { Config } from "./config.ts";
import { formatAlert, formatLocationCaption, isQuiet } from "./format.ts";
import type { Incident, IncidentSource, Store } from "./store/types.ts";

/** How an alert reaches people. Implemented by src/telegram/notifier.ts. */
export interface Notifier {
  /**
   * Posts the alert and returns the message id, so it can be edited later.
   * `quiet` sends without notification — see Category.urgency.
   */
  postAlert(text: string, incidentId: string, quiet: boolean): Promise<number>;
  /** Rewrites an existing alert (used when cancelling) and drops its buttons. */
  updateAlert(messageId: number, text: string): Promise<void>;
  /** Drops a native map pin, threaded under the alert. */
  postLocation(replyToMessageId: number, lat: number, lon: number, caption: string): Promise<void>;
}

export interface RaiseInput {
  source: IncidentSource;
  category: string;
  /** Telegram user id, or the E.164 number a bridge alert arrived from. */
  reporterRef: string;
  reporterName: string;
  /** Street address of a registered device. Omitted for Telegram alerts. */
  reporterAddress?: string | null;
  /** Device kind, for the icon on the alert. Absent for Telegram alerts. */
  reporterKind?: import("./store/types.ts").DeviceKind | null;
  /** Name of the admin who raised this from the panel, if anyone did. */
  simulatedBy?: string | null;
}

export type RaiseResult =
  | { status: "raised"; incident: Incident }
  /** A press that landed inside the dedupe window; nothing was posted. */
  | { status: "duplicate"; incident: Incident };

export type CancelResult =
  | { status: "cancelled"; incident: Incident }
  | { status: "not_found" }
  | { status: "already_cancelled"; incident: Incident }
  | { status: "forbidden"; incident: Incident };

/**
 * Time-ordered id: base36 milliseconds + random suffix. Sortable, so KV range
 * scans come back newest-first without a separate sort, and collisions between
 * two presses in the same millisecond are handled by the suffix.
 */
export function newIncidentId(now: Date): string {
  const stamp = now.getTime().toString(36).padStart(9, "0");
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${stamp}-${suffix}`;
}

export class AlertService {
  constructor(
    private config: Config,
    private store: Store,
    private notifier: Notifier,
    /** Injectable for tests; production passes nothing. */
    private now: () => Date = () => new Date(),
  ) {}

  /**
   * Raise an alert. Posts to the group and logs the incident.
   *
   * Double-tap guard: a second press by the same person in the same category
   * inside `alerts.dedupe_seconds` returns the open incident instead of posting
   * again. Elders panic-press and hands shake; two alerts for one emergency
   * split the response.
   */
  async raiseAlert(input: RaiseInput): Promise<RaiseResult> {
    const open = await this.store.findOpenIncident(input.reporterRef, input.category);
    if (open) {
      const ageSeconds = (this.now().getTime() - new Date(open.createdAt).getTime()) / 1000;
      if (ageSeconds < this.config.alerts.dedupeSeconds) {
        return { status: "duplicate", incident: open };
      }
    }

    const createdAt = this.now();
    const incident: Incident = {
      id: newIncidentId(createdAt),
      source: input.source,
      category: input.category,
      reporterRef: input.reporterRef,
      reporterName: input.reporterName,
      reporterAddress: input.reporterAddress ?? null,
      reporterKind: input.reporterKind ?? null,
      simulatedBy: input.simulatedBy ?? null,
      groupMessageId: null,
      lat: null,
      lon: null,
      createdAt: createdAt.toISOString(),
      cancelledAt: null,
      cancelledBy: null,
    };

    // Log before posting: if the post fails we still have the record, and a
    // retry can find it. The reverse order can lose the incident entirely.
    await this.store.putIncident(incident);

    const messageId = await this.notifier.postAlert(
      formatAlert(this.config, incident),
      incident.id,
      isQuiet(this.config, incident.category),
    );
    incident.groupMessageId = messageId;
    await this.store.putIncident(incident);

    return { status: "raised", incident };
  }

  /** Attach a shared location to an alert and drop a map pin under it. */
  async attachLocation(incidentId: string, lat: number, lon: number): Promise<Incident | null> {
    const incident = await this.store.getIncident(incidentId);
    if (!incident || incident.cancelledAt) return null;

    incident.lat = lat;
    incident.lon = lon;
    await this.store.putIncident(incident);

    if (incident.groupMessageId !== null) {
      await this.notifier.postLocation(
        incident.groupMessageId,
        lat,
        lon,
        formatLocationCaption(this.config, incident),
      );
    }
    return incident;
  }

  /**
   * Cancel an alert. Permitted to whoever raised it, or to any group admin —
   * the person who fell may not be the person who can reach a phone afterwards.
   */
  async cancelAlert(
    incidentId: string,
    byRef: string,
    isAdmin: boolean,
  ): Promise<CancelResult> {
    const incident = await this.store.getIncident(incidentId);
    if (!incident) return { status: "not_found" };
    if (incident.cancelledAt) return { status: "already_cancelled", incident };
    if (!isAdmin && incident.reporterRef !== byRef) return { status: "forbidden", incident };

    incident.cancelledAt = this.now().toISOString();
    incident.cancelledBy = byRef;
    await this.store.putIncident(incident);

    if (incident.groupMessageId !== null) {
      await this.notifier.updateAlert(
        incident.groupMessageId,
        formatAlert(this.config, incident),
      );
    }
    return { status: "cancelled", incident };
  }

  /** The most recent alert this person raised that is still open, if any. */
  async latestOpenFor(reporterRef: string): Promise<Incident | null> {
    const candidates = await Promise.all(
      this.config.categories.map((c) => this.store.findOpenIncident(reporterRef, c.id)),
    );
    return candidates
      .filter((i): i is Incident => i !== null)
      .sort((a, b) => (a.id < b.id ? 1 : -1))[0] ?? null;
  }
}
