/**
 * ToolAdapter — abstract interface for AI CLI tool adapters.
 * Each adapter knows how to detect, scan, install, uninstall, and toggle
 * components for one tool at one path.
 * Source: 4B-architecture/system-design.md §1.2
 */

import type {
  ToolId,
  ToolDetectionResult,
  ComponentId,
  ComponentType,
  Component,
  PortableComponent,
  PortablePlugin,
  InstallTarget,
} from '@shared/types';

export interface ToolAdapter {
  readonly toolId: ToolId;
  readonly instanceId: string;
  readonly rootPath: string;

  detect(): Promise<ToolDetectionResult>;
  scan(): Promise<Component[]>;
  install(portable: PortableComponent, target: InstallTarget): Promise<Component>;
  uninstall(id: ComponentId): Promise<void>;
  enable(id: ComponentId): Promise<void>;
  disable(id: ComponentId): Promise<void>;

  canToggle(type: ComponentType): boolean;
  getConfigPath(id: ComponentId): string;
  getSupportedTypes(): ComponentType[];
  resolveConfigDir(): string;

  /** Scan a specific project folder for project-scope components (USR-03) */
  scanProject?(projectPath: string): Promise<Component[]>;

  /** Install a full plugin with sub-components, registry entry, and enabled state (v1.7.0) */
  installPlugin?(plugin: PortablePlugin, target?: InstallTarget): Promise<Component[]>;

  /** Cache/temp patterns to exclude when skipCaches is true (FEAT-02) */
  getCachePatterns(): string[];
}
