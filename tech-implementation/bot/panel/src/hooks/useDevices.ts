// Owns the device list and the three mutations against it. Mutations return
// the updated record (or throw) rather than reloading the whole list — a
// coordinator adding a device during an active situation shouldn't have to
// wait on a second round trip to see it appear.

import { useCallback, useEffect, useState } from "react";
import { createDevice, deleteDevice, listDevices, updateDevice } from "../api/client.ts";
import type { Device, DeviceEdit, NewDevice } from "../api/types.ts";

type DevicesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; devices: Device[] };

export function useDevices(): {
  state: DevicesState;
  reload: () => void;
  addDevice: (body: NewDevice) => Promise<Device>;
  editDevice: (msisdn: string, body: DeviceEdit) => Promise<Device>;
  removeDevice: (msisdn: string) => Promise<void>;
} {
  const [state, setState] = useState<DevicesState>({ status: "loading" });

  const load = useCallback(() => {
    setState({ status: "loading" });
    listDevices()
      .then((devices) => setState({ status: "loaded", devices }))
      .catch((err) => setState({ status: "error", message: String(err) }));
  }, []);

  useEffect(load, [load]);

  // Errors from these three are deliberately NOT caught here — the calling
  // form needs the ApiError message to show next to the field it concerns,
  // so it must propagate rather than land in this hook's own error state.

  const addDevice = useCallback(async (body: NewDevice) => {
    const created = await createDevice(body);
    setState((prev) =>
      prev.status === "loaded" ? { status: "loaded", devices: [...prev.devices, created] } : prev
    );
    return created;
  }, []);

  const editDevice = useCallback(async (msisdn: string, body: DeviceEdit) => {
    const updated = await updateDevice(msisdn, body);
    setState((prev) =>
      prev.status === "loaded"
        ? {
          status: "loaded",
          devices: prev.devices.map((d) => (d.msisdn === msisdn ? updated : d)),
        }
        : prev
    );
    return updated;
  }, []);

  const removeDevice = useCallback(async (msisdn: string) => {
    await deleteDevice(msisdn);
    setState((prev) =>
      prev.status === "loaded"
        ? { status: "loaded", devices: prev.devices.filter((d) => d.msisdn !== msisdn) }
        : prev
    );
  }, []);

  return { state, reload: load, addDevice, editDevice, removeDevice };
}
