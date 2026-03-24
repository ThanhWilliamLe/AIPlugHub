/**
 * Horizontal scrollable "Popular" section showing top plugins.
 * Prefers entries with GitHub stars, falls back to showing featured entries
 * (by keyword count as a proxy for richness) when star data is sparse.
 */

import React, { useMemo } from 'react';
import type { MarketplaceEntry, MarketplaceRef } from '@shared/types';

type PopularSectionProps = {
  entries: MarketplaceEntry[];
  onSelect: (ref: MarketplaceRef) => void;
};

const MAX_POPULAR = 10;
/** If fewer than this many entries have stars, fall back to featured mode */
const MIN_STAR_ENTRIES = 3;

export const PopularSection = React.memo(function PopularSection({
  entries,
  onSelect,
}: PopularSectionProps) {
  const { items, hasStars } = useMemo(() => {
    const starred = entries
      .filter((e) => e.starCount !== undefined)
      .sort((a, b) => b.starCount! - a.starCount!);

    if (starred.length >= MIN_STAR_ENTRIES) {
      return { items: starred.slice(0, MAX_POPULAR), hasStars: true };
    }

    // Fallback: show "Featured" entries — prefer those with keywords/descriptions
    // as a proxy for completeness, then alphabetical
    const featured = [...entries]
      .sort((a, b) => {
        // Starred entries first
        const aStars = a.starCount ?? 0;
        const bStars = b.starCount ?? 0;
        if (aStars !== bStars) return bStars - aStars;
        // Then by keyword richness
        const aKeywords = a.keywords?.length ?? 0;
        const bKeywords = b.keywords?.length ?? 0;
        if (aKeywords !== bKeywords) return bKeywords - aKeywords;
        // Then alphabetical
        return a.name.localeCompare(b.name);
      })
      .slice(0, MAX_POPULAR);

    return { items: featured, hasStars: false };
  }, [entries]);

  if (items.length === 0) return null;

  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-sand-text mb-2 px-2">
        {hasStars ? '★ Popular' : '★ Featured'}
      </h3>
      <div className="flex gap-3 overflow-x-auto px-2 pb-2 snap-x snap-mandatory">
        {items.map((entry) => (
          <button
            key={`${entry.sourceId}:${entry.ref}`}
            type="button"
            className="min-w-[160px] max-w-[200px] shrink-0 snap-start rounded-lg border border-sand-border bg-sand-paper p-3 text-left hover:bg-sand-surface/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-olive/40"
            onClick={() => onSelect({ sourceId: entry.sourceId, ref: entry.ref })}
          >
            {entry.starCount !== undefined && (
              <div className="text-xs text-sand-muted mb-1">
                ★ {entry.starCount.toLocaleString()}
              </div>
            )}
            <div className="font-mono text-sm text-sand-text truncate">
              {entry.displayName ?? entry.name}
            </div>
            <div className="text-xs text-sand-secondary mt-0.5 line-clamp-1">
              {entry.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
});
