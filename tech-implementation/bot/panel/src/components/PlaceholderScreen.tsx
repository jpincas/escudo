import { useStrings } from "../i18n/context.tsx";

type PlaceholderSection = "inbox";

/**
 * Stands in for a section §7 (inbox) has yet to build. Config (§3) and
 * History (§6) used to be one of these; they now have real screens
 * (ConfigScreen.tsx, HistoryScreen.tsx). States plainly that the section is
 * coming rather than faking a finished screen — a placeholder that looks
 * done is worse than one that says what it is. Reuses the same empty-state
 * treatment the Devices screen already uses for its own empty list, rather
 * than inventing a second "nothing here yet" pattern.
 */
export function PlaceholderScreen({ section }: { section: PlaceholderSection }) {
  const s = useStrings();
  const copy = s.placeholder[section];

  return (
    <div className="placeholder-screen">
      <header className="app-header">
        <h1>{copy.heading}</h1>
      </header>
      <div className="empty-state">
        <p>{copy.body}</p>
      </div>
    </div>
  );
}
