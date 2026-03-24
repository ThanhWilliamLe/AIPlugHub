/**
 * Plugin result card for the Browse tab.
 * Shows name, description, tool badges, type badges, author, version.
 * Source: 5A-specs/browse-tab-spec.md §4 (Result card)
 */

import React from 'react';
import type { MarketplaceEntry, MarketplaceRef } from '@shared/types';
import { TOOL_META } from '@shared/constants';
import { TypeBadge } from '@renderer/components/shared/TypeBadge';
import { cn } from '@renderer/lib/utils';
import type { ComponentType } from '@shared/types';

type BrowseResultCardProps = {
  entry: MarketplaceEntry;
  selected: boolean;
  onSelect: (ref: MarketplaceRef) => void;
};

export const BrowseResultCard = React.memo(function BrowseResultCard({
  entry,
  selected,
  onSelect,
}: BrowseResultCardProps) {
  const ref: MarketplaceRef = { sourceId: entry.sourceId, ref: entry.ref };

  // Get component types present in this entry
  const componentTypes = entry.componentCounts
    ? (Object.entries(entry.componentCounts)
        .filter(([, count]) => (count ?? 0) > 0)
        .map(([type]) => type) as ComponentType[])
    : [];

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'w-full px-4 py-3 text-left rounded-lg border border-sand-border/60 transition-all cursor-pointer',
        'hover:bg-sand-surface/60 hover:border-sand-border hover:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-olive/40',
        selected && 'bg-sand-surface ring-1 ring-accent-olive/30',
      )}
      onClick={() => onSelect(ref)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(ref);
        }
      }}
      aria-current={selected ? 'true' : undefined}
    >
      {/* Header: name + version */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-medium text-sand-text truncate">
          {entry.displayName ?? entry.name}
        </span>
        {entry.version && (
          <span className="text-xs text-sand-muted shrink-0">v{entry.version}</span>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-sand-secondary mt-1 line-clamp-3">{entry.description}</p>

      {/* Footer: badges + author */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {/* Tool badges */}
        {entry.tools.map((toolId) => {
          const meta = TOOL_META[toolId];
          if (!meta) return null;
          return (
            <span key={toolId} className="inline-flex items-center gap-0.5 text-xs text-sand-muted">
              <span aria-hidden="true">{meta.emoji}</span>
              {meta.label}
            </span>
          );
        })}

        {/* Type badges */}
        {componentTypes.map((type) => (
          <TypeBadge key={type} type={type} />
        ))}

        {/* Source tag */}
        <span className="text-xs text-sand-muted font-mono">
          @{entry.sourceId}
        </span>

        {/* Star badge (USR-09) */}
        {entry.starCount !== undefined && (
          <span className="inline-flex items-center gap-0.5 text-xs text-sand-muted">
            ★ {entry.starCount.toLocaleString()}
          </span>
        )}

        {/* Author */}
        {entry.author && (
          <span className="text-xs text-sand-muted ml-auto">
            by{' '}
            {typeof entry.author === 'string'
              ? entry.author
              : ((entry.author as { name?: string }).name ?? 'Unknown')}
          </span>
        )}
      </div>
    </div>
  );
});
