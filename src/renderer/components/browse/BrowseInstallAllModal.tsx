/**
 * Install All modal — batch install selected Browse entries.
 * Shows location picker, scrollable list with smart skip for installed items,
 * and progress tracking during install.
 * Source: 5A-specs/keyboard-browse-multiselect-spec.md §4
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  MarketplaceEntry,
  MarketplaceRef,
  BrowseInstallTarget,
  ToolId,
  ProjectFolder,
} from '@shared/types';
import { TOOL_META } from '@shared/constants';
import { useToolStore } from '@renderer/stores/tool-store';
import { useBrowseStore, marketplaceRefEquals } from '@renderer/stores/browse-store';
import { useToastStore } from '@renderer/stores/toast-store';
import { isEntryInstalled } from '@renderer/lib/install-match';
import { friendlyError } from '@shared/utils';
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/utils';

type InstallStatus = 'ready' | 'installed' | 'installing' | 'success' | 'failed' | 'skipped';

type InstallItem = {
  entry: MarketplaceEntry;
  ref: MarketplaceRef;
  status: InstallStatus;
  checked: boolean;
  error?: string;
};

type BrowseInstallAllModalProps = {
  open: boolean;
  selectedRefs: MarketplaceRef[];
  onClose: () => void;
};

/** Extract last path segment as folder display name */
function folderName(p: string): string {
  const segments = p.replace(/[\\/]+$/, '').split(/[\\/]/);
  return segments[segments.length - 1] || p;
}

export function BrowseInstallAllModal({ open, selectedRefs, onClose }: BrowseInstallAllModalProps) {
  const entries = useBrowseStore((s) => s.entries);
  const installAction = useBrowseStore((s) => s.install);
  const tools = useToolStore((s) => s.tools);
  const installedComponents = useToolStore((s) => s.components);
  const addToast = useToastStore((s) => s.addToast);

  const [items, setItems] = useState<InstallItem[]>([]);
  const [target, setTarget] = useState<BrowseInstallTarget | null>(null);
  const [projectFolders, setProjectFolders] = useState<ProjectFolder[]>([]);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isDone, setIsDone] = useState(false);

  // Detected tools
  const detectedTools = useMemo(() => tools.filter((t) => t.detected), [tools]);

  // Initialize items from selectedRefs
  useEffect(() => {
    if (!open) return;
    const newItems: InstallItem[] = selectedRefs
      .map((ref) => {
        const entry = entries.find((e) => e.sourceId === ref.sourceId && e.ref === ref.ref);
        const installed = entry ? isEntryInstalled(installedComponents, entry) : false;
        return {
          entry: entry!,
          ref,
          status: installed ? 'installed' : 'ready',
          checked: !installed,
        };
      })
      .filter((item) => item.entry);
    setItems(newItems);
    setIsInstalling(false);
    setIsDone(false);
  }, [open, selectedRefs, entries, installedComponents]);

  // Load saved target + project folders
  useEffect(() => {
    if (!open) return;
    window.aiplughub.preferences
      .get()
      .then((prefs) => {
        if (prefs.browseInstallTarget) {
          setTarget(prefs.browseInstallTarget);
        } else if (detectedTools.length > 0) {
          setTarget({ instanceId: detectedTools[0].instanceId, scope: 'user' });
        }
      })
      .catch(() => {
        if (detectedTools.length > 0) {
          setTarget({ instanceId: detectedTools[0].instanceId, scope: 'user' });
        }
      });
    window.aiplughub.projects
      .list()
      .then(setProjectFolders)
      .catch(() => {});
  }, [open, detectedTools]);

  const readyCount = items.filter((i) => i.checked && i.status === 'ready').length;
  const installedCount = items.filter((i) => i.status === 'installed').length;
  const successCount = items.filter((i) => i.status === 'success').length;
  const failedCount = items.filter((i) => i.status === 'failed').length;

  const toggleItem = useCallback((ref: MarketplaceRef) => {
    setItems((prev) =>
      prev.map((item) =>
        marketplaceRefEquals(item.ref, ref) && item.status === 'ready'
          ? { ...item, checked: !item.checked }
          : item,
      ),
    );
  }, []);

  const selectTarget = useCallback(async (instanceId: string, scope: string) => {
    const newTarget: BrowseInstallTarget = { instanceId, scope };
    setTarget(newTarget);
    try {
      await window.aiplughub.preferences.set({ browseInstallTarget: newTarget });
    } catch {
      // best-effort persist
    }
  }, []);

  const handleInstall = useCallback(async () => {
    if (!target) return;
    setIsInstalling(true);

    const toInstall = items.filter((i) => i.checked && i.status === 'ready');

    for (const item of toInstall) {
      // Mark installing
      setItems((prev) =>
        prev.map((i) =>
          marketplaceRefEquals(i.ref, item.ref) ? { ...i, status: 'installing' } : i,
        ),
      );

      try {
        await installAction(item.ref, target);
        setItems((prev) =>
          prev.map((i) =>
            marketplaceRefEquals(i.ref, item.ref) ? { ...i, status: 'success' } : i,
          ),
        );
      } catch (err) {
        const message = friendlyError(err instanceof Error ? err.message : String(err)).message;
        setItems((prev) =>
          prev.map((i) =>
            marketplaceRefEquals(i.ref, item.ref) ? { ...i, status: 'failed', error: message } : i,
          ),
        );
      }
    }

    setIsInstalling(false);
    setIsDone(true);
  }, [items, target, installAction]);

  const handleDone = useCallback(() => {
    const sCount = items.filter((i) => i.status === 'success').length;
    const fCount = items.filter((i) => i.status === 'failed').length;
    if (fCount > 0) {
      addToast({ message: `Installed ${sCount}, ${fCount} failed`, type: 'error' });
    } else if (sCount > 0) {
      addToast({
        message: `Installed ${sCount} plugin${sCount !== 1 ? 's' : ''}`,
        type: 'success',
      });
    }
    onClose();
  }, [items, addToast, onClose]);

  const handleRetryFailed = useCallback(async () => {
    if (!target) return;
    setIsDone(false);
    setIsInstalling(true);

    const failed = items.filter((i) => i.status === 'failed');
    // Reset failed to ready
    setItems((prev) =>
      prev.map((i) =>
        i.status === 'failed' ? { ...i, status: 'ready', checked: true, error: undefined } : i,
      ),
    );

    for (const item of failed) {
      setItems((prev) =>
        prev.map((i) =>
          marketplaceRefEquals(i.ref, item.ref) ? { ...i, status: 'installing' } : i,
        ),
      );
      try {
        await installAction(item.ref, target);
        setItems((prev) =>
          prev.map((i) =>
            marketplaceRefEquals(i.ref, item.ref) ? { ...i, status: 'success' } : i,
          ),
        );
      } catch (err) {
        const message = friendlyError(err instanceof Error ? err.message : String(err)).message;
        setItems((prev) =>
          prev.map((i) =>
            marketplaceRefEquals(i.ref, item.ref) ? { ...i, status: 'failed', error: message } : i,
          ),
        );
      }
    }

    setIsInstalling(false);
    setIsDone(true);
  }, [items, target, installAction]);

  if (!open) return null;

  const targetLabel = target
    ? (() => {
        const tool = tools.find((t) => t.instanceId === target.instanceId);
        const meta = tool ? TOOL_META[tool.toolId as ToolId] : undefined;
        const toolName = meta?.label ?? target.instanceId;
        if (target.scope === 'user') return `${toolName} (user)`;
        const projectPath = target.scope.replace(/^project:/, '');
        return `${folderName(projectPath)} (${toolName})`;
      })()
    : 'Select location';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isInstalling) onClose();
      }}
    >
      <div className="bg-sand-paper rounded-xl shadow-2xl border border-sand-border w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-sand-border">
          <h2 className="text-base font-semibold text-sand-text">
            Install {items.length} Plugin{items.length !== 1 ? 's' : ''}
          </h2>
          {!isInstalling && (
            <button
              type="button"
              onClick={onClose}
              className="text-sand-muted hover:text-sand-text transition-colors"
              aria-label="Close"
            >
              {'\u2715'}
            </button>
          )}
        </div>

        {/* Install location */}
        <div className="px-5 py-3 border-b border-sand-border/60">
          <label className="text-xs text-sand-muted block mb-1.5">Install to:</label>
          {detectedTools.length <= 1 && projectFolders.length === 0 ? (
            <div className="px-3 py-2 text-sm text-sand-text">{targetLabel}</div>
          ) : (
            <select
              value={target ? `${target.instanceId}::${target.scope}` : ''}
              onChange={(e) => {
                const val = e.target.value;
                const sepIdx = val.indexOf('::');
                const instanceId = val.slice(0, sepIdx);
                const scope = val.slice(sepIdx + 2);
                selectTarget(instanceId, scope);
              }}
              disabled={isInstalling}
              className="w-full px-3 py-2 text-sm rounded-lg border border-sand-border bg-sand-surface/50 text-sand-text"
            >
              {detectedTools.map((tool) => {
                const meta = TOOL_META[tool.toolId as ToolId];
                if (!meta) return null;
                return (
                  <option key={tool.instanceId} value={`${tool.instanceId}::user`}>
                    {meta.emoji} {meta.label} (user)
                  </option>
                );
              })}
              {projectFolders.map((folder) =>
                detectedTools.map((tool) => {
                  const meta = TOOL_META[tool.toolId as ToolId];
                  if (!meta) return null;
                  return (
                    <option
                      key={`${tool.instanceId}:${folder.path}`}
                      value={`${tool.instanceId}::project:${folder.path}`}
                    >
                      {'\u{1F4C1}'} {folderName(folder.path)} ({meta.label})
                    </option>
                  );
                }),
              )}
            </select>
          )}
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="text-xs text-sand-muted mb-2">Plugins to install</div>
          <div className="space-y-1">
            {items.map((item) => (
              <div
                key={`${item.ref.sourceId}:${item.ref.ref}`}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
                  item.status === 'installed' && 'opacity-50',
                  item.status === 'success' && 'bg-accent-olive/5',
                  item.status === 'failed' && 'bg-accent-destructive/5',
                )}
              >
                {/* Checkbox or status indicator */}
                {item.status === 'ready' ? (
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => toggleItem(item.ref)}
                    className="w-3.5 h-3.5 shrink-0 accent-[#4A7FB5] cursor-pointer"
                    disabled={isInstalling}
                  />
                ) : (
                  <span className="w-3.5 shrink-0 text-center text-xs">
                    {item.status === 'installed' && '\u2500'}
                    {item.status === 'installing' && (
                      <span className="animate-pulse">{'\u25CF'}</span>
                    )}
                    {item.status === 'success' && (
                      <span className="text-accent-olive">{'\u2713'}</span>
                    )}
                    {item.status === 'failed' && (
                      <span className="text-accent-destructive">{'\u2717'}</span>
                    )}
                    {item.status === 'skipped' && '\u2500'}
                  </span>
                )}

                {/* Name */}
                <span className="font-mono text-sand-text truncate flex-1">
                  {item.entry.displayName ?? item.entry.name}
                </span>

                {/* Version */}
                {item.entry.version && (
                  <span className="text-xs text-sand-muted shrink-0">v{item.entry.version}</span>
                )}

                {/* Status label */}
                <span
                  className={cn(
                    'text-xs shrink-0',
                    item.status === 'ready' && 'text-sand-secondary',
                    item.status === 'installed' && 'text-sand-muted',
                    item.status === 'installing' && 'text-accent-olive animate-pulse',
                    item.status === 'success' && 'text-accent-olive',
                    item.status === 'failed' && 'text-accent-destructive',
                  )}
                >
                  {item.status === 'ready' && 'Ready'}
                  {item.status === 'installed' && 'Installed'}
                  {item.status === 'installing' && 'Installing...'}
                  {item.status === 'success' && 'Installed \u2713'}
                  {item.status === 'failed' && 'Failed'}
                </span>
              </div>
            ))}
          </div>

          {/* Error details for failed items */}
          {failedCount > 0 && isDone && (
            <div className="mt-3 space-y-1">
              {items
                .filter((i) => i.status === 'failed' && i.error)
                .map((i) => (
                  <p
                    key={`err-${i.ref.sourceId}:${i.ref.ref}`}
                    className="text-xs text-accent-destructive px-3 select-all"
                  >
                    {i.entry.name}: {i.error}
                  </p>
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-sand-border">
          <span className="text-xs text-sand-muted">
            {!isDone
              ? `${readyCount} ready to install \u00B7 ${installedCount} already installed`
              : `${successCount} installed \u00B7 ${failedCount} failed`}
          </span>

          <div className="flex items-center gap-2">
            {!isDone ? (
              <>
                <Button variant="outline" size="sm" onClick={onClose} disabled={isInstalling}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-accent-olive text-white hover:bg-accent-olive/90"
                  onClick={handleInstall}
                  disabled={readyCount === 0 || !target || isInstalling}
                >
                  {isInstalling ? 'Installing...' : `Install ${readyCount}`}
                </Button>
              </>
            ) : (
              <>
                {failedCount > 0 && (
                  <Button variant="outline" size="sm" onClick={handleRetryFailed}>
                    Retry failed
                  </Button>
                )}
                <Button
                  size="sm"
                  className="bg-accent-olive text-white hover:bg-accent-olive/90"
                  onClick={handleDone}
                >
                  Done
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
