/**
 * Install button — location selector (persisted) + install action.
 * The dropdown only selects a target; "Install" uses the saved choice.
 * Source: 5A-specs/browse-tab-spec.md §5 (Install button)
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { ToolId, BrowseInstallTarget, MarketplaceRef, ProjectFolder } from '@shared/types';
import { TOOL_META } from '@shared/constants';
import { useToolStore } from '@renderer/stores/tool-store';
import { useUiStore } from '@renderer/stores/ui-store';
import { useBrowseStore } from '@renderer/stores/browse-store';
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/utils';

type InstallButtonProps = {
  ref_: MarketplaceRef;
  compatibleTools: ToolId[];
  isInstalled: boolean;
  installedVersion?: string;
};

function refsEqual(a: MarketplaceRef | null, b: MarketplaceRef): boolean {
  return a?.sourceId === b.sourceId && a?.ref === b.ref;
}

/** Extract last path segment as folder display name */
function folderName(p: string): string {
  const segments = p.replace(/[\\/]+$/, '').split(/[\\/]/);
  return segments[segments.length - 1] || p;
}

/** Build a human-readable label for a saved target */
function targetLabel(
  target: BrowseInstallTarget,
  tools: { toolId: string; instanceId: string }[],
): string {
  const tool = tools.find((t) => t.instanceId === target.instanceId);
  const meta = tool ? TOOL_META[tool.toolId as ToolId] : undefined;
  const toolName = meta?.label ?? target.instanceId;
  if (target.scope === 'user') return `${toolName} (user)`;
  const projectPath = target.scope.replace(/^project:/, '');
  return `${folderName(projectPath)} (${toolName})`;
}

export function InstallButton({
  ref_,
  compatibleTools,
  isInstalled,
  installedVersion,
}: InstallButtonProps) {
  const installingRef = useBrowseStore((s) => s.installingRef);
  const lastInstalledRef = useBrowseStore((s) => s.lastInstalledRef);
  const installError = useBrowseStore((s) => s.installError);
  const installAction = useBrowseStore((s) => s.install);
  const clearInstallError = useBrowseStore((s) => s.clearInstallError);
  const tools = useToolStore((s) => s.tools);

  const [showDropdown, setShowDropdown] = useState(false);
  const [projectFolders, setProjectFolders] = useState<ProjectFolder[]>([]);
  const [savedTarget, setSavedTarget] = useState<BrowseInstallTarget | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const isInstalling = refsEqual(installingRef, ref_);
  const justInstalled = refsEqual(lastInstalledRef, ref_);
  const hasError = installError !== null && refsEqual(lastInstalledRef, ref_);

  // Find detected tools that are compatible (memoized for stable reference)
  const detectedCompatible = useMemo(
    () => tools.filter((t) => t.detected && compatibleTools.includes(t.toolId)),
    [tools, compatibleTools],
  );

  // Load saved target from preferences on mount
  useEffect(() => {
    window.aiplughub.preferences
      .get()
      .then((prefs) => {
        if (prefs.browseInstallTarget) {
          setSavedTarget(prefs.browseInstallTarget);
        }
        setPrefsLoaded(true);
      })
      .catch(() => setPrefsLoaded(true));
  }, []);

  // Auto-select first compatible tool if no saved target or saved target is incompatible
  const effectiveTarget = useMemo((): BrowseInstallTarget | null => {
    if (savedTarget) {
      const isCompatible = detectedCompatible.some((t) => t.instanceId === savedTarget.instanceId);
      if (isCompatible) {
        // Validate project-scope target: ensure the path is still registered
        if (savedTarget.scope.startsWith('project:')) {
          const projectPath = savedTarget.scope.replace(/^project:/, '');
          // projectFolders is empty until dropdown opens — trust the saved target
          // unless we have loaded folders and the path is missing
          if (projectFolders.length > 0 && !projectFolders.some((f) => f.path === projectPath)) {
            // Saved project folder no longer registered — fall through to default
          } else {
            return savedTarget;
          }
        } else {
          return savedTarget;
        }
      }
    }
    // Fallback: first compatible tool, user scope
    if (detectedCompatible.length > 0) {
      return { instanceId: detectedCompatible[0].instanceId, scope: 'user' };
    }
    return null;
  }, [savedTarget, detectedCompatible, projectFolders]);

  // Load project folders when dropdown opens
  useEffect(() => {
    if (!showDropdown) return;
    window.aiplughub.projects
      .list()
      .then(setProjectFolders)
      .catch(() => {});
  }, [showDropdown]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = triggerRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inTrigger && !inDropdown) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  const selectTarget = useCallback(async (instanceId: string, scope: string) => {
    const target: BrowseInstallTarget = { instanceId, scope };
    setSavedTarget(target);
    setShowDropdown(false);
    try {
      await window.aiplughub.preferences.set({ browseInstallTarget: target });
    } catch {
      // best-effort persist
    }
  }, []);

  const handleInstall = useCallback(() => {
    if (!effectiveTarget) return;
    clearInstallError();
    installAction(ref_, effectiveTarget);
  }, [ref_, effectiveTarget, installAction, clearInstallError]);

  // Retry uses handleInstall directly (which already clears errors)
  const handleRetry = handleInstall;

  if (isInstalled) {
    return (
      <Button variant="outline" size="sm" disabled>
        Installed{installedVersion ? ` (v${installedVersion})` : ''}
      </Button>
    );
  }

  if (isInstalling) {
    return (
      <Button size="sm" disabled className="bg-accent-olive text-white">
        Installing...
      </Button>
    );
  }

  if (justInstalled && !hasError) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="text-accent-olive border-accent-olive hover:bg-accent-olive/10"
        onClick={() => useUiStore.getState().setActiveTab('my-setup')}
      >
        Installed {'\u2713'} — View in My Setup
      </Button>
    );
  }

  if (hasError) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          size="sm"
          className="bg-accent-destructive text-white hover:bg-accent-destructive/90"
          onClick={handleRetry}
          title={installError ?? undefined}
        >
          Failed — Retry
        </Button>
        <p className="text-xs text-accent-destructive max-w-[280px] text-right leading-tight select-all">
          {installError}
        </p>
      </div>
    );
  }

  if (detectedCompatible.length === 0) {
    return (
      <Button variant="outline" size="sm" disabled>
        No compatible tools
      </Button>
    );
  }

  if (!prefsLoaded) {
    return (
      <Button size="sm" disabled className="bg-accent-olive/60 text-white">
        Install
      </Button>
    );
  }

  const currentLabel = effectiveTarget ? targetLabel(effectiveTarget, tools) : 'Select location';

  // Simple button when only one compatible tool (no need for location picker)
  const singleTarget = detectedCompatible.length <= 1;

  if (singleTarget) {
    return (
      <Button
        size="sm"
        className="bg-accent-olive text-white hover:bg-accent-olive/90"
        onClick={handleInstall}
        disabled={!effectiveTarget}
      >
        Install
      </Button>
    );
  }

  return (
    <div className="relative inline-flex items-stretch" ref={triggerRef}>
      {/* Install button with sub-text */}
      <Button
        size="sm"
        className={cn(
          'bg-accent-olive text-white hover:bg-accent-olive/90',
          'rounded-r-none border-r border-white/20',
          'flex flex-col items-center py-1 px-3 h-auto min-h-[36px]',
        )}
        onClick={handleInstall}
        disabled={!effectiveTarget}
      >
        <span className="text-sm leading-tight">Install</span>
        <span className="text-[10px] leading-tight opacity-80 font-normal">{currentLabel}</span>
      </Button>

      {/* Location selector dropdown trigger */}
      <button
        type="button"
        className={cn(
          'px-1.5 rounded-r-lg',
          'bg-accent-olive text-white hover:bg-accent-olive/80 transition-colors',
          'flex items-center justify-center',
        )}
        onClick={() => {
          if (!showDropdown && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
          }
          setShowDropdown(!showDropdown);
        }}
        aria-label="Change install location"
        aria-expanded={showDropdown}
        title="Change install location"
      >
        <span className="text-xs">{'\u25BE'}</span>
      </button>

      {/* Location dropdown */}
      {showDropdown && dropdownPos && (
        <div
          ref={dropdownRef}
          className={cn(
            'fixed z-50 min-w-[220px]',
            'bg-sand-paper border border-sand-border rounded-lg shadow-lg py-1',
            'animate-bounce-in',
          )}
          style={{ top: dropdownPos.top, right: dropdownPos.right }}
          role="menu"
        >
          <div className="px-3 py-1 text-[10px] text-sand-muted uppercase tracking-wider">
            Install location
          </div>

          {/* User scope — one option per compatible tool */}
          {detectedCompatible.map((tool) => {
            const meta = TOOL_META[tool.toolId];
            const isSelected =
              effectiveTarget?.instanceId === tool.instanceId && effectiveTarget?.scope === 'user';
            return (
              <button
                key={tool.instanceId}
                type="button"
                role="menuitem"
                className={cn(
                  'w-full px-3 py-2 text-left text-sm hover:bg-sand-surface/60 transition-colors flex items-center gap-2',
                  isSelected && 'bg-accent-olive/10 font-medium',
                )}
                onClick={() => selectTarget(tool.instanceId, 'user')}
              >
                <span aria-hidden="true">{meta.emoji}</span>
                {meta.label}
                <span className="text-xs text-sand-muted ml-auto">user</span>
                {isSelected && <span className="text-accent-olive text-xs">{'\u2713'}</span>}
              </button>
            );
          })}

          {/* Project scope — one option per project folder per compatible tool */}
          {projectFolders.length > 0 && (
            <>
              <div className="border-t border-sand-border/60 my-1" />
              <div className="px-3 py-1 text-[10px] text-sand-muted uppercase tracking-wider">
                Project folders
              </div>
              {projectFolders.map((folder) =>
                detectedCompatible.map((tool) => {
                  const meta = TOOL_META[tool.toolId];
                  const scope = `project:${folder.path}`;
                  const isSelected =
                    effectiveTarget?.instanceId === tool.instanceId &&
                    effectiveTarget?.scope === scope;
                  return (
                    <button
                      key={`${tool.instanceId}:${folder.path}`}
                      type="button"
                      role="menuitem"
                      className={cn(
                        'w-full px-3 py-2 text-left text-sm hover:bg-sand-surface/60 transition-colors flex items-center gap-2',
                        isSelected && 'bg-accent-olive/10 font-medium',
                      )}
                      onClick={() => selectTarget(tool.instanceId, scope)}
                    >
                      <span aria-hidden="true">{'\u{1F4C1}'}</span>
                      {folderName(folder.path)}
                      <span className="text-xs text-sand-muted ml-auto">{meta.label}</span>
                      {isSelected && <span className="text-accent-olive text-xs">{'\u2713'}</span>}
                    </button>
                  );
                }),
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
