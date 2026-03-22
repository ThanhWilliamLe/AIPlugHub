/**
 * Per-tool backup card — header with tool info + "Backup Now", list of backup entries.
 * Source: 5A-specs/backup-restore-spec.md
 */

import { useState, useEffect } from 'react';
import type { BackupSummary, ToolDetectionResult } from '@shared/types';
import { TOOL_META } from '@shared/constants';
import { useBackupStore } from '@renderer/stores/backup-store';
import { BackupEntryRow } from './BackupEntryRow';
import { BackupCreateForm } from './BackupCreateForm';
import { humanizeSize } from '@renderer/utils/format';

const EMPTY: BackupSummary[] = [];

export type BackupToolCardProps = {
  instanceId: string;
  tool: ToolDetectionResult;
};

export function BackupToolCard({ instanceId, tool }: BackupToolCardProps) {
  const backups = useBackupStore((s) => s.backups[instanceId] ?? EMPTY);
  const creating = useBackupStore((s) => s.creating);
  const meta = TOOL_META[tool.toolId];

  const [showForm, setShowForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const handleBackupNow = () => {
    setShowForm(true);
  };

  return (
    <div className="rounded-lg border border-sand-border bg-sand-surface/20">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-sand-border">
        <span className="text-base">{meta.emoji}</span>
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sand-text">{meta.label}</span>
          <p className="text-xs text-sand-muted font-mono truncate mt-0.5">{tool.path}</p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={handleBackupNow}
            disabled={creating === instanceId}
            className="px-3 py-1.5 rounded-lg bg-accent-olive text-white text-sm hover:bg-accent-olive/90 disabled:opacity-50 shrink-0"
          >
            {creating === instanceId ? 'Creating...' : 'Backup Now'}
          </button>
        )}
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-accent-olive border-t border-sand-border">
          <span aria-hidden="true">&#x2713;</span>
          <span>{successMessage}</span>
        </div>
      )}

      {/* Inline create form */}
      {showForm && (
        <BackupCreateForm
          instanceId={instanceId}
          toolId={tool.toolId}
          onCancel={() => setShowForm(false)}
          onComplete={(summary) => {
            setShowForm(false);
            setSuccessMessage(
              `Backup created \u00B7 ${summary.fileCount} files \u00B7 ${humanizeSize(summary.totalBytes)}`,
            );
          }}
        />
      )}

      {/* Body: backup entries */}
      <div className="p-3 space-y-2">
        {backups.length === 0 ? (
          <p className="text-sm text-sand-muted px-1 py-2">No backups yet</p>
        ) : (
          backups.map((entry) => <BackupEntryRow key={entry.backupPath} entry={entry} />)
        )}
      </div>
    </div>
  );
}
