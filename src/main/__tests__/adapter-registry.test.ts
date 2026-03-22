import { describe, it, expect, beforeEach } from 'vitest';
import { createAdapterRegistry } from '../adapters/adapter-registry';
import type { AdapterRegistry } from '../adapters/adapter-registry';
import type { ToolAdapter } from '../adapters/tool-adapter';
import type {
  ToolDetectionResult,
  Component,
  ComponentId,
  ComponentType,
  PortableComponent,
  InstallTarget,
} from '@shared/types';
import { AppError } from '@shared/types';

// -- Stub adapter for testing --

function createStubAdapter(
  instanceId: string,
  opts?: { detected?: boolean; components?: Component[] },
): ToolAdapter {
  const detected = opts?.detected ?? true;
  const components = opts?.components ?? [];

  return {
    toolId: 'claude-code',
    instanceId,
    rootPath: `/fake/${instanceId}`,

    async detect(): Promise<ToolDetectionResult> {
      return { toolId: 'claude-code', instanceId, path: this.rootPath, detected };
    },

    async scan(): Promise<Component[]> {
      return components;
    },

    async install(_p: PortableComponent, _t: InstallTarget): Promise<Component> {
      throw new Error('Not implemented in stub');
    },

    async uninstall(_id: ComponentId): Promise<void> {
      throw new Error('Not implemented in stub');
    },

    async enable(_id: ComponentId): Promise<void> {
      throw new Error('Not implemented in stub');
    },

    async disable(_id: ComponentId): Promise<void> {
      throw new Error('Not implemented in stub');
    },

    canToggle(_type: ComponentType): boolean {
      return false;
    },

    getConfigPath(_id: ComponentId): string {
      return this.rootPath;
    },

    getSupportedTypes(): ComponentType[] {
      return ['mcp-server', 'skill'];
    },

    resolveConfigDir(): string {
      return this.rootPath;
    },
  };
}

let registry: AdapterRegistry;

beforeEach(() => {
  registry = createAdapterRegistry();
});

// ─── register / getAdapter ──────────────────────────────────────────

describe('AdapterRegistry — registration', () => {
  it('registers and retrieves an adapter', () => {
    const adapter = createStubAdapter('cc-default');
    registry.register(adapter);

    const retrieved = registry.getAdapter('cc-default');
    expect(retrieved).toBe(adapter);
    expect(retrieved.instanceId).toBe('cc-default');
  });

  it('registers multiple adapters', () => {
    registry.register(createStubAdapter('cc-default'));
    registry.register(createStubAdapter('cc-beta'));

    expect(registry.getAdapter('cc-default').instanceId).toBe('cc-default');
    expect(registry.getAdapter('cc-beta').instanceId).toBe('cc-beta');
  });

  it('throws on duplicate instanceId', () => {
    registry.register(createStubAdapter('cc-default'));

    try {
      registry.register(createStubAdapter('cc-default'));
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('ADAPTER_UNSUPPORTED');
    }
  });

  it('throws TOOL_NOT_FOUND for unknown instanceId', () => {
    try {
      registry.getAdapter('nonexistent');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('TOOL_NOT_FOUND');
      expect((err as AppError).recoverable).toBe(true);
    }
  });
});

// ─── getAllAdapters ──────────────────────────────────────────────────

describe('AdapterRegistry — getAllAdapters', () => {
  it('returns empty array when none registered', () => {
    expect(registry.getAllAdapters()).toEqual([]);
  });

  it('returns all registered adapters', () => {
    registry.register(createStubAdapter('cc-1'));
    registry.register(createStubAdapter('cc-2'));
    registry.register(createStubAdapter('cc-3'));

    const all = registry.getAllAdapters();
    expect(all).toHaveLength(3);
    expect(all.map((a) => a.instanceId).sort()).toEqual(['cc-1', 'cc-2', 'cc-3']);
  });
});

// ─── detectAll ──────────────────────────────────────────────────────

describe('AdapterRegistry — detectAll', () => {
  it('runs detect on all adapters', async () => {
    registry.register(createStubAdapter('cc-default', { detected: true }));
    registry.register(createStubAdapter('cc-missing', { detected: false }));

    const results = await registry.detectAll();
    expect(results).toHaveLength(2);

    const detected = results.find((r) => r.instanceId === 'cc-default');
    const missing = results.find((r) => r.instanceId === 'cc-missing');
    expect(detected!.detected).toBe(true);
    expect(missing!.detected).toBe(false);
  });

  it('returns empty array when no adapters registered', async () => {
    const results = await registry.detectAll();
    expect(results).toEqual([]);
  });
});

// ─── scanAll ────────────────────────────────────────────────────────

describe('AdapterRegistry — scanAll', () => {
  it('returns flattened components from all adapters', async () => {
    const comps1: Component[] = [
      {
        id: { tool: 'claude-code', type: 'mcp-server', name: 'server1', scope: 'user' },
        core: { transport: 'stdio', command: 'a' },
        tracking: 'detected',
      },
    ];
    const comps2: Component[] = [
      {
        id: { tool: 'claude-code', type: 'skill', name: 'skill1', scope: 'user' },
        core: { description: '', content: '' },
        tracking: 'detected',
      },
      {
        id: { tool: 'claude-code', type: 'skill', name: 'skill2', scope: 'user' },
        core: { description: '', content: '' },
        tracking: 'detected',
      },
    ];

    registry.register(createStubAdapter('cc-1', { components: comps1 }));
    registry.register(createStubAdapter('cc-2', { components: comps2 }));

    const all = await registry.scanAll();
    expect(all).toHaveLength(3);
    expect(all.map((c) => c.id.name).sort()).toEqual(['server1', 'skill1', 'skill2']);
  });

  it('returns empty array when no adapters have components', async () => {
    registry.register(createStubAdapter('cc-empty', { components: [] }));
    const all = await registry.scanAll();
    expect(all).toEqual([]);
  });

  it('continues scanning when one adapter throws (allSettled)', async () => {
    const comps: Component[] = [
      {
        id: { tool: 'claude-code', type: 'skill', name: 'good', scope: 'user' },
        core: { description: '', content: '' },
        tracking: 'detected',
      },
    ];

    // Create a failing adapter
    const failing = createStubAdapter('cc-failing');
    failing.scan = async () => {
      throw new Error('Adapter exploded');
    };

    registry.register(failing);
    registry.register(createStubAdapter('cc-good', { components: comps }));

    const all = await registry.scanAll();
    // Only the good adapter's components returned
    expect(all).toHaveLength(1);
    expect(all[0].id.name).toBe('good');
  });
});
