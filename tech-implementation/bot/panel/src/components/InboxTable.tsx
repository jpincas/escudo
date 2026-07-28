import type { InboxEntry } from "../api/types.ts";
import { formatDateTimeInZone } from "../format.ts";
import { useLocale, useStrings } from "../i18n/context.tsx";
import { useVillage } from "../village-context.tsx";

/**
 * The Inbox table (spec 2026-07-27 §7.1): every unregistered caller, newest
 * first — exactly the order Store.listInbox() already returns, never
 * re-sorted here (unlike DeviceTable.tsx, which re-sorts by label: the whole
 * point of this list is "the number that just rang is the one being
 * registered", spec's own words for listInbox()).
 */
export function InboxTable({ entries, onRegister, onDismiss }: {
  entries: InboxEntry[];
  onRegister: (entry: InboxEntry) => void;
  onDismiss: (entry: InboxEntry) => void;
}) {
  const s = useStrings();
  const locale = useLocale();
  const { timezone } = useVillage();
  const c = s.inbox.columns;

  return (
    <table className="inbox-table">
      <thead>
        <tr>
          <th>{c.msisdn}</th>
          <th>{c.count}</th>
          <th>{c.firstSeen}</th>
          <th>{c.lastSeen}</th>
          <th>{c.channel}</th>
          <th>{c.lastBody}</th>
          <th>{c.actions}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.msisdn}>
            <td>{entry.msisdn}</td>
            <td>{entry.count}</td>
            <td>{formatDateTimeInZone(entry.firstSeenAt, locale, timezone)}</td>
            <td>{formatDateTimeInZone(entry.lastSeenAt, locale, timezone)}</td>
            <td>{s.inbox.channel[entry.lastVia]}</td>
            {/* Often names the device's manufacturer (spec §7.1) — shown in
                full, never truncated, since that's exactly the text a
                coordinator reads to work out what they're looking at. */}
            <td className="inbox-table__body">{entry.lastBody ?? ""}</td>
            {/* The flex row lives on an inner <div>, not the <td> itself
                (review 2026-07-28, F3): a table-cell with display:flex stops
                being laid out as a table cell at all, so it no longer
                stretches to the row's real height once a sibling cell (the
                message body, above) wraps to more than one line — visible as
                a short, misaligned border and off-centre buttons on exactly
                the row §7.1 exists for. The <td> keeps its ordinary
                table-cell display; only the wrapper arranges the buttons. */}
            <td>
              <div className="inbox-table__actions">
                <button type="button" onClick={() => onRegister(entry)}>
                  {s.inbox.register}
                </button>
                <button
                  type="button"
                  className="button--danger-text"
                  onClick={() => onDismiss(entry)}
                >
                  {s.inbox.dismiss}
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
