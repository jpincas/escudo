// Owns one page of the incident log at a time, plus stepping forward and back
// through it. Modelled on useDevices.ts's load/state shape, but there is no
// single list to hold in memory here — the whole point of §6 (spec
// 2026-07-27) is that the screen never fetches the full log, so this hook
// keeps only the cursors it has already visited (to make "back" free, without
// a second request) and the one page currently on screen.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchIncidents } from "../api/client.ts";
import type { Incident } from "../api/types.ts";

type IncidentHistoryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; incidents: Incident[]; nextCursor: string | null };

export function useIncidentHistory(): {
  state: IncidentHistoryState;
  hasPrev: boolean;
  hasNext: boolean;
  goPrev: () => void;
  goNext: () => void;
  reload: () => void;
} {
  // cursors[i] is what was passed to fetch page i; cursors[0] is always null
  // (the first page). pageIndex is which of those pages is on screen.
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [state, setState] = useState<IncidentHistoryState>({ status: "loading" });

  const cursor = cursors[pageIndex];

  // Rapid Next/Prev clicking fires several loads before earlier ones settle,
  // and network timing gives no guarantee they land in request order. A
  // generation counter — bumped per call, checked before the response is
  // applied — makes only the most recently *started* load allowed to win,
  // so a stale response arriving last can never overwrite the page the
  // admin is actually looking at. A ref rather than state: bumping it must
  // never itself trigger a render.
  const generationRef = useRef(0);

  const load = useCallback((forCursor: string | null) => {
    const generation = ++generationRef.current;
    setState({ status: "loading" });
    fetchIncidents(forCursor)
      .then((page) => {
        if (generationRef.current !== generation) return; // superseded — drop it
        setState({ status: "loaded", incidents: page.incidents, nextCursor: page.nextCursor });
      })
      .catch((err) => {
        if (generationRef.current !== generation) return;
        setState({ status: "error", message: String(err) });
      });
  }, []);

  useEffect(() => load(cursor), [cursor, load]);

  const goNext = useCallback(() => {
    if (state.status !== "loaded" || state.nextCursor === null) return;
    const nextCursor = state.nextCursor;
    setCursors((prev) => {
      // Already visited (the admin came back and is stepping forward again):
      // reuse the cursor recorded then rather than appending a duplicate.
      if (prev[pageIndex + 1] !== undefined) return prev;
      const next = [...prev];
      next[pageIndex + 1] = nextCursor;
      return next;
    });
    setPageIndex((i) => i + 1);
  }, [state, pageIndex]);

  const goPrev = useCallback(() => {
    setPageIndex((i) => Math.max(0, i - 1));
  }, []);

  // Retries the page currently on screen — same idea as useDevices.ts's
  // reload, just for whichever page failed rather than always the first.
  const reload = useCallback(() => load(cursor), [load, cursor]);

  return {
    state,
    hasPrev: pageIndex > 0,
    hasNext: state.status === "loaded" && state.nextCursor !== null,
    goPrev,
    goNext,
    reload,
  };
}
