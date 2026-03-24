/**
 * DataStore — persistence for the plugin manager's own metadata.
 * Does NOT store tool config data (that lives in native config files).
 * Source: 4B-architecture/system-design.md S1.4
 *
 * MVP: JSON file with schema versioning and migration runner.
 * Uses ConfigIO for atomic writes with backup.
 */

import type {
  ComponentId,
  ComponentMetadata,
  Plugin,
  ToolInstance,
  UserPreferences,
} from '@shared/types';
import { AppError } from '@shared/types';
import { componentIdKey } from '@shared/utils';
import type { ConfigIO } from './config-io';
import type { Logger } from './logger';

export interface DataStore {
  load(): Promise<void>;
  reset(): Promise<void>;
  getComponents(): Promise<ComponentMetadata[]>;
  setComponentMeta(id: ComponentId, meta: Partial<ComponentMetadata>): Promise<void>;
  removeComponentMeta(id: ComponentId): Promise<void>;
  getPlugins(): Promise<Plugin[]>;
  setPlugin(plugin: Plugin): Promise<void>;
  removePlugin(name: string): Promise<void>;
  getPreferences(): Promise<UserPreferences>;
  setPreferences(prefs: Partial<UserPreferences>): Promise<void>;
  getToolInstances(): Promise<ToolInstance[]>;
  setToolInstance(instance: ToolInstance): Promise<void>;
  removeToolInstance(instanceId: string): Promise<void>;
  /** Run a function with writes batched — saves once at the end instead of after each mutation. */
  batch(fn: () => Promise<void>): Promise<void>;
}

// --- Schema ----------------------------------------------------------------

const CURRENT_SCHEMA_VERSION = 1;

type DataStoreSchema = {
  schemaVersion: number;
  components: ComponentMetadata[];
  plugins: Plugin[];
  preferences: UserPreferences;
  toolInstances: ToolInstance[];
};

function defaultSchema(): DataStoreSchema {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    components: [],
    plugins: [],
    preferences: { rescanOnLaunch: true, setupComplete: false },
    toolInstances: [],
  };
}

// --- Migration -------------------------------------------------------------

type Migration = {
  fromVersion: number;
  toVersion: number;
  migrate(data: unknown): unknown;
};

const migrations: Migration[] = [
  // Example: when schemaVersion 2 is added
  // { fromVersion: 1, toVersion: 2, migrate(data) { ... return data; } }
];

function runMigrations(data: DataStoreSchema, logger: Logger): DataStoreSchema {
  let current = data;

  if (current.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new AppError(
      'MIGRATION_FAILED',
      `Data file is from a newer version (schema v${current.schemaVersion}, ` +
        `this app supports v${CURRENT_SCHEMA_VERSION}). Please update AI Plug Hub.`,
      false,
    );
  }

  while (current.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const migration = migrations.find((m) => m.fromVersion === current.schemaVersion);
    if (!migration) {
      throw new AppError(
        'MIGRATION_FAILED',
        `No migration path from schema version ${current.schemaVersion} to ${CURRENT_SCHEMA_VERSION}`,
        false,
      );
    }
    logger.info('DataStore', `Migrating schema v${migration.fromVersion} -> v${migration.toVersion}`);
    current = migration.migrate(current) as DataStoreSchema;
    current.schemaVersion = migration.toVersion;
  }

  return current;
}

// --- Implementation --------------------------------------------------------

export function createDataStore(
  filePath: string,
  configIO: ConfigIO,
  logger: Logger,
): DataStore {
  const MODULE = 'DataStore';
  let data: DataStoreSchema = defaultSchema();
  let loaded = false;
  let batching = false;
  let batchDirty = false;

  function ensureLoaded(): void {
    if (!loaded) {
      throw new AppError('NOT_LOADED', 'DataStore.load() must be called before using the store', false);
    }
  }

  async function save(): Promise<void> {
    if (batching) {
      batchDirty = true;
      return;
    }
    await configIO.writeJSON(filePath, data);
  }

  return {
    async load(): Promise<void> {
      const exists = await configIO.exists(filePath);
      if (!exists) {
        logger.info(MODULE, `No data file found, creating default: ${filePath}`);
        data = defaultSchema();
        await save();
        loaded = true;
        return;
      }

      try {
        const raw = (await configIO.readJSON(filePath)) as DataStoreSchema;

        if (!raw || typeof raw !== 'object' || !('schemaVersion' in raw)) {
          throw new AppError(
            'CONFIG_CORRUPTED',
            'Data file missing schemaVersion',
            true,
          );
        }

        data = runMigrations(raw, logger);

        // Ensure all expected fields exist (defensive against partial files)
        data.components ??= [];
        data.plugins ??= [];
        data.preferences ??= { rescanOnLaunch: true, setupComplete: false };
        data.toolInstances ??= [];

        loaded = true;

        logger.info(MODULE, `Loaded data file: ${filePath}`, {
          components: data.components.length,
          plugins: data.plugins.length,
          toolInstances: data.toolInstances.length,
        });
      } catch (err) {
        if (err instanceof AppError) {
          logger.error(MODULE, `Failed to load data file: ${filePath}`, err);
          throw err;
        }
        logger.error(MODULE, `Failed to load data file: ${filePath}`, err as Error);
        throw new AppError(
          'CONFIG_CORRUPTED',
          `Failed to load data file: ${(err as Error).message}`,
          true,
        );
      }
    },

    async reset(): Promise<void> {
      // Back up current file via save (which triggers backup in ConfigIO)
      try {
        await save();
      } catch {
        // If save fails (e.g., file doesn't exist yet), that's fine
      }
      data = defaultSchema();
      await save();
      loaded = true;
    },

    async getComponents(): Promise<ComponentMetadata[]> {
      ensureLoaded();
      return [...data.components];
    },

    async setComponentMeta(id: ComponentId, meta: Partial<ComponentMetadata>): Promise<void> {
      ensureLoaded();
      const key = componentIdKey(id);
      const idx = data.components.findIndex((c) => componentIdKey(c.id) === key);

      const base = idx >= 0 ? data.components[idx] : { tracking: 'detected' as const };
      const updated = { ...base, ...meta, id };
      if (idx >= 0) data.components[idx] = updated;
      else data.components.push(updated);

      await save();
    },

    async removeComponentMeta(id: ComponentId): Promise<void> {
      ensureLoaded();
      const key = componentIdKey(id);
      data.components = data.components.filter((c) => componentIdKey(c.id) !== key);
      await save();
    },

    async getPlugins(): Promise<Plugin[]> {
      ensureLoaded();
      return [...data.plugins];
    },

    async setPlugin(plugin: Plugin): Promise<void> {
      ensureLoaded();
      const idx = data.plugins.findIndex((p) => p.name === plugin.name);
      if (idx >= 0) {
        data.plugins[idx] = plugin;
      } else {
        data.plugins.push(plugin);
      }
      await save();
    },

    async removePlugin(name: string): Promise<void> {
      ensureLoaded();
      data.plugins = data.plugins.filter((p) => p.name !== name);
      await save();
    },

    async getPreferences(): Promise<UserPreferences> {
      ensureLoaded();
      return { ...data.preferences };
    },

    async setPreferences(prefs: Partial<UserPreferences>): Promise<void> {
      ensureLoaded();
      data.preferences = { ...data.preferences, ...prefs };
      await save();
    },

    async getToolInstances(): Promise<ToolInstance[]> {
      ensureLoaded();
      return [...data.toolInstances];
    },

    async setToolInstance(instance: ToolInstance): Promise<void> {
      ensureLoaded();
      const idx = data.toolInstances.findIndex((t) => t.instanceId === instance.instanceId);
      if (idx >= 0) {
        data.toolInstances[idx] = instance;
      } else {
        data.toolInstances.push(instance);
      }
      await save();
    },

    async removeToolInstance(instanceId: string): Promise<void> {
      ensureLoaded();
      data.toolInstances = data.toolInstances.filter((t) => t.instanceId !== instanceId);
      await save();
    },

    async batch(fn: () => Promise<void>): Promise<void> {
      if (batching) {
        // Already batching — just run the function, outer batch owns the flush
        await fn();
        return;
      }
      batching = true;
      batchDirty = false;
      try {
        await fn();
      } finally {
        batching = false;
        if (batchDirty) {
          batchDirty = false;
          await configIO.writeJSON(filePath, data);
        }
      }
    },
  };
}
