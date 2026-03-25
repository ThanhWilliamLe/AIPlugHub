/**
 * Filter pills for the Browse tab — tool and type filters with counts.
 * Source: 5A-specs/browse-tab-spec.md §4 (Filter behavior)
 */

import type { ToolId, ComponentType } from '@shared/types';
import { TOOL_META, COMPONENT_TYPE_META } from '@shared/constants';
import {
  useBrowseStore,
  useBrowseToolCounts,
  useBrowseTypeCounts,
} from '@renderer/stores/browse-store';
import { cn } from '@renderer/lib/utils';

/** Format a sourceId for display (title-case words) */
function formatSourceName(sourceId: string): string {
  return sourceId
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Compute relative luminance and choose white or dark text for WCAG contrast */
function contrastTextColor(hexBg: string): string {
  const r = parseInt(hexBg.slice(1, 3), 16) / 255;
  const g = parseInt(hexBg.slice(3, 5), 16) / 255;
  const b = parseInt(hexBg.slice(5, 7), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.36 ? '#302B24' : '#FFFFFF';
}

export function BrowseFilterPills() {
  const {
    toolFilters,
    typeFilters,
    sourceFilters,
    toggleToolFilter,
    toggleTypeFilter,
    toggleSourceFilter,
    clearFilters,
    searchQuery,
    entries,
  } = useBrowseStore();
  const toolCounts = useBrowseToolCounts();
  const typeCounts = useBrowseTypeCounts();

  // Count entries per source
  const sourceCounts = new Map<string, number>();
  for (const e of entries) {
    sourceCounts.set(e.sourceId, (sourceCounts.get(e.sourceId) ?? 0) + 1);
  }

  const activeTools = Array.from(toolCounts.keys());
  const activeTypes = Array.from(typeCounts.keys());
  const isFiltered =
    toolFilters.length > 0 ||
    typeFilters.length > 0 ||
    sourceFilters.length > 0 ||
    searchQuery.trim() !== '';

  if (activeTools.length === 0 && activeTypes.length === 0) return null;

  return (
    <div className="space-y-1.5" role="group" aria-label="Filters">
      {/* Source filters (only when 2+ sources) */}
      {sourceCounts.size > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-sand-secondary">Sources:</span>
          {Array.from(sourceCounts.entries()).map(([sourceId, count]) => (
            <button
              key={sourceId}
              type="button"
              onClick={() => toggleSourceFilter(sourceId)}
              className={cn(
                'px-2 py-1 rounded-full text-xs transition-colors',
                sourceFilters.includes(sourceId)
                  ? 'bg-accent-olive text-white'
                  : 'bg-sand-surface text-sand-text hover:bg-sand-surface/80',
              )}
              aria-pressed={sourceFilters.includes(sourceId)}
            >
              {formatSourceName(sourceId)} ({count})
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {/* Tool filters (hidden when only one tool present) */}
        {activeTools.length > 1 &&
          activeTools.map((toolId: ToolId) => {
            const active = toolFilters.includes(toolId);
            const meta = TOOL_META[toolId];
            const count = toolCounts.get(toolId) ?? 0;
            return (
              <button
                key={toolId}
                type="button"
                onClick={() => toggleToolFilter(toolId)}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  active
                    ? 'bg-accent-olive text-white'
                    : 'bg-sand-surface text-sand-secondary hover:bg-sand-surface/80',
                )}
                aria-pressed={active}
              >
                <span aria-hidden="true">{meta.emoji}</span>
                {meta.label}
                <span className="opacity-70">({count})</span>
              </button>
            );
          })}

        {/* Separator */}
        {activeTools.length > 1 && activeTypes.length > 0 && (
          <span className="w-px h-4 bg-sand-border mx-1" aria-hidden="true" />
        )}

        {/* Type filters */}
        {activeTypes.map((type: ComponentType) => {
          const active = typeFilters.includes(type);
          const meta = COMPONENT_TYPE_META[type];
          const count = typeCounts.get(type) ?? 0;
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleTypeFilter(type)}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                active ? '' : 'bg-sand-surface text-sand-secondary hover:bg-sand-surface/80',
              )}
              style={
                active
                  ? { backgroundColor: meta.color, color: contrastTextColor(meta.color) }
                  : undefined
              }
              aria-pressed={active}
              title={meta.tooltip}
            >
              {meta.label}
              <span className="opacity-70">({count})</span>
            </button>
          );
        })}

        {/* Clear all */}
        {isFiltered && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-sand-muted hover:text-sand-secondary ml-1 underline-offset-2 hover:underline transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
