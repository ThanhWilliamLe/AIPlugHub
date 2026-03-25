/**
 * IPC Handlers — register ipcMain.handle() for each channel.
 * Each handler delegates to main-process modules and returns IpcResult<T>.
 * Source: 6C-build-plan/m4-session-brief.md §1
 */

import type { IpcMain, BrowserWindow, WebContents, Dialog, Shell } from 'electron';
import type { AdapterRegistry } from '../adapters/adapter-registry';
import type { DataStore } from '../data-store';
import type { SecretStore } from '../secret-store';
import type { MarketplaceClient } from '../marketplace/marketplace-client';
import { fetchSuggestedSources } from '../marketplace';
import type { Logger } from '../logger';
import type { BackupManager } from '../backup';
import { assertWriteAllowed } from '../write-guard';
import type {
  IpcResult,
  IpcError,
  Component,
  ComponentId,
  ToolDetectionResult,
  PortableComponent,
  InstallTarget,
  ScanProgressEvent,
  Bundle,
  ExportOptions,
  ConflictManifest,
  ImportResult,
  ImportProgressEvent,
  ConflictResolution,
  MarketplaceEntry,
  MarketplaceDetail,
  MarketplaceRef,
  MarketplaceSourceConfig,
  NewSourceConfig,
  BrowseInstallTarget,
  UserPreferences,
  ProjectFolder,
  NativePlugin,
  UpdateCheckResult,
  BackupSummary,
  BackupCreateOptions,
  RestoreResult,
  SuggestedSourcesManifest,
  BundleTarget,
  ToolId,
} from '@shared/types';
import { AppError } from '@shared/types';
import { componentIdKey, normalizeSourceUrl } from '@shared/utils';
import { MAX_PROJECT_FOLDERS } from '@shared/constants';
import { withAdapterLock } from './operation-lock';
import { serializeBundle, deserializeBundle, detectConflicts, buildBundle } from '../bundle';

// ─── Error Wrapping ─────────────────────────────────────────────────

function toIpcError(err: unknown): IpcError {
  if (err instanceof AppError) {
    return {
      code: err.code,
      message: err.message,
      details: err.details,
      recoverable: err.recoverable,
    };
  }
  // Generic fallback for unexpected errors — not ADAPTER_UNSUPPORTED,
  // which has a specific semantic meaning ("operation not supported for this tool/type").
  return {
    code: 'INTERNAL_ERROR',
    message: err instanceof Error ? err.message : String(err),
    recoverable: false,
  };
}

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail<T>(err: unknown): IpcResult<T> {
  return { ok: false, error: toIpcError(err) };
}

// ─── File Dialog Options Type ───────────────────────────────────────

export type FileDialogOptions = {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
};

// ─── Drag-and-Drop Validation ───────────────────────────────────────

const ALLOWED_DROP_EXTENSIONS = ['.aibundle', '.json'];

function isAllowedDropFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return ALLOWED_DROP_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// ─── Handler Dependencies ───────────────────────────────────────────

export type HandlerDeps = {
  ipcMain: IpcMain;
  registry: AdapterRegistry;
  dataStore: DataStore;
  secretStore: SecretStore;
  marketplace: MarketplaceClient;
  backupManager: BackupManager;
  logger: Logger;
  dialog: Dialog;
  shell: Shell;
  getMainWindow: () => BrowserWindow | null;
  getAppVersion: () => string;
};

// ─── Register All IPC Handlers ──────────────────────────────────────

export function registerIpcHandlers(deps: HandlerDeps): void {
  const {
    ipcMain,
    registry,
    dataStore,
    secretStore,
    backupManager,
    logger,
    dialog,
    shell,
    getMainWindow,
  } = deps;
  const MODULE = 'IPC';

  // --- tools:detect ---
  ipcMain.handle('tools:detect', async (): Promise<IpcResult<ToolDetectionResult[]>> => {
    try {
      logger.info(MODULE, 'tools:detect');
      const results = await registry.detectAll();
      return ok(results);
    } catch (err) {
      logger.error(MODULE, 'tools:detect failed', err as Error);
      return fail(err);
    }
  });

  // --- tools:scan ---
  ipcMain.handle(
    'tools:scan',
    async (_event, instanceId: string): Promise<IpcResult<Component[]>> => {
      try {
        logger.info(MODULE, `tools:scan ${instanceId}`);
        const adapter = registry.getAdapter(instanceId);
        const components = await adapter.scan();
        return ok(components);
      } catch (err) {
        logger.error(MODULE, `tools:scan failed for ${instanceId}`, err as Error);
        return fail(err);
      }
    },
  );

  // --- tools:scanAll ---
  ipcMain.handle('tools:scanAll', async (event): Promise<IpcResult<Component[]>> => {
    try {
      logger.info(MODULE, 'tools:scanAll');
      const allComponents: Component[] = [];
      const sender: WebContents = event.sender;

      // Helper: send progress only if the window hasn't been destroyed mid-scan
      function sendProgress(data: ScanProgressEvent): void {
        if (!sender.isDestroyed()) sender.send('progress:scan', data);
      }

      for (const adapter of registry.getAllAdapters()) {
        const progressEvent: ScanProgressEvent = {
          instanceId: adapter.instanceId,
          toolId: adapter.toolId,
          status: 'scanning',
        };
        sendProgress(progressEvent);

        try {
          const components = await adapter.scan();
          allComponents.push(...components);

          sendProgress({
            ...progressEvent,
            status: 'complete',
            componentCount: components.length,
          });
        } catch (err) {
          sendProgress({
            ...progressEvent,
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
          // Continue scanning other adapters
        }
      }

      // Scan registered project folders (USR-03)
      try {
        const prefs = await dataStore.getPreferences();
        const projectFolders = prefs.projectFolders ?? [];

        for (const folder of projectFolders) {
          for (const adapter of registry.getAllAdapters()) {
            if (adapter.scanProject) {
              try {
                const projectComponents = await adapter.scanProject(folder.path);
                allComponents.push(...projectComponents);
              } catch (err) {
                logger.warn(
                  MODULE,
                  `Project scan failed for ${adapter.toolId}: ${folder.path}`,
                  err,
                );
              }
            }
          }
        }
      } catch (err) {
        logger.warn(MODULE, 'Failed to scan project folders', err);
      }

      // Enrich components with metadata from DataStore (installedFrom for update tracking)
      try {
        const allMeta = await dataStore.getComponents();
        const metaMap = new Map(allMeta.map((m) => [componentIdKey(m.id), m]));
        for (const comp of allComponents) {
          const meta = metaMap.get(componentIdKey(comp.id));
          if (meta?.installedFrom) {
            comp.installedFrom = meta.installedFrom;
          }
        }
      } catch (err) {
        logger.warn(MODULE, 'Failed to enrich components with metadata', err);
      }

      return ok(allComponents);
    } catch (err) {
      logger.error(MODULE, 'tools:scanAll failed', err as Error);
      return fail(err);
    }
  });

  // --- components:install ---
  ipcMain.handle(
    'components:install',
    async (
      _event,
      portable: PortableComponent,
      target: InstallTarget,
    ): Promise<IpcResult<Component>> => {
      try {
        logger.info(MODULE, `components:install ${portable.name} → ${target.instanceId}`);
        const result = await withAdapterLock(target.instanceId, async () => {
          const adapter = registry.getAdapter(target.instanceId);
          const component = await adapter.install(portable, target);
          await dataStore.setComponentMeta(component.id, {
            tracking: 'managed',
            displayName: portable.description,
          });
          return component;
        });
        return ok(result);
      } catch (err) {
        logger.error(MODULE, `components:install failed`, err as Error);
        return fail(err);
      }
    },
  );

  // --- components:uninstall ---
  ipcMain.handle(
    'components:uninstall',
    async (_event, id: ComponentId): Promise<IpcResult<void>> => {
      try {
        logger.info(MODULE, `components:uninstall ${id.name}`);
        // Determine instanceId from DataStore tool instances or use tool+scope
        const instances = await dataStore.getToolInstances();
        const instance = instances.find((t) => t.toolId === id.tool);
        if (!instance) {
          throw new AppError('TOOL_NOT_FOUND', `No tool instance found for ${id.tool}`, true);
        }

        await withAdapterLock(instance.instanceId, async () => {
          const adapter = registry.getAdapter(instance.instanceId);
          await adapter.uninstall(id);
          await dataStore.removeComponentMeta(id);
        });
        return ok(undefined);
      } catch (err) {
        logger.error(MODULE, `components:uninstall failed`, err as Error);
        return fail(err);
      }
    },
  );

  // --- components:enable ---
  ipcMain.handle('components:enable', async (_event, id: ComponentId): Promise<IpcResult<void>> => {
    try {
      logger.info(MODULE, `components:enable ${id.name}`);
      const instances = await dataStore.getToolInstances();
      const instance = instances.find((t) => t.toolId === id.tool);
      if (!instance) {
        throw new AppError('TOOL_NOT_FOUND', `No tool instance found for ${id.tool}`, true);
      }

      await withAdapterLock(instance.instanceId, async () => {
        const adapter = registry.getAdapter(instance.instanceId);
        if (!adapter.canToggle(id.type)) {
          throw new AppError(
            'ADAPTER_UNSUPPORTED',
            `Cannot toggle ${id.type} for ${id.tool}`,
            false,
          );
        }
        await adapter.enable(id);
      });
      return ok(undefined);
    } catch (err) {
      logger.error(MODULE, `components:enable failed`, err as Error);
      return fail(err);
    }
  });

  // --- components:disable ---
  ipcMain.handle(
    'components:disable',
    async (_event, id: ComponentId): Promise<IpcResult<void>> => {
      try {
        logger.info(MODULE, `components:disable ${id.name}`);
        const instances = await dataStore.getToolInstances();
        const instance = instances.find((t) => t.toolId === id.tool);
        if (!instance) {
          throw new AppError('TOOL_NOT_FOUND', `No tool instance found for ${id.tool}`, true);
        }

        await withAdapterLock(instance.instanceId, async () => {
          const adapter = registry.getAdapter(instance.instanceId);
          if (!adapter.canToggle(id.type)) {
            throw new AppError(
              'ADAPTER_UNSUPPORTED',
              `Cannot toggle ${id.type} for ${id.tool}`,
              false,
            );
          }
          await adapter.disable(id);
        });
        return ok(undefined);
      } catch (err) {
        logger.error(MODULE, `components:disable failed`, err as Error);
        return fail(err);
      }
    },
  );

  // --- system:openFileDialog ---
  ipcMain.handle(
    'system:openFileDialog',
    async (_event, options: FileDialogOptions): Promise<IpcResult<string | null>> => {
      try {
        const win = getMainWindow();
        if (!win) return ok(null);

        const result = await dialog.showOpenDialog(win, {
          title: options.title,
          defaultPath: options.defaultPath,
          filters: options.filters,
          properties: options.properties ?? ['openFile'],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return ok(null);
        }
        return ok(result.filePaths[0]);
      } catch (err) {
        logger.error(MODULE, 'system:openFileDialog failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- system:showInExplorer ---
  ipcMain.handle(
    'system:showInExplorer',
    async (_event, path: string): Promise<IpcResult<void>> => {
      try {
        // Validate: path must be absolute to prevent traversal
        const isAbsolute = path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path);
        if (!isAbsolute) {
          throw new AppError('CONFIG_PERMISSION', 'Path must be absolute', false, { path });
        }
        shell.showItemInFolder(path);
        return ok(undefined);
      } catch (err) {
        logger.error(MODULE, 'system:showInExplorer failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- system:openUrl ---
  ipcMain.handle('system:openUrl', async (_event, url: string): Promise<IpcResult<void>> => {
    try {
      const parsed = new URL(url);
      if (!['https:', 'mailto:'].includes(parsed.protocol)) {
        throw new AppError('CONFIG_PERMISSION', 'Only https: and mailto: URLs are allowed', false);
      }
      await shell.openExternal(url);
      return ok(undefined);
    } catch (err) {
      logger.error(MODULE, 'system:openUrl failed', err as Error);
      return fail(err);
    }
  });

  // --- system:getAppVersion ---
  ipcMain.handle('system:getAppVersion', (): IpcResult<string> => {
    try {
      return ok(deps.getAppVersion());
    } catch (err) {
      return fail(err);
    }
  });

  // ─── Bundle Operations (M6) ─────────────────────────────────────────

  // --- bundles:export ---
  ipcMain.handle(
    'bundles:export',
    async (
      _event,
      componentIds: ComponentId[],
      exportOptions: ExportOptions,
    ): Promise<IpcResult<string>> => {
      try {
        logger.info(MODULE, `bundles:export ${componentIds.length} components`);

        // Get current components via scan
        const allComponents: Component[] = [];
        for (const adapter of registry.getAllAdapters()) {
          try {
            const comps = await adapter.scan();
            allComponents.push(...comps);
          } catch {
            // Skip failed adapters
          }
        }

        // Fetch marketplace source URLs for bundle portability
        let marketplaceSources: Map<string, { sourceId: string; url: string }> | undefined;
        let userSources: MarketplaceSourceConfig[] | undefined;
        try {
          const sources = await deps.marketplace.getSources();
          userSources = sources;
          marketplaceSources = new Map(
            sources.map((s) => [s.sourceId, { sourceId: s.sourceId, url: s.url }]),
          );
        } catch {
          // Non-fatal — bundle works without source URLs, just less portable
        }

        // Determine target — from export options or infer from first selected component
        const target: BundleTarget = exportOptions.target ?? {
          scope: 'user',
          toolId: (allComponents.find((c) =>
            componentIds.some((id) => componentIdKey(c.id) === componentIdKey(id)),
          )?.id.tool ?? 'claude-code') as ToolId,
        };

        const appVersion = deps.getAppVersion();

        const bundle = buildBundle(
          componentIds,
          allComponents,
          exportOptions,
          target,
          appVersion,
          marketplaceSources,
          userSources,
        );
        const json = serializeBundle(bundle);
        return ok(json);
      } catch (err) {
        logger.error(MODULE, 'bundles:export failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- bundles:parse ---
  ipcMain.handle('bundles:parse', async (_event, filePath: string): Promise<IpcResult<Bundle>> => {
    try {
      logger.info(MODULE, `bundles:parse ${filePath}`);

      // Validate: absolute path + allowed extension (prevents arbitrary file read)
      const isAbsolute = filePath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(filePath);
      if (!isAbsolute) {
        throw new AppError('CONFIG_PERMISSION', 'Path must be absolute', false);
      }
      if (!isAllowedDropFile(filePath)) {
        throw new AppError('BUNDLE_INVALID', 'File must be .aibundle or .json', false);
      }

      const fs = await import('fs/promises');

      // File size limit (10 MB) — prevents DoS via large file
      const stats = await fs.stat(filePath);
      if (stats.size > 10 * 1024 * 1024) {
        throw new AppError('FILE_TOO_LARGE', 'Bundle file exceeds 10 MB limit', false);
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const bundle = deserializeBundle(content);
      return ok(bundle);
    } catch (err) {
      logger.error(MODULE, 'bundles:parse failed', err as Error);
      return fail(err);
    }
  });

  // --- bundles:detectConflicts ---
  ipcMain.handle(
    'bundles:detectConflicts',
    async (_event, bundle: Bundle): Promise<IpcResult<ConflictManifest>> => {
      try {
        logger.info(MODULE, 'bundles:detectConflicts');

        // Get existing components
        const allComponents: Component[] = [];
        for (const adapter of registry.getAllAdapters()) {
          try {
            const comps = await adapter.scan();
            allComponents.push(...comps);
          } catch {
            // Skip failed adapters
          }
        }

        // Get detected tool IDs
        const detectedToolIds = registry.getAllAdapters().map((a) => a.toolId);

        // Collect all components from bundle (top-level + plugin components)
        const incoming: PortableComponent[] = [
          ...bundle.components,
          ...bundle.plugins.flatMap((p) => p.components),
        ];

        const manifest = detectConflicts(incoming, allComponents, detectedToolIds);
        return ok(manifest);
      } catch (err) {
        logger.error(MODULE, 'bundles:detectConflicts failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- bundles:import ---
  ipcMain.handle(
    'bundles:import',
    async (
      event,
      components: PortableComponent[],
      resolutions: ConflictResolution[],
      plugins?: import('@shared/types').PortablePlugin[],
    ): Promise<IpcResult<ImportResult>> => {
      try {
        const pluginList = plugins ?? [];
        const totalItems = components.length + pluginList.length;
        logger.info(
          MODULE,
          `bundles:import ${components.length} components + ${pluginList.length} plugins`,
        );
        const sender = event.sender;
        const installed: Component[] = [];
        const skipped: ImportResult['skipped'] = [];
        const failed: ImportResult['failed'] = [];

        const instances = await dataStore.getToolInstances();
        let progressIdx = 0;

        // R3: Create ONE backup before the import loop (batch context)
        if (totalItems > 0) {
          for (const instance of instances) {
            try {
              await backupManager.create(instance.instanceId, {
                label: 'pre-import',
                auto: true,
              });
            } catch (err) {
              logger.warn(MODULE, `Pre-import backup failed for ${instance.instanceId}`, err);
            }
          }
        }

        // Phase 1: Install plugins (R2 — full plugin structure restoration)
        for (const plugin of pluginList) {
          progressIdx++;
          if (!sender.isDestroyed()) {
            sender.send('progress:import', {
              current: progressIdx,
              total: totalItems,
              componentName: plugin.pluginName ?? plugin.pluginKey,
              status: 'installing',
            } satisfies ImportProgressEvent);
          }

          // Find target tool instance (plugins are Claude Code specific for now)
          const instance = instances.find((t) => t.toolId === 'claude-code') ?? instances[0];
          if (!instance) {
            // Create a synthetic portable for failure reporting
            const synth: PortableComponent = {
              type: 'unknown',
              name: plugin.pluginKey,
              core: { rawConfig: {}, rawTypeName: 'plugin' },
            };
            failed.push({
              component: synth,
              error: {
                code: 'TOOL_NOT_FOUND',
                message: 'No tool instance found for plugin install',
                recoverable: true,
              },
            });
            continue;
          }

          try {
            const result = await withAdapterLock(instance.instanceId, async () => {
              const adapter = registry.getAdapter(instance.instanceId);
              if (adapter.installPlugin) {
                return adapter.installPlugin(plugin);
              }
              throw new AppError(
                'ADAPTER_UNSUPPORTED',
                `Adapter ${adapter.toolId} does not support plugin install`,
                false,
              );
            });

            for (const comp of result) {
              await dataStore.setComponentMeta(comp.id, {
                tracking: 'imported',
                displayName: comp.description,
              });
            }
            installed.push(...result);
          } catch (err) {
            const synth: PortableComponent = {
              type: 'unknown',
              name: plugin.pluginKey,
              core: { rawConfig: {}, rawTypeName: 'plugin' },
            };
            failed.push({ component: synth, error: toIpcError(err) });
          }
        }

        // Phase 2: Install standalone components (existing logic)
        for (let i = 0; i < components.length; i++) {
          let portable = components[i];
          progressIdx++;

          // Send progress
          if (!sender.isDestroyed()) {
            const progressEvent: ImportProgressEvent = {
              current: progressIdx,
              total: totalItems,
              componentName: portable.name,
              status: 'installing',
            };
            sender.send('progress:import', progressEvent);
          }

          // Defense-in-depth: the renderer pre-filters, but we check resolutions
          // server-side as well in case the renderer logic is bypassed or buggy.
          const resolution = resolutions.find(
            (r) => r.componentKey.type === portable.type && r.componentKey.name === portable.name,
          );

          if (resolution?.action === 'skip') {
            skipped.push({ component: portable, reason: 'User chose to skip' });
            continue;
          }

          // Skip unsupported component types (e.g., plugin placeholders)
          if (portable.type === 'unknown') {
            skipped.push({
              component: portable,
              reason: 'Plugin placeholder — install the plugin via your AI tool instead',
            });
            continue;
          }

          // Plugin-scoped components: strip the plugin prefix from the name
          // and force user scope. Plugin scope only works with the native plugin
          // system (installed_plugins.json) — importing as standalone installs
          // the component as a regular user-scope item.
          if (portable.name.includes('/')) {
            const leafName = portable.name.slice(portable.name.lastIndexOf('/') + 1);
            portable = { ...portable, name: leafName };
          }
          if (portable.scope === 'plugin' || portable.scope?.startsWith('extension:')) {
            portable = { ...portable, scope: 'user' };
          }

          // Find target tool instance
          const targetTool = portable.sourceTools?.[0];
          const instance = targetTool
            ? instances.find((t) => t.toolId === targetTool)
            : instances[0]; // fallback to first available

          if (!instance) {
            failed.push({
              component: portable,
              error: {
                code: 'TOOL_NOT_FOUND',
                message: `No tool instance found for ${targetTool ?? 'any tool'}`,
                recoverable: true,
              },
            });
            continue;
          }

          try {
            const target: InstallTarget = {
              instanceId: instance.instanceId,
              scope: resolution?.targetScope ?? portable.scope ?? 'user',
            };

            const result = await withAdapterLock(instance.instanceId, async () => {
              const adapter = registry.getAdapter(instance.instanceId);
              return adapter.install(portable, target);
            });

            await dataStore.setComponentMeta(result.id, {
              tracking: 'imported',
              displayName: portable.description,
            });

            installed.push(result);
          } catch (err) {
            failed.push({
              component: portable,
              error: toIpcError(err),
            });
          }
        }

        // Send completion progress
        if (!sender.isDestroyed()) {
          sender.send('progress:import', {
            current: totalItems,
            total: totalItems,
            componentName: '',
            status: 'complete',
          } satisfies ImportProgressEvent);
        }

        return ok({ installed, skipped, failed });
      } catch (err) {
        logger.error(MODULE, 'bundles:import failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- bundles:save ---
  ipcMain.handle(
    'bundles:save',
    async (_event, json: string, defaultName: string): Promise<IpcResult<string | null>> => {
      try {
        const win = getMainWindow();
        if (!win) return ok(null);

        // Sanitize: strip path separators and control characters from user-provided name
        const safeName = defaultName.replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_');

        const result = await dialog.showSaveDialog(win, {
          title: 'Save Bundle',
          defaultPath: `${safeName}.aibundle`,
          filters: [{ name: 'AI Bundle', extensions: ['aibundle'] }],
        });

        if (result.canceled || !result.filePath) return ok(null);

        assertWriteAllowed(result.filePath);
        const fs = await import('fs/promises');
        await fs.writeFile(result.filePath, json, 'utf-8');

        return ok(result.filePath);
      } catch (err) {
        logger.error(MODULE, 'bundles:save failed', err as Error);
        return fail(err);
      }
    },
  );

  // ─── Browse Operations (M7) ────────────────────────────────────────

  const { marketplace } = deps;

  // --- browse:getEntries ---
  ipcMain.handle('browse:getEntries', async (): Promise<IpcResult<MarketplaceEntry[]>> => {
    try {
      logger.info(MODULE, 'browse:getEntries');
      const entries = await marketplace.getEntries();
      return ok(entries);
    } catch (err) {
      logger.error(MODULE, 'browse:getEntries failed', err as Error);
      return fail(err);
    }
  });

  // --- browse:getDetail ---
  ipcMain.handle(
    'browse:getDetail',
    async (_event, ref: MarketplaceRef): Promise<IpcResult<MarketplaceDetail>> => {
      try {
        logger.info(MODULE, `browse:getDetail ${ref.sourceId}/${ref.ref}`);
        const detail = await marketplace.getDetail(ref);
        return ok(detail);
      } catch (err) {
        logger.error(MODULE, 'browse:getDetail failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- browse:install ---
  ipcMain.handle(
    'browse:install',
    async (
      _event,
      ref: MarketplaceRef,
      target: BrowseInstallTarget,
    ): Promise<IpcResult<Component>> => {
      try {
        logger.info(MODULE, `browse:install ${ref.ref} → ${target.instanceId}`);
        const result = await marketplace.install(ref, target);
        return ok(result);
      } catch (err) {
        logger.error(MODULE, 'browse:install failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- browse:refreshSources ---
  ipcMain.handle('browse:refreshSources', async (): Promise<IpcResult<void>> => {
    try {
      logger.info(MODULE, 'browse:refreshSources');
      await marketplace.refreshSources();
      return ok(undefined);
    } catch (err) {
      logger.error(MODULE, 'browse:refreshSources failed', err as Error);
      return fail(err);
    }
  });

  // --- browse:backfillInstalledFrom ---
  ipcMain.handle('browse:backfillInstalledFrom', async (): Promise<IpcResult<number>> => {
    try {
      logger.info(MODULE, 'browse:backfillInstalledFrom');
      const count = await marketplace.backfillInstalledFrom();
      return ok(count);
    } catch (err) {
      logger.error(MODULE, 'browse:backfillInstalledFrom failed', err as Error);
      return fail(err);
    }
  });

  // --- browse:getSuggestedSources ---
  ipcMain.handle(
    'browse:getSuggestedSources',
    async (): Promise<IpcResult<SuggestedSourcesManifest>> => {
      try {
        const manifest = await fetchSuggestedSources(logger);
        return ok(manifest);
      } catch (err) {
        logger.error(MODULE, 'browse:getSuggestedSources failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- settings:getSources ---
  ipcMain.handle('settings:getSources', async (): Promise<IpcResult<MarketplaceSourceConfig[]>> => {
    try {
      logger.info(MODULE, 'settings:getSources');
      const sources = await marketplace.getSources();
      return ok(sources);
    } catch (err) {
      logger.error(MODULE, 'settings:getSources failed', err as Error);
      return fail(err);
    }
  });

  // --- settings:addSource ---
  ipcMain.handle(
    'settings:addSource',
    async (_event, config: NewSourceConfig): Promise<IpcResult<MarketplaceSourceConfig>> => {
      try {
        // Normalize short-form inputs (owner/repo, github.com/..., git@, .git suffix)
        const normalized = { ...config, url: normalizeSourceUrl(config.url) };

        logger.info(MODULE, `settings:addSource ${normalized.url}`);

        // Validate URL scheme — only HTTPS allowed
        try {
          const parsed = new URL(normalized.url);
          if (parsed.protocol !== 'https:') {
            throw new AppError('VALIDATION_ERROR', 'Source URL must use HTTPS', false);
          }
        } catch (err) {
          if (err instanceof AppError) throw err;
          throw new AppError('VALIDATION_ERROR', 'Invalid source URL', false);
        }

        const source = await marketplace.addSource(normalized);
        return ok(source);
      } catch (err) {
        logger.error(MODULE, 'settings:addSource failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- settings:updateSource ---
  ipcMain.handle(
    'settings:updateSource',
    async (
      _event,
      sourceId: string,
      config: Partial<NewSourceConfig>,
    ): Promise<IpcResult<MarketplaceSourceConfig>> => {
      try {
        logger.info(MODULE, `settings:updateSource ${sourceId}`);
        const source = await marketplace.updateSource(sourceId, config);
        return ok(source);
      } catch (err) {
        logger.error(MODULE, 'settings:updateSource failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- settings:removeSource ---
  ipcMain.handle(
    'settings:removeSource',
    async (_event, sourceId: string): Promise<IpcResult<void>> => {
      try {
        logger.info(MODULE, `settings:removeSource ${sourceId}`);
        await marketplace.removeSource(sourceId);
        return ok(undefined);
      } catch (err) {
        logger.error(MODULE, 'settings:removeSource failed', err as Error);
        return fail(err);
      }
    },
  );

  // ─── Update Mechanism (USR-06) ─────────────────────────────────────

  // --- updates:check ---
  ipcMain.handle('updates:check', async (): Promise<IpcResult<UpdateCheckResult>> => {
    try {
      logger.info(MODULE, 'updates:check');
      const result = await marketplace.checkForUpdates();
      return ok(result);
    } catch (err) {
      logger.error(MODULE, 'updates:check failed', err as Error);
      return fail(err);
    }
  });

  // --- updates:getAvailable ---
  ipcMain.handle('updates:getAvailable', async (): Promise<IpcResult<UpdateCheckResult | null>> => {
    try {
      logger.info(MODULE, 'updates:getAvailable');
      return ok(marketplace.getLastCheckResult());
    } catch (err) {
      logger.error(MODULE, 'updates:getAvailable failed', err as Error);
      return fail(err);
    }
  });

  // --- updates:apply ---
  ipcMain.handle(
    'updates:apply',
    async (
      _event,
      pluginKey: string,
    ): Promise<IpcResult<{ pluginKey: string; newVersion?: string }>> => {
      try {
        logger.info(MODULE, `updates:apply ${pluginKey}`);
        const result = await marketplace.applyUpdate(pluginKey);
        return ok(result);
      } catch (err) {
        logger.error(MODULE, `updates:apply failed for ${pluginKey}`, err as Error);
        return fail(err);
      }
    },
  );

  // --- updates:applyAll ---
  ipcMain.handle(
    'updates:applyAll',
    async (
      _event,
      pluginKeys: string[],
    ): Promise<
      IpcResult<{
        results: Array<{
          pluginKey: string;
          status: 'success' | 'failed';
          error?: string;
          newVersion?: string;
        }>;
      }>
    > => {
      try {
        logger.info(MODULE, `updates:applyAll ${pluginKeys.length} plugins`);
        const results: Array<{
          pluginKey: string;
          status: 'success' | 'failed';
          error?: string;
          newVersion?: string;
        }> = [];

        for (const key of pluginKeys) {
          try {
            const result = await marketplace.applyUpdate(key);
            results.push({ pluginKey: key, status: 'success', newVersion: result.newVersion });
          } catch (err) {
            results.push({
              pluginKey: key,
              status: 'failed',
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        return ok({ results });
      } catch (err) {
        logger.error(MODULE, 'updates:applyAll failed', err as Error);
        return fail(err);
      }
    },
  );

  // ─── Preferences (M8) ─────────────────────────────────────────────

  // --- preferences:get ---
  ipcMain.handle('preferences:get', async (): Promise<IpcResult<UserPreferences>> => {
    try {
      logger.info(MODULE, 'preferences:get');
      const prefs = await dataStore.getPreferences();
      return ok(prefs);
    } catch (err) {
      logger.error(MODULE, 'preferences:get failed', err as Error);
      return fail(err);
    }
  });

  // --- preferences:set ---
  ipcMain.handle(
    'preferences:set',
    async (_event, prefs: Partial<UserPreferences>): Promise<IpcResult<UserPreferences>> => {
      try {
        logger.info(MODULE, 'preferences:set');
        await dataStore.setPreferences(prefs);
        const updated = await dataStore.getPreferences();
        return ok(updated);
      } catch (err) {
        logger.error(MODULE, 'preferences:set failed', err as Error);
        return fail(err);
      }
    },
  );

  // ─── Project Folders (USR-03) ────────────────────────────────────

  // --- projects:list ---
  ipcMain.handle('projects:list', async (): Promise<IpcResult<ProjectFolder[]>> => {
    try {
      logger.info(MODULE, 'projects:list');
      const { stat: fsStat } = await import('fs/promises');
      const prefs = await dataStore.getPreferences();
      const folders = prefs.projectFolders ?? [];

      // Enrich each folder with an existence check
      const enriched = await Promise.all(
        folders.map(async (folder) => {
          try {
            const info = await fsStat(folder.path);
            return { ...folder, exists: info.isDirectory() };
          } catch {
            return { ...folder, exists: false };
          }
        }),
      );

      return ok(enriched);
    } catch (err) {
      logger.error(MODULE, 'projects:list failed', err as Error);
      return fail(err);
    }
  });

  // --- projects:add ---
  ipcMain.handle(
    'projects:add',
    async (_event, folderPath: string): Promise<IpcResult<ProjectFolder>> => {
      try {
        logger.info(MODULE, `projects:add ${folderPath}`);
        const { resolve: resolvePath, basename: baseName } = await import('path');
        const { stat: fsStat } = await import('fs/promises');
        const resolvedPath = resolvePath(folderPath);

        // Validate directory exists
        try {
          const info = await fsStat(resolvedPath);
          if (!info.isDirectory()) {
            return fail(new AppError('NOT_FOUND', 'Path is not a directory', true));
          }
        } catch {
          return fail(new AppError('NOT_FOUND', "This folder doesn't exist on disk.", true));
        }

        const prefs = await dataStore.getPreferences();
        const folders = prefs.projectFolders ?? [];

        // Check duplicate
        if (folders.some((f) => resolvePath(f.path) === resolvedPath)) {
          return fail(new AppError('DUPLICATE', 'This folder is already registered.', true));
        }

        // Check limit
        if (folders.length >= MAX_PROJECT_FOLDERS) {
          return fail(
            new AppError(
              'LIMIT_EXCEEDED',
              `Maximum ${MAX_PROJECT_FOLDERS} project folders. Remove one to add another.`,
              true,
            ),
          );
        }

        const folder: ProjectFolder = {
          path: resolvedPath,
          name: baseName(resolvedPath),
          addedAt: new Date().toISOString(),
        };

        folders.push(folder);
        await dataStore.setPreferences({ projectFolders: folders });
        return ok(folder);
      } catch (err) {
        logger.error(MODULE, 'projects:add failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- projects:remove ---
  ipcMain.handle(
    'projects:remove',
    async (_event, folderPath: string): Promise<IpcResult<void>> => {
      try {
        logger.info(MODULE, `projects:remove ${folderPath}`);
        const { resolve: resolvePath } = await import('path');
        const resolvedPath = resolvePath(folderPath);

        const prefs = await dataStore.getPreferences();
        const folders = prefs.projectFolders ?? [];
        const filtered = folders.filter((f) => resolvePath(f.path) !== resolvedPath);

        if (filtered.length === folders.length) {
          return fail(new AppError('NOT_FOUND', 'Folder not found in registry.', true));
        }

        await dataStore.setPreferences({ projectFolders: filtered });
        return ok(undefined);
      } catch (err) {
        logger.error(MODULE, 'projects:remove failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- projects:scan ---
  ipcMain.handle(
    'projects:scan',
    async (_event, folderPath: string): Promise<IpcResult<Component[]>> => {
      try {
        logger.info(MODULE, `projects:scan ${folderPath}`);
        const { resolve: resolvePath } = await import('path');
        const resolvedPath = resolvePath(folderPath);

        // Validate path is a registered project folder (defense-in-depth)
        const prefs = await dataStore.getPreferences();
        const registered = prefs.projectFolders ?? [];
        if (!registered.some((f) => resolvePath(f.path) === resolvedPath)) {
          return fail(
            new AppError('CONFIG_PERMISSION', 'Path is not a registered project folder.', true),
          );
        }

        const components: Component[] = [];

        for (const adapter of registry.getAllAdapters()) {
          if (adapter.scanProject) {
            try {
              const projectComponents = await adapter.scanProject(resolvedPath);
              components.push(...projectComponents);
            } catch (err) {
              logger.warn(MODULE, `Project scan failed for ${adapter.toolId}: ${folderPath}`, err);
            }
          }
        }

        return ok(components);
      } catch (err) {
        logger.error(MODULE, 'projects:scan failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- projects:openFolderDialog ---
  ipcMain.handle('projects:openFolderDialog', async (): Promise<IpcResult<string | null>> => {
    try {
      const win = getMainWindow();
      if (!win) return ok(null);

      const result = await dialog.showOpenDialog(win, {
        title: 'Select project folder',
        properties: ['openDirectory'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return ok(null);
      }
      return ok(result.filePaths[0]);
    } catch (err) {
      logger.error(MODULE, 'projects:openFolderDialog failed', err as Error);
      return fail(err);
    }
  });

  // ─── GitHub Token (M8) ────────────────────────────────────────────

  // --- secrets:hasGithubToken ---
  ipcMain.handle('secrets:hasGithubToken', async (): Promise<IpcResult<boolean>> => {
    try {
      const token = await secretStore.get('aiplughub', 'github-token');
      return ok(token !== null && token.length > 0);
    } catch (err) {
      logger.error(MODULE, 'secrets:hasGithubToken failed', err as Error);
      return fail(err);
    }
  });

  // --- secrets:setGithubToken ---
  ipcMain.handle(
    'secrets:setGithubToken',
    async (_event, token: string): Promise<IpcResult<void>> => {
      try {
        logger.info(MODULE, 'secrets:setGithubToken');
        if (token.trim().length === 0) {
          await secretStore.delete('aiplughub', 'github-token');
        } else {
          await secretStore.set('aiplughub', 'github-token', token);
        }
        return ok(undefined);
      } catch (err) {
        logger.error(MODULE, 'secrets:setGithubToken failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- secrets:clearGithubToken ---
  ipcMain.handle('secrets:clearGithubToken', async (): Promise<IpcResult<void>> => {
    try {
      logger.info(MODULE, 'secrets:clearGithubToken');
      await secretStore.delete('aiplughub', 'github-token');
      return ok(undefined);
    } catch (err) {
      logger.error(MODULE, 'secrets:clearGithubToken failed', err as Error);
      return fail(err);
    }
  });

  // ─── Plugin Operations ─────────────────────────────────────────────

  interface PluginAdapter {
    togglePlugin(key: string, enabled: boolean): Promise<void>;
    uninstallPlugin(key: string): Promise<void>;
  }

  // --- plugins:list ---
  ipcMain.handle(
    'plugins:list',
    async (
      _event,
      instanceId: string = 'claude-code-default',
    ): Promise<IpcResult<NativePlugin[]>> => {
      try {
        logger.info(MODULE, 'plugins:list');
        const adapter = registry.getAdapter(instanceId);
        const components = await adapter.scan();
        const pluginComponents = components.filter((c) => c.id.scope === 'plugin');

        // Group by pluginKey
        const groups = new Map<
          string,
          { components: Component[]; enabled: boolean; version?: string; pluginKey: string }
        >();
        for (const c of pluginComponents) {
          const pluginKey = (c.extensions?.pluginKey as string) ?? c.id.name;
          if (!groups.has(pluginKey)) {
            groups.set(pluginKey, {
              components: [],
              enabled: c.enabled ?? false,
              version: c.version,
              pluginKey,
            });
          }
          groups.get(pluginKey)!.components.push(c);
        }

        const plugins: NativePlugin[] = [];
        for (const [key, group] of groups) {
          const [pluginName, marketplace] = key.includes('@') ? key.split('@') : [key, 'unknown'];
          plugins.push({
            pluginKey: key,
            pluginName,
            marketplace,
            version: group.version ?? '',
            enabled: group.enabled,
            scope: 'plugin',
            componentCount: group.components.length,
          });
        }

        return ok(plugins);
      } catch (err) {
        logger.error(MODULE, 'plugins:list failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- plugins:toggle ---
  ipcMain.handle(
    'plugins:toggle',
    async (
      _event,
      pluginKey: string,
      enabled: boolean,
      instanceId: string = 'claude-code-default',
    ): Promise<IpcResult<void>> => {
      try {
        logger.info(MODULE, `plugins:toggle ${pluginKey} → ${enabled}`);
        const adapter = registry.getAdapter(instanceId);
        // Use the extended method — cast since registry returns ToolAdapter
        const extended = adapter as unknown as PluginAdapter;
        if (!extended.togglePlugin) {
          throw new AppError(
            'ADAPTER_UNSUPPORTED',
            'Plugin toggle not supported for this tool',
            false,
          );
        }
        await withAdapterLock(instanceId, () => extended.togglePlugin(pluginKey, enabled));
        return ok(undefined);
      } catch (err) {
        logger.error(MODULE, 'plugins:toggle failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- plugins:uninstall ---
  ipcMain.handle(
    'plugins:uninstall',
    async (
      _event,
      pluginKey: string,
      instanceId: string = 'claude-code-default',
    ): Promise<IpcResult<void>> => {
      try {
        logger.info(MODULE, `plugins:uninstall ${pluginKey}`);
        const adapter = registry.getAdapter(instanceId);
        const extended = adapter as unknown as PluginAdapter;
        if (!extended.uninstallPlugin) {
          throw new AppError(
            'ADAPTER_UNSUPPORTED',
            'Plugin uninstall not supported for this tool',
            false,
          );
        }
        await withAdapterLock(instanceId, () => extended.uninstallPlugin(pluginKey));
        return ok(undefined);
      } catch (err) {
        logger.error(MODULE, 'plugins:uninstall failed', err as Error);
        return fail(err);
      }
    },
  );

  // ─── Backups (FEAT-02) ──────────────────────────────────────────────

  // --- backups:list ---
  ipcMain.handle(
    'backups:list',
    async (_event, instanceId: string): Promise<IpcResult<BackupSummary[]>> => {
      try {
        logger.info(MODULE, `backups:list ${instanceId}`);
        if (!instanceId || typeof instanceId !== 'string') {
          throw new AppError('VALIDATION_ERROR', 'instanceId must be a non-empty string', false);
        }
        const summaries = await backupManager.list(instanceId);
        return ok(summaries);
      } catch (err) {
        logger.error(MODULE, 'backups:list failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- backups:create ---
  ipcMain.handle(
    'backups:create',
    async (
      _event,
      instanceId: string,
      options?: BackupCreateOptions,
    ): Promise<IpcResult<BackupSummary>> => {
      try {
        logger.info(MODULE, `backups:create ${instanceId}`);
        if (!instanceId || typeof instanceId !== 'string') {
          throw new AppError('VALIDATION_ERROR', 'instanceId must be a non-empty string', false);
        }
        if (options?.label !== undefined) {
          if (typeof options.label !== 'string' || options.label.length > 100) {
            throw new AppError(
              'VALIDATION_ERROR',
              'label must be a string of at most 100 characters',
              false,
            );
          }
        }
        const summary = await backupManager.create(instanceId, options);
        return ok(summary);
      } catch (err) {
        logger.error(MODULE, 'backups:create failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- backups:restore ---
  ipcMain.handle(
    'backups:restore',
    async (_event, instanceId: string, backupPath: string): Promise<IpcResult<RestoreResult>> => {
      try {
        logger.info(MODULE, `backups:restore ${instanceId} from ${backupPath}`);
        if (!instanceId || typeof instanceId !== 'string') {
          throw new AppError('VALIDATION_ERROR', 'instanceId must be a non-empty string', false);
        }
        if (!backupPath || typeof backupPath !== 'string') {
          throw new AppError('VALIDATION_ERROR', 'backupPath must be a non-empty string', false);
        }
        if (backupPath.includes('..')) {
          throw new AppError('CONFIG_PERMISSION', 'Path traversal not allowed', false);
        }
        const result = await backupManager.restore(instanceId, backupPath);
        return ok(result);
      } catch (err) {
        logger.error(MODULE, 'backups:restore failed', err as Error);
        return fail(err);
      }
    },
  );

  // --- backups:delete ---
  ipcMain.handle(
    'backups:delete',
    async (_event, instanceId: string, backupPath: string): Promise<IpcResult<void>> => {
      try {
        logger.info(MODULE, `backups:delete ${instanceId} path ${backupPath}`);
        if (!instanceId || typeof instanceId !== 'string') {
          throw new AppError('VALIDATION_ERROR', 'instanceId must be a non-empty string', false);
        }
        if (!backupPath || typeof backupPath !== 'string') {
          throw new AppError('VALIDATION_ERROR', 'backupPath must be a non-empty string', false);
        }
        if (backupPath.includes('..')) {
          throw new AppError('CONFIG_PERMISSION', 'Path traversal not allowed', false);
        }
        await backupManager.delete(instanceId, backupPath);
        return ok(undefined);
      } catch (err) {
        logger.error(MODULE, 'backups:delete failed', err as Error);
        return fail(err);
      }
    },
  );
}

// ─── Drag-and-Drop ──────────────────────────────────────────────────
//
// With sandbox: true, the renderer can't access File.path from DOM drop events.
// The will-navigate guard in createWindow() blocks file-URL navigation from drops.
// For file import, the renderer uses system:openFileDialog (M5).
//
// The preload exposes system.onFileDrop as a forward-declaration — the main process
// will send 'system:fileDrop' events when the renderer-side drop handling is built
// in M5 (using Electron's webUtils.getPathForFile in a preload helper).
//
// Exported for type reference only:
export { isAllowedDropFile as _isAllowedDropFile };
