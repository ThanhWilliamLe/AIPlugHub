/**
 * Suggested marketplace sources picker for the Getting Started section (UX-12).
 * Shows checkboxes for curated sources; already-added sources are greyed out.
 * Source: 5A-specs/getting-started-spec.md §UX-12
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  SuggestedSource,
  MarketplaceSourceConfig,
  SuggestedSourcesManifest,
} from '@shared/types';
import { normalizeSourceUrl } from '@shared/utils';
import { TOOL_META } from '@shared/constants';
import { cn } from '@renderer/lib/utils';

type SourcePickerProps = {
  manifest: SuggestedSourcesManifest;
  onSourcesAdded?: () => void;
};

export function SourcePicker({ manifest, onSourcesAdded }: SourcePickerProps) {
  const [userSources, setUserSources] = useState<MarketplaceSourceConfig[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggested = manifest.sources;

  // Load user's current sources to determine "already added" state
  useEffect(() => {
    window.aiplughub.settings
      .getSources()
      .then(setUserSources)
      .catch(() => {});
  }, []);

  const isAlreadyAdded = useCallback(
    (source: SuggestedSource) => {
      const normalizedSuggested = normalizeSourceUrl(source.url);
      return userSources.some((us) => normalizeSourceUrl(us.url) === normalizedSuggested);
    },
    [userSources],
  );

  // Initialize default-checked sources
  useEffect(() => {
    const defaults = new Set<string>();
    for (const source of suggested) {
      if (source.defaultChecked && !isAlreadyAdded(source)) {
        defaults.add(source.sourceId);
      }
    }
    setChecked(defaults);
  }, [suggested, isAlreadyAdded]);

  const toggleCheck = (sourceId: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  };

  const handleAddSources = async () => {
    const toAdd = suggested.filter((s) => checked.has(s.sourceId) && !isAlreadyAdded(s));
    if (toAdd.length === 0) return;

    setAdding(true);
    setError(null);
    try {
      for (const source of toAdd) {
        await window.aiplughub.settings.addSource({
          sourceType: source.sourceType,
          url: source.url,
          displayName: source.displayName,
        });
      }
      // Refresh user sources to update "already added" state
      const updated = await window.aiplughub.settings.getSources();
      setUserSources(updated);
      setChecked(new Set());
      onSourcesAdded?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const allAdded = suggested.every(isAlreadyAdded);
  const addableCheckedCount = suggested.filter(
    (s) => checked.has(s.sourceId) && !isAlreadyAdded(s),
  ).length;

  return (
    <div>
      <h4 className="text-sm font-medium text-sand-text mb-1">Add plugin sources</h4>
      <p className="text-xs text-sand-secondary mb-2">
        Sources are plugin catalogs — each one has different plugins to browse. Add more to see more
        plugins.
      </p>

      {allAdded ? (
        <p className="text-xs text-sand-secondary">All suggested sources have been added.</p>
      ) : (
        <>
          <div className="space-y-2">
            {suggested.map((source) => {
              const added = isAlreadyAdded(source);
              return (
                <label
                  key={source.sourceId}
                  className={cn(
                    'flex items-start gap-2 p-2 rounded-md border border-sand-border/50',
                    added ? 'opacity-60 cursor-default' : 'hover:bg-sand-surface/30 cursor-pointer',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={added || checked.has(source.sourceId)}
                    disabled={added}
                    onChange={() => toggleCheck(source.sourceId)}
                    className="mt-0.5 accent-accent-olive"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-sand-text">
                        {source.displayName}
                      </span>
                      {added && (
                        <span className="text-xs text-sand-muted bg-sand-surface px-1.5 py-0.5 rounded">
                          Already added
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-sand-secondary mt-0.5">{source.description}</p>
                    <p className="text-[10px] text-sand-muted/60 mt-0.5 font-mono truncate">
                      {source.url}
                    </p>
                    <div className="flex gap-2 mt-1">
                      {source.tools.map((toolId) => (
                        <span
                          key={toolId}
                          className="inline-flex items-center gap-0.5 text-xs text-sand-muted"
                        >
                          {TOOL_META[toolId]?.emoji} {TOOL_META[toolId]?.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

          <button
            type="button"
            disabled={addableCheckedCount === 0 || adding}
            onClick={handleAddSources}
            className={cn(
              'mt-3 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              'bg-accent-olive text-white hover:bg-accent-olive/90',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-olive/40',
            )}
          >
            {adding ? 'Adding...' : `Add selected source${addableCheckedCount !== 1 ? 's' : ''}`}
          </button>
        </>
      )}
    </div>
  );
}
