import { strings } from "../strings.ts";

/** The one loading indicator in the app — plain text, no spinner asset (no dependency for it). */
export function LoadingView() {
  return <p className="loading">{strings.loading}</p>;
}
