/**
 * Browse tab — marketplace storefront client.
 * Fetches, searches, filters, and displays marketplace plugins.
 * Source: 5A-specs/browse-tab-spec.md §4
 */

import { useEffect, useRef, useCallback } from 'react';
import { useBrowseStore, useFilteredEntries } from '@renderer/stores/browse-store';
import type { MarketplaceRef } from '@shared/types';
import { BrowseSearchBar } from './BrowseSearchBar';
import { BrowseFilterPills } from './BrowseFilterPills';
import { BrowseResultCard } from './BrowseResultCard';
import { BrowseDetailPanel } from './BrowseDetailPanel';
import { PopularSection } from './PopularSection';
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
  const sourceFilters = useBrowseStore((s) => s.sourceFilters);

  const filteredEntries = useFilteredEntries();
  const initialized = useRef(false);

  const showPopular =
    !searchQuery &&
    toolFilters.length === 0 &&
    typeFilters.length === 0 &&
    sourceFilters.length === 0;

  // Load entries on first mount; close detail panel on unmount (tab switch)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    return () => {
      useBrowseStore.getState().closeDetail();
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

  // Loading state
  if (isLoading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-sand-secondary animate-pulse">Loading marketplace...</p>
      </div>
    );
  }

  // Error with no cached data
  if (error && entries.length === 0) {
    return (
      <EmptyState
        icon="\u{1F4E1}"
        title="Couldn't reach marketplace sources"
        description="Check your internet connection and try again."
        action={
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
          </div>
        }
      />
    );
  }

  // No entries (but sources fetched successfully)
  if (!isLoading && entries.length === 0 && !error) {
    return (
      <EmptyState
        icon="\u{1F4E6}"
        title="No plugins available"
        description="No plugins available from your configured sources. This is unusual — try refreshing or adding another source."
        action={
          <Button variant="outline" size="sm" onClick={refresh}>
            Refresh
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
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

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading && entries.length > 0 && (
          <div className="text-center py-2 text-xs text-sand-muted animate-pulse mb-3">
            Refreshing...
          </div>
        )}

        {filteredEntries.length === 0 &&
          (searchQuery.trim() || toolFilters.length > 0 || typeFilters.length > 0) && (
            <EmptyState
              icon="\u{1F50E}"
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
            <PopularSection entries={entries} onSelect={(ref) => openDetail(ref)} />
          </>
        )}

        <div className="grid gap-2">
          {filteredEntries.map((entry) => (
            <BrowseResultCard
              key={`${entry.sourceId}:${entry.ref}`}
              entry={entry}
              selected={selectedRef?.sourceId === entry.sourceId && selectedRef?.ref === entry.ref}
              onSelect={handleSelectEntry}
            />
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <BrowseDetailPanel />
    </div>
  );
}
