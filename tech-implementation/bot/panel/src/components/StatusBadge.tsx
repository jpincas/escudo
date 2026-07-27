import type { DeviceStatus } from "../api/types.ts";
import { useStrings } from "../i18n/context.tsx";

/**
 * `overdue` and `never` are exactly what a coordinator scans this table for,
 * so they carry the alarm colour — the one place in the panel outside the
 * delete confirm where rojo alarma is used, and only because it's a genuine
 * "this household may be uncovered" signal, not decoration.
 */
export function StatusBadge({ status }: { status: DeviceStatus }) {
  const s = useStrings();
  return (
    <span className={`status-badge status-badge--${status}`}>{s.devices.status[status]}</span>
  );
}
