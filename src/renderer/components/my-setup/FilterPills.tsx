/**
 * Dynamic filter pills — tool, type, and scope filters with counts.
 * Only shows filters for types/tools that exist in the user's setup.
 */

import type { ToolId, ComponentType } from '@shared/types';
import { TOOL_META, COMPONENT_TYPE_META } from '@shared/constants';
import { useUiStore } from '@renderer/stores/ui-store';
import { useComponents } from '@renderer/hooks/useComponents';
import { cn } from '@renderer/lib/utils';

/** Compute relative luminance and choose white or dark text for WCAG contrast */
function contrastTextColor(hexBg: string): string {
  const r = parseInt(hexBg.slice(1, 3), 16) / 255;
  const g = parseInt(hexBg.slice(3, 5), 16) / 255;
  const b = parseInt(hexBg.slice(5, 7), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  // Use dark text if background is light (luminance > 0.36 ≈ 4.5:1 threshold)
  return luminance > 0.36 ? '#302B24' : '#FFFFFF';
}

export function FilterPills() {
  const {
    toolFilters,
    typeFilters,
    scopeFilter,
    toggleToolFilter,
    toggleTypeFilter,
    toggleScopeFilter,
    clearFilters,
  } = useUiStore();
  const { activeTools, activeTypes, toolCounts, typeCounts, scopeCounts, isFiltered } =
    useComponents();

  if (activeTools.length === 0) return null;

  const hasPlugins = scopeCounts.plugin > 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filters">
      {/* Tool filters — only show when multiple tools have components */}
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
          >
            {meta.label}
            <span className="opacity-70">({count})</span>
          </button>
        );
      })}

      {/* Scope filters — only show when plugins exist */}
      {hasPlugins && (
        <>
          <span className="w-px h-4 bg-sand-border mx-1" aria-hidden="true" />
          <button
            type="button"
            onClick={() => toggleScopeFilter('plugin')}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
              scopeFilter === 'plugin'
                ? 'bg-blue-600 text-white'
                : 'bg-sand-surface text-sand-secondary hover:bg-sand-surface/80',
            )}
            aria-pressed={scopeFilter === 'plugin'}
          >
            Plugins
            <span className="opacity-70">({scopeCounts.plugin})</span>
          </button>
          <button
            type="button"
            onClick={() => toggleScopeFilter('standalone')}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
              scopeFilter === 'standalone'
                ? 'bg-blue-600 text-white'
                : 'bg-sand-surface text-sand-secondary hover:bg-sand-surface/80',
            )}
            aria-pressed={scopeFilter === 'standalone'}
          >
            Standalone
            <span className="opacity-70">({scopeCounts.standalone})</span>
          </button>
        </>
      )}

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
  );
}
