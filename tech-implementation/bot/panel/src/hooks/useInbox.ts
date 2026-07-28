// Owns the bridge inbox list and its two mutations. Modelled directly on
// useDevices.ts's load/state shape — register and dismiss both update the
// in-memory list themselves rather than re-fetching, the same reasoning
// useDevices.ts's own mutations give: a coordinator acting on one row
// shouldn't wait on a second round trip to see it disappear.
//
// Mounted once, in InboxProvider (see ../inbox-context.tsx), and shared by
// the sidebar's waiting-count badge and the Inbox screen's own list — see
// that file's header for why both must read the same state rather than
// each fetching its own copy.
//
// Review 2026-07-28, F1: mounting once is also why this needs its own
// freshness story that useDevices.ts never had to solve. useDevices is
// re-instantiated every time DevicesScreen mounts, so simply opening that
// screen always re-fetches; this hook lives for the life of the signed-in
// Shell, so nothing else was ever re-fetching it. `refresh` below (used both
// by the background poll and by InboxScreen's own on-mount effect — see that
// component) covers the case spec §7 is actually about: a coordinator
// standing in the kitchen with the panel already open, watching the sidebar
// rather than navigating away and back.
//
// Review 2026-07-28, F1' (closure review): the first version of `refresh`
// applied its response unconditionally, so a poll GET issued before a
// register/dismiss could land afterwards and silently resurrect the row the
// coordinator just dealt with — reproduced live: a dismissed entry
// reappeared, badge included, for up to one poll interval. Fixed with a
// generation counter, the identical shape useIncidentHistory.ts already uses
// for the same class of race (rapid Next/Prev there; a mutation racing a
// poll here): capture the counter when a fetch starts, bump it on every
// state-changing event, and discard the fetch's response if the counter
// moved while it was on the wire. The response is dropped, not raced harder
// and not prevented by slowing the poll down — either of those still leaves
// a window, just a different-sized one.

import { useCallback, useEffect, useRef, useState } from "react";
import { dismissInboxEntry, fetchInbox, registerFromInbox } from "../api/client.ts";
import type { Device, InboxEntry, RegisterFromInbox } from "../api/types.ts";

type InboxState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; entries: InboxEntry[] };

/**
 * How often the shared inbox state polls for new arrivals while the panel
 * is open (review F1). A window-focus listener was considered and rejected:
 * the scenario this is for is a coordinator's tab that never loses focus —
 * they're standing in front of it, not switching away and back — so only a
 * plain interval actually helps. Cheap enough to run in the background:
 * listInbox() is a single, unpaged read at village scale, the same one the
 * Inbox screen's own manual reload already does.
 */
const POLL_INTERVAL_MS = 15_000;

export function useInbox(): {
  state: InboxState;
  reload: () => void;
  refresh: () => void;
  register: (msisdn: string, body: RegisterFromInbox) => Promise<Device>;
  dismiss: (msisdn: string) => Promise<void>;
} {
  const [state, setState] = useState<InboxState>({ status: "loading" });

  // Bumped by every state-changing event — an explicit `load`, or a
  // register/dismiss landing — and checked before ANY fetch response
  // (load's or refresh's) is applied. A response whose captured generation
  // no longer matches the live counter started before the event that made
  // it stale and must be discarded outright, never merged or reconciled
  // (review F1').
  const generationRef = useRef(0);

  // Whether a `refresh()` fetch is currently on the wire — poll ticks and
  // InboxScreen's own on-mount refresh both call the same function, and
  // this stops two of them ever running concurrently (review F1': "guard
  // against overlapping polls"). `load` doesn't consult this: it's the one
  // deliberate, user-visible fetch (the provider's first-ever load, or the
  // ErrorView retry button), never skipped.
  const refreshInFlightRef = useRef(false);

  const load = useCallback(() => {
    const generation = ++generationRef.current;
    setState({ status: "loading" });
    fetchInbox()
      .then((entries) => {
        if (generationRef.current !== generation) return; // superseded — drop it
        setState({ status: "loaded", entries });
      })
      .catch((err) => {
        if (generationRef.current !== generation) return;
        setState({ status: "error", message: String(err) });
      });
  }, []);

  // The silent counterpart, used for the background poll and for
  // InboxScreen's own on-mount refresh (never `load` — see that component's
  // header for why: `load` blanks the screen and the sidebar badge back to
  // a loading state, which is exactly the flash review F3' reported).
  // Skips outright if another `refresh()` is already in flight, and — like
  // `load` — discards its response if the generation moved while it was on
  // the wire, rather than applying it regardless.
  const refresh = useCallback(() => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    const generation = generationRef.current;
    fetchInbox()
      .then((entries) => {
        if (generationRef.current !== generation) return; // superseded — drop it
        setState({ status: "loaded", entries });
      })
      .catch(() => {}) // a silent refresh's own failure is never surfaced
      .finally(() => {
        refreshInFlightRef.current = false;
      });
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // Errors from these two are deliberately NOT caught here — the calling
  // modal needs the ApiError message to show against its own form/prompt,
  // so it must propagate rather than land in this hook's own error state.

  const register = useCallback(async (msisdn: string, body: RegisterFromInbox) => {
    const device = await registerFromInbox(msisdn, body);
    // Invalidate any load/refresh already in flight before this landed —
    // see generationRef's own comment above for the race this closes.
    generationRef.current++;
    setState((prev) =>
      prev.status === "loaded"
        ? { status: "loaded", entries: prev.entries.filter((e) => e.msisdn !== msisdn) }
        : prev
    );
    return device;
  }, []);

  const dismiss = useCallback(async (msisdn: string) => {
    await dismissInboxEntry(msisdn);
    generationRef.current++;
    setState((prev) =>
      prev.status === "loaded"
        ? { status: "loaded", entries: prev.entries.filter((e) => e.msisdn !== msisdn) }
        : prev
    );
  }, []);

  return { state, reload: load, refresh, register, dismiss };
}
