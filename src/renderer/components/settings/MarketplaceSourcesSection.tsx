/**
 * Marketplace Sources section in Settings.
 * List, add, remove marketplace sources.
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@renderer/components/ui/button';
import type { MarketplaceSourceConfig, MarketplaceSourceType } from '@shared/types';
import { normalizeSourceUrl, detectSourceType, SOURCE_TYPE_LABELS } from '@shared/utils';

const SOURCE_TYPE_PLACEHOLDERS: Record<MarketplaceSourceType, string> = {
  'git-marketplace': 'owner/repo or https://github.com/owner/repo',
  'url-index': 'https://example.com/plugins.json',
};

export function MarketplaceSourcesSection() {
  const [sources, setSources] = useState<MarketplaceSourceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<MarketplaceSourceType>('git-marketplace');
  const [typeManuallySet, setTypeManuallySet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<MarketplaceSourceConfig | null>(null);

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

  const handleUrlChange = (url: string) => {
    setNewUrl(url);
    if (!typeManuallySet) {
      const detected = detectSourceType(url);
      if (detected !== null) setNewType(detected);
    }
  };

  const handleTypeChange = (type: MarketplaceSourceType) => {
    setNewType(type);
    setTypeManuallySet(true);
  };

  const handleAdd = async () => {
    if (!newUrl.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const normalizedUrl = normalizeSourceUrl(newUrl);
      await window.aiplughub.settings.addSource({
        sourceType: newType,
        url: normalizedUrl,
        displayName: newName.trim() || undefined,
      });
      setNewUrl('');
      setNewName('');
      setNewType('git-marketplace');
      setTypeManuallySet(false);
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
                  {SOURCE_TYPE_LABELS[source.sourceType] ?? source.sourceType}
                  {source.isBuiltIn ? (
                    <span className="text-xs text-sand-muted">
                      {' \uD83E\uDD16'} from Claude Code
                    </span>
                  ) : (
                    ''
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (source.isBuiltIn) {
                    setConfirmRemove(source);
                  } else {
                    handleRemove(source.sourceId);
                  }
                }}
                className="text-xs text-sand-muted hover:text-accent-destructive shrink-0"
                aria-label={`Remove ${source.displayName || source.url}`}
              >
                Remove
              </button>
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
              type="text"
              value={newUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder={SOURCE_TYPE_PLACEHOLDERS[newType]}
              className="w-full px-3 py-2 rounded-lg bg-sand-surface/50 border border-sand-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent-olive/40"
              aria-label="Source URL"
              autoFocus
            />
            <div className="flex items-center gap-2 mt-1">
              {newUrl.trim() && !typeManuallySet && (
                <span className="text-xs text-accent-olive">
                  {'\u2713'} Detected as {SOURCE_TYPE_LABELS[newType]}
                </span>
              )}
              {newType === 'git-marketplace' && (
                <span className="text-xs text-sand-muted">
                  Accepts: owner/repo, github.com/owner/repo, full URL, or git@ URL
                </span>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-sand-secondary mb-1">
              Source type
            </label>
            <select
              value={newType}
              onChange={(e) => handleTypeChange(e.target.value as MarketplaceSourceType)}
              className="w-full px-3 py-2 rounded-lg bg-sand-surface/50 border border-sand-border text-sm focus:outline-none focus:ring-2 focus:ring-accent-olive/40"
              aria-label="Source type"
            >
              <option value="git-marketplace">{SOURCE_TYPE_LABELS['git-marketplace']}</option>
              <option value="url-index">{SOURCE_TYPE_LABELS['url-index']}</option>
            </select>
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

      {/* Confirmation dialog for removing built-in/native sources */}
      {confirmRemove && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/20"
            onClick={() => setConfirmRemove(null)}
            aria-hidden="true"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="bg-sand-paper rounded-xl shadow-xl border border-sand-border w-full max-w-md p-6 animate-bounce-in"
              role="dialog"
              aria-modal="true"
              aria-label="Remove marketplace source"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-sand-text mb-3">
                Remove marketplace source?
              </h3>
              <div className="space-y-2 text-sm text-sand-secondary mb-4">
                <p>
                  You are about to remove{' '}
                  <strong className="text-sand-text">
                    {confirmRemove.displayName || confirmRemove.url}
                  </strong>
                </p>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1">
                  <p className="font-medium">This will:</p>
                  <ul className="list-disc ml-4 space-y-0.5">
                    <li>Remove all plugins from this source in the Browse tab</li>
                    <li>
                      {confirmRemove.isBuiltIn
                        ? 'Edit Claude Code\'s marketplace config to remove this marketplace'
                        : 'Remove this source from your settings'}
                    </li>
                  </ul>
                  <p className="mt-1">
                    Plugins already installed from this source will keep working.
                    You can re-add this source later.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmRemove(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-accent-destructive text-white hover:bg-accent-destructive/90"
                  onClick={async () => {
                    const sourceId = confirmRemove.sourceId;
                    setConfirmRemove(null);
                    await handleRemove(sourceId);
                  }}
                >
                  Remove Source
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
