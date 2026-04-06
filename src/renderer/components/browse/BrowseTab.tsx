/**
 * Browse tab — marketplace storefront client.
 * Fetches, searches, filters, and displays marketplace plugins.
 * Supports keyboard navigation (roving focus) and multi-select with Install All.
 * Source: 5A-specs/browse-tab-spec.md §4, keyboard-browse-multiselect-spec.md
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  useBrowseStore,
  useFilteredEntries,
  marketplaceRefEquals,
} from '@renderer/stores/browse-store';
import { useToolStore } from '@renderer/stores/tool-store';
import { isEntryInstalled } from '@renderer/lib/install-match';
import { useRovingFocus } from '@renderer/hooks/useRovingFocus';
import type { MarketplaceRef } from '@shared/types';
import { BrowseSearchBar } from './BrowseSearchBar';
import { BrowseFilterPills } from './BrowseFilterPills';
import { BrowseResultCard } from './BrowseResultCard';
import { BrowseDetailPanel } from './BrowseDetailPanel';
import { BrowseBulkActionBar } from './BrowseBulkActionBar';
import { BrowseInstallAllModal } from './BrowseInstallAllModal';
import { PopularSection } from './PopularSection';
import { GettingStarted } from './GettingStarted';
import { MarketplaceSourcesModal } from './MarketplaceSourcesModal';
import { EmptyState } from '@renderer/components/shared/EmptyState';
import { Button } from '@renderer/components/ui/button';
import type { BrowseSortBy } from '@renderer/stores/browse-store';
import { cn } from '@renderer/lib/utils';

const SORT_OPTIONS: { value: BrowseSortBy; label: string }[] = [
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'updated', label: 'Recently Updated' },
  { value: 'relevance', label: 'Relevance' },
  { value: 'popularity', label: 'Popularity' },
];

export function BrowseTab() {
  const isLoading = useBrowseStore((s) => s.isLoading);
  const error = useBrowseStore((s) => s.error);
  const entries = useBrowseStore((s) => s.entries);
  const searchQuery = useBrowseStore((s) => s.searchQuery);
  const sortBy = useBrowseStore((s) => s.sortBy);
  const selectedRef = useBrowseStore((s) => s.selectedRef);
  const isOffline = useBrowseStore((s) => s.isOffline);
  const loadEntries = useBrowseStore((s) => s.loadEntries);
  const refresh = useBrowseStore((s) => s.refresh);
  const openDetail = useBrowseStore((s) => s.openDetail);
  const setSortBy = useBrowseStore((s) => s.setSortBy);
  const clearError = useBrowseStore((s) => s.clearError);

  const toolFilters = useBrowseStore((s) => s.toolFilters);
  const typeFilters = useBrowseStore((s) => s.typeFilters);
  const installedComponents = useToolStore((s) => s.components);

  // Selection mode state
  const browseSelectionMode = useBrowseStore((s) => s.browseSelectionMode);
  const browseSelectedRefs = useBrowseStore((s) => s.browseSelectedRefs);
  const enterBrowseSelectionMode = useBrowseStore((s) => s.enterBrowseSelectionMode);
  const exitBrowseSelectionMode = useBrowseStore((s) => s.exitBrowseSelectionMode);
  const toggleBrowseSelectRef = useBrowseStore((s) => s.toggleBrowseSelectRef);
  const setBrowseSelectedRefs = useBrowseStore((s) => s.setBrowseSelectedRefs);

  const [showSourcesModal, setShowSourcesModal] = useState(false);
  const [showInstallAllModal, setShowInstallAllModal] = useState(false);
  const [gettingStartedExpanded, setGettingStartedExpanded] = useState(false);

  const filteredEntries = useFilteredEntries();
  const initialized = useRef(false);

  const showPopular = !searchQuery;

  // Load entries on first mount; close detail panel + exit selection on unmount (tab switch)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    return () => {
      useBrowseStore.getState().closeDetail();
      useBrowseStore.getState().exitBrowseSelectionMode();
    };
  }, []);

  const handleSelectEntry = useCallback(
    (ref: MarketplaceRef) => {
      if (selectedRef && selectedRef.sourceId === ref.sourceId && selectedRef.ref === ref.ref) {
        useBrowseStore.getState().closeDetail();
      } else {
        openDetail(ref);
      }
    },
    [selectedRef, openDetail],
  );

  const handleToggleSelect = useCallback(
    (ref: MarketplaceRef, index?: number) => {
      toggleBrowseSelectRef(ref, index);
    },
    [toggleBrowseSelectRef],
  );

  // Roving focus for filtered entries
  const rovingFocus = useRovingFocus({
    itemCount: filteredEntries.length,
    onEnter: (index) => {
      const entry = filteredEntries[index];
      if (entry) handleSelectEntry({ sourceId: entry.sourceId, ref: entry.ref });
    },
    onSpace: (index) => {
      // Auto-enter selection mode on Space if not already in it
      if (!browseSelectionMode) enterBrowseSelectionMode();
      const entry = filteredEntries[index];
      if (entry) handleToggleSelect({ sourceId: entry.sourceId, ref: entry.ref }, index);
    },
    onEscape: () => {
      if (browseSelectionMode) {
        exitBrowseSelectionMode();
      } else if (selectedRef) {
        useBrowseStore.getState().closeDetail();
      }
    },
    resetDeps: [searchQuery, toolFilters, typeFilters],
  });

  // Ctrl+A select all visible (in selection mode)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && browseSelectionMode) {
        e.preventDefault();
        const visibleRefs = filteredEntries.map((entry) => ({
          sourceId: entry.sourceId,
          ref: entry.ref,
        }));
        // Keep hidden selections + add all visible
        const hiddenSelected = browseSelectedRefs.filter(
          (ref) => !filteredEntries.some((e) => e.sourceId === ref.sourceId && e.ref === ref.ref),
        );
        setBrowseSelectedRefs([...hiddenSelected, ...visibleRefs]);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [browseSelectionMode, filteredEntries, browseSelectedRefs, setBrowseSelectedRefs]);

  // Shift+Space range select handler
  const handleShiftSpace = useCallback(
    (e: React.KeyboardEvent) => {
      if (!browseSelectionMode || !e.shiftKey || e.key !== ' ' || rovingFocus.focusIndex < 0)
        return;

      const lastIdx = useBrowseStore.getState().lastToggledIndex;
      if (lastIdx < 0) return;

      e.preventDefault();
      e.stopPropagation();

      const start = Math.min(lastIdx, rovingFocus.focusIndex);
      const end = Math.max(lastIdx, rovingFocus.focusIndex);

      // Build refs for the range, merging with existing selection
      const currentRefs = useBrowseStore.getState().browseSelectedRefs;
      const newRefs = [...currentRefs];
      for (let i = start; i <= end; i++) {
        const entry = filteredEntries[i];
        if (!entry) continue;
        const ref: MarketplaceRef = { sourceId: entry.sourceId, ref: entry.ref };
        if (!newRefs.some((r) => marketplaceRefEquals(r, ref))) {
          newRefs.push(ref);
        }
      }
      setBrowseSelectedRefs(newRefs);
    },
    [browseSelectionMode, rovingFocus.focusIndex, filteredEntries, setBrowseSelectedRefs],
  );

  const handleInstallAll = useCallback(() => {
    setShowInstallAllModal(true);
  }, []);

  const handleInstallAllClose = useCallback(() => {
    setShowInstallAllModal(false);
    exitBrowseSelectionMode();
  }, [exitBrowseSelectionMode]);

  // The modal must render in all states (including empty/error) so users can manage sources
  const sourcesModal = (
    <MarketplaceSourcesModal
      open={showSourcesModal}
      onClose={() => setShowSourcesModal(false)}
      onSourcesChanged={refresh}
    />
  );

  // Loading state
  if (isLoading && entries.length === 0) {
    return (
      <>
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-sand-secondary animate-pulse">Loading marketplace...</p>
        </div>
        {sourcesModal}
      </>
    );
  }

  // Error with no cached data
  if (error && entries.length === 0) {
    return (
      <>
        <EmptyState
          icon={'\u{1F4E1}'}
          title="Couldn't reach marketplace sources"
          description={error}
          action={
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    clearError();
                    loadEntries();
                  }}
                >
                  Retry
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowSourcesModal(true)}>
                  Manage Sources
                </Button>
              </div>
              <p className="text-xs text-sand-muted select-all max-w-md text-center">{error}</p>
            </div>
          }
        />
        {sourcesModal}
      </>
    );
  }

  // No entries (but sources fetched successfully)
  if (!isLoading && entries.length === 0 && !error) {
    return (
      <>
        <EmptyState
          icon={'\u{1F4E6}'}
          title="No plugins available"
          description="No plugins available from your configured sources. This is unusual — try refreshing or adding another source."
          action={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={refresh}>
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowSourcesModal(true)}>
                Manage Sources
              </Button>
            </div>
          }
        />
        {sourcesModal}
      </>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Getting Started onboarding overlay (UX-09) — covers entire tab when expanded */}
      <GettingStarted
        onSelectEntry={handleSelectEntry}
        onSourcesAdded={refresh}
        onExpandedChange={setGettingStartedExpanded}
      />

      {/* Browse content — hidden when Getting Started overlay is expanded */}
      {gettingStartedExpanded ? null : (
        <>
          {/* Error banner for partial failures */}
          {error && entries.length > 0 && (
            <div
              className="flex items-center gap-3 px-4 py-2.5 bg-accent-destructive/10 border-b border-accent-destructive/20 text-sm"
              role="alert"
            >
              <span className="text-accent-destructive flex-1">{error}</span>
              <button
                type="button"
                onClick={clearError}
                className="text-accent-destructive/60 hover:text-accent-destructive text-xs underline-offset-2 hover:underline shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Offline banner */}
          {isOffline && (
            <div className="px-4 py-2 bg-sand-surface border-b border-sand-border text-xs text-sand-muted">
              Offline — showing cached results
            </div>
          )}

          {/* Toolbar */}
          <div className="px-4 py-3 space-y-2 border-b border-sand-border">
            <div className="flex items-center gap-3">
              <BrowseSearchBar />

              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as BrowseSortBy)}
                className={cn(
                  'text-xs px-2 py-2 rounded-lg border border-sand-border bg-sand-surface/50',
                  'text-sand-text focus:outline-none focus:ring-2 focus:ring-accent-olive/40',
                )}
                aria-label="Sort by"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Select / Selecting toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={browseSelectionMode ? exitBrowseSelectionMode : enterBrowseSelectionMode}
                className={cn(
                  browseSelectionMode &&
                    'bg-[#4A7FB5] text-white border-[#4A7FB5] hover:bg-[#4A7FB5]/90',
                )}
                title="Toggle selection mode (Ctrl+Shift+S)"
              >
                {browseSelectionMode ? 'Selecting' : 'Select'}
              </Button>

              {/* Selection helpers */}
              {browseSelectionMode && (
                <span className="text-xs text-sand-muted">
                  {browseSelectedRefs.length} selected
                  {' \u00B7 '}
                  <button
                    type="button"
                    className="text-accent-olive hover:underline"
                    onClick={() => {
                      const visibleRefs = filteredEntries.map((e) => ({
                        sourceId: e.sourceId,
                        ref: e.ref,
                      }));
                      setBrowseSelectedRefs(visibleRefs);
                    }}
                  >
                    Select all visible
                  </button>
                  {browseSelectedRefs.length > 0 && (
                    <>
                      {' \u00B7 '}
                      <button
                        type="button"
                        className="text-sand-muted hover:text-sand-text hover:underline"
                        onClick={() => setBrowseSelectedRefs([])}
                      >
                        Deselect all
                      </button>
                    </>
                  )}
                </span>
              )}

              {/* Sources */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSourcesModal(true)}
                aria-label="Manage marketplace sources"
                title="Manage marketplace sources"
              >
                Sources
              </Button>

              {/* Refresh */}
              <Button
                variant="outline"
                size="sm"
                onClick={refresh}
                disabled={isLoading}
                aria-label="Refresh marketplace"
              >
                {isLoading ? '...' : '\u21BB'}
              </Button>
            </div>

            <BrowseFilterPills />
          </div>

          {/* Results — with roving focus keyboard handler */}
          <div
            className="flex-1 overflow-y-auto px-4 py-3"
            onKeyDown={(e) => {
              handleShiftSpace(e);
              if (!e.defaultPrevented) rovingFocus.handleListKeyDown(e);
            }}
            role="listbox"
            aria-label="Browse results"
          >
            {isLoading && entries.length > 0 && (
              <div className="text-center py-2 text-xs text-sand-muted animate-pulse mb-3">
                Refreshing...
              </div>
            )}

            {filteredEntries.length === 0 &&
              (searchQuery.trim() || toolFilters.length > 0 || typeFilters.length > 0) && (
                <EmptyState
                  icon={'\u{1F50E}'}
                  title={
                    searchQuery.trim()
                      ? `No plugins found matching "${searchQuery}"`
                      : 'No plugins match your current filters'
                  }
                  description="Try different keywords or clear your filters."
                  action={
                    <button
                      type="button"
                      onClick={() => useBrowseStore.getState().clearFilters()}
                      className="text-sm text-accent-olive hover:underline"
                    >
                      Clear filters
                    </button>
                  }
                />
              )}

            {showPopular && (
              <>
                <div className="px-1 mb-4 text-sm text-sand-secondary">
                  <span className="font-medium text-sand-text">New to plugins?</span> Start with the
                  popular ones below, or search for something specific.
                </div>
                <PopularSection entries={entries} onSelect={handleSelectEntry} />
              </>
            )}

            {/* Keyboard navigation hint */}
            {filteredEntries.length > 0 && (
              <p className="text-[11px] text-sand-muted mb-2 select-none">
                {'\u2191\u2193'} navigate {'\u00B7'} Enter view
                {browseSelectionMode && (
                  <>
                    {' \u00B7'} Space toggle {'\u00B7'} Shift+Space range
                  </>
                )}
                {' \u00B7'} Esc close
              </p>
            )}

            <div className="grid gap-2">
              {filteredEntries.map((entry, index) => {
                const ref: MarketplaceRef = { sourceId: entry.sourceId, ref: entry.ref };
                const isChecked = browseSelectedRefs.some((r) => marketplaceRefEquals(r, ref));
                return (
                  <BrowseResultCard
                    key={`${entry.sourceId}:${entry.ref}`}
                    entry={entry}
                    selected={
                      selectedRef?.sourceId === entry.sourceId && selectedRef?.ref === entry.ref
                    }
                    isInstalled={isEntryInstalled(installedComponents, entry)}
                    onSelect={handleSelectEntry}
                    selectionMode={browseSelectionMode}
                    checked={isChecked}
                    onCheckChange={handleToggleSelect}
                    rovingProps={rovingFocus.getItemProps(index)}
                  />
                );
              })}
            </div>

            {/* Bulk action bar (selection mode) */}
            {browseSelectionMode && browseSelectedRefs.length > 0 && (
              <BrowseBulkActionBar
                selectedCount={browseSelectedRefs.length}
                selectedNames={browseSelectedRefs.map((r) => {
                  const entry = entries.find((e) => e.sourceId === r.sourceId && e.ref === r.ref);
                  return entry?.displayName ?? entry?.name ?? r.ref;
                })}
                onInstallAll={handleInstallAll}
                onCancel={exitBrowseSelectionMode}
              />
            )}
          </div>

          {/* Detail panel */}
          <BrowseDetailPanel />

          {/* end of browse content conditional */}
        </>
      )}

      {/* Marketplace sources modal */}
      {sourcesModal}

      {/* Install All modal */}
      <BrowseInstallAllModal
        open={showInstallAllModal}
        selectedRefs={browseSelectedRefs}
        onClose={handleInstallAllClose}
      />
    </div>
  );
}
