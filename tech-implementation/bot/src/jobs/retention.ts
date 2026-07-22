// Retention.
//
// Spec §4: incidents are kept for 12 months, then deleted. This is a legal
// duty, not housekeeping — so it runs on a schedule rather than waiting for
// someone to remember, and it logs what it did.

import type { Store } from "../store/types.ts";

export function cutoffFor(retentionDays: number, now: Date = new Date()): string {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
}

/**
 * How long an unregistered number sits in the bridge inbox.
 *
 * Far shorter than the incident retention, because the justification is far
 * thinner: an incident is a record of something that happened to the village,
 * while an inbox row is a phone number belonging to someone who may simply have
 * misdialled. Thirty days is long enough for a coordinator to get to it and
 * finish an install, and no longer.
 */
export const INBOX_RETENTION_DAYS = 30;

export async function purgeExpiredIncidents(
  store: Store,
  retentionDays: number,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = cutoffFor(retentionDays, now);
  const deleted = await store.purgeIncidentsBefore(cutoff);
  console.log(`Retention: deleted ${deleted} incident(s) created before ${cutoff}`);

  const inboxCutoff = cutoffFor(INBOX_RETENTION_DAYS, now);
  const dropped = await store.purgeInboxBefore(inboxCutoff);
  console.log(
    `Retention: deleted ${dropped} unregistered caller(s) last seen before ${inboxCutoff}`,
  );

  return deleted;
}
