import { useStrings } from "../i18n/context.tsx";

type PlaceholderSection = "inbox" | "history" | "config";

/**
 * Stands in for a section that §3 (config), §6 (history) or §7 (inbox) build.
 * States plainly that the section is coming rather than faking a finished
 * screen — a placeholder that looks done is worse than one that says what it
 * is. Reuses the same empty-state treatment the Devices screen already uses
 * for its own empty list, rather than inventing a second "nothing here yet"
 * pattern.
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
