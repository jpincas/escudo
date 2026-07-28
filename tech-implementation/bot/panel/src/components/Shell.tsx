import type { Me } from "../api/types.ts";
import { InboxProvider, useInboxContext } from "../inbox-context.tsx";
import { useRoute } from "../router.ts";
import type { SectionId } from "../router.ts";
import { SECTIONS } from "../sections.tsx";
import { Sidebar } from "./Sidebar.tsx";

/**
 * The signed-in app: a persistent sidebar plus whichever section the route
 * currently points at. Only ever mounted once a session exists (App.tsx) —
 * there is no way to reach a section's screen without one.
 *
 * Wrapped in InboxProvider (spec 2026-07-27 §7.3) so the sidebar's
 * waiting-count badge and the Inbox screen below it share one fetch — see
 * inbox-context.tsx's own header for why that matters.
 */
export function Shell({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const { section, navigate } = useRoute();

  return (
    <InboxProvider>
      <ShellBody me={me} section={section} onNavigate={navigate} onSignOut={onSignOut} />
    </InboxProvider>
  );
}

function ShellBody({ me, section, onNavigate, onSignOut }: {
  me: Me;
  section: SectionId;
  onNavigate: (section: SectionId) => void;
  onSignOut: () => void;
}) {
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const Screen = current.Component;

  // Undefined while the first fetch is still in flight, matching the
  // "no section supplies this yet" state Sidebar.tsx already treats as
  // "don't render the badge" — a loading count would otherwise flash a
  // wrong or stale number before the real one lands.
  const { state: inboxState } = useInboxContext();
  const inboxCount = inboxState.status === "loaded" ? inboxState.entries.length : undefined;

  return (
    <div className="shell">
      <Sidebar
        me={me}
        section={section}
        onNavigate={onNavigate}
        onSignOut={onSignOut}
        inboxCount={inboxCount}
      />
      <main className="shell__main">
        <Screen />
      </main>
    </div>
  );
}
