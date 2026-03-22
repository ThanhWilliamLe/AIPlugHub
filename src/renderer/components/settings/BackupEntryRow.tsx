/**
 * Single backup entry row — shows label, date, size, badges, and action buttons.
 * Source: 5A-specs/backup-restore-spec.md
 */

import { useState } from 'react';
import type { BackupSummary } from '@shared/types';
import { RestoreDialog } from './RestoreDialog';
import { DeleteBackupDialog } from './DeleteBackupDialog';
import { formatDate, humanizeSize } from '@renderer/utils/format';

export type BackupEntryRowProps = {
  entry: BackupSummary;
};

export function BackupEntryRow({ entry }: BackupEntryRowProps) {
  const [showRestore, setShowRestore] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-sand-border bg-sand-surface/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {entry.label ? (
            <span className="text-sm font-medium text-sand-text">{entry.label}</span>
          ) : (
            <span className="text-sm italic text-sand-muted">no label</span>
          )}
          {entry.auto && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-sand-surface border border-sand-border text-sand-muted">
              auto
            </span>
          )}
        </div>
        <p className="text-xs text-sand-secondary mt-0.5">{formatDate(entry.createdAt)}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-sand-muted">
            {entry.fileCount} files &middot; {humanizeSize(entry.totalBytes)}
          </span>
          {entry.skipCaches && (
            <span className="text-xs text-sand-muted">&middot; caches skipped</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setShowRestore(true)}
          className="px-3 py-1.5 rounded-lg border border-sand-border text-sm text-sand-text hover:bg-sand-surface/50"
        >
          Restore
        </button>
        <button
          type="button"
          onClick={() => setShowDelete(true)}
          className="px-3 py-1.5 rounded-lg border border-sand-border text-sm hover:bg-sand-surface/50"
          style={{ color: '#D4614A' }}
        >
          Delete
        </button>
      </div>
      {showRestore && <RestoreDialog entry={entry} onClose={() => setShowRestore(false)} />}
      {showDelete && <DeleteBackupDialog entry={entry} onClose={() => setShowDelete(false)} />}
    </div>
  );
}
