// Shares one fetch of the bridge inbox between the sidebar's waiting-count
// badge and the Inbox screen's own list (spec 2026-07-27 §7.3): "the count
// must not go stale after a register or dismiss". If the sidebar and the
// screen each fetched their own copy, registering or dismissing a row from
// the screen would update the screen's list but leave the sidebar's count
// showing the old total until some unrelated re-fetch happened to run. One
// useInbox() call, held here, read by both — mirrors village-context.tsx's
// shape (a context wrapping the signed-in shell) but for data that mutates,
// not static policy.

import { createContext, type ReactNode, useContext } from "react";
import { useInbox } from "./hooks/useInbox.ts";

type InboxContextValue = ReturnType<typeof useInbox>;

const InboxContext = createContext<InboxContextValue | null>(null);

export function InboxProvider({ children }: { children: ReactNode }) {
  const inbox = useInbox();
  return <InboxContext.Provider value={inbox}>{children}</InboxContext.Provider>;
}

export function useInboxContext(): InboxContextValue {
  const value = useContext(InboxContext);
  if (!value) {
    throw new Error("useInboxContext() called outside <InboxProvider>");
  }
  return value;
}
