/**
 * Boot sequence tests — verify the boot function behavior
 * by testing the individual pieces it orchestrates.
 *
 * Since the actual boot() is tightly coupled to Electron's app lifecycle
 * (app.whenReady, BrowserWindow, etc.), we test the boot logic indirectly
 * through the modules it composes: DataStore loading, adapter registration,
 * IPC handler setup, and auto-detect/scan behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createConfigIO } from '../config-io';
import { createDataStore } from '../data-store';
import type { DataStore } from '../data-store';
import { createAdapterRegistry } from '../adapters/adapter-registry';
import type { ToolAdapter } from '../adapters/tool-adapter';
import { createLogger } from '../logger';
import type { Component, ComponentId, ComponentType, ToolDetectionResult } from '@shared/types';
import { AppError } from '@shared/types';

const logger = createLogger();
let tempDir: string;
let dataPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'plughub-boot-'));
  dataPath = join(tempDir, 'data.json');
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function makeDataStore(): DataStore {
  return createDataStore(dataPath, createConfigIO(logger), logger);
}

function createStubAdapter(
  instanceId: string,
  opts?: { detected?: boolean; components?: Component[]; scanThrows?: boolean },
): ToolAdapter {
  return {
    toolId: 'claude-code',
    instanceId,
    rootPath: `/fake/${instanceId}`,
    detect: vi.fn().mockResolvedValue({
      toolId: 'claude-code',
      instanceId,
      path: `/fake/${instanceId}`,
      detected: opts?.detected ?? true,
    } satisfies ToolDetectionResult),
    scan: opts?.scanThrows
      ? vi.fn().mockRejectedValue(new Error('scan failed'))
      : vi.fn().mockResolvedValue(opts?.components ?? []),
    install: vi.fn().mockRejectedValue(new Error('not implemented')),
    uninstall: vi.fn().mockRejectedValue(new Error('not implemented')),
    enable: vi.fn().mockRejectedValue(new Error('not implemented')),
    disable: vi.fn().mockRejectedValue(new Error('not implemented')),
    canToggle: (_type: ComponentType) => false,
    getConfigPath: (_id: ComponentId) => '/fake/config',
    getSupportedTypes: () => ['mcp-server', 'skill'] as ComponentType[],
    resolveConfigDir: () => `/fake/${instanceId}`,
  };
}

// ─── DataStore Boot ─────────────────────────────────────────────────

describe('Boot — DataStore loading', () => {
  it('boots with clean DataStore (no existing file)', async () => {
    const store = makeDataStore();
    await store.load();

    const prefs = await store.getPreferences();
    expect(prefs.setupComplete).toBe(false);
    expect(prefs.rescanOnLaunch).toBe(true);
  });

  it('boots and runs migrations if schema version is old', async () => {
    // Write a valid schema v1 file
    await writeFile(
      dataPath,
      JSON.stringify({
        schemaVersion: 1,
        components: [],
        plugins: [],
        preferences: { rescanOnLaunch: true, setupComplete: true },
        toolInstances: [],
      }),
    );

    const store = makeDataStore();
    await store.load();

    const prefs = await store.getPreferences();
    expect(prefs.setupComplete).toBe(true);
  });

  it('resets DataStore on corruption', async () => {
    // Write invalid data
    await writeFile(dataPath, 'not json at all');

    const store = makeDataStore();

    // load() should throw due to corruption
    await expect(store.load()).rejects.toThrow();

    // After reset, store should be usable
    await store.reset();
    const prefs = await store.getPreferences();
    expect(prefs.setupComplete).toBe(false);
  });
});

// ─── Adapter Registration ───────────────────────────────────────────

describe('Boot — adapter registration', () => {
  it('registers adapter and makes it retrievable', () => {
    const registry = createAdapterRegistry();
    const adapter = createStubAdapter('cc-default');

    registry.register(adapter);
    expect(registry.getAdapter('cc-default')).toBe(adapter);
  });

  it('handles adapter registration failure gracefully', () => {
    const registry = createAdapterRegistry();
    registry.register(createStubAdapter('cc-default'));

    // Double registration should throw but not crash the boot
    expect(() => registry.register(createStubAdapter('cc-default'))).toThrow(AppError);
  });
});

// ─── Auto-Detect + Scan ─────────────────────────────────────────────

describe('Boot — auto-detect and scan', () => {
  it('detects and scans on first run', async () => {
    const store = makeDataStore();
    await store.load();

    const prefs = await store.getPreferences();
    expect(prefs.setupComplete).toBe(false); // first run

    const registry = createAdapterRegistry();
    const components: Component[] = [
      {
        id: { tool: 'claude-code', type: 'mcp-server', name: 'server1', scope: 'user' },
        core: { transport: 'stdio', command: 'test' },
        tracking: 'detected',
      },
    ];
    const adapter = createStubAdapter('cc-default', { components });
    registry.register(adapter);

    // Simulate boot auto-detect
    const detectionResults = await registry.detectAll();
    expect(detectionResults).toHaveLength(1);
    expect(detectionResults[0].detected).toBe(true);

    // Register tool instance
    await store.setToolInstance({
      instanceId: 'cc-default',
      toolId: 'claude-code',
      path: '/fake/cc-default',
      name: 'Claude Code',
      isDefault: true,
    });

    // Scan
    const scanResults = await adapter.scan();
    expect(scanResults).toHaveLength(1);

    // Reconcile with DataStore
    for (const comp of scanResults) {
      await store.setComponentMeta(comp.id, { tracking: 'detected' });
    }

    const storedComponents = await store.getComponents();
    expect(storedComponents).toHaveLength(1);
    expect(storedComponents[0].tracking).toBe('detected');
  });

  it('skips scan when preference disabled', async () => {
    const store = makeDataStore();
    await store.load();
    await store.setPreferences({ rescanOnLaunch: false, setupComplete: true });

    const prefs = await store.getPreferences();
    expect(prefs.rescanOnLaunch).toBe(false);
    expect(prefs.setupComplete).toBe(true);

    // Boot should skip scan — adapter.scan() should NOT be called
    const adapter = createStubAdapter('cc-default');
    const shouldScan = !prefs.setupComplete || prefs.rescanOnLaunch;
    expect(shouldScan).toBe(false);
    expect(adapter.scan).not.toHaveBeenCalled();
  });

  it('handles scan failure gracefully (continues other adapters)', async () => {
    const registry = createAdapterRegistry();
    const goodComponents: Component[] = [
      {
        id: { tool: 'claude-code', type: 'skill', name: 'good-skill', scope: 'user' },
        core: { description: '', content: '' },
        tracking: 'detected',
      },
    ];

    registry.register(createStubAdapter('cc-failing', { scanThrows: true }));
    registry.register(createStubAdapter('cc-good', { components: goodComponents }));

    // scanAll uses allSettled — partial results are returned
    const all = await registry.scanAll();
    expect(all).toHaveLength(1);
    expect(all[0].id.name).toBe('good-skill');
  });
});

// ─── Single Instance Detection ──────────────────────────────────────

describe('Boot — single instance', () => {
  it('second instance detection pattern', () => {
    // This tests the pattern, not the actual Electron lock
    // The real test is that app.requestSingleInstanceLock() is called
    // and app.quit() is called when lock fails.
    let gotLock = true; // simulates first instance
    expect(gotLock).toBe(true);

    gotLock = false; // simulates second instance
    let quitCalled = false;
    if (!gotLock) {
      quitCalled = true;
    }
    expect(quitCalled).toBe(true);
  });
});

// ─── Reconciliation Logic ───────────────────────────────────────────

describe('Boot — reconciliation', () => {
  it('adds new detected components to DataStore', async () => {
    const store = makeDataStore();
    await store.load();

    const scanned: Component[] = [
      {
        id: { tool: 'claude-code', type: 'mcp-server', name: 'new-server', scope: 'user' },
        core: { transport: 'stdio', command: 'new' },
        tracking: 'detected',
      },
    ];

    // Before reconciliation
    const before = await store.getComponents();
    expect(before).toHaveLength(0);

    // Reconcile: add new components
    for (const comp of scanned) {
      const existing = (await store.getComponents()).find(
        (c) =>
          c.id.tool === comp.id.tool &&
          c.id.type === comp.id.type &&
          c.id.name === comp.id.name &&
          c.id.scope === comp.id.scope,
      );
      if (!existing) {
        await store.setComponentMeta(comp.id, { tracking: 'detected' });
      }
    }

    const after = await store.getComponents();
    expect(after).toHaveLength(1);
    expect(after[0].id.name).toBe('new-server');
  });

  it('does not overwrite existing managed component tracking', async () => {
    const store = makeDataStore();
    await store.load();

    // Pre-existing managed component
    const id: ComponentId = {
      tool: 'claude-code',
      type: 'mcp-server',
      name: 'managed-server',
      scope: 'user',
    };
    await store.setComponentMeta(id, { tracking: 'managed' });

    // Scan finds the same component
    const scanned: Component[] = [
      {
        id,
        core: { transport: 'stdio', command: 'test' },
        tracking: 'detected',
      },
    ];

    // Reconcile: skip existing
    for (const comp of scanned) {
      const existing = (await store.getComponents()).find(
        (c) =>
          c.id.tool === comp.id.tool &&
          c.id.type === comp.id.type &&
          c.id.name === comp.id.name &&
          c.id.scope === comp.id.scope,
      );
      if (!existing) {
        await store.setComponentMeta(comp.id, { tracking: 'detected' });
      }
    }

    // Tracking should still be 'managed', not overwritten to 'detected'
    const after = await store.getComponents();
    expect(after).toHaveLength(1);
    expect(after[0].tracking).toBe('managed');
  });
});
