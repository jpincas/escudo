// The Inbox section (spec 2026-07-27 §7): the onboarding path the memo
// documented but the panel never actually built — see InboxEntry's own doc
// in the backend's src/store/types.ts. Replaces the placeholder that used to
// stand in for this section.

import { useEffect, useState } from "react";
import type { InboxEntry } from "../api/types.ts";
import { useInboxContext } from "../inbox-context.tsx";
import { t } from "../i18n/mod.ts";
import { useStrings } from "../i18n/context.tsx";
import { useVillage } from "../village-context.tsx";
import { ConfirmDismissModal } from "./ConfirmDismissModal.tsx";
import { DeviceFormModal } from "./DeviceFormModal.tsx";
import { ErrorView } from "./ErrorView.tsx";
import { InboxTable } from "./InboxTable.tsx";
import { LoadingView } from "./LoadingView.tsx";

export function InboxScreen() {
  const s = useStrings();
  const { inboxRetentionDays } = useVillage();
  const { state, reload, refresh, register, dismiss } = useInboxContext();

  // The shared inbox state (see inbox-context.tsx) lives for the whole
  // signed-in session, not just while this screen is mounted — so opening
  // this section, same as opening Devices, must never show what might by now
  // be a stale list (review 2026-07-28, F1).
  //
  // `refresh`, not `reload` (review F3'): `reload` sets status back to
  // "loading", and Shell.tsx only renders the sidebar badge when status is
  // "loaded" — so reloading on every visit made the badge vanish for the
  // length of the fetch, on a slow link, on every single visit. `refresh`
  // updates the list in place with no such gap.
  //
  // Skipped when `state.status` is already "loading" (review F2'): that is
  // only ever true, at the exact moment this effect runs, when this screen
  // happened to be the one the panel first mounted on — the very same fetch
  // InboxProvider's own first-ever `load` is already making. `state` here is
  // the value from the render this effect was scheduled in, not a live
  // read, so this check is correct at the one moment it needs to be — the
  // fetch initial value is genuinely "loading" until that first load settles
  // no matter which of the two effects the browser happens to run first.
  // Deliberately an empty dependency array: this is a one-time landing
  // check against the status this screen was born into, not a subscription
  // that should re-run every time `state` changes afterward.
  useEffect(() => {
    if (state.status !== "loading") refresh();
  }, []);

  const [registering, setRegistering] = useState<InboxEntry | null>(null);
  const [dismissing, setDismissing] = useState<InboxEntry | null>(null);

  return (
    <div className="inbox-screen">
      <header className="app-header">
        <h1>{s.inbox.heading}</h1>
        <p className="inbox-screen__intro">
          {t(s.inbox.intro, { days: String(inboxRetentionDays) })}
        </p>
      </header>

      {state.status === "loading" && <LoadingView />}

      {state.status === "error" && <ErrorView message={state.message} onRetry={reload} />}

      {state.status === "loaded" && state.entries.length === 0 && (
        <div className="empty-state">
          <h2>{s.inbox.empty.heading}</h2>
          <p>{s.inbox.empty.body}</p>
        </div>
      )}

      {state.status === "loaded" && state.entries.length > 0 && (
        <InboxTable
          entries={state.entries}
          onRegister={setRegistering}
          onDismiss={setDismissing}
        />
      )}

      {registering && (
        <DeviceFormModal
          mode="register"
          msisdn={registering.msisdn}
          onSubmit={(body) => register(registering.msisdn, body)}
          onClose={() => setRegistering(null)}
        />
      )}

      {dismissing && (
        <ConfirmDismissModal
          entry={dismissing}
          onConfirm={() => dismiss(dismissing.msisdn)}
          onClose={() => setDismissing(null)}
        />
      )}
    </div>
  );
}
