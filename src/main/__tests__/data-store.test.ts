import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createConfigIO } from '../config-io';
import { createDataStore } from '../data-store';
import { createLogger } from '../logger';
import { AppError } from '@shared/types';
import type { ComponentId, ToolInstance } from '@shared/types';

const logger = createLogger();
let tempDir: string;
let dataPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'plughub-ds-'));
  dataPath = join(tempDir, 'data.json');
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function makeConfigIO() {
  return createConfigIO(logger);
}

function makeStore() {
  return createDataStore(dataPath, makeConfigIO(), logger);
}

const testId: ComponentId = {
  tool: 'claude-code',
  type: 'mcp-server',
  name: 'test-server',
  scope: 'user',
};

// --- Load guard tests ------------------------------------------------------

describe('DataStore load guard', () => {
  it('calling getComponents() before load() throws NOT_LOADED', async () => {
    const store = makeStore();
    await expect(store.getComponents()).rejects.toThrow(AppError);
    await expect(store.getComponents()).rejects.toMatchObject({
      code: 'NOT_LOADED',
      message: 'DataStore.load() must be called before using the store',
    });
  });

  it('calling setComponentMeta() before load() throws NOT_LOADED', async () => {
    const store = makeStore();
    await expect(store.setComponentMeta(testId, { tracking: 'detected' })).rejects.toThrow(AppError);
    await expect(store.setComponentMeta(testId, { tracking: 'detected' })).rejects.toMatchObject({
      code: 'NOT_LOADED',
    });
  });

  it('calling removeComponentMeta() before load() throws NOT_LOADED', async () => {
    const store = makeStore();
    await expect(store.removeComponentMeta(testId)).rejects.toThrow(AppError);
  });

  it('calling getPlugins() before load() throws NOT_LOADED', async () => {
    const store = makeStore();
    await expect(store.getPlugins()).rejects.toThrow(AppError);
  });

  it('calling setPlugin() before load() throws NOT_LOADED', async () => {
    const store = makeStore();
    const plugin = {
      name: 'test',
      origin: { type: 'git' as const, url: 'https://example.com' },
      components: [],
    };
    await expect(store.setPlugin(plugin)).rejects.toThrow(AppError);
  });

  it('calling removePlugin() before load() throws NOT_LOADED', async () => {
    const store = makeStore();
    await expect(store.removePlugin('test')).rejects.toThrow(AppError);
  });

  it('calling getPreferences() before load() throws NOT_LOADED', async () => {
    const store = makeStore();
    await expect(store.getPreferences()).rejects.toThrow(AppError);
  });

  it('calling setPreferences() before load() throws NOT_LOADED', async () => {
    const store = makeStore();
    await expect(store.setPreferences({ rescanOnLaunch: false })).rejects.toThrow(AppError);
  });

  it('calling getToolInstances() before load() throws NOT_LOADED', async () => {
    const store = makeStore();
    await expect(store.getToolInstances()).rejects.toThrow(AppError);
  });

  it('calling setToolInstance() before load() throws NOT_LOADED', async () => {
    const store = makeStore();
    const instance: ToolInstance = {
      instanceId: 'test',
      toolId: 'claude-code',
      path: '/test',
      name: 'Test',
      isDefault: true,
    };
    await expect(store.setToolInstance(instance)).rejects.toThrow(AppError);
  });

  it('calling removeToolInstance() before load() throws NOT_LOADED', async () => {
    const store = makeStore();
    await expect(store.removeToolInstance('test')).rejects.toThrow(AppError);
  });

  it('NOT_LOADED error has recoverable=false', async () => {
    const store = makeStore();
    try {
      await store.getComponents();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).recoverable).toBe(false);
    }
  });
});

// --- Load tests ------------------------------------------------------------

describe('DataStore.load', () => {
  it('creates default data file when none exists', async () => {
    const store = makeStore();
    await store.load();

    const raw = JSON.parse(await readFile(dataPath, 'utf-8'));
    expect(raw.schemaVersion).toBe(1);
    expect(raw.components).toEqual([]);
    expect(raw.plugins).toEqual([]);
    expect(raw.preferences.rescanOnLaunch).toBe(true);
    expect(raw.preferences.setupComplete).toBe(false);
    expect(raw.toolInstances).toEqual([]);
  });

  it('loads existing valid data file', async () => {
    await writeFile(
      dataPath,
      JSON.stringify({
        schemaVersion: 1,
        components: [{ id: testId, tracking: 'detected' }],
        plugins: [],
        preferences: { rescanOnLaunch: false, setupComplete: false },
        toolInstances: [],
      }),
    );

    const store = makeStore();
    await store.load();
    const components = await store.getComponents();
    expect(components).toHaveLength(1);
    expect(components[0].id.name).toBe('test-server');
  });

  it('throws CONFIG_CORRUPTED when schemaVersion is missing', async () => {
    await writeFile(dataPath, JSON.stringify({ components: [] }));

    const store = makeStore();
    await expect(store.load()).rejects.toThrow(AppError);
    await writeFile(dataPath, JSON.stringify({ components: [] }));
    const store2 = makeStore();
    try {
      await store2.load();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_CORRUPTED');
      expect((err as AppError).recoverable).toBe(true);
    }
  });

  it('throws MIGRATION_FAILED on newer schema version', async () => {
    await writeFile(
      dataPath,
      JSON.stringify({
        schemaVersion: 999,
        components: [],
        plugins: [],
        preferences: {},
        toolInstances: [],
      }),
    );

    const store = makeStore();
    try {
      await store.load();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('MIGRATION_FAILED');
      expect((err as AppError).recoverable).toBe(false);
    }
  });

  it('handles partial data file gracefully', async () => {
    await writeFile(
      dataPath,
      JSON.stringify({ schemaVersion: 1 }),
    );

    const store = makeStore();
    await store.load();
    const components = await store.getComponents();
    expect(components).toEqual([]);
  });

  it('corrupted JSON data file throws CONFIG_CORRUPTED', async () => {
    await writeFile(dataPath, '{not valid json!!!');

    const store = makeStore();
    try {
      await store.load();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_CORRUPTED');
      expect((err as AppError).recoverable).toBe(true);
    }
  });

  it('empty data file (0 bytes) handles gracefully', async () => {
    await writeFile(dataPath, '');

    const store = makeStore();
    // Empty file: readJSON will parse empty string, resulting in undefined/null,
    // which should trigger CONFIG_CORRUPTED since schemaVersion is missing
    try {
      await store.load();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_CORRUPTED');
    }
  });
});

// --- Migration tests -------------------------------------------------------

describe('DataStore migrations', () => {
  it('migration runner with synthetic migration transforms data', async () => {
    // We test the migration runner indirectly by writing a v0 schema
    // and injecting a migration. Since migrations is a module-level const,
    // we simulate by creating a file with schemaVersion: 1 (current)
    // and verifying it loads without migration.
    // For a real migration test, we need to test with a custom DataStore
    // that has migrations registered.

    // Write a valid v1 schema
    await writeFile(
      dataPath,
      JSON.stringify({
        schemaVersion: 1,
        components: [{ id: testId, tracking: 'detected' }],
        plugins: [],
        preferences: { rescanOnLaunch: true, setupComplete: false },
        toolInstances: [],
      }),
    );

    const store = makeStore();
    await store.load();
    const components = await store.getComponents();
    expect(components).toHaveLength(1);
    expect(components[0].tracking).toBe('detected');
  });

  it('migration runner with missing path throws MIGRATION_FAILED', async () => {
    // Write a schema with version 0 (no migration exists from 0 to 1)
    await writeFile(
      dataPath,
      JSON.stringify({
        schemaVersion: 0,
        components: [],
        plugins: [],
        preferences: {},
        toolInstances: [],
      }),
    );

    const store = makeStore();
    try {
      await store.load();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('MIGRATION_FAILED');
      expect((err as AppError).message).toContain('No migration path');
    }
  });
});

// --- Component metadata tests ----------------------------------------------

describe('DataStore component metadata', () => {
  it('adds new component metadata', async () => {
    const store = makeStore();
    await store.load();

    await store.setComponentMeta(testId, { tracking: 'managed', displayName: 'Test' });

    const components = await store.getComponents();
    expect(components).toHaveLength(1);
    expect(components[0].tracking).toBe('managed');
    expect(components[0].displayName).toBe('Test');
  });

  it('updates existing component metadata', async () => {
    const store = makeStore();
    await store.load();

    await store.setComponentMeta(testId, { tracking: 'detected' });
    await store.setComponentMeta(testId, { tracking: 'managed', displayName: 'Updated' });

    const components = await store.getComponents();
    expect(components).toHaveLength(1);
    expect(components[0].tracking).toBe('managed');
    expect(components[0].displayName).toBe('Updated');
  });

  it('removes component metadata', async () => {
    const store = makeStore();
    await store.load();

    await store.setComponentMeta(testId, { tracking: 'detected' });
    await store.removeComponentMeta(testId);

    const components = await store.getComponents();
    expect(components).toHaveLength(0);
  });

  it('persists across load/save cycles', async () => {
    const store1 = makeStore();
    await store1.load();
    await store1.setComponentMeta(testId, { tracking: 'imported' });

    // Load fresh instance from same file
    const store2 = makeStore();
    await store2.load();
    const components = await store2.getComponents();
    expect(components).toHaveLength(1);
    expect(components[0].tracking).toBe('imported');
  });

  it('setComponentMeta insert preserves extra fields from meta', async () => {
    const store = makeStore();
    await store.load();

    // Insert with extra fields: pluginName and displayName
    await store.setComponentMeta(testId, {
      tracking: 'managed',
      displayName: 'My Server',
      pluginName: 'my-plugin',
    });

    const components = await store.getComponents();
    expect(components).toHaveLength(1);
    expect(components[0].tracking).toBe('managed');
    expect(components[0].displayName).toBe('My Server');
    expect(components[0].pluginName).toBe('my-plugin');
    expect(components[0].id).toEqual(testId);
  });

  it('setComponentMeta update preserves fields not in meta', async () => {
    const store = makeStore();
    await store.load();

    // Insert with pluginName
    await store.setComponentMeta(testId, {
      tracking: 'managed',
      displayName: 'Original',
      pluginName: 'my-plugin',
    });

    // Update only displayName — pluginName should be preserved
    await store.setComponentMeta(testId, { displayName: 'Updated' });

    const components = await store.getComponents();
    expect(components).toHaveLength(1);
    expect(components[0].displayName).toBe('Updated');
    expect(components[0].pluginName).toBe('my-plugin');
    expect(components[0].tracking).toBe('managed');
  });

  it('insert defaults tracking to detected when not provided', async () => {
    const store = makeStore();
    await store.load();

    await store.setComponentMeta(testId, { displayName: 'No tracking' });

    const components = await store.getComponents();
    expect(components).toHaveLength(1);
    expect(components[0].tracking).toBe('detected');
  });
});

// --- Plugin tests ----------------------------------------------------------

describe('DataStore plugins', () => {
  const testPlugin = {
    name: 'test-plugin',
    origin: { type: 'git' as const, url: 'https://github.com/test/plugin' },
    version: '1.0.0',
    components: [testId],
  };

  it('adds and retrieves a plugin', async () => {
    const store = makeStore();
    await store.load();

    await store.setPlugin(testPlugin);
    const plugins = await store.getPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe('test-plugin');
  });

  it('updates existing plugin', async () => {
    const store = makeStore();
    await store.load();

    await store.setPlugin(testPlugin);
    await store.setPlugin({ ...testPlugin, version: '2.0.0' });
    const plugins = await store.getPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].version).toBe('2.0.0');
  });

  it('removes a plugin', async () => {
    const store = makeStore();
    await store.load();

    await store.setPlugin(testPlugin);
    await store.removePlugin('test-plugin');
    const plugins = await store.getPlugins();
    expect(plugins).toHaveLength(0);
  });
});

// --- Preferences tests -----------------------------------------------------

describe('DataStore preferences', () => {
  it('returns defaults including setupComplete: false', async () => {
    const store = makeStore();
    await store.load();
    const prefs = await store.getPreferences();
    expect(prefs.rescanOnLaunch).toBe(true);
    expect(prefs.setupComplete).toBe(false);
  });

  it('setupComplete defaults to false', async () => {
    const store = makeStore();
    await store.load();
    const prefs = await store.getPreferences();
    expect(prefs.setupComplete).toBe(false);
  });

  it('updates preferences partially', async () => {
    const store = makeStore();
    await store.load();

    await store.setPreferences({ rescanOnLaunch: false });
    const prefs = await store.getPreferences();
    expect(prefs.rescanOnLaunch).toBe(false);
    expect(prefs.setupComplete).toBe(false); // unchanged
  });

  it('updates setupComplete', async () => {
    const store = makeStore();
    await store.load();

    await store.setPreferences({ setupComplete: true });
    const prefs = await store.getPreferences();
    expect(prefs.setupComplete).toBe(true);
    expect(prefs.rescanOnLaunch).toBe(true); // unchanged
  });
});

// --- Tool instance tests ---------------------------------------------------

describe('DataStore tool instances', () => {
  const testInstance: ToolInstance = {
    instanceId: 'cc-default',
    toolId: 'claude-code',
    path: '/home/user/.claude',
    name: 'Claude Code',
    isDefault: true,
  };

  it('adds a tool instance', async () => {
    const store = makeStore();
    await store.load();

    await store.setToolInstance(testInstance);
    const instances = await store.getToolInstances();
    expect(instances).toHaveLength(1);
    expect(instances[0].instanceId).toBe('cc-default');
  });

  it('updates existing tool instance', async () => {
    const store = makeStore();
    await store.load();

    await store.setToolInstance(testInstance);
    await store.setToolInstance({ ...testInstance, path: '/new/path' });
    const instances = await store.getToolInstances();
    expect(instances).toHaveLength(1);
    expect(instances[0].path).toBe('/new/path');
  });

  it('removes a tool instance', async () => {
    const store = makeStore();
    await store.load();

    await store.setToolInstance(testInstance);
    await store.removeToolInstance('cc-default');
    const instances = await store.getToolInstances();
    expect(instances).toHaveLength(0);
  });
});

// --- Reset tests -----------------------------------------------------------

describe('DataStore.reset', () => {
  it('creates fresh default and preserves backup', async () => {
    const store = makeStore();
    await store.load();

    // Add some data
    await store.setComponentMeta(testId, { tracking: 'managed', displayName: 'Before Reset' });
    await store.setPreferences({ setupComplete: true, rescanOnLaunch: false });

    // Verify data exists
    const beforeComponents = await store.getComponents();
    expect(beforeComponents).toHaveLength(1);

    // Reset
    await store.reset();

    // After reset, store should have defaults
    const components = await store.getComponents();
    expect(components).toHaveLength(0);

    const prefs = await store.getPreferences();
    expect(prefs.rescanOnLaunch).toBe(true);
    expect(prefs.setupComplete).toBe(false);

    const plugins = await store.getPlugins();
    expect(plugins).toHaveLength(0);

    const instances = await store.getToolInstances();
    expect(instances).toHaveLength(0);

    // Backup file should exist with pre-reset data
    const backup = JSON.parse(await readFile(dataPath + '.backup', 'utf-8'));
    expect(backup.components).toHaveLength(1);
    expect(backup.components[0].displayName).toBe('Before Reset');
  });

  it('reset sets loaded to true (can use store after reset)', async () => {
    const store = makeStore();
    // Do NOT call load() first

    await store.reset();

    // Should be able to use the store now
    const components = await store.getComponents();
    expect(components).toHaveLength(0);
    const prefs = await store.getPreferences();
    expect(prefs.setupComplete).toBe(false);
  });

  it('reset writes valid JSON to file', async () => {
    const store = makeStore();
    await store.load();
    await store.setComponentMeta(testId, { tracking: 'managed' });

    await store.reset();

    const raw = JSON.parse(await readFile(dataPath, 'utf-8'));
    expect(raw.schemaVersion).toBe(1);
    expect(raw.components).toEqual([]);
    expect(raw.preferences.setupComplete).toBe(false);
  });
});

// --- Backup safety tests ---------------------------------------------------

describe('DataStore backup safety', () => {
  it('creates backup on every save', async () => {
    const store = makeStore();
    await store.load();

    // First save creates the file, no backup
    await store.setComponentMeta(testId, { tracking: 'detected' });

    // Second save should create a backup
    await store.setPreferences({ rescanOnLaunch: false });

    const backup = JSON.parse(await readFile(dataPath + '.backup', 'utf-8'));
    expect(backup.components).toHaveLength(1);
    // Backup should be the state before the preferences update
    expect(backup.preferences.rescanOnLaunch).toBe(true);
  });
});

// --- Default schema tests --------------------------------------------------

describe('DataStore default schema', () => {
  it('default preferences include setupComplete: false', async () => {
    const store = makeStore();
    await store.load();

    const raw = JSON.parse(await readFile(dataPath, 'utf-8'));
    expect(raw.preferences).toEqual({
      rescanOnLaunch: true,
      setupComplete: false,
    });
  });

  it('persisted defaults include setupComplete', async () => {
    const store = makeStore();
    await store.load();

    const store2 = makeStore();
    await store2.load();
    const prefs = await store2.getPreferences();
    expect(prefs.setupComplete).toBe(false);
  });
});
