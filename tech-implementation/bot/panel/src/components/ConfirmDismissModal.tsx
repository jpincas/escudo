import { useState } from "react";
import { ApiError } from "../api/client.ts";
import type { InboxEntry } from "../api/types.ts";
import { useStrings } from "../i18n/context.tsx";
import { t } from "../i18n/mod.ts";
import { Modal } from "./Modal.tsx";

interface ConfirmDismissModalProps {
  entry: InboxEntry;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/**
 * Mirrors ConfirmDeleteModal.tsx — dismiss is the inbox's own irreversible
 * removal (spec 2026-07-27 §7.2: "for a wrong number or a misdial"), so it
 * gets the same "name the specific thing, then confirm" shape rather than a
 * generic "Are you sure?". Unlike deleting a device, dismissing creates
 * nothing and removes nothing that could raise an alarm — but the row itself
 * is still gone for good, so it isn't a bare, unconfirmed click either.
 */
export function ConfirmDismissModal({ entry, onConfirm, onClose }: ConfirmDismissModalProps) {
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
    <Modal title={s.dismissConfirm.heading} onClose={onClose}>
      <p className="delete-confirm__body">
        {t(s.dismissConfirm.body, { msisdn: entry.msisdn })}
      </p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="modal-actions">
        <button type="button" onClick={onClose} disabled={busy}>
          {s.dismissConfirm.cancel}
        </button>
        <button type="button" className="button--danger" onClick={handleConfirm} disabled={busy}>
          {busy ? s.dismissConfirm.dismissing : s.dismissConfirm.confirm}
        </button>
      </div>
    </Modal>
  );
}
