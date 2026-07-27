import type { Me } from "../api/types.ts";
import { useRoute } from "../router.ts";
import { SECTIONS } from "../sections.tsx";
import { Sidebar } from "./Sidebar.tsx";

/**
 * The signed-in app: a persistent sidebar plus whichever section the route
 * currently points at. Only ever mounted once a session exists (App.tsx) —
 * there is no way to reach a section's screen without one.
 */
export function Shell({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const { section, navigate } = useRoute();
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const Screen = current.Component;

  return (
    <div className="shell">
      <Sidebar me={me} section={section} onNavigate={navigate} onSignOut={onSignOut} />
      <main className="shell__main">
        <Screen />
      </main>
    </div>
  );
}
