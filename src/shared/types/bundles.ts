/**
 * Bundle, portable component, and plugin types for export/import.
 * Source: 4B-architecture/data-model.md §6-8
 */

import type { ToolId } from './tools';
import type { ComponentId, ComponentType, CoreSchemaMap } from './components';

// ─── Plugin ──────────────────────────────────────────────────────────

export type PluginOrigin =
  | { type: 'marketplace'; marketplace: string; ref: string }
  | { type: 'git'; url: string; ref?: string }
  | { type: 'local'; path: string }
  | { type: 'bundle'; bundleId: string };

export type Plugin = {
  name: string;
  origin: PluginOrigin;
  version?: string;
  author?: { name: string; email?: string; url?: string };
  components: ComponentId[];
};

// ─── Portable Representation ─────────────────────────────────────────

export type ConfigRequirement = {
  key: string;
  description?: string;
  sensitive?: boolean;
  default?: string;
  envVar?: string;
};

export type PortableComponent = {
  type: ComponentType;
  name: string;
  scope?: string;
  description?: string;
  version?: string;
  sourceTools?: ToolId[];
  core: CoreSchemaMap[ComponentType];
  toolExtensions?: Partial<Record<ToolId, unknown>>;
  requiredConfig?: ConfigRequirement[];
  portabilityWarnings?: string[];
  /** Marketplace source reference — set when component was installed from marketplace */
  marketplaceSource?: { sourceId: string; ref: string };
};

export type PortablePlugin = {
  name: string;
  version?: string;
  author?: { name: string; email?: string; url?: string };
  components: PortableComponent[];
};

// ─── Bundle ──────────────────────────────────────────────────────────

export type Bundle = {
  formatVersion: string;
  name?: string;
  description?: string;
  exportedFrom: {
    tools: ToolId[];
    machine?: string;
    date: string;
  };
  plugins: PortablePlugin[];
  components: PortableComponent[];
};
