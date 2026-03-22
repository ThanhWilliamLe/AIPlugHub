/**
 * Export wizard — 3-step modal: Select → Review → Save confirmation.
 */

import { useMemo, useState } from 'react';
import { useToolStore } from '@renderer/stores/tool-store';
import { useWizardStore } from '@renderer/stores/wizard-store';
import { TOOL_META, COMPONENT_TYPE_META, PLUGIN_GROUP_META } from '@shared/constants';
import { TypeBadge } from '@renderer/components/shared/TypeBadge';
import { Button } from '@renderer/components/ui/button';
import { componentIdEquals, componentIdKey, isSensitiveEnvKey, isSensitiveEnvValue } from '@shared/utils';
import type { Component, ComponentId, ToolId } from '@shared/types';

export function ExportWizard() {
  const components = useToolStore((s) => s.components);
  const tools = useToolStore((s) => s.tools);
  const {
    exportStep,
    selectedIds,
    exportOptions,
    loading,
    setExportStep,
    toggleSelectId,
    selectAll,
    deselectAll,
    setExportOptions,
    buildAndSave,
    closeWizard,
    error,
  } = useWizardStore();

  const detectedTools = useMemo(() => tools.filter((t) => t.detected), [tools]);
  const [exportSearch, setExportSearch] = useState('');

  // Filter + group components by tool for the checklist, with plugin sub-grouping
  const toolGroups = useMemo(() => {
    const q = exportSearch.toLowerCase().trim();
    const groups: { toolId: ToolId; plugins: { pluginKey: string; components: Component[] }[]; standalone: Component[] }[] = [];

    for (const tool of detectedTools) {
      let toolComps = components.filter((c) => c.id.tool === tool.toolId);
      if (q) {
        toolComps = toolComps.filter(
          (c) =>
            c.id.name.toLowerCase().includes(q) ||
            c.displayName?.toLowerCase().includes(q) ||
            (c.extensions?.pluginKey as string)?.toLowerCase().includes(q),
        );
      }

      const standalone = toolComps.filter((c) => c.id.scope !== 'plugin');
      const pluginComps = toolComps.filter((c) => c.id.scope === 'plugin');

      // Group plugin components by pluginKey
      const pluginMap = new Map<string, Component[]>();
      for (const c of pluginComps) {
        const key = (c.extensions?.pluginKey as string) ?? 'unknown';
        if (!pluginMap.has(key)) pluginMap.set(key, []);
        pluginMap.get(key)!.push(c);
      }

      const plugins = Array.from(pluginMap.entries())
        .map(([pluginKey, comps]) => ({ pluginKey, components: comps }))
        .sort((a, b) => a.pluginKey.localeCompare(b.pluginKey));

      if (standalone.length > 0 || plugins.length > 0) {
        groups.push({ toolId: tool.toolId, plugins, standalone });
      }
    }
    return groups;
  }, [components, detectedTools, exportSearch]);

  const isSelected = (id: ComponentId) => selectedIds.some((s) => componentIdEquals(s, id));

  // Fix L2: "Select all" operates on filtered results when search is active
  const allIds = components.map((c) => c.id);
  const filteredIds = useMemo(
    () =>
      toolGroups.flatMap((g) => [
        ...g.standalone.map((c) => c.id),
        ...g.plugins.flatMap((p) => p.components.map((c) => c.id)),
      ]),
    [toolGroups],
  );
  const effectiveIds = exportSearch.trim() ? filteredIds : allIds;
  const allSelected =
    effectiveIds.length > 0 && effectiveIds.every((id) => isSelected(id));

  // Secret and warning counts for review step
  const selectedComponents = useMemo(
    () => components.filter((c) => selectedIds.some((s) => componentIdEquals(s, c.id))),
    [components, selectedIds],
  );

  // Fix M2: count secrets using both key name AND value pattern matching
  const secretCount = useMemo(() => {
    let count = 0;
    for (const c of selectedComponents) {
      if (c.id.type === 'mcp-server' && 'env' in c.core) {
        const env = (c.core as { env?: Record<string, string> }).env;
        if (env) {
          for (const [key, value] of Object.entries(env)) {
            if (isSensitiveEnvKey(key) || isSensitiveEnvValue(value)) count++;
          }
        }
      }
    }
    return count;
  }, [selectedComponents]);

  // Fix L3: compute portability warnings client-side for the review step
  const portabilityWarnings = useMemo(() => {
    const warnings: string[] = [];
    let remoteCount = 0;
    let supportingFilesCount = 0;

    for (const c of selectedComponents) {
      if (c.id.type === 'mcp-server') {
        const transport = (c.core as { transport?: string }).transport;
        if (transport === 'http' || transport === 'sse') remoteCount++;
      }
      if (c.id.type === 'skill') {
        const files = (c.core as { supportingFiles?: string[] }).supportingFiles;
        if (files && files.length > 0) supportingFilesCount++;
      }
    }

    if (remoteCount > 0) {
      warnings.push(
        `${remoteCount} remote MCP server${remoteCount !== 1 ? 's' : ''} may require manual GUI setup on some tools`,
      );
    }
    if (supportingFilesCount > 0) {
      warnings.push(
        `${supportingFilesCount} skill${supportingFilesCount !== 1 ? 's have' : ' has'} supporting scripts that are not included`,
      );
    }
    return warnings;
  }, [selectedComponents]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/20" aria-hidden="true" />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-sand-paper rounded-xl shadow-xl border border-sand-border w-full max-w-2xl max-h-[80vh] flex flex-col animate-bounce-in"
          role="dialog"
          aria-modal="true"
          aria-label="Export bundle"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-sand-border">
            <div>
              <h2 className="text-lg font-semibold text-sand-text">Export Bundle</h2>
              <div className="flex gap-2 mt-1">
                {[1, 2, 3].map((s) => (
                  <span
                    key={s}
                    className={`w-2 h-2 rounded-full ${
                      s <= exportStep ? 'bg-accent-olive' : 'bg-sand-border'
                    }`}
                  />
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={closeWizard}
              className="text-sand-muted hover:text-sand-text p-1"
              aria-label="Close"
            >
              {'\u2715'}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-accent-destructive/10 text-accent-destructive text-sm">
                {error}
              </div>
            )}

            {/* Step 1: Select */}
            {exportStep === 1 && (
              <div className="space-y-4">
                <input
                  type="search"
                  placeholder="Search components..."
                  value={exportSearch}
                  onChange={(e) => setExportSearch(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-sand-surface/50 border border-sand-border text-sm focus:outline-none focus:ring-2 focus:ring-accent-olive/40"
                  aria-label="Search components for export"
                />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-sand-secondary">
                    {selectedIds.length} of {components.length} selected
                  </span>
                  <button
                    type="button"
                    className="text-xs text-accent-olive hover:underline"
                    onClick={() => {
                      if (allSelected) {
                        // Deselect only the currently visible items, keep the rest
                        const visibleKeys = new Set(effectiveIds.map((id) =>
                          `${id.tool}:${id.type}:${id.name}:${id.scope}`));
                        const remaining = selectedIds.filter(
                          (id) => !visibleKeys.has(`${id.tool}:${id.type}:${id.name}:${id.scope}`));
                        selectAll(remaining);
                      } else {
                        // Add visible items to selection, keeping existing hidden selections
                        const existingKeys = new Set(selectedIds.map((id) =>
                          `${id.tool}:${id.type}:${id.name}:${id.scope}`));
                        const newIds = effectiveIds.filter(
                          (id) => !existingKeys.has(`${id.tool}:${id.type}:${id.name}:${id.scope}`));
                        selectAll([...selectedIds, ...newIds]);
                      }
                    }}
                  >
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </div>

                {toolGroups.map(({ toolId, plugins, standalone }) => {
                  const meta = TOOL_META[toolId];
                  const allToolComps = [
                    ...standalone,
                    ...plugins.flatMap((p) => p.components),
                  ];
                  const toolSelected = allToolComps.filter((c) => isSelected(c.id)).length;
                  const allToolSelected = toolSelected === allToolComps.length;

                  return (
                    <div key={toolId}>
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          type="button"
                          className="text-xs text-accent-olive hover:underline"
                          onClick={() => {
                            if (allToolSelected) {
                              for (const c of allToolComps) {
                                if (isSelected(c.id)) toggleSelectId(c.id);
                              }
                            } else {
                              for (const c of allToolComps) {
                                if (!isSelected(c.id)) toggleSelectId(c.id);
                              }
                            }
                          }}
                        >
                          {allToolSelected ? 'Deselect' : 'Select all'}
                        </button>
                        <span className="text-sm font-medium">
                          {meta.emoji} {meta.label} ({toolSelected}/{allToolComps.length})
                        </span>
                      </div>

                      {/* Plugin groups */}
                      {plugins.map((plugin) => {
                        const pluginIds = plugin.components.map((c) => c.id);
                        const allPluginSelected = pluginIds.every((id) =>
                          selectedIds.some((s) => componentIdEquals(s, id)),
                        );
                        const somePluginSelected = pluginIds.some((id) =>
                          selectedIds.some((s) => componentIdEquals(s, id)),
                        );

                        return (
                          <div key={plugin.pluginKey} className="ml-4 mb-2">
                            {/* Plugin header */}
                            <label className="flex items-center gap-2 py-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={allPluginSelected}
                                ref={(el) => {
                                  if (el) el.indeterminate = somePluginSelected && !allPluginSelected;
                                }}
                                onChange={() => {
                                  if (allPluginSelected) {
                                    const pluginKeySet = new Set(pluginIds.map(componentIdKey));
                                    const remaining = selectedIds.filter(
                                      (s) => !pluginKeySet.has(componentIdKey(s)),
                                    );
                                    selectAll(remaining);
                                  } else {
                                    const existing = new Set(selectedIds.map(componentIdKey));
                                    const toAdd = pluginIds.filter(
                                      (id) => !existing.has(componentIdKey(id)),
                                    );
                                    selectAll([...selectedIds, ...toAdd]);
                                  }
                                }}
                                className="rounded border-sand-border accent-accent-olive"
                              />
                              <span
                                className="w-1 h-5 rounded-full shrink-0"
                                style={{ backgroundColor: PLUGIN_GROUP_META.color }}
                                aria-hidden="true"
                              />
                              <span className="font-mono text-sm truncate">
                                {plugin.pluginKey}
                              </span>
                              <span className="text-xs text-sand-muted">
                                ({plugin.components.length})
                              </span>
                            </label>

                            {/* Plugin component checkboxes */}
                            <div className="space-y-1 ml-6">
                              {plugin.components.map((c) => (
                                <label
                                  key={componentIdKey(c.id)}
                                  className="flex items-center gap-2 py-1 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected(c.id)}
                                    onChange={() => toggleSelectId(c.id)}
                                    className="rounded border-sand-border accent-accent-olive"
                                  />
                                  <span className="font-mono text-sm truncate">
                                    {c.displayName ?? c.id.name}
                                  </span>
                                  <TypeBadge type={c.id.type} />
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}

                      {/* Standalone components */}
                      <div className="space-y-1 ml-4">
                        {standalone.map((c) => (
                          <label
                            key={componentIdKey(c.id)}
                            className="flex items-center gap-2 py-1 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected(c.id)}
                              onChange={() => toggleSelectId(c.id)}
                              className="rounded border-sand-border accent-accent-olive"
                            />
                            <span className="font-mono text-sm truncate">
                              {c.displayName ?? c.id.name}
                            </span>
                            <TypeBadge type={c.id.type} />
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Step 2: Review */}
            {exportStep === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-sand-secondary">
                  {selectedIds.length} component{selectedIds.length !== 1 ? 's' : ''} will be
                  exported
                </p>

                {secretCount > 0 && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                    {'\u{1F512}'} {secretCount} secret value{secretCount !== 1 ? 's' : ''} will not
                    be included. Recipients will be prompted.
                  </div>
                )}

                {/* Fix L3: Portability warnings */}
                {portabilityWarnings.length > 0 && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800 space-y-1">
                    {portabilityWarnings.map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                  </div>
                )}

                {/* Component summary by type */}
                <div className="space-y-1">
                  {Object.entries(
                    selectedComponents.reduce(
                      (acc, c) => {
                        const label = COMPONENT_TYPE_META[c.id.type].label;
                        acc[label] = (acc[label] ?? 0) + 1;
                        return acc;
                      },
                      {} as Record<string, number>,
                    ),
                  ).map(([label, count]) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-sand-secondary">{label}</span>
                      <span className="text-sand-text">{count}</span>
                    </div>
                  ))}
                </div>

                {/* Description field */}
                <div>
                  <label className="block text-xs font-medium text-sand-secondary mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    value={exportOptions.description ?? ''}
                    onChange={(e) => setExportOptions({ description: e.target.value })}
                    className="w-full p-2 rounded-lg bg-sand-surface/50 border border-sand-border text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-accent-olive/40"
                    placeholder="Notes for the bundle recipient..."
                  />
                </div>
              </div>
            )}

            {/* Step 3: Done */}
            {exportStep === 3 && (
              <div className="text-center py-8">
                <p className="text-2xl mb-2">{'\u2705'}</p>
                <h3 className="text-lg font-semibold text-sand-text mb-2">Export complete!</h3>
                <p className="text-sm text-sand-secondary">
                  Your bundle has been saved. Share it with a teammate or use it on another machine.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between px-6 py-4 border-t border-sand-border">
            {exportStep === 1 && (
              <>
                <Button variant="outline" size="sm" onClick={closeWizard}>
                  Cancel
                </Button>
                <Button
                  className="bg-accent-olive text-white hover:bg-accent-olive/90"
                  size="sm"
                  disabled={selectedIds.length === 0}
                  onClick={() => setExportStep(2)}
                >
                  {'Next \u2192'}
                </Button>
              </>
            )}
            {exportStep === 2 && (
              <>
                <Button variant="outline" size="sm" onClick={() => setExportStep(1)}>
                  {'\u2190 Back'}
                </Button>
                <Button
                  className="bg-accent-olive text-white hover:bg-accent-olive/90"
                  size="sm"
                  disabled={loading}
                  onClick={buildAndSave}
                >
                  {loading ? 'Saving...' : 'Save Bundle'}
                </Button>
              </>
            )}
            {exportStep === 3 && (
              <Button
                className="bg-accent-olive text-white hover:bg-accent-olive/90 ml-auto"
                size="sm"
                onClick={closeWizard}
              >
                Done
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
