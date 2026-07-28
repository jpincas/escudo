// The History section (spec 2026-07-27 §6): what has actually happened in
// the village, newest first, read-only, paged. Replaces the placeholder that
// stood in for it — see PlaceholderScreen.tsx.

import { t } from "../i18n/mod.ts";
import { useStrings } from "../i18n/context.tsx";
import { useVillage } from "../village-context.tsx";
import { useIncidentHistory } from "../hooks/useIncidentHistory.ts";
import { ErrorView } from "./ErrorView.tsx";
import { IncidentTable } from "./IncidentTable.tsx";
import { LoadingView } from "./LoadingView.tsx";

export function HistoryScreen() {
  const s = useStrings();
  const { retentionDays } = useVillage();
  const { state, hasPrev, hasNext, goPrev, goNext, reload } = useIncidentHistory();

  return (
    <div className="history-screen">
      <header className="app-header">
        <h1>{s.history.heading}</h1>
        <p className="history-screen__intro">
          {t(s.history.intro, { days: String(retentionDays) })}
        </p>
      </header>

      {state.status === "loading" && <LoadingView />}

      {state.status === "error" && <ErrorView message={state.message} onRetry={reload} />}

      {state.status === "loaded" && state.incidents.length === 0 && (
        <div className="empty-state">
          <h2>{s.history.empty.heading}</h2>
          <p>{s.history.empty.body}</p>
        </div>
      )}

      {state.status === "loaded" && state.incidents.length > 0 && (
        <>
          <IncidentTable incidents={state.incidents} />
          <div className="history-screen__pagination">
            <button type="button" onClick={goPrev} disabled={!hasPrev}>
              {s.history.pagination.prev}
            </button>
            <button type="button" onClick={goNext} disabled={!hasNext}>
              {s.history.pagination.next}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
