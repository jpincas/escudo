// Owns the single village profile row and its one mutation. Modelled on
// useDevices.ts, but there is exactly one record instead of a list: `save`
// replaces it wholesale (the backend has no PATCH for this — spec 3.2 is a
// single row, last write wins) and returns what was actually stored.

import { useCallback, useEffect, useState } from "react";
import { fetchVillageProfile, saveVillageProfile } from "../api/client.ts";
import type { VillageProfile, VillageProfileWrite } from "../api/types.ts";

type VillageProfileState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; profile: VillageProfile };

export function useVillageProfile(): {
  state: VillageProfileState;
  reload: () => void;
  save: (body: VillageProfileWrite) => Promise<VillageProfile>;
} {
  const [state, setState] = useState<VillageProfileState>({ status: "loading" });

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetchVillageProfile()
      .then((profile) => setState({ status: "loaded", profile }))
      .catch((err) => setState({ status: "error", message: String(err) }));
  }, []);

  useEffect(load, [load]);

  // Not caught here, same reasoning as useDevices.ts: the form needs the
  // ApiError itself (message + which field) to show against the exact input
  // that was wrong, so it must propagate rather than land in this hook.
  const save = useCallback(async (body: VillageProfileWrite) => {
    const saved = await saveVillageProfile(body);
    setState({ status: "loaded", profile: saved });
    return saved;
  }, []);

  return { state, reload: load, save };
}
