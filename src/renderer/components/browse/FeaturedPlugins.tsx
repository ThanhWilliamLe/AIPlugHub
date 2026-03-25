/**
 * Featured/popular plugin cards for the Getting Started section (UX-13).
 * Shows curated featured entries first, then top-N by stars from browse data.
 * Source: 5A-specs/getting-started-spec.md §UX-13
 */

import React, { useMemo } from 'react';
import type { FeaturedPlugin, MarketplaceRef, SuggestedSourcesManifest } from '@shared/types';
import { useBrowseStore } from '@renderer/stores/browse-store';
import { cn } from '@renderer/lib/utils';

const MAX_CARDS = 6;

type FeaturedPluginsProps = {
  manifest: SuggestedSourcesManifest;
  onSelect: (ref: MarketplaceRef) => void;
};

export const FeaturedPlugins = React.memo(function FeaturedPlugins({
  manifest,
  onSelect,
}: FeaturedPluginsProps) {
  const entries = useBrowseStore((s) => s.entries);
  const installingRef = useBrowseStore((s) => s.installingRef);

  const cards = useMemo(() => {
    const result: Array<{
      key: string;
      name: string;
      description: string;
      starCount?: number;
      ref: MarketplaceRef;
    }> = [];

    // 1. Featured entries from manifest (shown first)
    const featured: FeaturedPlugin[] = manifest.featured;
    for (const fp of featured) {
      if (result.length >= MAX_CARDS) break;
      result.push({
        key: `featured-${fp.sourceId}:${fp.ref}`,
        name: fp.name,
        description: fp.description,
        ref: { sourceId: fp.sourceId, ref: fp.ref },
      });
    }

    // 2. Fill remaining slots with top-N by star count from browse entries
    if (result.length < MAX_CARDS) {
      const starred = entries
        .filter((e) => e.starCount !== undefined && e.starCount > 0)
        .sort((a, b) => b.starCount! - a.starCount!);

      for (const entry of starred) {
        if (result.length >= MAX_CARDS) break;
        // Avoid duplicates with featured entries
        const isDuplicate = result.some(
          (r) => r.ref.sourceId === entry.sourceId && r.ref.ref === entry.ref,
        );
        if (isDuplicate) continue;

        result.push({
          key: `star-${entry.sourceId}:${entry.ref}`,
          name: entry.displayName ?? entry.name,
          description: entry.description,
          starCount: entry.starCount,
          ref: { sourceId: entry.sourceId, ref: entry.ref },
        });
      }
    }

    return result;
  }, [entries, manifest]);

  if (cards.length === 0) return null;

  return (
    <div>
      <h4 className="text-sm font-medium text-sand-text mb-2">Popular plugins</h4>
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
        {cards.map((card) => {
          const isInstalling =
            installingRef?.sourceId === card.ref.sourceId && installingRef?.ref === card.ref.ref;
          return (
            <div
              key={card.key}
              className="min-w-[180px] max-w-[220px] shrink-0 snap-start rounded-lg border border-sand-border bg-sand-paper p-3 flex flex-col gap-1.5"
            >
              <button
                type="button"
                className="text-left flex-1 focus-visible:outline-none"
                onClick={() => onSelect(card.ref)}
              >
                {card.starCount !== undefined && (
                  <div className="text-xs text-sand-muted mb-0.5">
                    {'\u2605'} {card.starCount.toLocaleString()}
                  </div>
                )}
                <div className="font-mono text-sm text-sand-text truncate">{card.name}</div>
                <div className="text-xs text-sand-secondary mt-0.5 line-clamp-2">
                  {card.description}
                </div>
              </button>
              <button
                type="button"
                disabled={isInstalling}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(card.ref);
                }}
                className={cn(
                  'mt-auto px-2 py-1 text-xs font-medium rounded transition-colors',
                  'bg-accent-olive/10 text-accent-olive hover:bg-accent-olive/20',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-olive/40',
                )}
              >
                {isInstalling ? 'Installing...' : 'View'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
});
