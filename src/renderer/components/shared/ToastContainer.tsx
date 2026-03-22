/**
 * Toast notification container — renders at bottom-right of the viewport.
 */

import { useToastStore } from '@renderer/stores/toast-store';
import { cn } from '@renderer/lib/utils';

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border text-sm',
            'animate-slide-in-right',
            toast.type === 'success' && 'bg-sand-paper border-accent-olive/30 text-sand-text',
            toast.type === 'error' && 'bg-sand-paper border-accent-destructive/30 text-sand-text',
            toast.type === 'info' && 'bg-sand-paper border-sand-border text-sand-text',
          )}
          role="status"
        >
          <span className="flex-1">{toast.message}</span>
          {toast.undoAction && (
            <button
              type="button"
              onClick={() => {
                toast.undoAction!();
                removeToast(toast.id);
              }}
              className="text-accent-olive font-medium hover:underline shrink-0"
            >
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="text-sand-muted hover:text-sand-text shrink-0"
            aria-label="Dismiss"
          >
            {'\u2715'}
          </button>
        </div>
      ))}
    </div>
  );
}
