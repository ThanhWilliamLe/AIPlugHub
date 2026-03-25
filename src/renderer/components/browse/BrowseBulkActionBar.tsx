/**
 * BrowseBulkActionBar — floating action bar at the bottom of the Browse tab
 * when entries are selected in multi-select mode.
 * Shows selected count (clickable to reveal names), Install All button, and Cancel.
 * Source: 5A-specs/keyboard-browse-multiselect-spec.md §3e
 */

import { useState } from 'react';

type BrowseBulkActionBarProps = {
  selectedCount: number;
  selectedNames: string[];
  onInstallAll: () => void;
  onCancel: () => void;
};

export function BrowseBulkActionBar({
  selectedCount,
  selectedNames,
  onInstallAll,
  onCancel,
}: BrowseBulkActionBarProps) {
  const [showList, setShowList] = useState(false);

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="sticky bottom-4 mx-4 z-20"
    >
      {/* Expandable selected-names panel */}
      {showList && selectedNames.length > 0 && (
        <div className="mb-1 bg-sand-text/95 text-white rounded-xl shadow-lg px-4 py-2 max-h-[200px] overflow-y-auto text-xs space-y-0.5">
          {selectedNames.map((name, i) => (
            <div key={i} className="truncate">
              {name}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 px-4 py-2.5 bg-sand-text text-white rounded-xl shadow-xl animate-slide-up">
        {/* Selected count — clickable to toggle list */}
        <button
          type="button"
          onClick={() => setShowList(!showList)}
          className="text-xs font-medium mr-2 shrink-0 hover:underline underline-offset-2"
          aria-expanded={showList}
        >
          {selectedCount} selected
        </button>

        {/* Divider */}
        <span className="w-px h-4 bg-white/20 shrink-0" aria-hidden="true" />

        {/* Install All */}
        <div className="flex items-center gap-1.5 flex-1">
          <button
            type="button"
            onClick={onInstallAll}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-accent-olive/40 bg-accent-olive/20 text-white hover:bg-accent-olive/30"
          >
            Install All
            <span className="text-[10px] bg-white/15 px-1.5 rounded ml-1.5">{selectedCount}</span>
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
    </div>
  );
}
