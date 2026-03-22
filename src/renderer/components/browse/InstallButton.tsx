/**
 * Install button — dropdown when multi-tool compatible.
 * Source: 5A-specs/browse-tab-spec.md §5 (Install button)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { ToolId, BrowseInstallTarget, MarketplaceRef } from '@shared/types';
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
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isInstalling = refsEqual(installingRef, ref_);
  const justInstalled = refsEqual(lastInstalledRef, ref_);
  const hasError = installError !== null && refsEqual(lastInstalledRef, ref_);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  // Find detected tools that are compatible
  const detectedCompatible = tools.filter((t) => t.detected && compatibleTools.includes(t.toolId));

  const handleInstall = useCallback(
    (toolId: ToolId, instanceId: string) => {
      clearInstallError();
      const target: BrowseInstallTarget = { instanceId, scope: 'user' };
      installAction(ref_, target);
      setShowDropdown(false);
    },
    [ref_, installAction, clearInstallError],
  );

  const handleRetry = useCallback(() => {
    clearInstallError();
    // Re-trigger install with the first compatible tool
    if (detectedCompatible.length > 0) {
      const tool = detectedCompatible[0];
      handleInstall(tool.toolId, tool.instanceId);
    }
  }, [detectedCompatible, handleInstall, clearInstallError]);

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
      <Button variant="destructive" size="sm" onClick={handleRetry}>
        Failed — Retry
      </Button>
    );
  }

  // Single compatible tool: direct install
  if (detectedCompatible.length === 1) {
    const tool = detectedCompatible[0];
    return (
      <Button
        size="sm"
        className="bg-accent-olive text-white hover:bg-accent-olive/90"
        onClick={() => handleInstall(tool.toolId, tool.instanceId)}
      >
        Install
      </Button>
    );
  }

  // Multiple compatible tools: dropdown
  if (detectedCompatible.length > 1) {
    return (
      <div className="relative" ref={dropdownRef}>
        <Button
          size="sm"
          className="bg-accent-olive text-white hover:bg-accent-olive/90"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          Install {'\u25BE'}
        </Button>

        {showDropdown && (
          <div
            className={cn(
              'absolute right-0 top-full mt-1 z-50 min-w-[200px]',
              'bg-sand-paper border border-sand-border rounded-lg shadow-lg py-1',
              'animate-bounce-in',
            )}
          >
            {detectedCompatible.map((tool) => {
              const meta = TOOL_META[tool.toolId];
              return (
                <button
                  key={tool.instanceId}
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-sand-surface/60 transition-colors flex items-center gap-2"
                  onClick={() => handleInstall(tool.toolId, tool.instanceId)}
                >
                  <span aria-hidden="true">{meta.emoji}</span>
                  Install to {meta.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // No compatible tools detected
  return (
    <Button variant="outline" size="sm" disabled>
      No compatible tools
    </Button>
  );
}
