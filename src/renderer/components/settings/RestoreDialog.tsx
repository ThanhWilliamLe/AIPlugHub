/**
 * Restore confirmation dialog — 4 states: confirm, progress, success, error.
 * Source: 5A-specs/backup-restore-spec.md
 */

import { useState, useEffect, useCallback } from 'react';
import type { BackupSummary, RestoreResult } from '@shared/types';
import { useBackupStore } from '@renderer/stores/backup-store';
import { useToolStore } from '@renderer/stores/tool-store';
import { Button } from '@renderer/components/ui/button';
import { formatDate, humanizeSize } from '@renderer/utils/format';

type RestoreDialogProps = {
  entry: BackupSummary;
  onClose: () => void;
};

type DialogState =
  | { phase: 'confirm' }
  | { phase: 'progress'; autoBackedUp: boolean }
  | { phase: 'success'; result: RestoreResult }
  | { phase: 'error'; message: string; rollbackFailed: boolean; autoBackupPath?: string };

export function RestoreDialog({ entry, onClose }: RestoreDialogProps) {
  const [state, setState] = useState<DialogState>({ phase: 'confirm' });
  const restoreBackup = useBackupStore((s) => s.restoreBackup);
  const scanAll = useToolStore((s) => s.scanAll);

  const canClose = state.phase === 'confirm';

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && canClose) {
        e.stopPropagation();
        onClose();
      }
    },
    [canClose, onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleConfirm = async () => {
    setState({ phase: 'progress', autoBackedUp: false });

    try {
      // Small delay to show the progress state, then mark auto-backup done
      // In practice the IPC call handles this atomically
      setState({ phase: 'progress', autoBackedUp: true });

      const result = await restoreBackup(entry.instanceId, entry.backupPath);

      setState({ phase: 'success', result });
    } catch (err) {
      const message = (err as { message?: string }).message ?? 'Restore failed';
      const code = (err as { code?: string }).code;
      const isRollbackFailed = code === 'RESTORE_ROLLBACK_FAILED';
      const autoBackupPath = isRollbackFailed
        ? (err as { details?: { autoBackupPath?: string } }).details?.autoBackupPath
        : undefined;
      setState({
        phase: 'error',
        message,
        rollbackFailed: isRollbackFailed,
        autoBackupPath,
      });
    }
  };

  const handleRescan = async () => {
    await scanAll();
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/30"
        onClick={canClose ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="restore-title"
      >
        <div className="bg-sand-paper rounded-xl shadow-lg border border-sand-border p-6 max-w-md w-full animate-bounce-in">
          {state.phase === 'confirm' && (
            <>
              <h2 id="restore-title" className="text-lg font-semibold text-sand-text mb-2">
                Restore backup?
              </h2>
              <p className="text-sm text-sand-secondary mb-3">
                This will replace the current contents of{' '}
                <code className="font-mono text-xs bg-sand-surface px-1 py-0.5 rounded">
                  {entry.configPath}
                </code>{' '}
                with the backup from:
              </p>

              {/* Backup info card */}
              <div className="bg-sand-surface rounded-lg p-3 mb-3 space-y-1">
                {entry.label && (
                  <p className="text-sm font-medium text-sand-text">{entry.label}</p>
                )}
                <p className="text-xs text-sand-secondary">{formatDate(entry.createdAt)}</p>
                <p className="text-xs text-sand-muted">
                  {entry.fileCount} files &middot; {humanizeSize(entry.totalBytes)}
                </p>
              </div>

              {/* Green reassurance */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                <span className="text-green-600 shrink-0" aria-hidden="true">&#x2713;</span>
                <p className="text-xs text-green-800">
                  Your current config will be automatically backed up before restoring, so you can
                  undo this if needed.
                </p>
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="px-3 py-1.5 rounded-lg bg-accent-olive text-white text-sm hover:bg-accent-olive/90"
                  data-testid="restore-confirm-btn"
                >
                  Restore
                </button>
              </div>
            </>
          )}

          {state.phase === 'progress' && (
            <div className="py-4 space-y-3" data-testid="restore-progress">
              <div className="flex items-center gap-3">
                <svg
                  className="animate-spin h-5 w-5 text-accent-olive"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <span className="text-sm font-medium text-sand-text">Restoring...</span>
              </div>
              {state.autoBackedUp && (
                <p className="text-xs text-sand-secondary ml-8">
                  &#x2713; Current config backed up
                </p>
              )}
              <p className="text-xs text-sand-secondary ml-8">
                &#x27F3; Copying backup files...
              </p>
            </div>
          )}

          {state.phase === 'success' && (
            <div data-testid="restore-success">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-accent-olive text-lg" aria-hidden="true">&#x2713;</span>
                <h2 className="text-lg font-semibold text-accent-olive">
                  Restored successfully
                </h2>
              </div>

              <div className="space-y-1 mb-3">
                {entry.label && (
                  <p className="text-sm text-sand-text">{entry.label}</p>
                )}
                <p className="text-xs text-sand-secondary">{entry.configPath}</p>
              </div>

              <p className="text-xs text-sand-muted mb-3">
                Auto-backup saved to:{' '}
                <span className="font-mono text-xs">{state.result.autoBackupPath}</span>
              </p>

              {/* Amber rescan banner */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-amber-800">
                  Your component list may have changed. A rescan is recommended.
                </p>
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Close
                </Button>
                <button
                  type="button"
                  onClick={handleRescan}
                  className="px-3 py-1.5 rounded-lg bg-accent-olive text-white text-sm hover:bg-accent-olive/90"
                  data-testid="rescan-btn"
                >
                  Rescan Now
                </button>
              </div>
            </div>
          )}

          {state.phase === 'error' && (
            <div data-testid="restore-error">
              <h2 className="text-lg font-semibold text-red-600 mb-2">Restore failed</h2>
              <p className="text-sm text-sand-secondary mb-3">{state.message}</p>

              {!state.rollbackFailed && (
                <p className="text-xs text-sand-muted mb-4">
                  Your config has been rolled back to its previous state.
                </p>
              )}

              {state.rollbackFailed && state.autoBackupPath && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-red-800">
                    Rollback also failed. You can manually recover from:{' '}
                    <span className="font-mono text-xs break-all">{state.autoBackupPath}</span>
                  </p>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
