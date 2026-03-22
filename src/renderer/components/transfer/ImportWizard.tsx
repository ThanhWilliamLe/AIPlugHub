/**
 * Import wizard — 2-step modal: Preview & Resolve → Config & Install (results).
 */

import { useState, useEffect, useMemo } from 'react';
import { useWizardStore } from '@renderer/stores/wizard-store';
import { useToolStore } from '@renderer/stores/tool-store';
import { useUiStore } from '@renderer/stores/ui-store';
import { TOOL_META, COMPONENT_TYPE_META } from '@shared/constants';
import { TypeBadge } from '@renderer/components/shared/TypeBadge';
import { Button } from '@renderer/components/ui/button';
import type { ImportProgressEvent } from '@shared/types';
import type { ConflictEntry, ConflictResolution } from '@shared/types';

export function ImportWizard() {
  const [progress, setProgress] = useState<ImportProgressEvent | null>(null);

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
    return {
      totalComponents,
      typeCounts,
      newCount: conflicts.newComponents.length,
      conflictCount: realConflicts.length,
      identicalCount: identicalConflicts.length,
      incompatibleCount: conflicts.incompatible.length,
    };
  }, [bundle, conflicts, realConflicts, identicalConflicts]);

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
              onClick={closeWizard}
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
    closeWizard();
    // Rescan so My Setup reflects the newly imported components
    await useToolStore.getState().scanAll();
    setActiveTab('my-setup');
  };

  return (
    <WizardShell onClose={closeWizard}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-sand-border">
        <h2 className="text-lg font-semibold text-sand-text">Import Bundle</h2>
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
              {bundleSummary.totalComponents} component
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
              <span className="text-amber-600">
                {bundleSummary.conflictCount} conflict{bundleSummary.conflictCount !== 1 ? 's' : ''}
              </span>
            )}
            {bundleSummary.identicalCount > 0 && (
              <span className="text-sand-muted">{bundleSummary.identicalCount} identical</span>
            )}
            {bundleSummary.incompatibleCount > 0 && (
              <span className="text-sand-muted">
                {bundleSummary.incompatibleCount} incompatible
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
            {/* New components */}
            {conflicts.newComponents.length > 0 && (
              <section>
                <h3 className="text-xs font-medium text-sand-secondary uppercase tracking-wider mb-2">
                  New ({conflicts.newComponents.length})
                </h3>
                <div className="space-y-1">
                  {conflicts.newComponents.map((c) => (
                    <div
                      key={`${c.type}:${c.name}`}
                      className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-accent-olive/5"
                    >
                      <span className="text-xs text-accent-olive font-medium">NEW</span>
                      <span className="font-mono text-sm truncate">{c.name}</span>
                      <TypeBadge type={c.type} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* USR-16: Identical items — collapsed summary */}
            {identicalConflicts.length > 0 && (
              <section>
                <div className="py-2 px-3 rounded-lg bg-sand-surface/30 text-sm text-sand-muted">
                  {identicalConflicts.length} identical — will be skipped
                </div>
              </section>
            )}

            {/* Conflicts (real — excluding identical) */}
            {realConflicts.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-sand-secondary uppercase tracking-wider">
                    Conflicts ({realConflicts.length})
                  </h3>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={alwaysOverride}
                      onChange={(e) => setAlwaysOverride(e.target.checked)}
                      className="rounded border-sand-border accent-accent-olive"
                    />
                    Always override
                  </label>
                </div>
                <div className="space-y-2">
                  {realConflicts.map((conflict) => (
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
            {conflicts.incompatible.length > 0 && (
              <section>
                <h3 className="text-xs font-medium text-sand-secondary uppercase tracking-wider mb-2">
                  Incompatible ({conflicts.incompatible.length})
                </h3>
                <div className="space-y-1">
                  {conflicts.incompatible.map((item) => (
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
                  Some components require configuration before they can be installed.
                </p>
                {pendingConfigs.map((pc) => {
                  const key = `${pc.componentName}::${pc.config.key}`;
                  return (
                    <div key={key} className="space-y-1">
                      <label className="block text-sm font-medium text-sand-text">
                        {pc.config.key}
                        <span className="text-xs text-sand-muted ml-2">for {pc.componentName}</span>
                      </label>
                      {pc.config.description && (
                        <p className="text-xs text-sand-secondary">{pc.config.description}</p>
                      )}
                      {pc.config.sensitive && (
                        <p className="text-xs text-amber-600">
                          {'\u{1F512}'} Sensitive — will be stored in OS keychain
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
                  <p className="text-sm text-sand-secondary animate-pulse">
                    Installing components...
                  </p>
                )}
              </div>
            )}

            {/* Results */}
            {!importing && importResult && (
              <>
                <div className="text-center py-4">
                  <p className="text-2xl mb-2">{'\u2705'}</p>
                  <h3 className="text-lg font-semibold text-sand-text mb-4">Import complete</h3>
                </div>

                <div className="space-y-2 text-sm">
                  {importResult.installed.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-accent-olive">Installed</span>
                      <span className="font-medium">{importResult.installed.length}</span>
                    </div>
                  )}
                  {importResult.skipped.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sand-secondary">Skipped</span>
                      <span className="font-medium">{importResult.skipped.length}</span>
                    </div>
                  )}
                  {importResult.failed.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-accent-destructive">Failed</span>
                      <span className="font-medium">{importResult.failed.length}</span>
                    </div>
                  )}
                </div>

                {importResult.failed.length > 0 && (
                  <div className="mt-4 space-y-1">
                    {importResult.failed.map((f) => (
                      <div
                        key={`${f.component.type}:${f.component.name}`}
                        className="text-xs text-accent-destructive"
                      >
                        {f.component.name}: {f.error.message}
                      </div>
                    ))}
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
              disabled={loading}
              onClick={executeImport}
            >
              Install
            </Button>
          </>
        )}
        {importStep === 2 && showingConfigPrompts && !importing && !importResult && (
          <>
            <Button variant="outline" size="sm" onClick={closeWizard}>
              Cancel
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
    content: 'Content differs',
    'scope-mismatch': `Scope: ${existing.id.scope} \u2260 ${incoming.scope ?? 'default'}`,
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
        </div>
        <span
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
      >
        <option value="install">Replace</option>
        <option value="skip">Skip</option>
      </select>
    </div>
  );
}
