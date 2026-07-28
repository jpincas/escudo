import type { Incident } from "../api/types.ts";
import { formatDateTimeInZone } from "../format.ts";
import { t } from "../i18n/mod.ts";
import { useLocale, useStrings } from "../i18n/context.tsx";
import { useVillage } from "../village-context.tsx";

/** A plain link to the shared pin — no map embed, no API key, just the
 *  coordinates a responder needs to actually get there. */
function mapsLink(lat: number, lon: number): string {
  return `https://www.google.com/maps?q=${lat},${lon}`;
}

/**
 * The History table (spec 2026-07-27 §6.1): every incident, newest first,
 * read-only. Mirrors DeviceTable.tsx's shape — a plain <table>, one row per
 * record, columns exactly as spec 6.1 lists them. No actions column: there is
 * nothing to do from here (§6.2 — "read-only. No editing, no deleting, no
 * cancelling from here").
 */
export function IncidentTable({ incidents }: { incidents: Incident[] }) {
  const s = useStrings();
  const locale = useLocale();
  const { timezone } = useVillage();
  const c = s.history.columns;

  return (
    <table className="incident-table">
      <thead>
        <tr>
          <th>{c.when}</th>
          <th>{c.category}</th>
          <th>{c.source}</th>
          <th>{c.who}</th>
          <th>{c.location}</th>
          <th>{c.drill}</th>
          <th>{c.cancelled}</th>
        </tr>
      </thead>
      <tbody>
        {incidents.map((incident) => (
          <tr key={incident.id}>
            <td>{formatDateTimeInZone(incident.createdAt, locale, timezone)}</td>
            <td>
              {incident.categoryEmoji} {incident.categoryLabel}
            </td>
            <td>{s.history.source[incident.source]}</td>
            <td>
              <div>{incident.reporterName}</div>
              {/* Address and kind are independent snapshotted fields (spec
                  6.1) — shown whichever are present, not only when both are,
                  so an address never depends on a sibling field existing
                  (review F3). */}
              {(incident.reporterKind || incident.reporterAddress) && (
                <div className="incident-table__detail">
                  {[
                    incident.reporterKind ? s.devices.kind[incident.reporterKind] : null,
                    incident.reporterAddress,
                  ]
                    .filter((part): part is string => Boolean(part))
                    .join(" · ")}
                </div>
              )}
            </td>
            <td>
              {incident.lat !== null && incident.lon !== null && (
                <a
                  href={mapsLink(incident.lat, incident.lon)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {s.history.locationLink}
                </a>
              )}
            </td>
            <td>
              {incident.simulatedBy && (
                <span className="incident-table__badge incident-table__badge--drill">
                  {t(s.history.drillBy, { name: incident.simulatedBy })}
                </span>
              )}
            </td>
            <td>
              {incident.cancelledAt && (
                <span className="incident-table__badge incident-table__badge--cancelled">
                  {t(s.history.cancelledAt, {
                    when: formatDateTimeInZone(incident.cancelledAt, locale, timezone),
                  })}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
