/**
 * Hook for filtered + grouped component data.
 * Combines tool-store data with ui-store filters.
 */

import { useMemo } from 'react';
import { useToolStore } from '@renderer/stores/tool-store';
import { useUiStore } from '@renderer/stores/ui-store';
import type { Component, ToolId, ComponentType } from '@shared/types';
import { COMPONENT_TYPE_META } from '@shared/constants';

export type PluginGroup = {
  pluginKey: string;
  pluginName: string;
  marketplace: string;
  version?: string;
  enabled: boolean;
  components: Component[];
};

/** A group of components from a single project folder (USR-03) */
export type ProjectGroup = {
  projectPath: string;
  projectName: string; // last path segment
  components: Component[];
};

export type ToolGroup = {
  toolId: ToolId;
  instanceId: string;
  components: Component[]; // standalone user-scope components
  pluginGroups: PluginGroup[]; // grouped plugin components
  projectGroups: ProjectGroup[]; // grouped project-scope components (USR-03)
  totalCount: number; // all components (standalone + plugin + project)
};

/** Filter components by search query, tool filters, and type filters */
function filterComponents(
  components: Component[],
  searchQuery: string,
  toolFilters: ToolId[],
  typeFilters: ComponentType[],
): Component[] {
  let filtered = components;

  if (toolFilters.length > 0) {
    filtered = filtered.filter((c) => toolFilters.includes(c.id.tool));
  }

  if (typeFilters.length > 0) {
    filtered = filtered.filter((c) => typeFilters.includes(c.id.type));
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter((c) => {
      const typeLabel = COMPONENT_TYPE_META[c.id.type]?.label?.toLowerCase() ?? '';
      const pluginKey = (c.extensions?.pluginKey as string)?.toLowerCase() ?? '';
      return (
        c.id.name.toLowerCase().includes(q) ||
        c.displayName?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        typeLabel.includes(q) ||
        pluginKey.includes(q)
      );
    });

    // When search matches a plugin name, include all sub-components of that plugin
    const matchedPluginKeys = new Set<string>();
    for (const c of filtered) {
      const pk = c.extensions?.pluginKey as string | undefined;
      if (pk) matchedPluginKeys.add(pk);
    }
    if (matchedPluginKeys.size > 0) {
      // Add any components from matched plugins that didn't pass the filter individually
      for (const c of components) {
        const pk = c.extensions?.pluginKey as string | undefined;
        if (pk && matchedPluginKeys.has(pk) && !filtered.includes(c)) {
          // Also check tool and type filters still apply
          if (toolFilters.length > 0 && !toolFilters.includes(c.id.tool)) continue;
          if (typeFilters.length > 0 && !typeFilters.includes(c.id.type)) continue;
          filtered.push(c);
        }
      }
    }
  }

  return filtered;
}

/** Extract the last segment of a file path as the project name */
function projectNameFromPath(p: string): string {
  const segments = p.replace(/[\\/]+$/, '').split(/[\\/]/);
  return segments[segments.length - 1] || p;
}

/** Group filtered components by tool, maintaining tool order from detection */
function groupByTool(
  components: Component[],
  tools: { toolId: ToolId; instanceId: string }[],
): ToolGroup[] {
  const groups: ToolGroup[] = [];

  for (const tool of tools) {
    const toolComponents = components.filter((c) => c.id.tool === tool.toolId);
    const pluginComps = toolComponents.filter((c) => c.id.scope === 'plugin');
    const projectComps = toolComponents.filter((c) => c.id.scope === 'project');
    const standalone = toolComponents.filter(
      (c) => c.id.scope !== 'plugin' && c.id.scope !== 'project',
    );

    // Group plugin components by pluginKey
    const pluginMap = new Map<string, Component[]>();
    for (const c of pluginComps) {
      const key = (c.extensions?.pluginKey as string) ?? 'unknown';
      if (!pluginMap.has(key)) pluginMap.set(key, []);
      pluginMap.get(key)!.push(c);
    }

    const pluginGroups: PluginGroup[] = [];
    for (const [key, comps] of pluginMap) {
      const [name, mkt] = key.includes('@') ? key.split('@') : [key, ''];
      pluginGroups.push({
        pluginKey: key,
        pluginName: name,
        marketplace: mkt,
        version: comps[0]?.version,
        enabled: comps[0]?.enabled ?? false,
        components: comps,
      });
    }
    pluginGroups.sort((a, b) => a.pluginKey.localeCompare(b.pluginKey));

    // Group project components by projectPath (USR-03)
    const projectMap = new Map<string, Component[]>();
    for (const c of projectComps) {
      const key = c.projectPath ?? 'unknown';
      if (!projectMap.has(key)) projectMap.set(key, []);
      projectMap.get(key)!.push(c);
    }

    const projectGroups: ProjectGroup[] = [];
    for (const [path, comps] of projectMap) {
      projectGroups.push({
        projectPath: path,
        projectName: projectNameFromPath(path),
        components: comps,
      });
    }
    projectGroups.sort((a, b) => a.projectName.localeCompare(b.projectName));

    if (standalone.length > 0 || pluginGroups.length > 0) {
      groups.push({
        toolId: tool.toolId,
        instanceId: tool.instanceId,
        components: standalone,
        pluginGroups,
        projectGroups,
        totalCount: standalone.length + pluginComps.length,
      });
    } else if (projectGroups.length > 0) {
      // Tool has only project components — still need the group for project extraction
      groups.push({
        toolId: tool.toolId,
        instanceId: tool.instanceId,
        components: [],
        pluginGroups: [],
        projectGroups,
        totalCount: 0,
      });
    }
  }

  return groups;
}

/** Count components by type (for filter pill counts) */
function countByType(components: Component[]): Map<ComponentType, number> {
  const counts = new Map<ComponentType, number>();
  for (const c of components) {
    counts.set(c.id.type, (counts.get(c.id.type) ?? 0) + 1);
  }
  return counts;
}

/** Count components by tool (for filter pill counts) */
function countByTool(components: Component[]): Map<ToolId, number> {
  const counts = new Map<ToolId, number>();
  for (const c of components) {
    counts.set(c.id.tool, (counts.get(c.id.tool) ?? 0) + 1);
  }
  return counts;
}

export function useComponents() {
  const { tools, components, scanning } = useToolStore();
  const { searchQuery, toolFilters, typeFilters } = useUiStore();

  const detectedTools = useMemo(() => tools.filter((t) => t.detected), [tools]);

  const filteredComponents = useMemo(
    () => filterComponents(components, searchQuery, toolFilters, typeFilters),
    [components, searchQuery, toolFilters, typeFilters],
  );

  const toolGroups = useMemo(
    () => groupByTool(filteredComponents, detectedTools),
    [filteredComponents, detectedTools],
  );

  // Extract project groups as top-level peers of tools (UX-01)
  const projectGroups = useMemo(() => {
    const allProjects: ProjectGroup[] = [];
    for (const group of toolGroups) {
      if (group.projectGroups) allProjects.push(...group.projectGroups);
    }
    return allProjects;
  }, [toolGroups]);

  const typeCounts = useMemo(() => countByType(components), [components]);
  const toolCounts = useMemo(() => countByTool(components), [components]);

  /** Types that actually exist in the user's setup (for dynamic filter pills) */
  const activeTypes = useMemo(() => Array.from(typeCounts.keys()), [typeCounts]);

  /** Tools that have components (for dynamic filter pills) */
  const activeTools = useMemo(() => Array.from(toolCounts.keys()), [toolCounts]);

  return {
    detectedTools,
    filteredComponents,
    toolGroups,
    projectGroups,
    typeCounts,
    toolCounts,
    activeTypes,
    activeTools,
    totalCount: components.length,
    filteredCount: filteredComponents.length,
    scanning,
    hasComponents: components.length > 0,
    hasTools: detectedTools.length > 0,
    isFiltered: searchQuery.trim() !== '' || toolFilters.length > 0 || typeFilters.length > 0,
  };
}
