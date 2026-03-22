/**
 * Delete backup confirmation dialog — simple confirm/cancel.
 * Source: 5A-specs/backup-restore-spec.md
 */

import { useEffect, useCallback } from 'react';
import type { BackupSummary } from '@shared/types';
import { useBackupStore } from '@renderer/stores/backup-store';
import { Button } from '@renderer/components/ui/button';
import { formatDate } from '@renderer/utils/format';

type DeleteBackupDialogProps = {
  entry: BackupSummary;
  onClose: () => void;
};

export function DeleteBackupDialog({ entry, onClose }: DeleteBackupDialogProps) {
  const deleteBackup = useBackupStore((s) => s.deleteBackup);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleConfirm = async () => {
    await deleteBackup(entry.instanceId, entry.backupPath);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} aria-hidden="true" />

      {/* Dialog */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-backup-title"
        aria-describedby="delete-backup-description"
      >
        <div className="bg-sand-paper rounded-xl shadow-lg border border-sand-border p-6 max-w-md w-full animate-bounce-in">
          <h2 id="delete-backup-title" className="text-lg font-semibold text-sand-text mb-2">
            Delete backup?
          </h2>
          <p id="delete-backup-description" className="text-sm text-sand-secondary mb-6">
            This will permanently delete the backup <strong>{entry.label ?? 'unlabeled'}</strong> (
            {formatDate(entry.createdAt)}). This cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-3 py-1.5 rounded-lg text-white text-sm hover:opacity-90"
              style={{ backgroundColor: '#D4614A' }}
              data-testid="delete-confirm-btn"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
