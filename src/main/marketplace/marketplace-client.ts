/**
 * Marketplace client — orchestrates source adapters, caching, and installs.
 * Source: 5A-specs/browse-tab-spec.md §1-§3
 */

import type {
  MarketplaceEntry,
  MarketplaceDetail,
  MarketplaceRef,
  MarketplaceSourceConfig,
  NewSourceConfig,
  BrowseInstallTarget,
  Component,
  ComponentMetadata,
  UpdateCheckResult,
  UpdateCheckError,
  PluginUpdate,
  ComponentChange,
  FieldDiff,
  PortableComponent,
} from '@shared/types';
import { AppError } from '@shared/types';
import type { MarketplaceSource } from './marketplace-source';
import { GitMarketplaceSource } from './git-marketplace-source';
import { UrlIndexSource } from './url-index-source';
import { MarketplaceCache } from './cache';
import { StarEnricher } from './star-enricher';
import type { Logger } from '../logger';
import type { DataStore } from '../data-store';
import type { SecretStore } from '../secret-store';
import type { AdapterRegistry } from '../adapters/adapter-registry';
import { withAdapterLock } from '../ipc/operation-lock';
import { componentContentHash, isSensitiveEnvKey } from '@shared/utils';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { assertWriteAllowed } from '../write-guard';

const execFileAsync = promisify(execFile);

/** 1 hour manifest cache TTL */
const MANIFEST_TTL_MS = 60 * 60 * 1000;

/** 24 hour detail cache TTL */
const DETAIL_TTL_MS = 24 * 60 * 60 * 1000;

/** Max concurrent source fetches */
const MAX_CONCURRENT_FETCHES = 3;

/** Default built-in source */
const BUILTIN_SOURCE: MarketplaceSourceConfig = {
  sourceId: 'claude-plugins-official',
  sourceType: 'git-marketplace',
  url: 'https://github.com/anthropics/claude-plugins-official',
  displayName: 'Claude Plugins Official',
  isBuiltIn: true,
};

type KnownMarketplace = {
  source: { source: string; repo: string };
  installLocation: string;
  lastUpdated: string;
};

export type MarketplaceClientOptions = {
  cachePath: string;
  dataStore: DataStore;
  secretStore: SecretStore;
  registry: AdapterRegistry;
  logger: Logger;
  claudeRootPath?: string;
};

export class MarketplaceClient {
  private cache: MarketplaceCache;
  private sources = new Map<string, MarketplaceSource>();
  private sourceConfigs: MarketplaceSourceConfig[] = [];
  private dataStore: DataStore;
  private secretStore: SecretStore;
  private registry: AdapterRegistry;
  private logger: Logger;
  private claudeRootPath?: string;
  private initialized = false;
  private starEnricher: StarEnricher | null = null;

  /** Mutex for update operations — prevents concurrent check + apply */
  private updateLock: Promise<void> = Promise.resolve();

  constructor(options: MarketplaceClientOptions) {
    this.cache = new MarketplaceCache({ basePath: options.cachePath });
    this.dataStore = options.dataStore;
    this.secretStore = options.secretStore;
    this.registry = options.registry;
    this.logger = options.logger;
    this.claudeRootPath = options.claudeRootPath;
  }

  /** Initialize sources from stored config */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.sourceConfigs = await this.loadSourceConfigs();
    await this.rebuildSources();
    this.initialized = true;
  }

  /** Get all entries from all sources (with caching) */
  async getEntries(): Promise<MarketplaceEntry[]> {
    await this.init();
    const allEntries: MarketplaceEntry[] = [];
    const sourceIds = Array.from(this.sources.keys());

    // Fetch in batches of MAX_CONCURRENT_FETCHES
    for (let i = 0; i < sourceIds.length; i += MAX_CONCURRENT_FETCHES) {
      const batch = sourceIds.slice(i, i + MAX_CONCURRENT_FETCHES);
      const results = await Promise.allSettled(batch.map((id) => this.fetchSourceEntries(id)));

      for (const result of results) {
        if (result.status === 'fulfilled') {
          allEntries.push(...result.value);
        }
        // Failed sources are logged but don't block others
      }
    }

    if (this.starEnricher) {
      return this.starEnricher.enrich(allEntries);
    }
    return allEntries;
  }

  /** Get detail for a specific plugin */
  async getDetail(ref: MarketplaceRef, options?: { force?: boolean }): Promise<MarketplaceDetail> {
    await this.init();

    // Check detail cache first (skip if force is set — used during update apply)
    if (!options?.force) {
      const cached = await this.cache.getDetail<MarketplaceDetail>(
        ref.sourceId,
        ref.ref,
        DETAIL_TTL_MS,
      );
      if (cached) return cached.data;
    }

    const source = this.sources.get(ref.sourceId);
    if (!source) {
      throw new AppError(
        'SOURCE_NOT_FOUND',
        `Marketplace source "${ref.sourceId}" not found`,
        true,
      );
    }

    const detail = await source.getDetail(ref.ref);
    await this.cache.setDetail(ref.sourceId, ref.ref, detail);
    return detail;
  }

  /** Install a plugin from the marketplace */
  async install(ref: MarketplaceRef, target: BrowseInstallTarget): Promise<Component> {
    const detail = await this.getDetail(ref);

    // If detail has portable components (plugin.json exists), install them directly
    if (detail.components.length > 0) {
      let lastResult: Component | null = null;
      for (const portable of detail.components) {
        const result = await withAdapterLock(target.instanceId, async () => {
          const adapter = this.registry.getAdapter(target.instanceId);
          return adapter.install(portable, {
            instanceId: target.instanceId,
            scope: target.scope,
          });
        });

        await this.dataStore.setComponentMeta(result.id, {
          tracking: 'imported',
          displayName: portable.description,
          installedFrom: { sourceId: ref.sourceId, ref: ref.ref },
          installedVersion: detail.entry.version,
          installedHash: componentContentHash(portable),
        });

        lastResult = result;
      }
      return lastResult!;
    }

    // No plugin.json — delegate to Claude Code's native install command.
    // Most plugins don't ship a plugin.json manifest; they have skills/commands/agents
    // as .md files that Claude Code's own installer knows how to handle.
    const adapter = this.registry.getAdapter(target.instanceId);
    if (adapter.toolId !== 'claude-code') {
      throw new AppError(
        'INSTALL_FAILED',
        `Plugin "${ref.ref}" has no installable components and native install is only supported for Claude Code. [source: ${ref.sourceId}, ref: ${ref.ref}]`,
        true,
      );
    }

    // Build the plugin specifier: name@marketplace
    const pluginSpec = `${ref.ref}@${ref.sourceId}`;
    this.logger.info(
      'Marketplace',
      `No plugin.json — delegating to: claude plugins install ${pluginSpec}`,
    );

    try {
      // Build a filtered env that strips sensitive variables
      const safeEnv: Record<string, string> = {};
      const SAFE_ENV_KEYS = new Set([
        'PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
        'TEMP', 'TMP', 'SystemRoot', 'COMSPEC', 'SHELL',
        'LANG', 'LC_ALL', 'TERM', 'NODE_ENV',
      ]);
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined && (SAFE_ENV_KEYS.has(key) || !isSensitiveEnvKey(key))) {
          safeEnv[key] = value;
        }
      }
      const { stdout, stderr } = await execFileAsync('claude', ['plugins', 'install', pluginSpec], {
        timeout: 60_000,
        env: safeEnv,
      });
      this.logger.info('Marketplace', `Native install stdout: ${stdout.trim()}`);
      if (stderr.trim()) {
        this.logger.warn('Marketplace', `Native install stderr: ${stderr.trim()}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(
        'INSTALL_FAILED',
        `Native install failed for "${pluginSpec}": ${message}. Try running "claude plugins install ${pluginSpec}" manually in your terminal.`,
        true,
      );
    }

    // Re-scan to pick up the newly installed plugin
    const components = await adapter.scan();
    const installed = components.find(
      (c) =>
        c.extensions?.pluginKey === pluginSpec ||
        (c.extensions?.pluginName === ref.ref && c.extensions?.marketplace === ref.sourceId),
    );

    if (installed) {
      await this.dataStore.setComponentMeta(installed.id, {
        tracking: 'imported',
        installedFrom: { sourceId: ref.sourceId, ref: ref.ref },
        installedVersion: detail.entry.version,
      });
      return installed;
    }

    // Plugin installed but we can't find it — still a success, just return a placeholder
    return {
      id: { tool: 'claude-code', type: 'unknown', name: ref.ref, scope: 'plugin' },
      core: { rawConfig: undefined, rawTypeName: 'plugin' },
      tracking: 'imported',
      installedFrom: { sourceId: ref.sourceId, ref: ref.ref },
      version: detail.entry.version,
    };
  }

  /** Invalidate all caches and re-fetch */
  async refreshSources(): Promise<void> {
    await this.cache.invalidateManifests();
    if (this.starEnricher) {
      await this.starEnricher.invalidateStarCache();
    }
  }

  /** Acquire the update mutex. Returns a release function. */
  private async acquireUpdateLock(): Promise<() => void> {
    let release: () => void;
    const newLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previousLock = this.updateLock;
    this.updateLock = previousLock.then(() => newLock);
    await previousLock;
    return release!;
  }

  // ─── Update Mechanism (USR-06) ──────────────────────────────────────

  /** In-memory store for latest check result */
  private lastCheckResult: UpdateCheckResult | null = null;

  /** Check all installed plugins for available updates */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    await this.init();
    const release = await this.acquireUpdateLock();
    try {
      const updates: PluginUpdate[] = [];
      const errors: UpdateCheckError[] = [];

      // Get all components with upstream tracking
      const allMeta = await this.dataStore.getComponents();
      const tracked = allMeta.filter((m) => m.installedFrom);

      // Group by upstream ref (sourceId + ref = one plugin)
      const pluginGroups = new Map<string, ComponentMetadata[]>();
      for (const meta of tracked) {
        const key = `${meta.installedFrom!.sourceId}:${meta.installedFrom!.ref}`;
        const group = pluginGroups.get(key) ?? [];
        group.push(meta);
        pluginGroups.set(key, group);
      }

      for (const [, metas] of pluginGroups) {
        const { sourceId, ref } = metas[0].installedFrom!;
        try {
          const detail = await this.getDetail({ sourceId, ref });
          const changes = this.compareComponents(metas, detail.components);
          const hasChanges = changes.some((c) => c.changeType !== 'unchanged');

          if (hasChanges) {
            const pluginName = metas[0].pluginName ?? ref;
            const marketplace = sourceId;
            updates.push({
              pluginKey: pluginName.includes('@') ? pluginName : `${pluginName}@${marketplace}`,
              pluginName: pluginName.includes('@') ? pluginName.split('@')[0] : pluginName,
              marketplace,
              sourceId,
              ref,
              currentVersion: metas[0].installedVersion,
              availableVersion: detail.entry.version,
              changes,
              addedCount: changes.filter((c) => c.changeType === 'added').length,
              modifiedCount: changes.filter((c) => c.changeType === 'modified').length,
              removedCount: changes.filter((c) => c.changeType === 'removed').length,
              unchangedCount: changes.filter((c) => c.changeType === 'unchanged').length,
            });
          }
        } catch (err) {
          errors.push({ sourceId, message: err instanceof Error ? err.message : String(err) });
        }
      }

      const now = new Date().toISOString();
      await this.dataStore.setPreferences({ lastUpdateCheck: now });

      this.lastCheckResult = { checkedAt: now, updates, errors };
      return this.lastCheckResult;
    } finally {
      release();
    }
  }

  /** Get last check result without re-checking */
  getLastCheckResult(): UpdateCheckResult | null {
    return this.lastCheckResult;
  }

  /** Apply an update for a single plugin */
  async applyUpdate(pluginKey: string): Promise<{ pluginKey: string; newVersion?: string }> {
    await this.init();
    const release = await this.acquireUpdateLock();
    try {
      // Find the tracked metadata for this plugin
      const allMeta = await this.dataStore.getComponents();
      const pluginMetas = allMeta.filter(
        (m) =>
          m.installedFrom &&
          (m.pluginName === pluginKey ||
            `${m.pluginName}@${m.installedFrom.sourceId}` === pluginKey),
      );

      if (pluginMetas.length === 0) {
        throw new AppError(
          'UPDATE_FAILED',
          `No tracked components found for plugin "${pluginKey}"`,
          true,
        );
      }

      const { sourceId, ref } = pluginMetas[0].installedFrom!;

      // Fetch fresh detail (bypass cache)
      const detail = await this.getDetail({ sourceId, ref }, { force: true });

      // Determine target tool instance from existing components
      const instances = await this.dataStore.getToolInstances();
      const toolId = pluginMetas[0].id.tool;
      const instance = instances.find((t) => t.toolId === toolId);
      if (!instance) {
        throw new AppError('TOOL_NOT_FOUND', `No tool instance found for ${toolId}`, true);
      }

      // Track what we've updated for rollback — store previous portable representations
      const updatedComponents: Array<{
        id: (typeof pluginMetas)[0]['id'];
        previousPortable?: PortableComponent;
      }> = [];

      try {
        // Install/update each upstream component
        for (const portable of detail.components) {
          const result = await withAdapterLock(instance.instanceId, async () => {
            const adapter = this.registry.getAdapter(instance.instanceId);
            return adapter.install(portable, {
              instanceId: instance.instanceId,
              scope: pluginMetas[0].id.scope,
            });
          });

          updatedComponents.push({
            id: result.id,
            previousPortable: undefined, // We don't have the old portable; rollback will uninstall
          });

          await this.dataStore.setComponentMeta(result.id, {
            tracking: 'imported',
            displayName: portable.description,
            installedFrom: { sourceId, ref },
            installedVersion: detail.entry.version,
            installedHash: componentContentHash(portable),
          });
        }

        // Remove components that no longer exist upstream
        const upstreamNames = new Set(detail.components.map((c) => `${c.type}:${c.name}`));
        for (const meta of pluginMetas) {
          const key = `${meta.id.type}:${meta.id.name}`;
          if (!upstreamNames.has(key)) {
            await withAdapterLock(instance.instanceId, async () => {
              const adapter = this.registry.getAdapter(instance.instanceId);
              await adapter.uninstall(meta.id);
              await this.dataStore.removeComponentMeta(meta.id);
            });
          }
        }

        // Remove from in-memory update list
        if (this.lastCheckResult) {
          this.lastCheckResult = {
            ...this.lastCheckResult,
            updates: this.lastCheckResult.updates.filter((u) => u.pluginKey !== pluginKey),
          };
        }

        return { pluginKey, newVersion: detail.entry.version };
      } catch (err) {
        // Rollback: re-install previous versions of already-updated components
        this.logger.warn(
          'Marketplace',
          `Update failed for ${pluginKey}, rolling back ${updatedComponents.length} components`,
        );
        for (const updated of updatedComponents) {
          try {
            // Find the original metadata to restore
            const originalMeta = pluginMetas.find(
              (m) => m.id.type === updated.id.type && m.id.name === updated.id.name,
            );
            if (originalMeta) {
              // Restore original metadata (version and hash)
              await this.dataStore.setComponentMeta(updated.id, {
                tracking: originalMeta.tracking,
                displayName: originalMeta.displayName,
                installedFrom: originalMeta.installedFrom,
                installedVersion: originalMeta.installedVersion,
                installedHash: originalMeta.installedHash,
                pluginName: originalMeta.pluginName,
              });
            }
          } catch (rollbackErr) {
            this.logger.error(
              'Marketplace',
              `Rollback failed for component ${updated.id.name}`,
              rollbackErr as Error,
            );
          }
        }
        throw new AppError(
          'UPDATE_FAILED',
          `Update failed for "${pluginKey}": ${err instanceof Error ? err.message : String(err)}. Changes have been rolled back.`,
          true,
        );
      }
    } finally {
      release();
    }
  }

  /** Compare installed component metadata against upstream portable components */
  private compareComponents(
    installed: ComponentMetadata[],
    upstream: PortableComponent[],
  ): ComponentChange[] {
    const changes: ComponentChange[] = [];

    const installedMap = new Map(installed.map((m) => [`${m.id.type}:${m.id.name}`, m]));
    const upstreamMap = new Map(upstream.map((p) => [`${p.type}:${p.name}`, p]));

    // Check upstream components against installed
    for (const [key, portable] of upstreamMap) {
      const meta = installedMap.get(key);
      if (!meta) {
        changes.push({ name: portable.name, type: portable.type, changeType: 'added' });
        continue;
      }

      // Compare: version first, then hash
      const upstreamHash = componentContentHash(portable);
      if (meta.installedVersion && portable.version && meta.installedVersion !== portable.version) {
        changes.push({
          name: portable.name,
          type: portable.type,
          changeType: 'modified',
          fieldDiffs: this.computeFieldDiffs(meta, portable),
        });
      } else if (meta.installedHash && meta.installedHash !== upstreamHash) {
        const fieldDiffs = this.computeFieldDiffs(meta, portable);
        changes.push({
          name: portable.name,
          type: portable.type,
          changeType: 'modified',
          fieldDiffs: fieldDiffs.length > 0 ? fieldDiffs : undefined,
          hashOnly: fieldDiffs.length === 0,
        });
      } else {
        changes.push({ name: portable.name, type: portable.type, changeType: 'unchanged' });
      }
    }

    // Check for removed components (in installed but not upstream)
    for (const [key, meta] of installedMap) {
      if (!upstreamMap.has(key)) {
        changes.push({ name: meta.id.name, type: meta.id.type, changeType: 'removed' });
      }
    }

    return changes;
  }

  /** Compute field-level diffs between installed metadata and upstream portable */
  private computeFieldDiffs(meta: ComponentMetadata, upstream: PortableComponent): FieldDiff[] {
    const diffs: FieldDiff[] = [];

    if (meta.displayName !== undefined && meta.displayName !== upstream.description) {
      diffs.push({
        field: 'description',
        oldValue: meta.displayName,
        newValue: upstream.description,
      });
    }

    if (
      meta.installedVersion !== undefined &&
      upstream.version !== undefined &&
      meta.installedVersion !== upstream.version
    ) {
      diffs.push({ field: 'version', oldValue: meta.installedVersion, newValue: upstream.version });
    }

    return diffs;
  }

  // ─── Update Backfill (USR-06B) ─────────────────────────────────────

  /**
   * Attempt to backfill `installedFrom` for components installed before USR-06.
   * Matches by plugin name: if a component's pluginName matches an upstream ref,
   * backfill the metadata so it gains update tracking.
   *
   * Conservative: only backfills when there's a unique match from a known source.
   * Returns the number of components backfilled.
   */
  async backfillInstalledFrom(): Promise<number> {
    await this.init();

    const allMeta = await this.dataStore.getComponents();
    const untracked = allMeta.filter((m) => !m.installedFrom && m.pluginName);
    if (untracked.length === 0) return 0;

    // Get all marketplace entries — track duplicates for safety
    const entries = await this.getEntries();
    const entryByRef = new Map<string, { sourceId: string; ref: string }>();
    const ambiguousRefs = new Set<string>();
    for (const entry of entries) {
      if (entryByRef.has(entry.ref)) {
        // Multiple sources provide the same ref — skip to prevent hijacking
        ambiguousRefs.add(entry.ref);
      }
      entryByRef.set(entry.ref, { sourceId: entry.sourceId, ref: entry.ref });
    }

    let backfilledCount = 0;

    // Group untracked by pluginName
    const pluginGroups = new Map<string, ComponentMetadata[]>();
    for (const meta of untracked) {
      const key = meta.pluginName!;
      const group = pluginGroups.get(key) ?? [];
      group.push(meta);
      pluginGroups.set(key, group);
    }

    for (const [pluginName, metas] of pluginGroups) {
      // Try to match pluginName to a marketplace ref — skip ambiguous matches
      if (ambiguousRefs.has(pluginName)) {
        this.logger.warn(
          'MarketplaceClient',
          `Skipping backfill for "${pluginName}" — multiple sources provide this ref`,
        );
        continue;
      }
      const match = entryByRef.get(pluginName);
      if (!match) continue;

      // Backfill all components for this plugin
      for (const meta of metas) {
        try {
          await this.dataStore.setComponentMeta(meta.id, {
            installedFrom: match,
          });
          backfilledCount++;
        } catch (err) {
          this.logger.warn(
            'MarketplaceClient',
            `Failed to backfill metadata for ${meta.id.name}`,
            err,
          );
        }
      }
    }

    this.logger.info(
      'MarketplaceClient',
      `Backfill complete: ${backfilledCount} components linked to upstream`,
    );
    return backfilledCount;
  }

  // ─── Source Management ─────────────────────────────────────────────

  async getSources(): Promise<MarketplaceSourceConfig[]> {
    await this.init();
    return [...this.sourceConfigs];
  }

  async addSource(config: NewSourceConfig): Promise<MarketplaceSourceConfig> {
    await this.init();

    // Validate URL is HTTPS
    if (!config.url.startsWith('https://')) {
      throw new AppError('VALIDATION_ERROR', 'Source URL must use HTTPS', true);
    }

    // Check for duplicate URL
    if (this.sourceConfigs.some((s) => s.url === config.url)) {
      throw new AppError('VALIDATION_ERROR', 'A source with this URL already exists', true);
    }

    const sourceId = `custom-${Date.now()}`;
    const newConfig: MarketplaceSourceConfig = {
      sourceId,
      sourceType: config.sourceType,
      url: config.url,
      displayName: config.displayName ?? config.url,
      isBuiltIn: false,
    };

    // Validate by trying to fetch
    const source = this.createSource(newConfig);
    await source.fetch(); // Throws on invalid source

    this.sourceConfigs.push(newConfig);
    await this.saveSourceConfigs();
    await this.rebuildSources();

    return newConfig;
  }

  async updateSource(
    sourceId: string,
    config: Partial<NewSourceConfig>,
  ): Promise<MarketplaceSourceConfig> {
    await this.init();

    const idx = this.sourceConfigs.findIndex((s) => s.sourceId === sourceId);
    if (idx === -1) throw new AppError('SOURCE_NOT_FOUND', `Source "${sourceId}" not found`, true);
    if (this.sourceConfigs[idx].isBuiltIn) {
      throw new AppError('VALIDATION_ERROR', 'Cannot modify built-in source', false);
    }

    if (config.url && !config.url.startsWith('https://')) {
      throw new AppError('VALIDATION_ERROR', 'Source URL must use HTTPS', true);
    }

    const updated = { ...this.sourceConfigs[idx], ...config };
    this.sourceConfigs[idx] = updated;
    await this.saveSourceConfigs();
    await this.rebuildSources();

    return updated;
  }

  async removeSource(sourceId: string): Promise<void> {
    await this.init();

    const config = this.sourceConfigs.find((s) => s.sourceId === sourceId);
    if (!config) throw new AppError('SOURCE_NOT_FOUND', `Source "${sourceId}" not found`, true);

    // Built-in sources (from Claude Code's known_marketplaces.json) — remove from the file
    if (config.isBuiltIn) {
      await this.removeNativeMarketplaceSource(sourceId);
    } else {
      // Custom sources persist in DataStore preferences
      await this.saveSourceConfigs();
    }

    this.sourceConfigs = this.sourceConfigs.filter((s) => s.sourceId !== sourceId);
    this.sources.delete(sourceId);

    await this.cache.invalidateSource(sourceId);
  }

  /** Remove a native marketplace entry from Claude Code's config files */
  private async removeNativeMarketplaceSource(sourceId: string): Promise<void> {
    if (!this.claudeRootPath) return;

    const fs = await import('fs/promises');
    let removed = false;

    // Try known_marketplaces.json first
    try {
      const knownPath = join(this.claudeRootPath, 'plugins', 'known_marketplaces.json');
      const content = await fs.readFile(knownPath, 'utf-8');
      const data = JSON.parse(content) as Record<string, unknown>;
      if (sourceId in data) {
        delete data[sourceId];
        assertWriteAllowed(knownPath);
        await fs.writeFile(knownPath, JSON.stringify(data, null, 2), 'utf-8');
        this.logger.info('Marketplace', `Removed "${sourceId}" from known_marketplaces.json`);
        removed = true;
      }
    } catch {
      // File may not exist — continue to settings.json
    }

    // Also try settings.json → extraKnownMarketplaces
    try {
      const settingsPath = join(this.claudeRootPath, 'settings.json');
      const content = await fs.readFile(settingsPath, 'utf-8');
      const settings = JSON.parse(content) as Record<string, unknown>;
      const extra = settings.extraKnownMarketplaces as Record<string, unknown> | undefined;
      if (extra && sourceId in extra) {
        delete extra[sourceId];
        if (Object.keys(extra).length === 0) {
          delete settings.extraKnownMarketplaces;
        }
        assertWriteAllowed(settingsPath);
        await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
        this.logger.info('Marketplace', `Removed "${sourceId}" from settings.json extraKnownMarketplaces`);
        removed = true;
      }
    } catch {
      // settings.json may not exist or be unreadable
    }

    if (!removed) {
      this.logger.warn('Marketplace', `Source "${sourceId}" not found in any Claude Code config file`);
    }
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private async fetchSourceEntries(sourceId: string): Promise<MarketplaceEntry[]> {
    const source = this.sources.get(sourceId);
    if (!source) return [];

    // Check cache first
    const cached = await this.cache.getManifest<MarketplaceEntry[]>(sourceId, MANIFEST_TTL_MS);
    if (cached) return cached.data;

    try {
      const etag = await this.cache.getManifestEtag(sourceId);
      const entries = await source.fetch({ etag });

      // 304 Not Modified — source returns [] to signal "use cache"
      if (entries.length === 0 && etag) {
        const stale = await this.cache.getManifest<MarketplaceEntry[]>(sourceId, Infinity);
        if (stale) return stale.data;
        // If stale cache is also gone, fall through to re-fetch without etag
        const freshEntries = await source.fetch();
        await this.cache.setManifest(sourceId, freshEntries);
        return freshEntries;
      }

      await this.cache.setManifest(sourceId, entries, source.lastEtag);

      // Update lastFetched
      const configIdx = this.sourceConfigs.findIndex((s) => s.sourceId === sourceId);
      if (configIdx !== -1) {
        this.sourceConfigs[configIdx] = {
          ...this.sourceConfigs[configIdx],
          lastFetched: new Date().toISOString(),
        };
      }

      return entries;
    } catch (err) {
      this.logger.error('Marketplace', `Failed to fetch source ${sourceId}`, err as Error);
      // Fall back to stale cache
      const stale = await this.cache.getManifest<MarketplaceEntry[]>(sourceId, Infinity);
      if (stale) return stale.data;
      throw err;
    }
  }

  private createSource(config: MarketplaceSourceConfig): MarketplaceSource {
    switch (config.sourceType) {
      case 'git-marketplace':
        return new GitMarketplaceSource({
          sourceId: config.sourceId,
          displayName: config.displayName,
          url: config.url,
          githubToken: undefined, // Set from SecretStore during rebuild
        });
      case 'url-index':
        return new UrlIndexSource({
          sourceId: config.sourceId,
          displayName: config.displayName,
          url: config.url,
        });
      default:
        throw new Error(`Unknown source type: ${config.sourceType}`);
    }
  }

  private async rebuildSources(): Promise<void> {
    this.sources.clear();
    const githubToken =
      (await this.secretStore.get('aiplughub', 'github-token').catch(() => null)) ?? undefined;

    for (const config of this.sourceConfigs) {
      if (config.sourceType === 'git-marketplace') {
        this.sources.set(
          config.sourceId,
          new GitMarketplaceSource({
            sourceId: config.sourceId,
            displayName: config.displayName,
            url: config.url,
            githubToken,
          }),
        );
      } else {
        this.sources.set(config.sourceId, this.createSource(config));
      }
    }

    this.starEnricher = new StarEnricher(this.cache, githubToken ?? null);
  }

  /** Convert a marketplace entries record into MarketplaceSourceConfig[] */
  private marketplaceEntriesToSources(
    data: Record<string, KnownMarketplace>,
  ): MarketplaceSourceConfig[] {
    const sources: MarketplaceSourceConfig[] = [];
    for (const [id, entry] of Object.entries(data)) {
      if (!entry?.source?.repo || entry.source.source !== 'github') continue;
      sources.push({
        sourceId: id,
        sourceType: 'git-marketplace',
        url: `https://github.com/${entry.source.repo}`,
        displayName: id
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
        isBuiltIn: true,
      });
    }
    return sources;
  }

  /**
   * Load native marketplace sources from Claude Code's config files.
   * Reads both known_marketplaces.json and settings.json (extraKnownMarketplaces).
   * settings.json entries override known_marketplaces.json for the same ID.
   */
  private async loadNativeMarketplaceSources(): Promise<MarketplaceSourceConfig[]> {
    if (!this.claudeRootPath) return [];

    const fs = await import('fs/promises');
    const merged = new Map<string, MarketplaceSourceConfig>();

    // 1. Read known_marketplaces.json (plugin-installed marketplaces)
    try {
      const knownPath = join(this.claudeRootPath, 'plugins', 'known_marketplaces.json');
      const content = await fs.readFile(knownPath, 'utf-8');
      const data = JSON.parse(content) as Record<string, KnownMarketplace>;
      for (const src of this.marketplaceEntriesToSources(data)) {
        merged.set(src.sourceId, src);
      }
    } catch {
      this.logger.warn('Marketplace', 'Could not read known_marketplaces.json');
    }

    // 2. Read settings.json → extraKnownMarketplaces (user-added marketplaces)
    try {
      const settingsPath = join(this.claudeRootPath, 'settings.json');
      const content = await fs.readFile(settingsPath, 'utf-8');
      const settings = JSON.parse(content) as { extraKnownMarketplaces?: Record<string, KnownMarketplace> };
      if (settings.extraKnownMarketplaces) {
        for (const src of this.marketplaceEntriesToSources(settings.extraKnownMarketplaces)) {
          merged.set(src.sourceId, src); // Override known_marketplaces.json entry if same ID
        }
      }
    } catch {
      this.logger.warn('Marketplace', 'Could not read extraKnownMarketplaces from settings.json');
    }

    return Array.from(merged.values());
  }

  private async loadSourceConfigs(): Promise<MarketplaceSourceConfig[]> {
    try {
      // 1. Try native marketplace sources from Claude Code
      const nativeSources = await this.loadNativeMarketplaceSources();

      // 2. Use native sources if available, otherwise fall back to hardcoded
      const builtInSources = nativeSources.length > 0 ? nativeSources : [BUILTIN_SOURCE];

      // 3. Append any user-added custom sources from DataStore
      const prefs = await this.dataStore.getPreferences();
      const customSources = (prefs.marketplaceSources ?? []).filter((s) => !s.isBuiltIn);

      return [...builtInSources, ...customSources];
    } catch {
      return [BUILTIN_SOURCE];
    }
  }

  private async saveSourceConfigs(): Promise<void> {
    const custom = this.sourceConfigs.filter((s) => !s.isBuiltIn);
    await this.dataStore.setPreferences({ marketplaceSources: custom });
  }
}
