/**
 * AdapterRegistry — manages ToolAdapter instances.
 * Supports multiple instances of the same tool type at different paths.
 * Source: 4B-architecture/system-design.md §1.1
 */

import type { ToolAdapter } from './tool-adapter';
import type { ToolDetectionResult, Component } from '@shared/types';
import { AppError } from '@shared/types';

export interface AdapterRegistry {
  register(adapter: ToolAdapter): void;
  getAdapter(instanceId: string): ToolAdapter;
  getAllAdapters(): ToolAdapter[];
  detectAll(): Promise<ToolDetectionResult[]>;
  scanAll(): Promise<Component[]>;
}

export function createAdapterRegistry(): AdapterRegistry {
  const adapters = new Map<string, ToolAdapter>();

  return {
    register(adapter) {
      if (adapters.has(adapter.instanceId)) {
        throw new AppError(
          'ADAPTER_UNSUPPORTED',
          `Adapter already registered: "${adapter.instanceId}"`,
          false,
        );
      }
      adapters.set(adapter.instanceId, adapter);
    },

    getAdapter(instanceId) {
      const adapter = adapters.get(instanceId);
      if (!adapter) {
        throw new AppError('TOOL_NOT_FOUND', `No adapter registered: "${instanceId}"`, true);
      }
      return adapter;
    },

    getAllAdapters() {
      return [...adapters.values()];
    },

    async detectAll() {
      // allSettled: one adapter failure doesn't block detection of others
      const settled = await Promise.allSettled([...adapters.values()].map((a) => a.detect()));
      const results: ToolDetectionResult[] = [];
      for (const r of settled) {
        if (r.status === 'fulfilled') results.push(r.value);
        // rejected adapters are silently skipped — caller gets partial results
      }
      return results;
    },

    async scanAll() {
      // allSettled: one adapter failure doesn't lose all scan results
      const settled = await Promise.allSettled([...adapters.values()].map((a) => a.scan()));
      const components: Component[] = [];
      for (const r of settled) {
        if (r.status === 'fulfilled') components.push(...r.value);
      }
      return components;
    },
  };
}
