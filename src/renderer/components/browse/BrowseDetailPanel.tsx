/**
 * Browse tab detail panel — slide-out panel showing full plugin details + install.
 * Reuses the same slide-out pattern from My Setup.
 * Source: 5A-specs/browse-tab-spec.md §5
 */

import { useEffect, useCallback } from 'react';
import { useBrowseStore } from '@renderer/stores/browse-store';
import { useToolStore } from '@renderer/stores/tool-store';
import { TypeBadge } from '@renderer/components/shared/TypeBadge';
import { InstallButton } from './InstallButton';
import { cn } from '@renderer/lib/utils';
import type { ComponentType } from '@shared/types';
import { TOOL_META, ENABLED_TOOL_SET } from '@shared/constants';
import { isEntryInstalled, findInstalledVersion } from '@renderer/lib/install-match';

export function BrowseDetailPanel() {
  const selectedRef = useBrowseStore((s) => s.selectedRef);
  const detail = useBrowseStore((s) => s.detail);
  const detailLoading = useBrowseStore((s) => s.detailLoading);
  const detailError = useBrowseStore((s) => s.detailError);
  const closeDetail = useBrowseStore((s) => s.closeDetail);
  const entries = useBrowseStore((s) => s.entries);
  const installedComponents = useToolStore((s) => s.components);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetail();
    },
    [closeDetail],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!selectedRef) return null;

  // Get entry-level data (always available, even if detail fetch fails)
  const entry = entries.find(
    (e) => e.sourceId === selectedRef.sourceId && e.ref === selectedRef.ref,
  );

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30" onClick={closeDetail} aria-hidden="true" />

      {/* Panel */}
      <aside
        className={cn(
          'fixed top-0 right-0 z-40 h-full w-[40%] min-w-[320px] max-w-[560px]',
          'bg-sand-paper border-l border-sand-border shadow-lg',
          'animate-slide-in-right overflow-y-auto',
        )}
        role="dialog"
        aria-modal="true"
        aria-label={`Details for ${entry?.displayName ?? entry?.name ?? selectedRef.ref}`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-sand-paper border-b border-sand-border px-6 py-4 flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="font-mono text-lg font-semibold text-sand-text truncate">
              {entry?.displayName ?? entry?.name ?? selectedRef.ref}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              {entry?.version && <span className="text-xs text-sand-muted">v{entry.version}</span>}
              {entry?.author && (
                <span className="text-xs text-sand-secondary">
                  by{' '}
                  {typeof entry.author === 'string'
                    ? entry.author
                    : ((entry.author as { name?: string }).name ?? 'Unknown')}
                </span>
              )}
              {entry?.starCount !== undefined && (
                <span className="text-xs text-sand-muted">
                  ★ {entry.starCount.toLocaleString()} stars
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={closeDetail}
            className="text-sand-muted hover:text-sand-text transition-colors p-1 -mr-1"
            aria-label="Close panel"
          >
            {'\u2715'}
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Install button */}
          {entry && (
            <InstallButton
              ref_={selectedRef}
              compatibleTools={entry.tools.filter((id) => ENABLED_TOOL_SET.has(id))}
              isInstalled={isEntryInstalled(installedComponents, entry)}
              installedVersion={findInstalledVersion(installedComponents, entry)}
            />
          )}

          {/* Loading state */}
          {detailLoading && (
            <div className="text-center py-8">
              <p className="text-sm text-sand-secondary animate-pulse">Loading details...</p>
            </div>
          )}

          {/* Error state */}
          {detailError && (
            <div className="rounded-lg bg-accent-destructive/10 p-3">
              <p className="text-sm text-accent-destructive">Couldn&apos;t load plugin details.</p>
              <p className="text-xs text-accent-destructive/80 mt-1 select-all">{detailError}</p>
              <button
                type="button"
                className="text-xs text-accent-destructive underline mt-2"
                onClick={() => useBrowseStore.getState().openDetail(selectedRef)}
              >
                Retry
              </button>
            </div>
          )}

          {/* Description */}
          {(detail?.entry.description ?? entry?.description) && (
            <section>
              <h3 className="text-xs font-medium text-sand-secondary uppercase tracking-wider mb-2">
                Description
              </h3>
              <p className="text-sm text-sand-text leading-relaxed">
                {detail?.longDescription ?? detail?.entry.description ?? entry?.description}
              </p>
            </section>
          )}

          {/* Components */}
          {detail?.components && detail.components.length > 0 && (
            <section>
              <h3 className="text-xs font-medium text-sand-secondary uppercase tracking-wider mb-2">
                What&apos;s included
              </h3>
              <div className="space-y-1.5">
                {detail.components.map((comp, i) => (
                  <div key={`${comp.type}-${comp.name}-${i}`} className="flex items-center gap-2">
                    <TypeBadge type={comp.type} />
                    <span className="font-mono text-sm text-sand-text">{comp.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Component counts (from entry when detail not loaded) */}
          {!detail && entry?.componentCounts && (
            <section>
              <h3 className="text-xs font-medium text-sand-secondary uppercase tracking-wider mb-2">
                What&apos;s included
              </h3>
              <div className="space-y-1.5">
                {Object.entries(entry.componentCounts)
                  .filter(([, count]) => (count ?? 0) > 0)
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2">
                      <TypeBadge type={type as ComponentType} />
                      <span className="text-sm text-sand-muted">
                        {count ?? 0} {count === 1 ? 'plugin' : 'plugins'}
                      </span>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* Compatible tools */}
          {entry && entry.tools.filter((id) => ENABLED_TOOL_SET.has(id)).length > 0 && (
            <section>
              <h3 className="text-xs font-medium text-sand-secondary uppercase tracking-wider mb-2">
                Compatible with
              </h3>
              <div className="flex flex-wrap gap-2">
                {entry.tools.filter((id) => ENABLED_TOOL_SET.has(id)).map((toolId) => {
                  const meta = TOOL_META[toolId];
                  if (!meta) return null;
                  return (
                    <span
                      key={toolId}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sand-surface text-xs text-sand-text"
                    >
                      <span aria-hidden="true">{meta.emoji}</span>
                      {meta.label}
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {/* Metadata */}
          {detail && (
            <section className="pt-2 border-t border-sand-border">
              <dl className="space-y-2 text-sm">
                {detail.repository && (
                  <div className="flex justify-between items-start gap-4">
                    <dt className="text-sand-secondary shrink-0">Source</dt>
                    <dd className="font-mono text-xs truncate text-right">
                      <button
                        type="button"
                        className="text-accent-olive hover:underline cursor-pointer"
                        title={`Open ${detail.repository}`}
                        onClick={() => window.aiplughub.system.openUrl(detail.repository!)}
                      >
                        {detail.repository}
                      </button>
                    </dd>
                  </div>
                )}
                {detail.license && (
                  <div className="flex justify-between">
                    <dt className="text-sand-secondary">License</dt>
                    <dd className="text-sand-text">{detail.license}</dd>
                  </div>
                )}
                {entry?.lastUpdated && (
                  <div className="flex justify-between">
                    <dt className="text-sand-secondary">Updated</dt>
                    <dd className="text-sand-text">
                      {new Date(entry.lastUpdated).toLocaleDateString()}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}
