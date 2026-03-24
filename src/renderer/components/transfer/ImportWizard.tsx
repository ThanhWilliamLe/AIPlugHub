/**
 * Import wizard — 2-step modal: Preview & Resolve → Config & Install (results).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useWizardStore } from '@renderer/stores/wizard-store';
import { useToolStore } from '@renderer/stores/tool-store';
import { useUiStore } from '@renderer/stores/ui-store';
import { useToastStore } from '@renderer/stores/toast-store';
import { TOOL_META, COMPONENT_TYPE_META } from '@shared/constants';
import { TypeBadge } from '@renderer/components/shared/TypeBadge';
import { Button } from '@renderer/components/ui/button';
import type { ImportProgressEvent, PortablePlugin } from '@shared/types';
import type { ConflictEntry, ConflictResolution } from '@shared/types';

type ImportFilter = 'new' | 'conflicts' | 'identical' | 'incompatible' | 'plugins';

/** Compact scope indicator for import preview items */
function ScopeBadge({ scope }: { scope?: string }) {
  if (!scope || scope === 'user') return null;
  const label = scope === 'plugin' ? 'plugin' : scope === 'project' ? 'project' : scope;
  return (
    <span className="text-[10px] text-sand-muted bg-sand-surface/60 px-1.5 py-0.5 rounded shrink-0">
      {label}
    </span>
  );
}

export function ImportWizard() {
  const [progress, setProgress] = useState<ImportProgressEvent | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<ImportFilter>>(new Set());
  const [importTypeFilters, setImportTypeFilters] = useState<Set<string>>(new Set());
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set());

  const togglePluginExpand = useCallback((pluginKey: string) => {
    setExpandedPlugins((prev) => {
      const next = new Set(prev);
      if (next.has(pluginKey)) next.delete(pluginKey);
      else next.add(pluginKey);
      return next;
    });
  }, []);

  const toggleFilter = (filter: ImportFilter) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  };

  const toggleTypeFilter = (type: string) => {
    setImportTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // When no filters are active, show all sections
  const showSection = (section: ImportFilter) =>
    activeFilters.size === 0 || activeFilters.has(section);

  // Type filter: filter items within each section
  const matchesTypeFilter = (type: string) =>
    importTypeFilters.size === 0 || importTypeFilters.has(type);

  // Subscribe to import progress events
  useEffect(() => {
    const unsubscribe = window.aiplughub.progress.onImportProgress((event) => {
      setProgress(event as ImportProgressEvent);
    });
    return unsubscribe;
  }, []);

  const {
    importStep,
    bundle,
    conflicts,
    resolutions,
    alwaysOverride,
    importResult,
    importing,
    loading,
    error,
    pendingConfigs,
    configValues,
    showingConfigPrompts,
    setResolution,
    setAlwaysOverride,
    executeImport,
    setConfigValue,
    confirmConfigs,
    closeWizard,
  } = useWizardStore();
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  // Check if all required configs have values
  const allConfigsFilled = useMemo(() => {
    if (pendingConfigs.length === 0) return true;
    return pendingConfigs.every((pc) => {
      const key = `${pc.componentName}::${pc.config.key}`;
      return configValues[key]?.trim().length > 0;
    });
  }, [pendingConfigs, configValues]);

  // USR-16: Split identical conflicts from real conflicts
  const identicalConflicts = useMemo(
    () => (conflicts?.conflicts ?? []).filter((c) => c.conflictType === 'identical'),
    [conflicts],
  );
  const realConflicts = useMemo(
    () => (conflicts?.conflicts ?? []).filter((c) => c.conflictType !== 'identical'),
    [conflicts],
  );

  // USR-17: Bundle summary counts
  const bundleSummary = useMemo(() => {
    if (!bundle || !conflicts) return null;
    const totalComponents =
      bundle.components.length + bundle.plugins.reduce((sum, p) => sum + p.components.length, 0);
    // Count by type
    const allPortables = [...bundle.components, ...bundle.plugins.flatMap((p) => p.components)];
    const typeCounts: Record<string, number> = {};
    for (const c of allPortables) {
      const label = COMPONENT_TYPE_META[c.type]?.label ?? c.type;
      typeCounts[label] = (typeCounts[label] ?? 0) + 1;
    }
    const marketplaceCount = allPortables.filter((c) => c.marketplaceSource).length;
    // Distinct types with counts for type filter pills
    const importTypes = new Map<string, number>();
    for (const c of allPortables) {
      importTypes.set(c.type, (importTypes.get(c.type) ?? 0) + 1);
    }
    return {
      totalComponents,
      typeCounts,
      newCount: conflicts.newComponents.length,
      conflictCount: realConflicts.length,
      identicalCount: identicalConflicts.length,
      incompatibleCount: conflicts.incompatible.length,
      marketplaceCount,
      importTypes,
    };
  }, [bundle, conflicts, realConflicts, identicalConflicts]);

  // Count items that will be installed (new + non-skipped conflicts + plugin groups)
  const installCount = useMemo(() => {
    if (!conflicts || !bundle) return 0;
    const newCount = conflicts.newComponents.length;
    const conflictInstalls = alwaysOverride
      ? realConflicts.length
      : resolutions.filter((r) => r.action === 'install').length +
        realConflicts.filter(
          (c) =>
            !resolutions.some(
              (r) =>
                r.componentKey.type === c.incoming.type && r.componentKey.name === c.incoming.name,
            ),
        ).length; // Default action is 'install'
    const pluginCount = bundle.plugins.length;
    return newCount + conflictInstalls + pluginCount;
  }, [bundle, conflicts, realConflicts, resolutions, alwaysOverride]);

  if (!bundle || !conflicts) {
    if (loading) {
      return (
        <WizardShell onClose={closeWizard}>
          <div className="text-center py-12">
            <p className="text-sm text-sand-secondary animate-pulse">Loading bundle...</p>
          </div>
        </WizardShell>
      );
    }
    if (error) {
      return (
        <WizardShell onClose={closeWizard}>
          <div className="px-6 py-4 border-b border-sand-border">
            <h2 className="text-lg font-semibold text-sand-text">Import Bundle</h2>
          </div>
          <div className="flex-1 px-6 py-8">
            <div className="p-3 rounded-lg bg-accent-destructive/10 text-accent-destructive text-sm">
              {error}
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-sand-border">
            <Button variant="outline" size="sm" onClick={closeWizard}>
              Cancel
            </Button>
            <Button
              className="bg-accent-olive text-white hover:bg-accent-olive/90"
              size="sm"
              onClick={async () => {
                useWizardStore.getState().closeWizard();
                useWizardStore.getState().startImport();
                try {
                  const filePath = await window.aiplughub.system.openFileDialog({
                    title: 'Open a bundle file',
                    filters: [{ name: 'AI Bundle', extensions: ['aibundle', 'json'] }],
                  });
                  if (!filePath) {
                    useWizardStore.getState().closeWizard();
                    return;
                  }
                  await useWizardStore.getState().loadBundle(filePath);
                } catch {
                  useWizardStore.getState().closeWizard();
                }
              }}
            >
              Try Again
            </Button>
          </div>
        </WizardShell>
      );
    }
    return null;
  }

  const handleGoToSetup = async () => {
    const result = importResult;
    const bundleName = bundle?.name;
    closeWizard();
    setActiveTab('my-setup');
    // Rescan so My Setup reflects the newly imported components
    await useToolStore.getState().scanAll();
    // Show post-import toast on My Setup
    if (result && result.installed.length > 0) {
      const n = result.installed.length;
      const from = bundleName ? ` from "${bundleName}"` : '';
      useToastStore.getState().addToast({
        message: `${n} plugin${n !== 1 ? 's' : ''} imported${from}`,
        type: 'success',
      });
    }
  };

  return (
    <WizardShell onClose={closeWizard}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-sand-border">
        <h2 className="text-lg font-semibold text-sand-text">Import Bundle</h2>
        <p className="text-xs text-sand-muted">Install plugins from a shared file</p>
        {bundle.name && <p className="text-sm text-sand-secondary mt-1">{bundle.name}</p>}
        {bundle.description && <p className="text-xs text-sand-muted mt-1">{bundle.description}</p>}
        <p className="text-xs text-sand-muted mt-1">
          Exported from {bundle.exportedFrom.tools.map((t) => TOOL_META[t]?.label ?? t).join(', ')}
          {bundle.exportedFrom.date &&
            ` on ${new Date(bundle.exportedFrom.date).toLocaleDateString()}`}
        </p>
        {/* USR-17: Bundle summary */}
        {bundleSummary && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-sand-secondary">
            <span>
              {bundleSummary.totalComponents} plugin
              {bundleSummary.totalComponents !== 1 ? 's' : ''}
            </span>
            <span className="text-sand-border">|</span>
            {Object.entries(bundleSummary.typeCounts).map(([label, count]) => (
              <span key={label}>
                {count} {label}
                {count !== 1 ? 's' : ''}
              </span>
            ))}
          </div>
        )}
        {bundleSummary && importStep === 1 && (
          <div className="mt-1 flex gap-3 text-xs">
            {bundleSummary.newCount > 0 && (
              <span className="text-accent-olive">{bundleSummary.newCount} new</span>
            )}
            {bundleSummary.conflictCount > 0 && (
              <span className="text-amber-600">{bundleSummary.conflictCount} to review</span>
            )}
            {bundleSummary.identicalCount > 0 && (
              <span className="text-sand-muted">{bundleSummary.identicalCount} identical</span>
            )}
            {bundleSummary.incompatibleCount > 0 && (
              <span className="text-sand-muted">
                {bundleSummary.incompatibleCount} incompatible
              </span>
            )}
            {bundleSummary.marketplaceCount > 0 && (
              <span className="text-sand-muted">
                {bundleSummary.marketplaceCount} from marketplace
              </span>
            )}
          </div>
        )}
        <div className="flex gap-2 mt-2">
          {[1, 2].map((s) => (
            <span
              key={s}
              className={`w-2 h-2 rounded-full ${
                s <= importStep ? 'bg-accent-olive' : 'bg-sand-border'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-accent-destructive/10 text-accent-destructive text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Preview & Resolve */}
        {importStep === 1 && (
          <div className="space-y-4">
            {/* Filter pills — quick toggle by action type */}
            <div className="flex flex-wrap gap-1.5">
              {conflicts.newComponents.length > 0 && (
                <button
                  type="button"
                  title="Plugins you don't have yet — will be installed"
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    activeFilters.has('new')
                      ? 'bg-accent-olive/15 border-accent-olive text-accent-olive'
                      : 'border-sand-border text-sand-secondary hover:bg-sand-surface/60'
                  }`}
                  onClick={() => toggleFilter('new')}
                >
                  New ({conflicts.newComponents.length})
                </button>
              )}
              {realConflicts.length > 0 && (
                <button
                  type="button"
                  title="Plugins you already have with a different version or settings"
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    activeFilters.has('conflicts')
                      ? 'bg-amber-50 border-amber-400 text-amber-700'
                      : 'border-sand-border text-sand-secondary hover:bg-sand-surface/60'
                  }`}
                  onClick={() => toggleFilter('conflicts')}
                >
                  Needs review ({realConflicts.length})
                </button>
              )}
              {identicalConflicts.length > 0 && (
                <button
                  type="button"
                  title="Plugins you already have with the same version — no action needed"
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    activeFilters.has('identical')
                      ? 'bg-sand-surface border-sand-text/30 text-sand-text'
                      : 'border-sand-border text-sand-secondary hover:bg-sand-surface/60'
                  }`}
                  onClick={() => toggleFilter('identical')}
                >
                  Identical ({identicalConflicts.length})
                </button>
              )}
              {conflicts.incompatible.length > 0 && (
                <button
                  type="button"
                  title="Plugins that require tools you don't have installed"
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    activeFilters.has('incompatible')
                      ? 'bg-sand-surface border-sand-text/30 text-sand-text'
                      : 'border-sand-border text-sand-secondary hover:bg-sand-surface/60'
                  }`}
                  onClick={() => toggleFilter('incompatible')}
                >
                  Incompatible ({conflicts.incompatible.length})
                </button>
              )}
              {bundle.plugins.length > 0 && (
                <button
                  type="button"
                  title="Plugin groups — will restore full plugin structure"
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    activeFilters.has('plugins')
                      ? 'bg-blue-50 border-blue-400 text-blue-700'
                      : 'border-sand-border text-sand-secondary hover:bg-sand-surface/60'
                  }`}
                  onClick={() => toggleFilter('plugins')}
                >
                  Plugins ({bundle.plugins.length})
                </button>
              )}
              {activeFilters.size > 0 && (
                <button
                  type="button"
                  className="text-xs px-2 py-1 text-sand-muted hover:text-sand-text"
                  onClick={() => setActiveFilters(new Set())}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Type filter pills */}
            {bundleSummary && bundleSummary.importTypes.size > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {Array.from(bundleSummary.importTypes.entries()).map(([type, count]) => (
                  <button
                    key={type}
                    type="button"
                    title={COMPONENT_TYPE_META[type]?.tooltip}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      importTypeFilters.has(type)
                        ? 'bg-accent-olive/15 border-accent-olive text-accent-olive'
                        : 'border-sand-border text-sand-secondary hover:bg-sand-surface/60'
                    }`}
                    onClick={() => toggleTypeFilter(type)}
                  >
                    {COMPONENT_TYPE_META[type]?.label ?? type} ({count})
                  </button>
                ))}
                {importTypeFilters.size > 0 && (
                  <button
                    type="button"
                    className="text-xs px-2 py-1 text-sand-muted hover:text-sand-text"
                    onClick={() => setImportTypeFilters(new Set())}
                  >
                    Clear types
                  </button>
                )}
              </div>
            )}

            {/* Plugin groups (R4) */}
            {bundle.plugins.length > 0 && (showSection('plugins') || activeFilters.size === 0) && (
              <section>
                <h3 className="text-xs font-medium text-sand-secondary uppercase tracking-wider mb-2">
                  Plugin Groups ({bundle.plugins.length})
                </h3>
                <div className="space-y-1.5">
                  {bundle.plugins.map((plugin) => (
                    <PluginGroupRow
                      key={plugin.pluginKey}
                      plugin={plugin}
                      expanded={expandedPlugins.has(plugin.pluginKey)}
                      onToggleExpand={() => togglePluginExpand(plugin.pluginKey)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* New components */}
            {conflicts.newComponents.length > 0 && showSection('new') && (
              <section>
                <h3 className="text-xs font-medium text-sand-secondary uppercase tracking-wider mb-2">
                  New ({conflicts.newComponents.length})
                </h3>
                <div className="space-y-1">
                  {conflicts.newComponents
                    .filter((c) => matchesTypeFilter(c.type))
                    .map((c) => (
                      <div
                        key={`${c.type}:${c.name}`}
                        className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-accent-olive/5"
                      >
                        <span className="text-xs text-accent-olive font-medium">NEW</span>
                        <span className="font-mono text-sm truncate">{c.name}</span>
                        <TypeBadge type={c.type} />
                        <ScopeBadge scope={c.scope} />
                        {c.marketplaceSource && (
                          <span
                            className="text-xs text-sand-muted ml-auto shrink-0"
                            title={`Available in marketplace: ${c.marketplaceSource.sourceId}`}
                          >
                            via marketplace
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              </section>
            )}

            {/* USR-16: Identical items — collapsed summary (expanded when filtered) */}
            {identicalConflicts.length > 0 && showSection('identical') && (
              <section>
                {activeFilters.has('identical') ? (
                  <>
                    <h3 className="text-xs font-medium text-sand-secondary uppercase tracking-wider mb-2">
                      Already up to date ({identicalConflicts.length})
                    </h3>
                    <div className="space-y-1">
                      {identicalConflicts.map((c) => (
                        <div
                          key={`${c.incoming.type}:${c.incoming.name}`}
                          className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-sand-surface/30 text-sm text-sand-muted"
                        >
                          <span className="font-mono truncate">{c.incoming.name}</span>
                          <TypeBadge type={c.incoming.type} />
                          <ScopeBadge scope={c.incoming.scope} />
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="py-2 px-3 rounded-lg bg-sand-surface/30 text-sm text-sand-muted">
                    {identicalConflicts.length} already up to date — no action needed
                  </div>
                )}
              </section>
            )}

            {/* Conflicts (real — excluding identical) */}
            {realConflicts.length > 0 && showSection('conflicts') && (
              <section>
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <h3 className="text-xs font-medium text-sand-secondary uppercase tracking-wider">
                      Needs review ({realConflicts.length})
                    </h3>
                    <p className="text-xs text-sand-muted">
                      You already have these — choose to use the bundle version or keep yours
                    </p>
                  </div>
                  <label
                    className="flex items-center gap-1.5 text-xs"
                    title="Use the bundle version for all conflicts"
                  >
                    <input
                      type="checkbox"
                      checked={alwaysOverride}
                      onChange={(e) => setAlwaysOverride(e.target.checked)}
                      className="rounded border-sand-border accent-accent-olive"
                    />
                    Replace all
                  </label>
                </div>
                <div className="space-y-2">
                  {realConflicts
                    .filter((c) => matchesTypeFilter(c.incoming.type))
                    .map((conflict) => (
                      <ConflictRow
                        key={`${conflict.incoming.type}:${conflict.incoming.name}`}
                        conflict={conflict}
                        resolution={resolutions.find(
                          (r) =>
                            r.componentKey.type === conflict.incoming.type &&
                            r.componentKey.name === conflict.incoming.name,
                        )}
                        onResolve={setResolution}
                        disabled={alwaysOverride}
                      />
                    ))}
                </div>
              </section>
            )}

            {/* Incompatible */}
            {conflicts.incompatible.length > 0 && showSection('incompatible') && (
              <section>
                <h3 className="text-xs font-medium text-sand-secondary uppercase tracking-wider mb-0.5">
                  Incompatible ({conflicts.incompatible.length})
                </h3>
                <p className="text-xs text-sand-muted mb-2">
                  For AI tools you haven't installed (like Claude Desktop or Gemini CLI) — will be
                  skipped
                </p>
                <div className="space-y-1">
                  {conflicts.incompatible
                    .filter((item) => matchesTypeFilter(item.component.type))
                    .map((item) => (
                      <div
                        key={`${item.component.type}:${item.component.name}`}
                        className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-sand-surface/50 opacity-60"
                      >
                        <span className="text-xs text-sand-muted font-medium">SKIP</span>
                        <span className="font-mono text-sm truncate">{item.component.name}</span>
                        <span className="text-xs text-sand-muted ml-auto">{item.reason}</span>
                      </div>
                    ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Step 2: Config & Install */}
        {importStep === 2 && (
          <div className="space-y-4">
            {/* H1: Config prompts — shown before install when components have requiredConfig */}
            {showingConfigPrompts && !importing && !importResult && (
              <div className="space-y-4">
                <p className="text-sm text-sand-secondary">
                  Some plugins need settings before they can be installed.
                </p>
                {pendingConfigs.map((pc) => {
                  const key = `${pc.componentName}::${pc.config.key}`;
                  return (
                    <div key={key} className="space-y-1">
                      <label className="block text-sm font-medium text-sand-text">
                        {pc.config.description ?? pc.config.key}
                        <span className="text-xs text-sand-muted ml-2">for {pc.componentName}</span>
                      </label>
                      {pc.config.description && (
                        <p className="text-xs text-sand-secondary font-mono">{pc.config.key}</p>
                      )}
                      {pc.config.sensitive && (
                        <p className="text-xs text-amber-600">
                          {'\u{1F512}'} This value is stored securely on your computer
                        </p>
                      )}
                      <input
                        type={pc.config.sensitive ? 'password' : 'text'}
                        value={configValues[key] ?? ''}
                        onChange={(e) => setConfigValue(key, e.target.value)}
                        placeholder={pc.config.default ?? `Enter ${pc.config.key}`}
                        className="w-full px-3 py-2 rounded-lg bg-sand-surface/50 border border-sand-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent-olive/40"
                        aria-label={`Value for ${pc.config.key}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Install progress */}
            {importing && (
              <div className="text-center py-8">
                {progress && progress.status !== 'complete' ? (
                  <>
                    <p className="text-sm text-sand-text mb-2">
                      Installing {progress.componentName}...
                    </p>
                    <p className="text-xs text-sand-secondary">
                      {progress.current} of {progress.total}
                    </p>
                    {/* Fix L4: guard against divide-by-zero */}
                    <div className="w-48 h-1.5 bg-sand-surface rounded-full mx-auto mt-3">
                      <div
                        className="h-full bg-accent-olive rounded-full transition-all"
                        style={{
                          width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-sand-secondary animate-pulse">Installing plugins...</p>
                )}
              </div>
            )}

            {/* Results */}
            {!importing && importResult && (
              <>
                <div className="text-center py-4">
                  <p className="text-2xl mb-2">{'\u2705'}</p>
                  <h3 className="text-lg font-semibold text-sand-text mb-2">Import complete</h3>
                </div>

                {/* Summary counts */}
                <div className="flex justify-center gap-4 text-sm mb-4">
                  {importResult.installed.length > 0 && (
                    <span className="text-accent-olive font-medium">
                      {importResult.installed.length} installed
                    </span>
                  )}
                  {importResult.skipped.length > 0 && (
                    <span className="text-sand-secondary font-medium">
                      {importResult.skipped.length} skipped
                    </span>
                  )}
                  {importResult.failed.length > 0 && (
                    <span className="text-accent-destructive font-medium">
                      {importResult.failed.length} failed
                    </span>
                  )}
                </div>

                {/* Installed details */}
                {importResult.installed.length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-xs font-medium text-accent-olive uppercase tracking-wider mb-1.5">
                      Installed ({importResult.installed.length})
                    </h4>
                    <div className="space-y-1">
                      {importResult.installed.map((c) => (
                        <div
                          key={`${c.id.type}:${c.id.name}`}
                          className="flex items-center gap-2 py-1 px-3 rounded bg-accent-olive/5 text-sm"
                        >
                          <span className="font-mono truncate">{c.displayName ?? c.id.name}</span>
                          <TypeBadge type={c.id.type} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skipped details — shows WHY each was skipped */}
                {importResult.skipped.length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-xs font-medium text-sand-secondary uppercase tracking-wider mb-1.5">
                      Skipped ({importResult.skipped.length})
                    </h4>
                    <div className="space-y-1">
                      {importResult.skipped.map((s) => (
                        <div
                          key={`${s.component.type}:${s.component.name}`}
                          className="flex items-center gap-2 py-1 px-3 rounded bg-sand-surface/30 text-sm"
                        >
                          <span className="font-mono truncate">
                            {s.component.description ?? s.component.name}
                          </span>
                          <TypeBadge type={s.component.type} />
                          <span className="text-xs text-sand-muted ml-auto shrink-0">
                            {s.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Failed details */}
                {importResult.failed.length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-xs font-medium text-accent-destructive uppercase tracking-wider mb-1.5">
                      Failed ({importResult.failed.length})
                    </h4>
                    <div className="space-y-1">
                      {importResult.failed.map((f) => (
                        <div
                          key={`${f.component.type}:${f.component.name}`}
                          className="py-1 px-3 rounded bg-accent-destructive/5 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono truncate">
                              {f.component.description ?? f.component.name}
                            </span>
                            <TypeBadge type={f.component.type} />
                          </div>
                          <p className="text-xs text-accent-destructive mt-0.5">
                            {f.error.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-between px-6 py-4 border-t border-sand-border">
        {importStep === 1 && (
          <>
            <Button variant="outline" size="sm" onClick={closeWizard}>
              Cancel
            </Button>
            <Button
              className="bg-accent-olive text-white hover:bg-accent-olive/90"
              size="sm"
              disabled={loading || installCount === 0}
              onClick={executeImport}
            >
              {installCount > 0 ? `Install (${installCount})` : 'Nothing to install'}
            </Button>
          </>
        )}
        {importStep === 2 && showingConfigPrompts && !importing && !importResult && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => useWizardStore.getState().setImportStep(1)}
            >
              {'\u2190 Back'}
            </Button>
            <Button
              className="bg-accent-olive text-white hover:bg-accent-olive/90"
              size="sm"
              disabled={!allConfigsFilled}
              onClick={confirmConfigs}
            >
              Install
            </Button>
          </>
        )}
        {importStep === 2 && !importing && importResult && (
          <Button
            className="bg-accent-olive text-white hover:bg-accent-olive/90 ml-auto"
            size="sm"
            onClick={handleGoToSetup}
          >
            Go to My Setup
          </Button>
        )}
      </div>
    </WizardShell>
  );
}

/** Reusable wizard shell (backdrop + modal frame) */
function WizardShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/20" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-sand-paper rounded-xl shadow-xl border border-sand-border w-full max-w-2xl max-h-[80vh] flex flex-col animate-bounce-in"
          role="dialog"
          aria-modal="true"
          aria-label="Import bundle"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </>
  );
}

/** Individual conflict row with resolve dropdown */
function ConflictRow({
  conflict,
  resolution,
  onResolve,
  disabled,
}: {
  conflict: ConflictEntry;
  resolution: ConflictResolution | undefined;
  onResolve: (r: ConflictResolution) => void;
  disabled?: boolean;
}) {
  const { incoming, existing, conflictType } = conflict;
  const action = resolution?.action ?? 'install';

  const badgeText: Record<string, string> = {
    version: `${existing.version ?? '?'} \u2192 ${incoming.version ?? '?'}`,
    content: 'Settings are different',
    'scope-mismatch': 'Installed in a different location',
  };

  const badgeColor: Record<string, string> = {
    version: 'bg-amber-50 text-amber-700',
    content: 'bg-amber-50 text-amber-700',
    'scope-mismatch': 'bg-blue-50 text-blue-700',
  };

  return (
    <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-sand-surface/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm truncate">{incoming.name}</span>
          <TypeBadge type={incoming.type} />
          <ScopeBadge scope={incoming.scope} />
          {incoming.marketplaceSource && (
            <span className="text-xs text-sand-muted shrink-0">via marketplace</span>
          )}
        </div>
        <span
          title={
            conflictType === 'scope-mismatch'
              ? 'This plugin is installed globally vs. for a specific project (or vice versa)'
              : undefined
          }
          className={`inline-block mt-0.5 text-xs px-1.5 py-0.5 rounded ${badgeColor[conflictType]}`}
        >
          {badgeText[conflictType]}
        </span>
      </div>

      <select
        value={action}
        disabled={disabled}
        onChange={(e) =>
          onResolve({
            componentKey: { type: incoming.type, name: incoming.name },
            action: e.target.value as 'install' | 'skip',
          })
        }
        className={`text-xs px-2 py-1 rounded border border-sand-border bg-sand-paper${disabled ? ' opacity-50 cursor-not-allowed' : ''}`}
        aria-label={`Resolution for ${incoming.name}`}
        title="Replace: use the bundle version. Skip: keep your current version."
      >
        <option value="install">Replace</option>
        <option value="skip">Skip</option>
      </select>
    </div>
  );
}

/** Collapsible plugin group row for import preview (R4) */
function PluginGroupRow({
  plugin,
  expanded,
  onToggleExpand,
}: {
  plugin: PortablePlugin;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const componentCount = plugin.components.length;
  // Count by type
  const typeSummary = plugin.components.reduce(
    (acc, c) => {
      const label = COMPONENT_TYPE_META[c.type]?.label ?? c.type;
      acc[label] = (acc[label] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="rounded-lg border border-sand-border/60 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 py-2 px-3 bg-blue-50/30 hover:bg-blue-50/50 transition-colors text-left"
        onClick={onToggleExpand}
        aria-expanded={expanded}
      >
        <span className="text-xs text-blue-600 shrink-0">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span className="font-mono text-sm font-medium truncate">{plugin.pluginName}</span>
        {plugin.version && (
          <span className="text-xs text-sand-muted shrink-0">v{plugin.version}</span>
        )}
        <span className="text-xs text-sand-secondary shrink-0">
          {componentCount} {componentCount === 1 ? 'component' : 'components'}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
            plugin.enabled
              ? 'bg-accent-olive/10 text-accent-olive'
              : 'bg-sand-surface/60 text-sand-muted'
          }`}
        >
          {plugin.enabled ? 'enabled' : 'disabled'}
        </span>
        {plugin.marketplace && (
          <span className="text-xs text-sand-muted ml-auto shrink-0">@{plugin.marketplace}</span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-sand-border/40 bg-sand-paper/50 px-3 py-2 space-y-1">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-sand-secondary mb-1.5">
            {Object.entries(typeSummary).map(([label, count]) => (
              <span key={label}>
                {count} {label}
                {count !== 1 ? 's' : ''}
              </span>
            ))}
          </div>
          {plugin.components.map((c) => {
            const leafName = c.name.includes('/')
              ? c.name.slice(c.name.lastIndexOf('/') + 1)
              : c.name;
            return (
              <div
                key={`${c.type}:${c.name}`}
                className="flex items-center gap-2 py-1 px-2 rounded bg-sand-surface/20 text-sm"
              >
                <span className="font-mono text-xs truncate">{leafName}</span>
                <TypeBadge type={c.type} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
