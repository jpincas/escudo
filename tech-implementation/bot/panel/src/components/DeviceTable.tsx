import { useMemo } from "react";
import type { Device } from "../api/types.ts";
import { formatDateTime } from "../format.ts";
import { useLocale, useStrings } from "../i18n/context.tsx";
import { StatusBadge } from "./StatusBadge.tsx";

interface DeviceTableProps {
  devices: Device[];
  onEdit: (device: Device) => void;
  onDelete: (device: Device) => void;
  onTest: (device: Device) => void;
}

export function DeviceTable({ devices, onEdit, onDelete, onTest }: DeviceTableProps) {
  const s = useStrings();
  const locale = useLocale();

  // Sorted by label, not registration order — that's how a coordinator
  // scanning a printed or on-screen list finds a household, by name. Collated
  // as Spanish regardless of the admin's own locale: the labels themselves
  // are village names, which are Spanish either way.
  const sorted = useMemo(
    () => [...devices].sort((a, b) => a.label.localeCompare(b.label, "es")),
    [devices],
  );

  const c = s.devices.columns;

  return (
    <table className="device-table">
      <thead>
        <tr>
          <th>{c.label}</th>
          <th>{c.address}</th>
          <th>{c.msisdn}</th>
          <th>{c.kind}</th>
          <th>{c.status}</th>
          <th>{c.lastProvenAt}</th>
          <th>{c.actions}</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((device) => (
          <tr key={device.msisdn}>
            <td>{device.label}</td>
            <td>{device.address}</td>
            <td>{device.msisdn}</td>
            <td>{s.devices.kind[device.kind]}</td>
            <td>
              <StatusBadge status={device.status} />
            </td>
            <td>
              {device.lastProvenAt
                ? formatDateTime(device.lastProvenAt, locale)
                : s.devices.status.never}
            </td>
            <td className="device-table__actions">
              <button type="button" onClick={() => onTest(device)}>
                {s.testAlert.action}
              </button>
              <button type="button" onClick={() => onEdit(device)}>
                {s.devices.edit}
              </button>
              <button
                type="button"
                className="button--danger-text"
                onClick={() => onDelete(device)}
              >
                {s.devices.delete}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
