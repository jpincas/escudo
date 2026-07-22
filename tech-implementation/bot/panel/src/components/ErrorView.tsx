import { strings } from "../strings.ts";

/**
 * Full-width error state for a failed request. `onRetry` is optional because
 * not every error is retryable the same way (e.g. a failed mutation inside a
 * modal handles its own retry by just letting the user resubmit).
 */
export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-view" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          {strings.retry}
        </button>
      )}
    </div>
  );
}
