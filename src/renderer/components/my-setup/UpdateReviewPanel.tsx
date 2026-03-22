/**
 * Slide-out panel for reviewing and applying plugin updates.
 * Opens from the right, 50% width. Shows a scrollable list of UpdateCards
 * with a sticky footer for bulk actions.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useToolStore } from '@renderer/stores/tool-store';
import { useUiStore } from '@renderer/stores/ui-store';
import { UpdateCard } from './UpdateCard';
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/utils';

export function UpdateReviewPanel() {
  const updatePanelOpen = useUiStore((s) => s.updatePanelOpen);
  const updatePanelScrollTo = useUiStore((s) => s.updatePanelScrollTo);
  const closeUpdatePanel = useUiStore((s) => s.closeUpdatePanel);

  const availableUpdates = useToolStore((s) => s.availableUpdates);
  const isCheckingUpdates = useToolStore((s) => s.isCheckingUpdates);
  const checkForUpdates = useToolStore((s) => s.checkForUpdates);
  const applyAllUpdates = useToolStore((s) => s.applyAllUpdates);
  const updateStatuses = useToolStore((s) => s.updateStatuses);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cardRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeUpdatePanel();
    },
    [closeUpdatePanel],
  );

  useEffect(() => {
    if (!updatePanelOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [updatePanelOpen, handleKeyDown]);

  // Auto-scroll to target plugin when panel opens
  useEffect(() => {
    if (!updatePanelOpen || !updatePanelScrollTo) return;

    // Defer to let DOM render
    const timer = setTimeout(() => {
      const el = cardRefsMap.current.get(updatePanelScrollTo);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [updatePanelOpen, updatePanelScrollTo]);

  if (!updatePanelOpen) return null;

  // Count updates that are still actionable (not yet successfully applied)
  const actionableUpdates = availableUpdates.filter((u) => {
    const status = updateStatuses[u.pluginKey];
    return !status || status.state !== 'success';
  });

  const actionableKeys = actionableUpdates.map((u) => u.pluginKey);
  const hasAnyUpdating = actionableUpdates.some(
    (u) => updateStatuses[u.pluginKey]?.state === 'updating',
  );

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30" onClick={closeUpdatePanel} aria-hidden="true" />

      {/* Panel */}
      <aside
        className={cn(
          'fixed top-0 right-0 z-40 h-full w-[50%] min-w-[400px] max-w-[720px]',
          'bg-sand-paper border-l border-sand-border shadow-lg',
          'animate-slide-in-right flex flex-col',
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Plugin Updates"
      >
        {/* Header */}
        <div className="sticky top-0 bg-sand-paper border-b border-sand-border px-6 py-4 flex items-start justify-between shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-sand-text">Plugin Updates</h2>
            <p className="text-xs text-sand-muted mt-0.5">
              {availableUpdates.length} update{availableUpdates.length !== 1 ? 's' : ''} available
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="xs"
              onClick={() => checkForUpdates()}
              disabled={isCheckingUpdates}
            >
              {isCheckingUpdates ? (
                <span className="inline-flex items-center gap-1">
                  <span className="size-3 border-2 border-sand-muted border-t-accent-olive rounded-full animate-spin" />
                  Checking...
                </span>
              ) : (
                <>{'\u21BB'} Check now</>
              )}
            </Button>
            <button
              type="button"
              onClick={closeUpdatePanel}
              className="text-sand-muted hover:text-sand-text transition-colors p-1 -mr-1"
              aria-label="Close panel"
            >
              {'\u2715'}
            </button>
          </div>
        </div>

        {/* Body */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {availableUpdates.length === 0 && !isCheckingUpdates && (
            <div className="text-center py-12 text-sm text-sand-muted">
              All plugins are up to date.
            </div>
          )}

          {isCheckingUpdates && availableUpdates.length === 0 && (
            <div className="text-center py-12 text-sm text-sand-secondary">
              Checking for updates...
            </div>
          )}

          {availableUpdates.map((update) => (
            <div
              key={update.pluginKey}
              ref={(el) => {
                if (el) {
                  cardRefsMap.current.set(update.pluginKey, el);
                } else {
                  cardRefsMap.current.delete(update.pluginKey);
                }
              }}
            >
              <UpdateCard update={update} />
            </div>
          ))}
        </div>

        {/* Sticky footer */}
        {actionableKeys.length > 0 && (
          <div className="sticky bottom-0 bg-sand-paper border-t border-sand-border px-6 py-3 shrink-0">
            <Button
              className="w-full bg-[#6B7D5E] text-white hover:bg-[#6B7D5E]/90"
              size="sm"
              disabled={hasAnyUpdating}
              onClick={() => applyAllUpdates(actionableKeys)}
            >
              {hasAnyUpdating
                ? 'Updating...'
                : `Update all (${actionableKeys.length})`}
            </Button>
          </div>
        )}
      </aside>
    </>
  );
}
