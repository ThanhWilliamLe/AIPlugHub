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
  isInstalled: boolean;
  onSelect: (ref: MarketplaceRef) => void;
  /** Selection mode (multi-select) */
  selectionMode?: boolean;
  /** Whether this card is checked in selection mode */
  checked?: boolean;
  /** Toggle check in selection mode */
  onCheckChange?: (ref: MarketplaceRef) => void;
  /** Roving focus props (tabIndex + ref) */
  rovingProps?: {
    tabIndex: number;
    ref: (el: HTMLElement | null) => void;
    'data-focus-index': number;
  };
};

export const BrowseResultCard = React.memo(function BrowseResultCard({
  entry,
  selected,
  isInstalled,
  onSelect,
  selectionMode = false,
  checked = false,
  onCheckChange,
  rovingProps,
}: BrowseResultCardProps) {
  const entryRef: MarketplaceRef = { sourceId: entry.sourceId, ref: entry.ref };

  // Get component types present in this entry
  const componentTypes = entry.componentCounts
    ? (Object.entries(entry.componentCounts)
        .filter(([, count]) => (count ?? 0) > 0)
        .map(([type]) => type) as ComponentType[])
    : [];

  const handleClick = () => {
    if (selectionMode && onCheckChange) {
      onCheckChange(entryRef);
    } else {
      onSelect(entryRef);
    }
  };

  return (
    <div
      role="button"
      tabIndex={rovingProps?.tabIndex ?? 0}
      ref={rovingProps?.ref}
      data-focus-index={rovingProps?.['data-focus-index']}
      className={cn(
        'w-full px-4 py-3 text-left rounded-lg border border-sand-border/60 transition-all cursor-pointer',
        'hover:bg-sand-surface/60 hover:border-sand-border hover:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-olive/40',
        selected && 'bg-sand-surface ring-1 ring-accent-olive/30',
        isInstalled && 'opacity-60 hover:opacity-100',
        selectionMode && checked && 'bg-[#4A7FB5]/10 ring-1 ring-[#4A7FB5]/20',
      )}
      onClick={handleClick}
      onKeyDown={(e) => {
        // Enter/Space handled by roving focus hook at container level;
        // fallback for non-roving usage
        if (!rovingProps && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-current={selected ? 'true' : undefined}
    >
      {selectionMode && (
        <div className="flex items-center gap-3 mb-1">
          <input
            type="checkbox"
            checked={checked}
            aria-label={`Select ${entry.displayName ?? entry.name}`}
            className="w-3.5 h-3.5 shrink-0 accent-[#4A7FB5] cursor-pointer"
            onChange={() => onCheckChange?.(entryRef)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      {/* Header: name + installed badge + version */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-sm font-medium text-sand-text truncate">
            {entry.displayName ?? entry.name}
          </span>
          {isInstalled && (
            <span className="shrink-0 text-[10px] font-medium text-accent-olive bg-accent-olive/10 px-1.5 py-0.5 rounded">
              Installed
            </span>
          )}
        </div>
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
        <span className="text-xs text-sand-muted font-mono">@{entry.sourceId}</span>

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
