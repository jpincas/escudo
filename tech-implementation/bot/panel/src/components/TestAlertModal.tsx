import { useEffect, useState } from "react";
import { previewAlert, sendTestAlert } from "../api/client.ts";
import type { Device } from "../api/types.ts";
import { fmt, strings } from "../strings.ts";

interface TestAlertModalProps {
  device: Device;
  /** Category ids the village has configured, for the picker. */
  categories: string[];
  onClose: () => void;
}

/**
 * Raise an alert as a registered device, for testing.
 *
 * Deliberately two steps. Opening it only ever previews — rendered by the
 * server through the same function the group message goes through, so what is
 * shown is what would be sent. Nothing leaves the building until the second
 * button is pressed.
 *
 * The warning is not boilerplate. The group receives an ordinary alert with
 * nothing marking it as practice, because an alert that announces itself as a
 * drill tests nothing about how people react to a real one — which does mean
 * neighbours may put their boots on.
 */
export function TestAlertModal({ device, categories, onClose }: TestAlertModalProps) {
  const s = strings.testAlert;
  const [category, setCategory] = useState(categories[0] ?? "emergencia");
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    previewAlert(device.msisdn, category)
      .then((text) => !cancelled && setPreview(text))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [device.msisdn, category]);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await sendTestAlert(device.msisdn, category);
      setResult(res.status === "duplicate" ? s.duplicate : s.sent);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{s.heading}</h2>
        <p>{fmt(s.intro, { label: device.label })}</p>

        {/* The rendered message, shown as Telegram would show it. */}
        <div
          className="test-alert__preview"
          dangerouslySetInnerHTML={{ __html: preview ?? "" }}
        />
        {preview === null && !error && <p className="muted">{s.loading}</p>}

        <label>
          {s.category}
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>

        <p className="test-alert__warning">⚠️ {s.warning}</p>

        {error && <p className="form-error">{error}</p>}
        {result && <p className="test-alert__result">{result}</p>}

        <div className="modal__actions">
          <button type="button" onClick={onClose}>{s.cancel}</button>
          <button
            type="button"
            className="button--danger"
            disabled={sending || result !== null}
            onClick={send}
          >
            {sending ? s.sending : s.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
