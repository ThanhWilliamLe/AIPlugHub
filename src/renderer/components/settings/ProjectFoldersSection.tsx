/**
 * Project Folders section in Settings — manage registered project folders for scanning.
 * USR-03: Project-scope scanning.
 */

import { useState, useEffect, useCallback } from 'react';
import { useToolStore } from '@renderer/stores/tool-store';
import { MAX_PROJECT_FOLDERS } from '@shared/constants';
import { Button } from '@renderer/components/ui/button';
import type { ProjectFolder } from '@shared/types';

export function ProjectFoldersSection() {
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [folderStats, setFolderStats] = useState<Map<string, number>>(new Map());
  const [missingPaths, setMissingPaths] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const components = useToolStore((s) => s.components);
  const scanAll = useToolStore((s) => s.scanAll);

  // Load folders on mount and detect missing paths
  useEffect(() => {
    window.aiplughub.projects
      .list()
      .then((loadedFolders) => {
        setFolders(loadedFolders);
        // Populate missing paths from the exists flag set by the main process
        const missing = new Set<string>();
        for (const folder of loadedFolders) {
          if (folder.exists === false) {
            missing.add(folder.path);
          }
        }
        setMissingPaths(missing);
      })
      .catch(() => {});
  }, []);

  // Compute component counts per project folder from toolStore
  useEffect(() => {
    const stats = new Map<string, number>();
    for (const c of components) {
      if (c.id.scope === 'project' && c.projectPath) {
        stats.set(c.projectPath, (stats.get(c.projectPath) ?? 0) + 1);
      }
    }
    setFolderStats(stats);
  }, [components]);

  const handleAdd = useCallback(async () => {
    setError(null);
    setAdding(true);
    try {
      const path = await window.aiplughub.projects.openFolderDialog();
      if (!path) {
        setAdding(false);
        return;
      }

      const folder = await window.aiplughub.projects.add(path);
      setFolders((prev) => [...prev, folder]);

      // Scan the new project folder and trigger a full rescan to update components
      await scanAll();
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? 'Failed to add folder';
      setError(message);
    } finally {
      setAdding(false);
    }
  }, [scanAll]);

  const handleRemove = useCallback(
    async (folderPath: string) => {
      setError(null);
      setRemoving(folderPath);
      try {
        await window.aiplughub.projects.remove(folderPath);
        setFolders((prev) => prev.filter((f) => f.path !== folderPath));
        setMissingPaths((prev) => {
          const next = new Set(prev);
          next.delete(folderPath);
          return next;
        });

        // Rescan to remove components from the removed project
        await scanAll();
      } catch (err: unknown) {
        const message = (err as { message?: string })?.message ?? 'Failed to remove folder';
        setError(message);
      } finally {
        setRemoving(null);
      }
    },
    [scanAll],
  );

  const isAtLimit = folders.length >= MAX_PROJECT_FOLDERS;

  return (
    <section>
      <h2 className="text-sm font-semibold text-sand-text uppercase tracking-wider mb-1">
        Project Folders
      </h2>
      <p className="text-xs text-sand-secondary mb-3">
        Scan project-specific components from your working directories.
      </p>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded mb-3">{error}</div>
      )}

      {folders.length === 0 ? (
        <div className="text-sm text-sand-muted px-4 py-6 text-center border border-dashed border-sand-border rounded-lg">
          No project folders registered.
          <br />
          Add a working directory to see its project-specific components.
        </div>
      ) : (
        <div className="space-y-2">
          {folders.map((folder) => {
            const count = folderStats.get(folder.path) ?? 0;
            const isMissing = missingPaths.has(folder.path);
            const isRemoving = removing === folder.path;

            return (
              <div
                key={folder.path}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border border-sand-border bg-sand-surface/30"
              >
                <span className="text-base" aria-hidden="true">
                  {'\u{1F4C1}'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sand-text truncate">{folder.name}</span>
                    {isMissing && (
                      <span className="text-xs text-amber-600" title="Folder not found on disk">
                        {'\u26A0'} Missing
                      </span>
                    )}
                  </div>
                  <p
                    className="text-xs text-sand-secondary font-mono truncate mt-0.5"
                    title={folder.path}
                  >
                    {folder.path}
                  </p>
                  <p className="text-xs text-sand-muted mt-0.5">
                    {count === 0
                      ? 'No components found'
                      : `${count} component${count === 1 ? '' : 's'} found`}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-sand-muted hover:text-red-500 p-1 transition-colors"
                  onClick={() => handleRemove(folder.path)}
                  disabled={isRemoving}
                  aria-label={`Remove ${folder.name}`}
                  title={`Remove ${folder.name} — won't delete any files`}
                >
                  {'\u2715'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={adding || isAtLimit}
          title={isAtLimit ? `Maximum ${MAX_PROJECT_FOLDERS} project folders` : undefined}
        >
          {adding ? 'Adding...' : '+ Add project folder'}
        </Button>
        {isAtLimit && (
          <span className="text-xs text-sand-muted ml-2">
            Maximum {MAX_PROJECT_FOLDERS} folders reached
          </span>
        )}
      </div>
    </section>
  );
}
