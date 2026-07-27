import { useState } from "react";
import type { Device } from "../api/types.ts";
import { useDevices } from "../hooks/useDevices.ts";
import { useStrings } from "../i18n/context.tsx";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal.tsx";
import { DeviceFormModal } from "./DeviceFormModal.tsx";
import { DeviceTable } from "./DeviceTable.tsx";
import { ErrorView } from "./ErrorView.tsx";
import { LoadingView } from "./LoadingView.tsx";
import { TestAlertModal } from "./TestAlertModal.tsx";

/**
 * Categories a test alert can be raised as.
 *
 * Hard-coded rather than fetched: the panel has no categories endpoint, and a
 * device press always raises the generic one in real life anyway (tech-spec §2)
 * — the others exist here so a coordinator can see how each renders.
 */
const CATEGORIES = ["emergencia", "fuego", "medico", "delito"];

/** The Devices section: the roster of alert devices for this village. Village
 *  name and signed-in admin now live in the sidebar (see Shell.tsx), so this
 *  screen only needs its own heading and toolbar. */
export function DevicesScreen() {
  const s = useStrings();
  const { state, reload, addDevice, editDevice, removeDevice } = useDevices();

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState<Device | null>(null);
  const [testing, setTesting] = useState<Device | null>(null);

  return (
    <div className="devices-screen">
      <header className="app-header">
        <h1>{s.devices.heading}</h1>
      </header>

      <div className="devices-screen__toolbar">
        <button type="button" className="button--primary" onClick={() => setShowAdd(true)}>
          {s.devices.add}
        </button>
      </div>

      {state.status === "loading" && <LoadingView />}

      {state.status === "error" && <ErrorView message={state.message} onRetry={reload} />}

      {state.status === "loaded" && state.devices.length === 0 && (
        <div className="empty-state">
          <h2>{s.devices.empty.heading}</h2>
          <p>{s.devices.empty.body}</p>
        </div>
      )}

      {state.status === "loaded" && state.devices.length > 0 && (
        <DeviceTable
          devices={state.devices}
          onEdit={setEditing}
          onDelete={setDeleting}
          onTest={setTesting}
        />
      )}

      {showAdd && (
        <DeviceFormModal
          mode="add"
          onSubmit={(body) => addDevice(body)}
          onClose={() => setShowAdd(false)}
        />
      )}

      {editing && (
        <DeviceFormModal
          mode="edit"
          device={editing}
          onSubmit={(body) => editDevice(editing.msisdn, body)}
          onClose={() => setEditing(null)}
        />
      )}

      {testing && (
        <TestAlertModal
          device={testing}
          categories={CATEGORIES}
          onClose={() => setTesting(null)}
        />
      )}

      {deleting && (
        <ConfirmDeleteModal
          device={deleting}
          onConfirm={() => removeDevice(deleting.msisdn)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
