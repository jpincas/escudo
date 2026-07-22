import { useState } from "react";
import { ApiError } from "../api/client.ts";
import type { Device } from "../api/types.ts";
import { fmt, strings } from "../strings.ts";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : strings.genericError);
      setBusy(false);
    }
  }

  return (
    <Modal title={strings.deleteConfirm.heading} onClose={onClose}>
      <p className="delete-confirm__body">
        {fmt(strings.deleteConfirm.body, { label: device.label })}
      </p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="modal-actions">
        <button type="button" onClick={onClose} disabled={busy}>
          {strings.deleteConfirm.cancel}
        </button>
        <button type="button" className="button--danger" onClick={handleConfirm} disabled={busy}>
          {busy ? strings.deleteConfirm.deleting : strings.deleteConfirm.confirm}
        </button>
      </div>
    </Modal>
  );
}
