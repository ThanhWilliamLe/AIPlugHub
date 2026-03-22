/**
 * Backups tab — top-level tab in Settings overlay.
 * Shows per-tool backup cards with summary line.
 * Source: 5A-specs/backup-restore-spec.md
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useToolStore } from '@renderer/stores/tool-store';
import { useBackupStore } from '@renderer/stores/backup-store';
import { BackupToolCard } from './BackupToolCard';
import { humanizeSize } from '@renderer/utils/format';

export function BackupsTab() {
  const tools = useToolStore((s) => s.tools);
  const backups = useBackupStore((s) => s.backups);
  const loadAllBackups = useBackupStore((s) => s.loadAllBackups);

  const detectedTools = useMemo(() => tools.filter((t) => t.detected), [tools]);

  // Stable callback for loading — useCallback prevents infinite re-render loop
  const loadAll = useCallback(() => {
    const ids = detectedTools.map((t) => t.instanceId);
    if (ids.length > 0) {
      loadAllBackups(ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedTools]);

  // Load backups on mount for all detected tools
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Compute totals across all tools
  const { totalBackups, totalTools, totalBytes } = useMemo(() => {
    let count = 0;
    let toolsWithBackups = 0;
    let bytes = 0;
    for (const [, entries] of Object.entries(backups)) {
      if (entries.length > 0) {
        toolsWithBackups++;
        count += entries.length;
        for (const e of entries) {
          bytes += e.totalBytes;
        }
      }
    }
    return { totalBackups: count, totalTools: toolsWithBackups, totalBytes: bytes };
  }, [backups]);

  return (
    <section>
      <h2 className="text-sm font-semibold text-sand-text uppercase tracking-wider mb-1">
        Backups
      </h2>
      <p className="text-xs text-sand-secondary mb-4">
        Snapshot tool config directories for safe experimentation and disaster recovery.
      </p>

      {/* Summary line */}
      <p className="text-xs text-sand-muted mb-4" data-testid="backup-summary">
        {totalBackups} backup{totalBackups !== 1 ? 's' : ''} across {totalTools} tool
        {totalTools !== 1 ? 's' : ''} &middot; {humanizeSize(totalBytes)} total
      </p>

      {/* Per-tool cards */}
      <div className="space-y-4">
        {detectedTools.map((tool) => (
          <BackupToolCard key={tool.instanceId} instanceId={tool.instanceId} tool={tool} />
        ))}
      </div>

      {/* Footer */}
      <p className="text-xs text-sand-muted mt-4">Only detected tools are shown.</p>
    </section>
  );
}
