/**
 * Error banner — displays the store's error state with a dismiss button.
 */

import { useToolStore } from '@renderer/stores/tool-store';

export function ErrorBanner() {
  const error = useToolStore((s) => s.error);
  const clearError = useToolStore((s) => s.clearError);

  if (!error) return null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 bg-accent-destructive/10 border-b border-accent-destructive/20 text-sm"
      role="alert"
    >
      <span className="text-accent-destructive flex-1">{error}</span>
      <button
        type="button"
        onClick={clearError}
        className="text-accent-destructive/60 hover:text-accent-destructive text-xs underline-offset-2 hover:underline shrink-0"
      >
        Dismiss
      </button>
    </div>
  );
}
