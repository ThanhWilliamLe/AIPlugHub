/**
 * BulkActionBar — floating action bar shown at the bottom of the My Setup tab
 * when one or more components are selected.
 *
 * Displays selected count (with hidden count when filtered), 4 action buttons
 * with count badges, and a Cancel button.
 */

import React from 'react';
import type { ComponentId, Component } from '@shared/types';
import { componentIdEquals } from '@shared/utils';
import { cn } from '@renderer/lib/utils';

type BulkActionBarProps = {
  selectedIds: ComponentId[];
  components: Component[];
  filteredComponents: Component[];
  onExport: () => void;
  onToggle: () => void;
  onUpdate: () => void;
  onUninstall: () => void;
  onCancel: () => void;
};

export function BulkActionBar({
  selectedIds,
  components,
  filteredComponents,
  onExport,
  onToggle,
  onUpdate,
  onUninstall,
  onCancel,
}: BulkActionBarProps) {
  // Hidden count — selected items not visible in the current filtered list
  const visibleSelectedCount = selectedIds.filter((id) =>
    filteredComponents.some((c) => componentIdEquals(c.id, id)),
  ).length;
  const hiddenSelectedCount = selectedIds.length - visibleSelectedCount;

  // Enable/Disable toggle label and applicable count
  const toggleable = selectedIds.filter((id) => {
    const c = components.find((comp) => componentIdEquals(comp.id, id));
    return c?.enabled !== undefined;
  });
  const allEnabled =
    toggleable.length > 0 &&
    toggleable.every((id) => {
      const c = components.find((comp) => componentIdEquals(comp.id, id));
      return c?.enabled === true;
    });
  const toggleLabel = allEnabled ? 'Disable' : 'Enable';
  const toggleCount = toggleable.length;

  // Update count — stub, no update store integration yet
  const updatableCount = 0;

  const totalSelected = selectedIds.length;

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="sticky bottom-4 mx-4 flex items-center gap-2 px-4 py-2.5 bg-sand-text text-white rounded-xl shadow-xl animate-slide-up z-20"
    >
      {/* Selected count */}
      <span className="text-xs font-medium mr-2 shrink-0">
        {totalSelected} selected
        {hiddenSelectedCount > 0 && (
          <span className="text-white/60 ml-1">({hiddenSelectedCount} not shown)</span>
        )}
      </span>

      {/* Divider */}
      <span className="w-px h-4 bg-white/20 shrink-0" aria-hidden="true" />

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 flex-1">
        {/* Export */}
        <button
          type="button"
          onClick={onExport}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-white/15 bg-white/8 text-white hover:bg-white/15"
        >
          Export
          <span className="text-[10px] bg-white/15 px-1.5 rounded ml-1.5">{totalSelected}</span>
        </button>

        {/* Enable / Disable */}
        <button
          type="button"
          onClick={onToggle}
          disabled={toggleCount === 0}
          title={toggleCount === 0 ? 'No plugins with enable/disable support selected' : undefined}
          className={cn(
            'text-xs font-medium px-3 py-1.5 rounded-lg border border-white/15 bg-white/8 text-white hover:bg-white/15',
            toggleCount === 0 && 'opacity-50 cursor-not-allowed',
          )}
        >
          {toggleLabel}
          <span className="text-[10px] bg-white/15 px-1.5 rounded ml-1.5">{toggleCount}</span>
        </button>

        {/* Update */}
        <button
          type="button"
          onClick={onUpdate}
          disabled={updatableCount === 0}
          title={updatableCount === 0 ? 'No updates available for selected plugins' : undefined}
          className={cn(
            'text-xs font-medium px-3 py-1.5 rounded-lg border border-white/15 bg-white/8 text-white hover:bg-white/15',
            updatableCount === 0 && 'opacity-50 cursor-not-allowed',
          )}
        >
          Update
          <span className="text-[10px] bg-white/15 px-1.5 rounded ml-1.5">{updatableCount}</span>
        </button>

        {/* Uninstall — destructive */}
        <button
          type="button"
          onClick={onUninstall}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-accent-destructive/40 bg-white/8 text-[#F5A090] hover:bg-white/15 destructive"
        >
          Uninstall
          <span className="text-[10px] bg-white/15 px-1.5 rounded ml-1.5">{totalSelected}</span>
        </button>
      </div>

      {/* Cancel */}
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-sand-muted hover:text-white bg-transparent border-none shrink-0 ml-2"
      >
        Cancel
      </button>
    </div>
  );
}
