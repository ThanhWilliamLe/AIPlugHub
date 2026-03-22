/**
 * Marketplace Sources section in Settings.
 * List, add, remove marketplace sources.
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@renderer/components/ui/button';
import type { MarketplaceSourceConfig } from '@shared/types';

export function MarketplaceSourcesSection() {
  const [sources, setSources] = useState<MarketplaceSourceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadSources = useCallback(async () => {
    try {
      const result = await window.aiplughub.settings.getSources();
      setSources(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const handleAdd = async () => {
    if (!newUrl.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await window.aiplughub.settings.addSource({
        sourceType: 'url-index',
        url: newUrl.trim(),
        displayName: newName.trim() || undefined,
      });
      setNewUrl('');
      setNewName('');
      setAdding(false);
      await loadSources();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (sourceId: string) => {
    setError(null);
    try {
      await window.aiplughub.settings.removeSource(sourceId);
      await loadSources();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-sand-text uppercase tracking-wider mb-3">
        Marketplace Sources
      </h2>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-accent-destructive/10 text-accent-destructive text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-sand-secondary animate-pulse">Loading sources...</p>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => (
            <div
              key={source.sourceId}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-sand-border bg-sand-surface/30"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sand-text">
                  {source.displayName || source.url}
                </p>
                {source.displayName && (
                  <p className="text-xs text-sand-secondary font-mono truncate">{source.url}</p>
                )}
                <p className="text-xs text-sand-muted mt-0.5">
                  {source.sourceType === 'url-index' ? 'URL Index' : source.sourceType === 'git' ? 'Git Repository' : source.sourceType}
                  {source.sourceId.startsWith('native-') ? (
                    <>
                      {' '}
                      <span className="relative group cursor-help text-xs text-sand-muted">
                        {'\uD83E\uDD16'} from Claude Code
                        <span className="absolute hidden group-hover:block bottom-full left-0 mb-1 px-2 py-1 bg-sand-text text-sand-paper text-xs rounded whitespace-nowrap z-50">
                          Managed by Claude Code. Use /plugin to modify.
                        </span>
                      </span>
                    </>
                  ) : source.isBuiltIn ? ' (built-in)' : ''}
                </p>
              </div>
              {!source.isBuiltIn && !source.sourceId.startsWith('native-') && (
                <button
                  type="button"
                  onClick={() => handleRemove(source.sourceId)}
                  className="text-xs text-sand-muted hover:text-accent-destructive"
                  aria-label={`Remove ${source.displayName || source.url}`}
                >
                  Remove
                </button>
              )}
            </div>
          ))}

          {sources.length === 0 && (
            <p className="text-sm text-sand-muted">No marketplace sources configured.</p>
          )}
        </div>
      )}

      {adding ? (
        <div className="mt-3 p-4 rounded-lg border border-sand-border bg-sand-surface/20 space-y-3">
          <div>
            <label className="block text-xs font-medium text-sand-secondary mb-1">Source URL</label>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com/plugins.json"
              className="w-full px-3 py-2 rounded-lg bg-sand-surface/50 border border-sand-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent-olive/40"
              aria-label="Source URL"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-sand-secondary mb-1">
              Display name (optional)
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="My custom source"
              className="w-full px-3 py-2 rounded-lg bg-sand-surface/50 border border-sand-border text-sm focus:outline-none focus:ring-2 focus:ring-accent-olive/40"
              aria-label="Display name"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-accent-olive text-white hover:bg-accent-olive/90"
              onClick={handleAdd}
              disabled={!newUrl.trim() || submitting}
            >
              Add Source
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            + Add Source
          </Button>
        </div>
      )}
    </section>
  );
}
