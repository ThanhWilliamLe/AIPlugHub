/**
 * Horizontal scrollable "Popular" section showing top plugins by GitHub stars.
 * Reads from full entry list (not filtered). Hidden when no stars available.
 */

import React, { useMemo } from 'react';
import type { MarketplaceEntry, MarketplaceRef } from '@shared/types';

type PopularSectionProps = {
  entries: MarketplaceEntry[];
  onSelect: (ref: MarketplaceRef) => void;
};

const MAX_POPULAR = 10;

export const PopularSection = React.memo(function PopularSection({
  entries,
  onSelect,
}: PopularSectionProps) {
  const popular = useMemo(() => {
    return entries
      .filter((e) => e.starCount !== undefined)
      .sort((a, b) => b.starCount! - a.starCount!)
      .slice(0, MAX_POPULAR);
  }, [entries]);

  if (popular.length === 0) return null;

  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-sand-text mb-2 px-2">
        ★ Popular
      </h3>
      <div className="flex gap-3 overflow-x-auto px-2 pb-2 snap-x snap-mandatory">
        {popular.map((entry) => (
          <button
            key={`${entry.sourceId}:${entry.ref}`}
            type="button"
            className="min-w-[160px] max-w-[200px] shrink-0 snap-start rounded-lg border border-sand-border bg-sand-paper p-3 text-left hover:bg-sand-surface/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-olive/40"
            onClick={() => onSelect({ sourceId: entry.sourceId, ref: entry.ref })}
          >
            <div className="text-xs text-sand-muted mb-1">
              ★ {entry.starCount!.toLocaleString()}
            </div>
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
