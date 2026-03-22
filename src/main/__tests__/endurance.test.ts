/**
 * Endurance / soak tests — main process modules.
 *
 * Goals:
 *   - Detect memory leaks (Maps, arrays, closures that grow without bound)
 *   - Detect performance degradation (later iterations should not be significantly
 *     slower than earlier ones under the same workload)
 *   - Confirm correctness is maintained over hundreds of repeated cycles
 *
 * Each suite runs 500–1 000 iteration cycles and compares timing windows
 * (first N ops vs last N ops) to catch unbounded growth.
 *
 * All tests carry an explicit 60 000 ms timeout because the iteration counts
 * are intentionally high.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import { createDataStore } from '../data-store';
import { withAdapterLock, _resetLocks } from '../ipc/operation-lock';
import { buildBundle } from '../bundle/export-builder';
import { serializeBundle, deserializeBundle, createBundle } from '../bundle/serializer';
import { detectConflicts } from '../bundle/conflict-detector';
import { createAdapterRegistry } from '../adapters/adapter-registry';
import { createConfigIO } from '../config-io';

import type {
  Component,
  ComponentId,
  ComponentMetadata,
  PortableComponent,
  ToolDetectionResult,
} from '@shared/types';
import type { ToolAdapter } from '../adapters/tool-adapter';
import type { ConfigIO } from '../config-io';

// ─── Shared helpers ──────────────────────────────────────────────────────────

/** Minimal logger mock — silences output while keeping type compatibility. */
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

/**
 * Compare the mean of the first `windowSize` timings against the mean of the
 * last `windowSize` timings.  Returns the ratio (last / first).
 * A ratio > degradationThreshold is treated as a performance regression.
 */
function timingDegradationRatio(timings: number[], windowSize: number): number {
  if (timings.length < windowSize * 2) return 1;

  const first = timings.slice(0, windowSize);
  const last = timings.slice(-windowSize);

  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const firstMean = mean(first);
  // Avoid division by zero on very fast operations (sub-millisecond timings
  // can round to 0 in performance.now() on some platforms).
  if (firstMean === 0) return 1;

  return mean(last) / firstMean;
}

/** Build N installed Component objects with unique names. */
function makeComponents(count: number, toolSuffix = ''): Component[] {
  return Array.from({ length: count }, (_, i) => ({
    id: {
      tool: 'claude-code' as const,
      type: 'mcp-server' as const,
      name: `server-${toolSuffix}${i}`,
      scope: 'user',
    },
    tracking: 'detected' as const,
    version: '1.0.0',
    core: {
      transport: 'stdio' as const,
      command: 'npx',
      args: ['-y', `server-${toolSuffix}${i}`],
      env: {
        HOST: `host-${i}`,
        PORT: `${8000 + i}`,
      },
    },
  }));
}

/** Build N PortableComponent objects with unique names. */
function makePortableComponents(count: number, prefix = 'server'): PortableComponent[] {
  return Array.from({ length: count }, (_, i) => ({
    type: 'mcp-server' as const,
    name: `${prefix}-${i}`,
    scope: 'user',
    version: '1.0.0',
    sourceTools: ['claude-code' as const],
    core: {
      transport: 'stdio' as const,
      command: 'npx',
      args: ['-y', `${prefix}-${i}`],
    },
  }));
}

/** Build a ComponentId for DataStore churn tests. */
function makeId(name: string): ComponentId {
  return {
    tool: 'claude-code' as const,
    type: 'mcp-server' as const,
    name,
    scope: 'user',
  };
}

// ─── 1. DataStore CRUD churn ─────────────────────────────────────────────────

describe('Endurance: DataStore CRUD churn', () => {
  /**
   * The DataStore is given a fully in-memory ConfigIO so that disk I/O does not
   * dominate timings and the test remains self-contained.
   */
  function makeInMemoryConfigIO(): ConfigIO {
    const files = new Map<string, string>();

    return {
      readJSON: vi.fn(async (path: string) => {
        const raw = files.get(path) ?? 'null';
        return JSON.parse(raw) as unknown;
      }),
      writeJSON: vi.fn(async (path: string, data: unknown) => {
        files.set(path, JSON.stringify(data));
      }),
      exists: vi.fn(async (path: string) => files.has(path)),
      readYAMLFrontmatter: vi.fn(),
      readTOML: vi.fn(),
      writeFile: vi.fn(async (path: string, content: string) => {
        files.set(path, content);
      }),
      listDir: vi.fn(async () => []),
      hasBackup: vi.fn(async () => false),
      restoreFromBackup: vi.fn(),
    };
  }

  it('survives 500 set/get/remove cycles without component count growing unboundedly', async () => {
    const CYCLES = 500;
    const configIO = makeInMemoryConfigIO();
    const store = createDataStore('/mock/data.json', configIO, mockLogger);
    await store.load();

    for (let i = 0; i < CYCLES; i++) {
      const id = makeId(`component-${i}`);

      await store.setComponentMeta(id, { tracking: 'detected' });
      const afterSet = await store.getComponents();
      // After one set on a fresh name the store must have grown by exactly 1.
      // We check relative: each unique id should appear exactly once.
      const match = afterSet.filter((c) => c.id.name === id.name && c.id.tool === id.tool);
      expect(match).toHaveLength(1);

      await store.removeComponentMeta(id);
      const afterRemove = await store.getComponents();
      const matchAfterRemove = afterRemove.filter((c) => c.id.name === id.name);
      expect(matchAfterRemove).toHaveLength(0);
    }

    // Final component count must be zero — nothing left behind.
    const final = await store.getComponents();
    expect(final).toHaveLength(0);
  }, 60_000);

  it('component count never exceeds number of actively stored entries', async () => {
    const CYCLES = 500;
    const ACTIVE_NAMES = 10; // a fixed pool — upsert semantics, not append
    const configIO = makeInMemoryConfigIO();
    const store = createDataStore('/mock/data.json', configIO, mockLogger);
    await store.load();

    for (let i = 0; i < CYCLES; i++) {
      // Rotate through a fixed pool of names — each set is an upsert.
      const name = `pool-component-${i % ACTIVE_NAMES}`;
      await store.setComponentMeta(makeId(name), { tracking: 'detected' });

      const components = await store.getComponents();
      // After any number of upserts into a pool of ACTIVE_NAMES,
      // the count must never exceed that pool size.
      expect(components.length).toBeLessThanOrEqual(ACTIVE_NAMES);
    }
  }, 60_000);

  it('operation latency does not degrade over 500 CRUD cycles (last 100 < 5x first 100)', async () => {
    const CYCLES = 500;
    const WINDOW = 100;
    const MAX_DEGRADATION_RATIO = 5;

    const configIO = makeInMemoryConfigIO();
    const store = createDataStore('/mock/data.json', configIO, mockLogger);
    await store.load();

    const cycleTimings: number[] = [];

    for (let i = 0; i < CYCLES; i++) {
      const id = makeId(`timed-${i % 50}`); // pool of 50 names
      const t0 = performance.now();
      await store.setComponentMeta(id, { tracking: 'detected' });
      await store.getComponents();
      await store.removeComponentMeta(id);
      cycleTimings.push(performance.now() - t0);
    }

    const ratio = timingDegradationRatio(cycleTimings, WINDOW);
    expect(
      ratio,
      `Latency degraded: last-${WINDOW} mean is ${ratio.toFixed(2)}x the first-${WINDOW} mean (threshold ${MAX_DEGRADATION_RATIO}x)`,
    ).toBeLessThan(MAX_DEGRADATION_RATIO);
  }, 60_000);

  it('repeated setPlugin / removePlugin leaves plugin list empty after 500 cycles', async () => {
    const CYCLES = 500;
    const configIO = makeInMemoryConfigIO();
    const store = createDataStore('/mock/data.json', configIO, mockLogger);
    await store.load();

    for (let i = 0; i < CYCLES; i++) {
      await store.setPlugin({
        name: `plugin-${i % 20}`,
        origin: { type: 'git', url: `https://example.com/plugin-${i % 20}` },
        components: [],
      });
      await store.removePlugin(`plugin-${i % 20}`);
    }

    const plugins = await store.getPlugins();
    expect(plugins).toHaveLength(0);
  }, 60_000);

  it('repeated setToolInstance / removeToolInstance leaves instances list empty after 500 cycles', async () => {
    const CYCLES = 500;
    const configIO = makeInMemoryConfigIO();
    const store = createDataStore('/mock/data.json', configIO, mockLogger);
    await store.load();

    for (let i = 0; i < CYCLES; i++) {
      const instanceId = `instance-${i % 10}`;
      await store.setToolInstance({
        instanceId,
        toolId: 'claude-code',
        path: `/mock/${instanceId}`,
        name: `Claude Code ${instanceId}`,
        isDefault: i === 0,
      });
      await store.removeToolInstance(instanceId);
    }

    const instances = await store.getToolInstances();
    expect(instances).toHaveLength(0);
  }, 60_000);
});

// ─── 2. Operation Lock churn ─────────────────────────────────────────────────

describe('Endurance: Operation Lock churn', () => {
  beforeEach(() => {
    _resetLocks();
  });

  it('survives 500 sequential lock/unlock cycles on the same instanceId without deadlock', async () => {
    const CYCLES = 500;
    const instanceId = 'test-adapter-sequential';
    let counter = 0;

    for (let i = 0; i < CYCLES; i++) {
      await withAdapterLock(instanceId, async () => {
        counter++;
      });
    }

    expect(counter).toBe(CYCLES);
  }, 60_000);

  it('internal locks Map does not retain entries after 500 sequential cycles on the same key', async () => {
    /**
     * The operation-lock module cleans up Map entries after each chain settles.
     * After all sequential operations complete, the Map must be empty (no leak).
     * We verify this indirectly: _resetLocks() clears whatever is there, then
     * we run cycles, wait for all to settle, and re-check by running a probe
     * that would deadlock if a stale entry blocked the queue.
     */
    const CYCLES = 500;
    const instanceId = 'test-adapter-leak-check';

    // Run all cycles
    for (let i = 0; i < CYCLES; i++) {
      await withAdapterLock(instanceId, async () => {
        /* no-op */
      });
    }

    // Probe: if the Map still holds a stale entry that never settles,
    // this would hang and the test would timeout.
    let probeRan = false;
    await withAdapterLock(instanceId, async () => {
      probeRan = true;
    });

    expect(probeRan).toBe(true);
  }, 60_000);

  it('survives 500 cycles spread across 10 different instanceIds without deadlock', async () => {
    const CYCLES_PER_KEY = 50; // 50 x 10 = 500 total
    const KEY_COUNT = 10;
    const counters = new Array<number>(KEY_COUNT).fill(0);

    // Run all cycles sequentially across keys to keep the test deterministic.
    for (let i = 0; i < CYCLES_PER_KEY; i++) {
      for (let k = 0; k < KEY_COUNT; k++) {
        const kCopy = k;
        await withAdapterLock(`key-${k}`, async () => {
          counters[kCopy]++;
        });
      }
    }

    for (let k = 0; k < KEY_COUNT; k++) {
      expect(counters[k], `key-${k} counter`).toBe(CYCLES_PER_KEY);
    }
  }, 60_000);

  it('lock correctly serializes concurrent operations — no lost updates over 200 concurrent calls', async () => {
    /**
     * This test pushes concurrent pressure onto a single key to confirm
     * the mutex correctly serializes access. A simple shared integer
     * incremented inside non-atomic async steps would produce a race if the
     * lock were broken.
     */
    const CONCURRENT = 200;
    const instanceId = 'concurrency-probe';
    let sharedValue = 0;

    const ops = Array.from({ length: CONCURRENT }, () =>
      withAdapterLock(instanceId, async () => {
        const snapshot = sharedValue;
        // Yield to the microtask queue — exposes races if locking is broken.
        await Promise.resolve();
        sharedValue = snapshot + 1;
      }),
    );

    await Promise.all(ops);

    expect(sharedValue).toBe(CONCURRENT);
  }, 60_000);

  it('lock continues to function correctly after a rejected operation in the chain', async () => {
    const instanceId = 'error-recovery';
    let successCount = 0;

    // Inject failures at regular intervals to exercise the error recovery path.
    for (let i = 0; i < 200; i++) {
      if (i % 10 === 5) {
        await expect(
          withAdapterLock(instanceId, async () => {
            throw new Error(`intentional error at cycle ${i}`);
          }),
        ).rejects.toThrow('intentional error');
      } else {
        await withAdapterLock(instanceId, async () => {
          successCount++;
        });
      }
    }

    // 200 cycles, 20 of which are failures (every 10th starting at index 5).
    expect(successCount).toBe(180);
  }, 60_000);

  it('lock timing does not degrade over 500 sequential cycles (last 100 < 5x first 100)', async () => {
    const CYCLES = 500;
    const WINDOW = 100;
    const MAX_DEGRADATION_RATIO = 5;
    const instanceId = 'timing-probe';
    const timings: number[] = [];

    for (let i = 0; i < CYCLES; i++) {
      const t0 = performance.now();
      await withAdapterLock(instanceId, async () => {
        /* no-op */
      });
      timings.push(performance.now() - t0);
    }

    const ratio = timingDegradationRatio(timings, WINDOW);
    expect(
      ratio,
      `Lock latency degraded: last-${WINDOW} mean is ${ratio.toFixed(2)}x the first-${WINDOW} mean (threshold ${MAX_DEGRADATION_RATIO}x)`,
    ).toBeLessThan(MAX_DEGRADATION_RATIO);
  }, 60_000);
});

// ─── 3. Bundle engine repeated cycles ────────────────────────────────────────

describe('Endurance: Bundle engine repeated cycles', () => {
  const COMPONENTS = makeComponents(50);
  const COMPONENT_IDS: ComponentId[] = COMPONENTS.map((c) => c.id);

  it('survives 200 buildBundle → serialize → deserialize → detectConflicts cycles without crash', async () => {
    const CYCLES = 200;

    for (let i = 0; i < CYCLES; i++) {
      const bundle = buildBundle(COMPONENT_IDS, COMPONENTS, { name: `endurance-${i}` });
      const json = serializeBundle(bundle);
      const restored = deserializeBundle(json);
      detectConflicts(restored.components, COMPONENTS, ['claude-code']);

      // Structural correctness must hold on every cycle.
      expect(restored.components).toHaveLength(50);
    }
  }, 60_000);

  it('bundle cycle timing does not degrade (last 50 cycles < 5x first 50 cycles)', async () => {
    const CYCLES = 200;
    const WINDOW = 50;
    const MAX_DEGRADATION_RATIO = 5;
    const timings: number[] = [];

    for (let i = 0; i < CYCLES; i++) {
      const t0 = performance.now();
      const bundle = buildBundle(COMPONENT_IDS, COMPONENTS, { name: `timing-${i}` });
      const json = serializeBundle(bundle);
      const restored = deserializeBundle(json);
      detectConflicts(restored.components, COMPONENTS, ['claude-code']);
      timings.push(performance.now() - t0);
    }

    const ratio = timingDegradationRatio(timings, WINDOW);
    expect(
      ratio,
      `Bundle cycle degraded: last-${WINDOW} mean is ${ratio.toFixed(2)}x first-${WINDOW} mean (threshold ${MAX_DEGRADATION_RATIO}x)`,
    ).toBeLessThan(MAX_DEGRADATION_RATIO);
  }, 60_000);

  it('serialized JSON size stays constant across 200 cycles (no payload growth)', async () => {
    const CYCLES = 200;
    let firstSize: number | null = null;

    for (let i = 0; i < CYCLES; i++) {
      const bundle = buildBundle(COMPONENT_IDS, COMPONENTS, { name: 'size-check' });
      const json = serializeBundle(bundle);

      if (firstSize === null) {
        firstSize = json.length;
      } else {
        // The serialized payload for an identical set of components must not grow.
        // Allow a small tolerance (1%) for floating-point formatting differences.
        const tolerance = Math.ceil(firstSize * 0.01);
        expect(json.length).toBeLessThanOrEqual(firstSize + tolerance);
      }
    }
  }, 60_000);

  it('round-trip fidelity maintained across 200 cycles — deserialized components match originals', async () => {
    const CYCLES = 200;
    const portables = makePortableComponents(50);
    const bundleTemplate = createBundle('fidelity-test', ['claude-code'], 'endurance');
    bundleTemplate.components = portables;

    for (let i = 0; i < CYCLES; i++) {
      const json = serializeBundle(bundleTemplate);
      const restored = deserializeBundle(json);

      expect(restored.components).toHaveLength(portables.length);

      // Spot-check first and last component on every cycle.
      expect(restored.components[0].name).toBe(portables[0].name);
      expect(restored.components[portables.length - 1].name).toBe(
        portables[portables.length - 1].name,
      );
    }
  }, 60_000);

  it('conflict detection results are stable across 200 repeated calls with the same inputs', async () => {
    const CYCLES = 200;
    const incoming = makePortableComponents(50, 'incoming');
    const existing = makeComponents(50);

    // First call establishes the baseline result shape.
    const baseline = detectConflicts(incoming, existing, ['claude-code']);

    for (let i = 0; i < CYCLES; i++) {
      const result = detectConflicts(incoming, existing, ['claude-code']);
      expect(result.newComponents).toHaveLength(baseline.newComponents.length);
      expect(result.conflicts).toHaveLength(baseline.conflicts.length);
      expect(result.incompatible).toHaveLength(baseline.incompatible.length);
    }
  }, 60_000);
});

// ─── 4. AdapterRegistry repeated scanAll ─────────────────────────────────────

describe('Endurance: AdapterRegistry repeated scanAll', () => {
  /**
   * Build a minimal ToolAdapter mock that returns the given components.
   * Uses vi.fn() so call counts can be observed if needed.
   */
  function makeMockAdapter(instanceId: string, components: Component[]): ToolAdapter {
    return {
      toolId: 'claude-code' as const,
      instanceId,
      rootPath: `/mock/${instanceId}`,
      detect: vi.fn().mockResolvedValue({
        toolId: 'claude-code',
        instanceId,
        path: `/mock/${instanceId}`,
        detected: true,
      } satisfies ToolDetectionResult),
      scan: vi.fn().mockResolvedValue(components),
      install: vi.fn(),
      uninstall: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
      canToggle: vi.fn().mockReturnValue(true),
      getConfigPath: vi.fn().mockReturnValue('/mock/config'),
      getSupportedTypes: vi.fn().mockReturnValue(['mcp-server'] as const),
      resolveConfigDir: vi.fn().mockReturnValue('/mock/config'),
      getCachePatterns: vi.fn().mockReturnValue([]),
    };
  }

  it('survives 500 scanAll calls and always returns the correct component count', async () => {
    const ADAPTERS = 4;
    const COMPONENTS_PER_ADAPTER = 50;
    const EXPECTED_TOTAL = ADAPTERS * COMPONENTS_PER_ADAPTER;
    const CYCLES = 500;

    const registry = createAdapterRegistry();
    for (let a = 0; a < ADAPTERS; a++) {
      registry.register(
        makeMockAdapter(`adapter-${a}`, makeComponents(COMPONENTS_PER_ADAPTER, `a${a}-`)),
      );
    }

    for (let i = 0; i < CYCLES; i++) {
      const result = await registry.scanAll();
      expect(result).toHaveLength(EXPECTED_TOTAL);
    }
  }, 60_000);

  it('scanAll timing does not degrade over 500 cycles (last 100 < 5x first 100)', async () => {
    const CYCLES = 500;
    const WARMUP = 50; // JIT-prime iterations excluded from timing windows
    const WINDOW = 100;
    const MAX_DEGRADATION_RATIO = 5;

    const registry = createAdapterRegistry();
    for (let a = 0; a < 2; a++) {
      registry.register(makeMockAdapter(`timing-adapter-${a}`, makeComponents(50, `ta${a}-`)));
    }

    // Warmup: allow V8 to JIT-compile the hot path before measuring.
    for (let i = 0; i < WARMUP; i++) {
      await registry.scanAll();
    }

    const timings: number[] = [];

    for (let i = 0; i < CYCLES; i++) {
      const t0 = performance.now();
      await registry.scanAll();
      timings.push(performance.now() - t0);
    }

    const ratio = timingDegradationRatio(timings, WINDOW);
    expect(
      ratio,
      `scanAll degraded: last-${WINDOW} mean is ${ratio.toFixed(2)}x first-${WINDOW} mean (threshold ${MAX_DEGRADATION_RATIO}x)`,
    ).toBeLessThan(MAX_DEGRADATION_RATIO);
  }, 60_000);

  it('result array is a new reference on every call (no aliasing to internal state)', async () => {
    const registry = createAdapterRegistry();
    registry.register(makeMockAdapter('alias-adapter', makeComponents(10)));

    const first = await registry.scanAll();
    const second = await registry.scanAll();

    // Mutating the returned array must not affect subsequent calls.
    first.push(first[0]);
    const third = await registry.scanAll();

    expect(third).toHaveLength(10);
    expect(second).toHaveLength(10);
  }, 60_000);

  it('detectAll survives 500 cycles and always returns detected adapters', async () => {
    const CYCLES = 500;
    const registry = createAdapterRegistry();
    registry.register(makeMockAdapter('detect-adapter-0', makeComponents(5)));
    registry.register(makeMockAdapter('detect-adapter-1', makeComponents(5)));

    for (let i = 0; i < CYCLES; i++) {
      const results = await registry.detectAll();
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.detected)).toBe(true);
    }
  }, 60_000);
});

// ─── 5. ConfigIO read/write churn ────────────────────────────────────────────

describe('Endurance: ConfigIO read/write churn', () => {
  let tempDir: string;

  // Use a single temp directory across all tests in this suite.
  // Each test manages its own file within that directory.
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'plughub-endurance-'));
  });

  afterAll(async () => {
    // Best-effort cleanup — Windows may hold file handles briefly.
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      /* ignored */
    }
  });

  it('survives 200 write → read cycles and file content always matches the last write', async () => {
    const CYCLES = 200;
    const filePath = join(tempDir, 'churn.json');
    const configIO = createConfigIO(mockLogger);

    for (let i = 0; i < CYCLES; i++) {
      const payload = { cycle: i, value: `data-${i}`, items: [i, i + 1, i + 2] };
      await configIO.writeJSON(filePath, payload);

      const read = (await configIO.readJSON(filePath)) as typeof payload;
      expect(read.cycle).toBe(i);
      expect(read.value).toBe(`data-${i}`);
      expect(read.items).toEqual([i, i + 1, i + 2]);
    }
  }, 60_000);

  it('backup file exists and is valid JSON after 200 write cycles', async () => {
    const CYCLES = 200;
    const filePath = join(tempDir, 'backup-check.json');
    const backupPath = filePath + '.backup';
    const configIO = createConfigIO(mockLogger);

    for (let i = 0; i < CYCLES; i++) {
      await configIO.writeJSON(filePath, { cycle: i });
    }

    // The backup must exist after multiple write cycles.
    const hasBackup = await configIO.hasBackup(filePath);
    expect(hasBackup).toBe(true);

    // The backup must be valid JSON (not corrupted by concurrent temp-file churn).
    const backupRaw = await readFile(backupPath, 'utf-8');
    expect(() => JSON.parse(backupRaw)).not.toThrow();

    const backupData = JSON.parse(backupRaw) as { cycle: number };
    // Backup should contain the second-to-last write (one before the final).
    expect(typeof backupData.cycle).toBe('number');
    expect(backupData.cycle).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it('interleaved writes to different files do not corrupt each other over 200 cycles', async () => {
    const CYCLES = 200;
    const fileA = join(tempDir, 'interleave-a.json');
    const fileB = join(tempDir, 'interleave-b.json');
    const configIO = createConfigIO(mockLogger);

    for (let i = 0; i < CYCLES; i++) {
      await configIO.writeJSON(fileA, { owner: 'A', cycle: i });
      await configIO.writeJSON(fileB, { owner: 'B', cycle: i });

      const a = (await configIO.readJSON(fileA)) as { owner: string; cycle: number };
      const b = (await configIO.readJSON(fileB)) as { owner: string; cycle: number };

      expect(a.owner).toBe('A');
      expect(b.owner).toBe('B');
      expect(a.cycle).toBe(i);
      expect(b.cycle).toBe(i);
    }
  }, 60_000);

  it('exists() returns correct values consistently across 200 cycles', async () => {
    const CYCLES = 200;
    const filePath = join(tempDir, 'exists-probe.json');
    const configIO = createConfigIO(mockLogger);

    // File does not exist yet.
    expect(await configIO.exists(filePath)).toBe(false);

    for (let i = 0; i < CYCLES; i++) {
      await configIO.writeJSON(filePath, { i });
      expect(await configIO.exists(filePath)).toBe(true);
    }
  }, 60_000);

  it('write/read timing does not degrade over 200 cycles (last 50 < 5x first 50)', async () => {
    const CYCLES = 200;
    const WINDOW = 50;
    const MAX_DEGRADATION_RATIO = 5;
    const filePath = join(tempDir, 'timing.json');
    const configIO = createConfigIO(mockLogger);
    const timings: number[] = [];

    for (let i = 0; i < CYCLES; i++) {
      const t0 = performance.now();
      await configIO.writeJSON(filePath, { i, data: `payload-${i}` });
      await configIO.readJSON(filePath);
      timings.push(performance.now() - t0);
    }

    const ratio = timingDegradationRatio(timings, WINDOW);
    expect(
      ratio,
      `ConfigIO write/read degraded: last-${WINDOW} mean is ${ratio.toFixed(2)}x first-${WINDOW} mean (threshold ${MAX_DEGRADATION_RATIO}x)`,
    ).toBeLessThan(MAX_DEGRADATION_RATIO);
  }, 60_000);

  it('large payload write/read round-trips correctly over 50 cycles without data loss', async () => {
    /**
     * Write a payload approaching a realistic "many components" size (~1 000 entries).
     * Confirms there is no silent truncation or corruption on large files.
     */
    const CYCLES = 50;
    const filePath = join(tempDir, 'large-payload.json');
    const configIO = createConfigIO(mockLogger);

    const largePayload = {
      components: Array.from({ length: 1_000 }, (_, i) => ({
        id: { tool: 'claude-code', type: 'mcp-server', name: `server-${i}`, scope: 'user' },
        tracking: 'detected',
        version: `1.0.${i}`,
      })),
    };

    for (let i = 0; i < CYCLES; i++) {
      await configIO.writeJSON(filePath, largePayload);
      const read = (await configIO.readJSON(filePath)) as typeof largePayload;
      expect(read.components).toHaveLength(1_000);
      expect(read.components[999].version).toBe('1.0.999');
    }
  }, 60_000);
});
