/**
 * Card showing a single plugin update with change summary, diff accordion,
 * and update/skip/retry actions.
 */

import React, { useState } from 'react';
import type { PluginUpdate, ComponentChange, UpdateStatus } from '@shared/types';
import { useToolStore } from '@renderer/stores/tool-store';
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/utils';

type UpdateCardProps = {
  update: PluginUpdate;
};

function ChangeTypeBadge({ changeType }: { changeType: ComponentChange['changeType'] }) {
  const styles: Record<string, string> = {
    added: 'bg-[#6B7D5E]/10 text-[#6B7D5E]',
    modified: 'bg-amber-100 text-amber-800',
    removed: 'bg-[#D4614A]/10 text-[#D4614A]',
    unchanged: 'bg-sand-surface text-sand-muted',
  };
  const labels: Record<string, string> = {
    added: 'New',
    modified: 'Modified',
    removed: 'Removed',
    unchanged: 'Unchanged',
  };

  return (
    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', styles[changeType])}>
      {labels[changeType]}
    </span>
  );
}

function ChangeEntry({ change }: { change: ComponentChange }) {
  return (
    <div className={cn('py-2 px-3 rounded', change.changeType === 'unchanged' && 'opacity-50')}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-sand-text">{change.name}</span>
        <span className="text-[10px] text-sand-muted">{change.type}</span>
        <ChangeTypeBadge changeType={change.changeType} />
      </div>

      {/* Field diffs for modified components */}
      {change.changeType === 'modified' && change.fieldDiffs && change.fieldDiffs.length > 0 && (
        <div className="mt-1.5 space-y-1 ml-2">
          {change.fieldDiffs.map((diff) => (
            <div key={diff.field} className="text-xs font-mono">
              <span className="text-sand-secondary">{diff.field}: </span>
              {diff.oldValue !== undefined && (
                <span className="text-[#D4614A] line-through mr-1">{diff.oldValue}</span>
              )}
              {diff.newValue !== undefined && (
                <span className="text-[#6B7D5E]">{diff.newValue}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Hash-only change */}
      {change.changeType === 'modified' && change.hashOnly && (
        <p className="text-[10px] text-sand-muted mt-1 ml-2 italic">Content changed (hash differs)</p>
      )}

      {/* Removed component warning */}
      {change.changeType === 'removed' && (
        <p className="text-[10px] text-[#D4614A]/80 mt-1 ml-2">
          This component will be removed during update
        </p>
      )}
    </div>
  );
}

function StatusIndicator({ status }: { status: UpdateStatus }) {
  switch (status.state) {
    case 'updating':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-sand-secondary">
          <span className="size-3 border-2 border-sand-muted border-t-accent-olive rounded-full animate-spin" />
          Updating...
        </span>
      );
    case 'success':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-[#6B7D5E] font-medium">
          {'\u2713'} Updated{status.newVersion ? ` to v${status.newVersion}` : ''}
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-[#D4614A]">
          {'\u2717'} {status.error}
        </span>
      );
    default:
      return null;
  }
}

export const UpdateCard = React.memo(function UpdateCard({ update }: UpdateCardProps) {
  const [showChanges, setShowChanges] = useState(false);
  const applyUpdate = useToolStore((s) => s.applyUpdate);
  const skipUpdate = useToolStore((s) => s.skipUpdate);
  const status = useToolStore((s) => s.updateStatuses[update.pluginKey]);

  const isUpdating = status?.state === 'updating';
  const isSuccess = status?.state === 'success';
  const isFailed = status?.state === 'failed';

  const versionText =
    update.currentVersion && update.availableVersion
      ? `v${update.currentVersion} \u2192 v${update.availableVersion}`
      : 'Content changed';

  const changeSummaryParts: string[] = [];
  if (update.addedCount > 0) changeSummaryParts.push(`${update.addedCount} added`);
  if (update.modifiedCount > 0) changeSummaryParts.push(`${update.modifiedCount} modified`);
  if (update.removedCount > 0) changeSummaryParts.push(`${update.removedCount} removed`);
  const changeSummary = changeSummaryParts.join(', ') || 'No component changes';

  return (
    <div
      className={cn(
        'rounded-lg border border-black/[0.04] bg-[#F0EBE3] p-4',
        isSuccess && 'opacity-60',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-mono text-sm font-semibold text-sand-text truncate">
            {update.pluginName}
          </h3>
          <p className="text-xs text-sand-secondary mt-0.5">{versionText}</p>
          <p className="text-xs text-sand-muted mt-0.5">{changeSummary}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {!isUpdating && !isSuccess && (
            <>
              <Button variant="ghost" size="xs" onClick={() => skipUpdate(update.pluginKey)}>
                Skip
              </Button>
              <Button
                size="xs"
                className="bg-[#6B7D5E] text-white hover:bg-[#6B7D5E]/90"
                onClick={() => applyUpdate(update.pluginKey)}
              >
                Update
              </Button>
            </>
          )}
          {isFailed && (
            <Button
              size="xs"
              className="bg-[#6B7D5E] text-white hover:bg-[#6B7D5E]/90"
              onClick={() => applyUpdate(update.pluginKey)}
            >
              Retry
            </Button>
          )}
        </div>
      </div>

      {/* Status */}
      {status && (
        <div className="mt-2">
          <StatusIndicator status={status} />
        </div>
      )}

      {/* Show changes toggle */}
      {update.changes.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            className="text-xs text-sand-secondary hover:text-sand-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-olive/40 rounded"
            onClick={() => setShowChanges(!showChanges)}
          >
            {showChanges ? '\u25BC' : '\u25B6'} {showChanges ? 'Hide' : 'Show'} changes ({update.changes.length})
          </button>

          {showChanges && (
            <div className="mt-2 space-y-1 bg-sand-base/50 rounded-lg p-2">
              {update.changes.map((change) => (
                <ChangeEntry key={`${change.type}:${change.name}`} change={change} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
