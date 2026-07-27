// A tiny hand-rolled router over history.pushState — deliberately not a
// library. Four static sections below /panel, none nested, none carrying
// params: a real router's matching, guards and code-splitting all solve
// problems this app doesn't have. If a fifth section ever needs a param
// (e.g. /panel/history/:id), that's the point to reconsider, not before.

import { useCallback, useEffect, useState } from "react";

export const SECTION_IDS = ["devices", "inbox", "history", "config"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** Devices is first in the sidebar and the landing section for `/panel`
 *  itself or any path below it this router doesn't recognise. */
export const DEFAULT_SECTION: SectionId = "devices";

function isSectionId(value: string): value is SectionId {
  return (SECTION_IDS as readonly string[]).includes(value);
}

/** `/panel`, `/panel/`, `/panel/devices` -> "devices"; `/panel/nonsense` ->
 *  the default section, same as bare `/panel` — an unknown path is not an
 *  error, it just isn't linked to anything else in the sidebar. */
function parseSection(pathname: string): SectionId {
  const segment = pathname.replace(/^\/panel\/?/, "").split("/")[0];
  return isSectionId(segment) ? segment : DEFAULT_SECTION;
}

export function useRoute(): { section: SectionId; navigate: (section: SectionId) => void } {
  const [section, setSection] = useState<SectionId>(() => parseSection(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setSection(parseSection(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((next: SectionId) => {
    const path = `/panel/${next}`;
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setSection(next);
  }, []);

  return { section, navigate };
}
