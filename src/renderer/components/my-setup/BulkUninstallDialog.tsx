/**
 * Bulk uninstall confirmation dialog — shows grouped-by-tool list, destructive action.
 */

import { useEffect, useCallback } from 'react';
import type { ComponentId, Component } from '@shared/types';
import { TOOL_META } from '@shared/constants';
import { componentIdEquals } from '@shared/utils';
import { Button } from '@renderer/components/ui/button';

type BulkUninstallDialogProps = {
  componentIds: ComponentId[];
  components: Component[];
  onConfirm: (ids: ComponentId[]) => void;
  onCancel: () => void;
};

export function BulkUninstallDialog({
  componentIds,
  components,
  onConfirm,
  onCancel,
}: BulkUninstallDialogProps) {
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

  // Group components by tool
  const groups = new Map<
    string,
    { label: string; emoji: string; components: Array<{ name: string; type: string }> }
  >();

  for (const id of componentIds) {
    const comp = components.find((c) => componentIdEquals(c.id, id));
    if (!comp) continue;
    const tool = id.tool;
    if (!groups.has(tool)) {
      const meta = TOOL_META[tool];
      groups.set(tool, { label: meta.label, emoji: meta.emoji, components: [] });
    }
    groups.get(tool)!.components.push({
      name: comp.displayName ?? id.name,
      type: id.type,
    });
  }

  const count = componentIds.length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/20"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bulk-uninstall-title"
        aria-describedby="bulk-uninstall-description"
      >
        <div className="bg-sand-paper rounded-xl shadow-xl border border-sand-border p-6 max-w-md w-full animate-bounce-in">
          <h2
            id="bulk-uninstall-title"
            className="text-lg font-semibold text-sand-text mb-3"
          >
            Uninstall {count} component{count !== 1 ? 's' : ''}?
          </h2>

          <p className="text-sm text-sand-secondary mb-3">This will remove:</p>

          <div id="bulk-uninstall-description" className="mb-4 space-y-3">
            {Array.from(groups.entries()).map(([tool, group]) => (
              <div key={tool}>
                <p className="text-sm font-medium text-sand-text">
                  {group.emoji} {group.label} ({group.components.length}):
                </p>
                <ul className="mt-1 ml-4 space-y-0.5">
                  {group.components.map((comp, i) => (
                    <li key={i} className="text-sm text-sand-secondary">
                      &bull; {comp.name} ({comp.type})
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="text-xs text-accent-destructive mb-5">
            This action cannot be undone.
          </p>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onConfirm(componentIds)}
              autoFocus
            >
              Uninstall {count}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
