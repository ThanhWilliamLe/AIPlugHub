/**
 * Toolbar pill showing available update count.
 * Hidden when no updates are available. Clicking opens the UpdateReviewPanel.
 */

import { useToolStore } from '@renderer/stores/tool-store';
import { useUiStore } from '@renderer/stores/ui-store';

export function UpdateToolbarPill() {
  const count = useToolStore((s) => s.availableUpdates.length);
  const openUpdatePanel = useUiStore((s) => s.openUpdatePanel);

  if (count === 0) return null;

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#6B7D5E] text-white text-xs font-medium transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B7D5E]/40"
      onClick={() => openUpdatePanel()}
    >
      {'\u2B06'} {count} update{count !== 1 ? 's' : ''}
    </button>
  );
}
