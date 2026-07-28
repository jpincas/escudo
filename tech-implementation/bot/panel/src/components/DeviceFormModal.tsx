import { type FormEvent, useState } from "react";
import { ApiError } from "../api/client.ts";
import type {
  Device,
  DeviceEdit,
  DeviceKind,
  NewDevice,
  RegisterFromInbox,
} from "../api/types.ts";
import { useStrings } from "../i18n/context.tsx";
import { Modal } from "./Modal.tsx";

// Fixed rather than derived from Strings: the set of kinds and their order
// (matches the backend's own KINDS in src/panel/api.ts) doesn't change with
// locale — only each kind's label does, read from `s.devices.kind` at render.
const KIND_OPTIONS: DeviceKind[] = ["base", "wearable", "phone", "alarm", "other"];

// A bare structural check, not a substitute for the backend's own validation
// (which is what actually decides whether a number is acceptable) — this
// only stops an obviously malformed number from making a round trip.
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

// Discriminated on `mode` so each branch gets its own `onSubmit` shape:
// adding sends the full NewDevice (msisdn included), editing sends only the
// mutable fields, and registering from the inbox (spec 2026-07-27 §7.2)
// sends the same shape as editing plus the msisdn separately — it's the path
// param of POST /inbox/:msisdn/register, not a body field, so there is
// exactly one number this submission can possibly act on (see
// src/panel/api.ts). Keeps the "msisdn is not editable" rule enforced by the
// type system, not just by the read-only input below.
type DeviceFormModalProps =
  | { mode: "add"; onSubmit: (values: NewDevice) => Promise<Device>; onClose: () => void }
  | {
    mode: "edit";
    device: Device;
    onSubmit: (values: DeviceEdit) => Promise<Device>;
    onClose: () => void;
  }
  | {
    mode: "register";
    /** The number that reached the bridge — pre-filled, never editable: this
     *  is a shortcut into the ordinary add-device path for a number that's
     *  already known, not a second way to type one in. */
    msisdn: string;
    onSubmit: (values: RegisterFromInbox) => Promise<Device>;
    onClose: () => void;
  };

export function DeviceFormModal(props: DeviceFormModalProps) {
  const s = useStrings();
  const { onClose } = props;
  const device = props.mode === "edit" ? props.device : undefined;

  // The one field every mode handles differently: editable only in "add".
  const readonlyMsisdn = props.mode === "edit"
    ? props.device.msisdn
    : props.mode === "register"
    ? props.msisdn
    : null;

  const [msisdn, setMsisdn] = useState(device?.msisdn ?? "");
  const [label, setLabel] = useState(device?.label ?? "");
  const [address, setAddress] = useState(device?.address ?? "");
  const [kind, setKind] = useState<DeviceKind>(device?.kind ?? "base");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (props.mode === "edit" || props.mode === "register") {
        await props.onSubmit({ label, address, kind });
      } else {
        await props.onSubmit({ msisdn, label, address, kind });
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : s.genericError);
      setSubmitting(false);
    }
  }

  const title = props.mode === "edit"
    ? s.form.editTitle
    : props.mode === "register"
    ? s.form.registerTitle
    : s.form.addTitle;

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="device-msisdn">{s.form.msisdn}</label>
          {readonlyMsisdn !== null
            ? (
              // Fixed for this submission — reads as plain text so it's
              // never mistaken for an editable field.
              <p className="form-field__readonly" id="device-msisdn">{readonlyMsisdn}</p>
            )
            : (
              <>
                <input
                  id="device-msisdn"
                  type="tel"
                  required
                  pattern={E164_PATTERN.source}
                  placeholder="+34600111222"
                  value={msisdn}
                  onChange={(e) => setMsisdn(e.target.value)}
                />
                <p className="form-field__help">{s.form.msisdnHelp}</p>
              </>
            )}
        </div>

        <div className="form-field">
          <label htmlFor="device-label">{s.form.label}</label>
          <input
            id="device-label"
            type="text"
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <p className="form-field__help">{s.form.labelHelp}</p>
        </div>

        <div className="form-field">
          <label htmlFor="device-address">{s.form.address}</label>
          <input
            id="device-address"
            type="text"
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <p className="form-field__help">{s.form.addressHelp}</p>
        </div>

        <div className="form-field">
          <label htmlFor="device-kind">{s.form.kind}</label>
          <select
            id="device-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as DeviceKind)}
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {s.devices.kind[k]}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={submitting}>
            {s.form.cancel}
          </button>
          <button type="submit" className="button--primary" disabled={submitting}>
            {submitting ? s.form.saving : s.form.save}
          </button>
        </div>
      </form>
    </Modal>
  );
}
