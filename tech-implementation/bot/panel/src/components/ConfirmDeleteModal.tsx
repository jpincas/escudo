import { useState } from "react";
import { ApiError } from "../api/client.ts";
import type { Device } from "../api/types.ts";
import { useStrings } from "../i18n/context.tsx";
import { t } from "../i18n/mod.ts";
import { Modal } from "./Modal.tsx";

interface ConfirmDeleteModalProps {
  device: Device;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/**
 * Names the device's own label in the prompt rather than a generic "Are you
 * sure?" — deleting this removes a household's ability to raise an alarm,
 * so the admin should be reading the specific name they're about to cut off.
 */
export function ConfirmDeleteModal({ device, onConfirm, onClose }: ConfirmDeleteModalProps) {
  const s = useStrings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : s.genericError);
      setBusy(false);
    }
  }

  return (
    <Modal title={s.deleteConfirm.heading} onClose={onClose}>
      <p className="delete-confirm__body">
        {t(s.deleteConfirm.body, { label: device.label })}
      </p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="modal-actions">
        <button type="button" onClick={onClose} disabled={busy}>
          {s.deleteConfirm.cancel}
        </button>
        <button type="button" className="button--danger" onClick={handleConfirm} disabled={busy}>
          {busy ? s.deleteConfirm.deleting : s.deleteConfirm.confirm}
        </button>
      </div>
    </Modal>
  );
}
