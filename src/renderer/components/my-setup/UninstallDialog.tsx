/**
 * Uninstall confirmation dialog — destructive action, red button.
 */

import { useEffect, useCallback } from 'react';
import type { ComponentId } from '@shared/types';
import { Button } from '@renderer/components/ui/button';

type UninstallDialogProps = {
  componentId: ComponentId;
  componentName: string;
  onConfirm: (id: ComponentId) => void;
  onCancel: () => void;
};

export function UninstallDialog({
  componentId,
  componentName,
  onConfirm,
  onCancel,
}: UninstallDialogProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    },
    [onCancel],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/20" onClick={onCancel} aria-hidden="true" />

      {/* Dialog */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="uninstall-title"
        aria-describedby="uninstall-description"
      >
        <div className="bg-sand-paper rounded-xl shadow-xl border border-sand-border p-6 max-w-sm w-full animate-bounce-in">
          <h2 id="uninstall-title" className="text-lg font-semibold text-sand-text mb-2">
            Uninstall {componentName}?
          </h2>
          <p id="uninstall-description" className="text-sm text-sand-secondary mb-6">
            {componentId.scope.startsWith('extension:') ? (
              <>
                This will uninstall the entire{' '}
                <strong>{componentId.scope.slice('extension:'.length)}</strong> extension, including
                all its components (skills, commands, hooks, agents). This action cannot be undone.
              </>
            ) : (
              'This will remove the plugin from your tool configuration. This action cannot be undone.'
            )}
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-accent-destructive text-white hover:bg-accent-destructive/90"
              onClick={() => onConfirm(componentId)}
              autoFocus
            >
              Uninstall
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
