/**
 * Collapsible tool section in My Setup.
 * Shows tool emoji + name + component count, with expand/collapse.
 * Renders plugin group sub-sections before standalone components.
 * Uses @tanstack/react-virtual for sections with 50+ components.
 */

import React, { useState, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ToolId, Component, ComponentId } from '@shared/types';
import { TOOL_META, PLUGIN_GROUP_META } from '@shared/constants';
import { componentIdEquals, componentIdKey } from '@shared/utils';
import { ComponentCard } from './ComponentCard';
import { UpdateBadge } from './UpdateBadge';
import { cn } from '@renderer/lib/utils';

/** Compute checkbox state for a group of children against selectedIds */
function computeGroupCheckState(children: Component[], selectedIds: ComponentId[]) {
  const selectedKeySet = new Set(selectedIds.map(componentIdKey));
  const childIds = children.map((c) => c.id);
  const selectedCount = childIds.filter((id) => selectedKeySet.has(componentIdKey(id))).length;
  const allSelected = selectedCount === childIds.length && childIds.length > 0;
  const someSelected = selectedCount > 0 && !allSelected;
  return { allSelected, someSelected, childIds };
}

// Virtualization threshold set high — nested scroll containers cause confusing
// dual-scroll UX. 500+ simple cards render fine without virtualization.
const VIRTUALIZE_THRESHOLD = 2000;
const ESTIMATED_ROW_HEIGHT = 52;

/** A group of components that belong to the same plugin */
export type PluginGroup = {
  pluginKey: string;
  version?: string;
  enabled: boolean;
  components: Component[];
};

/** A group of components from a project folder (USR-03) */
export type ProjectGroup = {
  projectPath: string;
  projectName: string;
  components: Component[];
};

type ToolSectionProps = {
  toolId: ToolId;
  components: Component[]; // standalone components
  pluginGroups?: PluginGroup[]; // grouped plugin components
  projectGroups?: ProjectGroup[]; // project-scope sub-groups (USR-03)
  selectedComponentId: ComponentId | null;
  onSelectComponent: (id: ComponentId) => void;
  onToggleComponent: (id: ComponentId) => void;
  onTogglePlugin?: (pluginKey: string) => void;
  selectionMode?: boolean;
  selectedIds?: ComponentId[];
  onCheckChange?: (id: ComponentId) => void;
  onCheckGroup?: (ids: ComponentId[], checked: boolean) => void;
};

/** Collapsible sub-section for a single plugin group */
function PluginGroupSection({
  group,
  selectedComponentId,
  onSelectComponent,
  onToggleComponent,
  onTogglePlugin,
  selectionMode,
  selectedIds,
  onCheckChange,
  onCheckGroup,
  autoExpand = false,
}: {
  group: PluginGroup;
  selectedComponentId: ComponentId | null;
  onSelectComponent: (id: ComponentId) => void;
  onToggleComponent: (id: ComponentId) => void;
  onTogglePlugin?: (pluginKey: string) => void;
  selectionMode?: boolean;
  selectedIds?: ComponentId[];
  onCheckChange?: (id: ComponentId) => void;
  onCheckGroup?: (ids: ComponentId[], checked: boolean) => void;
  autoExpand?: boolean;
}) {
  const [expanded, setExpanded] = useState(autoExpand ?? false);
  const { allSelected, someSelected, childIds } = computeGroupCheckState(
    group.components,
    selectedIds ?? [],
  );

  return (
    <div className="ml-4 mb-1">
      {/* Plugin group header */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg',
          'hover:bg-sand-surface/60 transition-colors cursor-pointer',
        )}
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        {/* Group checkbox */}
        {selectionMode && (
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            aria-label={`Select all ${group.pluginKey} plugins`}
            className="w-4 h-4 shrink-0 accent-[#4A7FB5] cursor-pointer"
            onChange={() => onCheckGroup?.(childIds, !allSelected)}
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {/* Chevron */}
        <span
          className={cn(
            'text-xs text-sand-muted transition-transform',
            expanded ? 'rotate-90' : 'rotate-0',
          )}
          aria-hidden="true"
        >
          {'\u25B6'}
        </span>

        {/* Plugin color bar */}
        <span
          className="w-1 h-8 rounded-full shrink-0"
          style={{ backgroundColor: PLUGIN_GROUP_META.color }}
          aria-hidden="true"
        />

        {/* Plugin name + version */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-sand-text truncate">{group.pluginKey}</span>
            <span className="text-xs text-sand-muted">({group.components.length})</span>
          </div>
          {group.version && <span className="text-xs text-sand-muted">v{group.version}</span>}
        </div>

        {/* Update badge */}
        <UpdateBadge pluginKey={group.pluginKey} />

        {/* Plugin toggle — hidden until adapters support canToggle() */}
      </div>

      {/* Plugin components (when expanded) */}
      {expanded && (
        <div className="ml-4 mt-1 space-y-0.5" role="list">
          {group.components.map((component) => (
            <ComponentCard
              key={`${component.id.tool}:${component.id.type}:${component.id.name}:${component.id.scope}`}
              component={component}
              selected={
                selectedComponentId !== null && componentIdEquals(component.id, selectedComponentId)
              }
              onSelect={onSelectComponent}
              onToggle={onToggleComponent}
              selectionMode={selectionMode}
              checked={
                selectionMode && selectedIds
                  ? selectedIds.some((s) => componentIdKey(s) === componentIdKey(component.id))
                  : false
              }
              onCheckChange={onCheckChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Collapsible section for a project folder group (USR-03). Exported for top-level rendering. */
export function ProjectGroupSection({
  group,
  defaultExpanded,
  selectedComponentId,
  onSelectComponent,
  onToggleComponent,
  selectionMode,
  selectedIds,
  onCheckChange,
  onCheckGroup,
}: {
  group: ProjectGroup;
  defaultExpanded: boolean;
  selectedComponentId: ComponentId | null;
  onSelectComponent: (id: ComponentId) => void;
  onToggleComponent: (id: ComponentId) => void;
  selectionMode?: boolean;
  selectedIds?: ComponentId[];
  onCheckChange?: (id: ComponentId) => void;
  onCheckGroup?: (ids: ComponentId[], checked: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { allSelected, someSelected, childIds } = computeGroupCheckState(
    group.components,
    selectedIds ?? [],
  );

  return (
    <div className="mb-1">
      {/* Project group header */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg',
          'hover:bg-sand-surface/60 transition-colors cursor-pointer',
        )}
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        {/* Group checkbox */}
        {selectionMode && (
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            aria-label={`Select all ${group.projectName} plugins`}
            className="w-4 h-4 shrink-0 accent-[#4A7FB5] cursor-pointer"
            onChange={() => onCheckGroup?.(childIds, !allSelected)}
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {/* Chevron */}
        <span
          className={cn(
            'text-xs text-sand-muted transition-transform',
            expanded ? 'rotate-90' : 'rotate-0',
          )}
          aria-hidden="true"
        >
          {'\u25B6'}
        </span>

        {/* Folder icon */}
        <span className="text-base" aria-hidden="true">
          {'\u{1F4C1}'}
        </span>

        {/* Project name + count */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-sand-text truncate">{group.projectName}</span>
            <span className="text-xs text-sand-muted">({group.components.length})</span>
          </div>
        </div>
      </div>

      {/* Project components (when expanded) */}
      {expanded && (
        <div className="ml-4 mt-1 space-y-0.5" role="list">
          {group.components.map((component) => (
            <ComponentCard
              key={`${component.id.tool}:${component.id.type}:${component.id.name}:${component.id.scope}:${component.projectPath}`}
              component={component}
              selected={
                selectedComponentId !== null && componentIdEquals(component.id, selectedComponentId)
              }
              onSelect={onSelectComponent}
              onToggle={onToggleComponent}
              selectionMode={selectionMode}
              checked={
                selectionMode && selectedIds
                  ? selectedIds.some((s) => componentIdKey(s) === componentIdKey(component.id))
                  : false
              }
              onCheckChange={onCheckChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const ToolSection = React.memo(function ToolSection({
  toolId,
  components,
  pluginGroups,
  projectGroups,
  selectedComponentId,
  onSelectComponent,
  onToggleComponent,
  onTogglePlugin,
  selectionMode,
  selectedIds,
  onCheckChange,
  onCheckGroup,
}: ToolSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const meta = TOOL_META[toolId];

  const totalComponentCount =
    components.length +
    (pluginGroups?.reduce((sum, g) => sum + g.components.length, 0) ?? 0) +
    (projectGroups?.reduce((sum, g) => sum + g.components.length, 0) ?? 0);
  const autoExpandGroups = totalComponentCount <= 30;

  const allChildren = [
    ...(pluginGroups?.flatMap((g) => g.components) ?? []),
    ...(projectGroups?.flatMap((g) => g.components) ?? []),
    ...components,
  ];
  const {
    allSelected: toolAllSelected,
    someSelected: toolSomeSelected,
    childIds: toolChildIds,
  } = computeGroupCheckState(allChildren, selectedIds ?? []);
  const listId = `tool-section-${toolId}`;
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = components.length >= VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize && expanded ? components.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <section className="mb-4">
      <button
        type="button"
        className={cn(
          'flex items-center gap-2 w-full px-4 py-2 rounded-lg',
          'hover:bg-sand-surface/60 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-olive/40',
        )}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={listId}
      >
        {selectionMode && (
          <input
            type="checkbox"
            checked={toolAllSelected}
            ref={(el) => {
              if (el) el.indeterminate = toolSomeSelected;
            }}
            aria-label={`Select all ${meta.label} plugins`}
            className="w-4 h-4 shrink-0 accent-[#4A7FB5] cursor-pointer"
            onChange={() => onCheckGroup?.(toolChildIds, !toolAllSelected)}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <span
          className={cn(
            'text-xs text-sand-muted transition-transform',
            expanded ? 'rotate-90' : 'rotate-0',
          )}
          aria-hidden="true"
        >
          {'\u25B6'}
        </span>
        <span className="text-base" aria-hidden="true">
          {meta.emoji}
        </span>
        <span className="font-medium text-sand-text">{meta.label}</span>
        <span className="text-xs text-sand-muted ml-1">
          (
          {(pluginGroups?.reduce((n, g) => n + g.components.length, 0) ?? 0) +
            (projectGroups?.reduce((n, g) => n + g.components.length, 0) ?? 0) +
            components.length}
          )
        </span>
      </button>

      {/* Plugin group sub-sections */}
      {expanded && pluginGroups && pluginGroups.length > 0 && (
        <div className="mt-1">
          {pluginGroups.map((group) => (
            <PluginGroupSection
              key={group.pluginKey}
              group={group}
              selectedComponentId={selectedComponentId}
              onSelectComponent={onSelectComponent}
              onToggleComponent={onToggleComponent}
              onTogglePlugin={onTogglePlugin}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onCheckChange={onCheckChange}
              onCheckGroup={onCheckGroup}
              autoExpand={autoExpandGroups}
            />
          ))}
        </div>
      )}

      {/* Note: Project groups are rendered as top-level sections in MySetupTab (UX-01) */}

      {/* Standalone components */}
      {expanded && !shouldVirtualize && (
        <div id={listId} className="ml-4 mt-1 space-y-0.5" role="list">
          {components.map((component) => (
            <ComponentCard
              key={`${component.id.tool}:${component.id.type}:${component.id.name}:${component.id.scope}`}
              component={component}
              selected={
                selectedComponentId !== null && componentIdEquals(component.id, selectedComponentId)
              }
              onSelect={onSelectComponent}
              onToggle={onToggleComponent}
              selectionMode={selectionMode}
              checked={
                selectionMode && selectedIds
                  ? selectedIds.some((s) => componentIdKey(s) === componentIdKey(component.id))
                  : false
              }
              onCheckChange={onCheckChange}
            />
          ))}
        </div>
      )}

      {expanded && shouldVirtualize && (
        <div
          id={listId}
          ref={parentRef}
          className="ml-4 mt-1 overflow-y-auto"
          role="list"
          style={{ maxHeight: '60vh' }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const component = components[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ComponentCard
                    component={component}
                    selected={
                      selectedComponentId !== null &&
                      componentIdEquals(component.id, selectedComponentId)
                    }
                    onSelect={onSelectComponent}
                    onToggle={onToggleComponent}
                    selectionMode={selectionMode}
                    checked={
                      selectionMode && selectedIds
                        ? selectedIds.some(
                            (s) => componentIdKey(s) === componentIdKey(component.id),
                          )
                        : false
                    }
                    onCheckChange={onCheckChange}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
});
