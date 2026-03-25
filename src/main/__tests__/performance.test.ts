/**
 * Performance benchmarks — critical operations must complete within the latency
 * budgets defined in the test strategy (§10).
 *
 * All benchmarks use mock adapters with zero I/O so the timings reflect
 * algorithm cost (iteration, serialisation, comparison), not disk or network.
 *
 * Budgets:
 *   scanAll        — 2 000 ms for 50 components
 *   bundle export  — 1 000 ms for 50 components (build + serialize)
 *   detectConflicts— 500 ms for 50 incoming vs 50 existing
 *   round-trip     — 100 ms for serialize + deserialize of 50 components
 */

import { describe, it, expect, vi } from 'vitest';
import { buildBundle as buildBundleRaw } from '../bundle/export-builder';
import { serializeBundle, deserializeBundle, createBundle } from '../bundle/serializer';
import { detectConflicts } from '../bundle/conflict-detector';
import { createAdapterRegistry } from '../adapters/adapter-registry';
import type { Component, ComponentId, PortableComponent, ToolDetectionResult } from '@shared/types';
import type { BundleTarget } from '@shared/types';

const _perfTarget: BundleTarget = { scope: 'user', toolId: 'claude-code' };
function buildBundle(ids: any[], comps: any[], opts: any) {
  return buildBundleRaw(ids, comps, opts, _perfTarget, '1.9.0');
}
import type { ToolAdapter } from '../adapters/tool-adapter';

// ─── Test data factories ─────────────────────────────────────────────────────

/** Build N installed components with unique names. */
function makeComponents(
  count: number,
  tool: 'claude-code' | 'claude-desktop' = 'claude-code',
): Component[] {
  return Array.from({ length: count }, (_, i) => ({
    id: {
      tool,
      type: 'mcp-server' as const,
      name: `server-${i}`,
      scope: 'user',
    },
    tracking: 'detected' as const,
    version: '1.0.0',
    core: {
      transport: 'stdio' as const,
      command: 'npx',
      args: ['-y', `server-${i}`],
      env: {
        // Mix of safe and sensitive keys to exercise the stripping loop.
        HOST: `host-${i}`,
        PORT: `${8000 + i}`,
      },
    },
  }));
}

/** Build N portable components with unique names. */
function makePortableComponents(count: number): PortableComponent[] {
  return Array.from({ length: count }, (_, i) => ({
    type: 'mcp-server' as const,
    name: `server-${i}`,
    scope: 'user',
    version: '1.0.0',
    sourceTools: ['claude-code' as const],
    core: {
      transport: 'stdio' as const,
      command: 'npx',
      args: ['-y', `server-${i}`],
    },
  }));
}

/** Build a mock ToolAdapter that synchronously returns the given components. */
function makeFastAdapter(instanceId: string, components: Component[]): ToolAdapter {
  return {
    toolId: 'claude-code',
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
    getSupportedTypes: vi.fn().mockReturnValue(['mcp-server']),
    resolveConfigDir: vi.fn().mockReturnValue('/mock/config'),
  };
}

// ─── Benchmarks ──────────────────────────────────────────────────────────────

describe('Performance benchmarks', () => {
  it('scanAll completes under 2 000 ms for 50 components', async () => {
    // Register a single adapter that returns 50 components — the registry
    // fans out to all adapters via Promise.allSettled; this tests the pipeline.
    const components = makeComponents(50);
    const registry = createAdapterRegistry();
    registry.register(makeFastAdapter('adapter-0', components));

    const start = performance.now();
    const result = await registry.scanAll();
    const elapsed = performance.now() - start;

    expect(result).toHaveLength(50);
    expect(elapsed, `scanAll took ${elapsed.toFixed(1)} ms (budget: 2 000 ms)`).toBeLessThan(2000);
  });

  it('scanAll across multiple adapters completes under 2 000 ms for 50 components total', async () => {
    // Spread 50 components across 5 adapters (10 each) — exercises allSettled fan-out.
    const registry = createAdapterRegistry();
    for (let a = 0; a < 5; a++) {
      registry.register(makeFastAdapter(`adapter-${a}`, makeComponents(10)));
    }

    const start = performance.now();
    const result = await registry.scanAll();
    const elapsed = performance.now() - start;

    expect(result).toHaveLength(50);
    expect(
      elapsed,
      `multi-adapter scanAll took ${elapsed.toFixed(1)} ms (budget: 2 000 ms)`,
    ).toBeLessThan(2000);
  });

  it('bundle export (buildBundle + serializeBundle) completes under 1 000 ms for 50 components', () => {
    const components = makeComponents(50);
    const ids: ComponentId[] = components.map((c) => c.id);

    const start = performance.now();
    const bundle = buildBundle(ids, components, { name: 'perf-test' });
    const json = serializeBundle(bundle);
    const elapsed = performance.now() - start;

    expect(bundle.components).toHaveLength(50);
    expect(typeof json).toBe('string');
    expect(elapsed, `export took ${elapsed.toFixed(1)} ms (budget: 1 000 ms)`).toBeLessThan(1000);
  });

  it('conflict detection completes under 500 ms for 50 incoming vs 50 existing components', () => {
    const existing = makeComponents(50);
    // Give incoming components different names so all 50 are classified as "new" —
    // this exercises the full iteration without short-circuiting.
    const incoming = makePortableComponents(50).map((p, i) => ({
      ...p,
      name: `incoming-server-${i}`,
    }));

    const start = performance.now();
    const manifest = detectConflicts(incoming, existing, ['claude-code']);
    const elapsed = performance.now() - start;

    expect(manifest.newComponents).toHaveLength(50);
    expect(elapsed, `detectConflicts took ${elapsed.toFixed(1)} ms (budget: 500 ms)`).toBeLessThan(
      500,
    );
  });

  it('conflict detection with all conflicts completes under 500 ms for 50 vs 50', () => {
    // All names match — every incoming component has a conflict to classify.
    const existing = makeComponents(50);
    const incoming: PortableComponent[] = existing.map((c) => ({
      type: c.id.type,
      name: c.id.name,
      scope: c.id.scope,
      version: '2.0.0', // different version → triggers version-conflict path
      sourceTools: [c.id.tool],
      core: c.core,
    }));

    const start = performance.now();
    const manifest = detectConflicts(incoming, existing, ['claude-code']);
    const elapsed = performance.now() - start;

    expect(manifest.conflicts).toHaveLength(50);
    expect(
      elapsed,
      `conflict classification took ${elapsed.toFixed(1)} ms (budget: 500 ms)`,
    ).toBeLessThan(500);
  });

  it('bundle serialisation round-trip completes under 100 ms for 50 components', () => {
    // Build a bundle directly (no component scanning) and round-trip it.
    const bundle = createBundle(
      'round-trip-test',
      { scope: 'user', toolId: 'claude-code' },
      '1.9.0',
      'perf test',
    );
    bundle.components = makePortableComponents(50);

    const start = performance.now();
    const json = serializeBundle(bundle);
    const restored = deserializeBundle(json);
    const elapsed = performance.now() - start;

    expect(restored.components).toHaveLength(50);
    expect(elapsed, `round-trip took ${elapsed.toFixed(1)} ms (budget: 100 ms)`).toBeLessThan(100);
  });

  it('repeated serialisation (10x 50-component bundles) stays under 1 000 ms total', () => {
    // Stress test: 10 consecutive export cycles — catches O(n²) regressions.
    const components = makeComponents(50);
    const ids: ComponentId[] = components.map((c) => c.id);

    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      const bundle = buildBundle(ids, components, { name: `batch-${i}` });
      serializeBundle(bundle);
    }
    const elapsed = performance.now() - start;

    expect(elapsed, `10x export took ${elapsed.toFixed(1)} ms (budget: 1 000 ms)`).toBeLessThan(
      1000,
    );
  });
});
