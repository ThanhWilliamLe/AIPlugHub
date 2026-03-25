/**
 * Compare wizard — modal for comparing bundles or bundle vs. current setup.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useCompareStore } from '@renderer/stores/compare-store';
import type { CompareTarget, DiffCategory } from '@renderer/stores/compare-store';
import { useToolStore } from '@renderer/stores/tool-store';
import { TOOL_META, COMPONENT_TYPE_META } from '@shared/constants';
import { TypeBadge } from '@renderer/components/shared/TypeBadge';
import { Button } from '@renderer/components/ui/button';
import type { ProjectFolder } from '@shared/types';

export function CompareWizard() {
  const {
    mode,
    leftLabel,
    rightLabel,
    diffResult,
    loading,
    error,
    setMode,
    compareBundles,
    compareWithSetup,
    close,
  } = useCompareStore();

  const tools = useToolStore((s) => s.tools);
  const detectedTools = useMemo(() => tools.filter((t) => t.detected), [tools]);

  const [leftPath, setLeftPath] = useState('');
  const [rightPath, setRightPath] = useState('');
  const [bundlePath, setBundlePath] = useState('');
  const [compareTarget, setCompareTarget] = useState<CompareTarget | null>(null);
  const [projectFolders, setProjectFolders] = useState<ProjectFolder[]>([]);

  useEffect(() => {
    window.aiplughub.projects
      .list()
      .then(setProjectFolders)
      .catch(() => {});
  }, []);

  const handlePickFile = useCallback(async (setter: (path: string) => void) => {
    try {
      const filePath = await window.aiplughub.system.openFileDialog({
        title: 'Select a bundle file',
        filters: [{ name: 'AI Bundle', extensions: ['aibundle', 'json'] }],
      });
      if (filePath) setter(filePath);
    } catch {
      // Dialog cancelled or failed
    }
  }, []);

  const handleCompareBundles = useCallback(async () => {
    if (!leftPath || !rightPath) return;
    await compareBundles(leftPath, rightPath);
  }, [leftPath, rightPath, compareBundles]);

  const handleCompareWithSetup = useCallback(async () => {
    if (!bundlePath || !compareTarget) return;
    await compareWithSetup(bundlePath, compareTarget);
  }, [bundlePath, compareTarget, compareWithSetup]);

  // Handle Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [close]);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/20" onClick={close} aria-hidden="true" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-sand-paper rounded-xl shadow-xl border border-sand-border w-full max-w-2xl max-h-[80vh] flex flex-col animate-bounce-in"
          role="dialog"
          aria-modal="true"
          aria-label="Compare bundles"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-sand-border">
            <h2 className="text-lg font-semibold text-sand-text">Compare</h2>
            <p className="text-xs text-sand-muted">
              {!mode
                ? 'Choose a comparison mode'
                : mode === 'bundle-vs-bundle'
                  ? 'Compare two bundle files side by side'
                  : 'Compare a bundle against your current setup'}
            </p>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-accent-destructive/10 text-accent-destructive text-sm">
                {error}
              </div>
            )}

            {/* Mode selection */}
            {!mode && !diffResult && (
              <div className="flex gap-4">
                <button
                  type="button"
                  className="flex-1 rounded-xl border border-sand-border bg-sand-surface/30 p-6 text-center hover:scale-[1.01] hover:border-accent-olive/40 transition-all cursor-pointer"
                  onClick={() => setMode('bundle-vs-bundle')}
                >
                  <div className="text-2xl mb-2">{'\u{1F504}'}</div>
                  <h3 className="text-sm font-semibold text-sand-text mb-1">Bundle vs Bundle</h3>
                  <p className="text-xs text-sand-secondary">Compare two exported bundle files</p>
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl border border-sand-border bg-sand-surface/30 p-6 text-center hover:scale-[1.01] hover:border-accent-olive/40 transition-all cursor-pointer"
                  onClick={() => setMode('bundle-vs-setup')}
                >
                  <div className="text-2xl mb-2">{'\u2705'}</div>
                  <h3 className="text-sm font-semibold text-sand-text mb-1">Bundle vs My Setup</h3>
                  <p className="text-xs text-sand-secondary">
                    Check if your setup matches a bundle
                  </p>
                </button>
              </div>
            )}

            {/* Bundle vs Bundle: file pickers */}
            {mode === 'bundle-vs-bundle' && !diffResult && !loading && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-sand-text mb-1">
                    Left bundle
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={leftPath}
                      placeholder="No file selected"
                      className="flex-1 text-sm px-3 py-2 rounded-lg border border-sand-border bg-sand-surface/50 text-sand-text truncate"
                      aria-label="Left bundle path"
                    />
                    <Button variant="outline" size="sm" onClick={() => handlePickFile(setLeftPath)}>
                      Browse...
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-sand-text mb-1">
                    Right bundle
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={rightPath}
                      placeholder="No file selected"
                      className="flex-1 text-sm px-3 py-2 rounded-lg border border-sand-border bg-sand-surface/50 text-sand-text truncate"
                      aria-label="Right bundle path"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePickFile(setRightPath)}
                    >
                      Browse...
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Bundle vs Setup: file picker + target picker */}
            {mode === 'bundle-vs-setup' && !diffResult && !loading && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-sand-text mb-1">
                    Bundle file
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={bundlePath}
                      placeholder="No file selected"
                      className="flex-1 text-sm px-3 py-2 rounded-lg border border-sand-border bg-sand-surface/50 text-sand-text truncate"
                      aria-label="Bundle file path"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePickFile(setBundlePath)}
                    >
                      Browse...
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-sand-text mb-1">
                    Compare against
                  </label>
                  <select
                    value={
                      compareTarget
                        ? compareTarget.scope === 'user'
                          ? `user:${compareTarget.toolId}`
                          : `project:${compareTarget.projectPath}`
                        : ''
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setCompareTarget(null);
                        return;
                      }
                      const [scope, id] = val.split(':');
                      if (scope === 'user') {
                        setCompareTarget({ scope: 'user', toolId: id });
                      } else {
                        setCompareTarget({
                          scope: 'project',
                          projectPath: val.slice('project:'.length),
                        });
                      }
                    }}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-sand-border bg-sand-paper focus:outline-none focus:ring-2 focus:ring-accent-olive/40"
                    aria-label="Compare target"
                  >
                    <option value="">Select a target...</option>
                    <optgroup label="User scope (tool)">
                      {detectedTools.map((t) => (
                        <option key={`user:${t.toolId}`} value={`user:${t.toolId}`}>
                          {TOOL_META[t.toolId]?.label ?? t.toolId}
                        </option>
                      ))}
                    </optgroup>
                    {projectFolders.length > 0 && (
                      <optgroup label="Project scope">
                        {projectFolders.map((f) => (
                          <option key={`project:${f.path}`} value={`project:${f.path}`}>
                            {f.name} ({f.path})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="text-center py-12">
                <p className="text-sm text-sand-secondary animate-pulse">Comparing...</p>
              </div>
            )}

            {/* Diff results */}
            {diffResult && !loading && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-medium text-sand-text">{leftLabel}</span>
                  <span className="text-sand-muted">vs</span>
                  <span className="font-medium text-sand-text">{rightLabel}</span>
                </div>
                <div className="flex gap-4 text-xs">
                  {diffResult.summary.added > 0 && (
                    <span className="text-accent-olive font-medium">
                      +{diffResult.summary.added} added
                    </span>
                  )}
                  {diffResult.summary.removed > 0 && (
                    <span className="text-accent-destructive font-medium">
                      -{diffResult.summary.removed} removed
                    </span>
                  )}
                  {diffResult.summary.changed > 0 && (
                    <span className="text-amber-600 font-medium">
                      ~{diffResult.summary.changed} changed
                    </span>
                  )}
                  {diffResult.summary.unchanged > 0 && (
                    <span className="text-sand-muted">
                      {diffResult.summary.unchanged} unchanged
                    </span>
                  )}
                </div>

                {/* Added */}
                <DiffSection
                  category="added"
                  entries={diffResult.entries.filter((e) => e.category === 'added')}
                  label="Added"
                  defaultExpanded
                />

                {/* Removed */}
                <DiffSection
                  category="removed"
                  entries={diffResult.entries.filter((e) => e.category === 'removed')}
                  label="Removed"
                  defaultExpanded
                />

                {/* Changed */}
                <DiffSection
                  category="changed"
                  entries={diffResult.entries.filter((e) => e.category === 'changed')}
                  label="Changed"
                  defaultExpanded
                />

                {/* Unchanged (collapsed by default) */}
                {diffResult.summary.unchanged > 0 && (
                  <DiffSection
                    category="unchanged"
                    entries={diffResult.entries.filter((e) => e.category === 'unchanged')}
                    label="Unchanged"
                    defaultExpanded={false}
                  />
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between px-6 py-4 border-t border-sand-border">
            {!diffResult ? (
              <>
                <Button variant="outline" size="sm" onClick={mode ? () => setMode(null) : close}>
                  {mode ? 'Back' : 'Cancel'}
                </Button>
                {mode === 'bundle-vs-bundle' && (
                  <Button
                    className="bg-accent-olive text-white hover:bg-accent-olive/90"
                    size="sm"
                    disabled={!leftPath || !rightPath || loading}
                    onClick={handleCompareBundles}
                  >
                    Compare
                  </Button>
                )}
                {mode === 'bundle-vs-setup' && (
                  <Button
                    className="bg-accent-olive text-white hover:bg-accent-olive/90"
                    size="sm"
                    disabled={!bundlePath || !compareTarget || loading}
                    onClick={handleCompareWithSetup}
                  >
                    Compare
                  </Button>
                )}
              </>
            ) : (
              <Button
                className="bg-accent-olive text-white hover:bg-accent-olive/90 ml-auto"
                size="sm"
                onClick={close}
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

/** Collapsible diff section */
function DiffSection({
  category,
  entries,
  label,
  defaultExpanded,
}: {
  category: DiffCategory;
  entries: {
    type: string;
    name: string;
    leftVersion?: string;
    rightVersion?: string;
    changeDetails?: string;
  }[];
  label: string;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (entries.length === 0) return null;

  const colorMap: Record<DiffCategory, string> = {
    added: 'text-accent-olive',
    removed: 'text-accent-destructive',
    changed: 'text-amber-600',
    unchanged: 'text-sand-muted',
  };

  const bgMap: Record<DiffCategory, string> = {
    added: 'bg-accent-olive/5',
    removed: 'bg-accent-destructive/5',
    changed: 'bg-amber-50/50',
    unchanged: 'bg-sand-surface/30',
  };

  return (
    <section>
      <button
        type="button"
        className="flex items-center gap-2 w-full text-left mb-1.5"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="text-xs text-sand-muted">{expanded ? '\u25BC' : '\u25B6'}</span>
        <h3 className={`text-xs font-medium uppercase tracking-wider ${colorMap[category]}`}>
          {label} ({entries.length})
        </h3>
      </button>
      {expanded && (
        <div className="space-y-1">
          {entries.map((entry) => (
            <div
              key={`${entry.type}:${entry.name}`}
              className={`flex items-center gap-2 py-1.5 px-3 rounded-lg ${bgMap[category]}`}
            >
              <span className="font-mono text-sm truncate">{entry.name}</span>
              <TypeBadge type={entry.type} />
              {entry.leftVersion && (
                <span className="text-xs text-sand-muted shrink-0">
                  {entry.rightVersion && entry.leftVersion !== entry.rightVersion
                    ? `${entry.leftVersion} -> ${entry.rightVersion}`
                    : `v${entry.leftVersion}`}
                </span>
              )}
              {!entry.leftVersion && entry.rightVersion && (
                <span className="text-xs text-sand-muted shrink-0">v{entry.rightVersion}</span>
              )}
              {entry.changeDetails && (
                <span className="text-xs text-amber-600 ml-auto shrink-0 truncate max-w-[200px]">
                  {entry.changeDetails}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
