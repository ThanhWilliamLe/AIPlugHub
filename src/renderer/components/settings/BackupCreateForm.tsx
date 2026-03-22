/**
 * Inline backup creation form — expands below the Backup Now button.
 * Source: 5A-specs/backup-restore-spec.md
 */

import { useState } from 'react';
import { CACHE_PATTERNS } from '@shared/constants';
import type { CachePatternEntry } from '@shared/constants';
import type { BackupSummary } from '@shared/types';
import { useBackupStore } from '@renderer/stores/backup-store';

export type BackupCreateFormProps = {
  instanceId: string;
  toolId: string;
  onCancel: () => void;
  onComplete: (summary: BackupSummary) => void;
};

export function BackupCreateForm({
  instanceId,
  toolId,
  onCancel,
  onComplete,
}: BackupCreateFormProps) {
  const [label, setLabel] = useState('');
  const [skipCaches, setSkipCaches] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createBackup = useBackupStore((s) => s.createBackup);
  const patterns: CachePatternEntry[] = CACHE_PATTERNS[toolId] ?? [];

  const handleSubmit = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const summary = await createBackup(
        instanceId,
        label.trim() || undefined,
        skipCaches,
      );
      onComplete(summary);
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Backup failed');
      setIsCreating(false);
    }
  };

  if (isCreating) {
    return (
      <div className="flex items-center gap-2 px-4 py-4 text-sm text-sand-secondary">
        <svg
          className="animate-spin h-4 w-4 text-accent-olive"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
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
        Creating backup...
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-3 border-t border-sand-border">
      {/* Label input */}
      <div>
        <label className="block text-sand-secondary text-xs font-medium mb-1">
          Label (optional)
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g., before-superpowers-update"
          className="w-full font-mono text-sm px-2.5 py-1.5 rounded-md border border-sand-border bg-sand-surface/30 text-sand-text placeholder:text-sand-muted focus:outline-none focus:ring-1 focus:ring-accent-olive"
        />
      </div>

      {/* Skip caches checkbox */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`skip-caches-${instanceId}`}
          checked={skipCaches}
          onChange={(e) => setSkipCaches(e.target.checked)}
          className="accent-olive"
        />
        <label
          htmlFor={`skip-caches-${instanceId}`}
          className="text-sm text-sand-text select-none"
        >
          Skip caches and temporary files
        </label>
        {patterns.length > 0 && (
          <button
            type="button"
            onClick={() => setShowInfo(!showInfo)}
            className="inline-flex items-center justify-center w-5 h-5 border border-sand-border rounded-full text-sand-muted text-xs hover:text-sand-text"
            aria-label="Toggle cache pattern info"
          >
            i
          </button>
        )}
      </div>

      {/* Info popover */}
      {showInfo && patterns.length > 0 && (
        <div className="bg-sand-surface rounded-lg border border-sand-border p-3 text-xs space-y-1.5">
          {patterns.map((p) => (
            <div key={p.pattern} className="flex gap-2">
              <code className="font-mono text-sand-text shrink-0">{p.pattern}</code>
              <span className="text-sand-muted">{p.description}</span>
            </div>
          ))}
          <p className="text-sand-muted pt-1 border-t border-sand-border mt-1.5">
            All excluded items regenerate automatically. Your configs, skills,
            commands, hooks, and MCP servers are always included.
          </p>
        </div>
      )}

      {/* Secrets warning */}
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
        <span className="shrink-0 mt-0.5" aria-hidden="true">
          &#x26A0;&#xFE0F;
        </span>
        <span>
          This backup may contain API keys and secrets stored in config files.
          Backups are stored locally alongside your config directory.
        </span>
      </div>

      {/* Error message */}
      {error && (
        <p className="text-xs text-accent-destructive">{error}</p>
      )}

      {/* Buttons */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-sand-border text-sand-text text-sm hover:bg-sand-surface/50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="px-3 py-1.5 rounded-lg bg-accent-olive text-white text-sm hover:bg-accent-olive/90"
        >
          Create Backup
        </button>
      </div>
    </div>
  );
}
