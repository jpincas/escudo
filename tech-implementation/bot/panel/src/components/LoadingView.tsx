import { useStrings } from "../i18n/context.tsx";

/** The one loading indicator in the app — plain text, no spinner asset (no dependency for it). */
export function LoadingView() {
  const s = useStrings();
  return <p className="loading">{s.loading}</p>;
}
