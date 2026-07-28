// Makes village policy that isn't locale — timezone, retention — available to
// any screen below it, the same shape as i18n/context.tsx's LocaleProvider but
// for a different concern. Mounted once, by App.tsx, only for the signed-in
// shell: the only consumer today is the History screen (§6, spec
// 2026-07-27), which needs both to render the village's own clock and to
// state honestly how far back the log reaches.

import { createContext, type ReactNode, useContext } from "react";

export interface VillageInfo {
  /** IANA timezone, e.g. "Europe/Madrid". */
  timezone: string;
  /** Days the incident log is kept before retention deletes it. */
  retentionDays: number;
  /** Days an unregistered caller sits in the bridge inbox before retention
   *  deletes it (spec 2026-07-27 §7.3) — read from the session, not
   *  hardcoded, same as retentionDays above. */
  inboxRetentionDays: number;
}

const VillageContext = createContext<VillageInfo | null>(null);

export function VillageProvider(
  { timezone, retentionDays, inboxRetentionDays, children }: VillageInfo & { children: ReactNode },
) {
  return (
    <VillageContext.Provider value={{ timezone, retentionDays, inboxRetentionDays }}>
      {children}
    </VillageContext.Provider>
  );
}

export function useVillage(): VillageInfo {
  const village = useContext(VillageContext);
  if (!village) {
    throw new Error("useVillage() called outside <VillageProvider>");
  }
  return village;
}
