/**
 * Tool ecosystem types.
 * Source: 4B-architecture/data-model.md §1, system-design.md §1.1
 */

/** Supported AI CLI tools */
export type ToolId = 'claude-code' | 'claude-desktop' | 'gemini-cli' | 'antigravity';

/** Result of detecting whether a tool is installed */
export type ToolDetectionResult = {
  toolId: ToolId;
  instanceId: string;
  path: string;
  detected: boolean;
  version?: string;
  componentCount?: number;
  /** Whether the tool's CLI binary is available on PATH (for CLI-delegating adapters) */
  cliAvailable?: boolean;
};

/** A registered tool instance (supports multiple instances of the same tool at different paths) */
export type ToolInstance = {
  instanceId: string;
  toolId: ToolId;
  path: string;
  name: string;
  isDefault: boolean;
};

/** Target for installing a component */
export type InstallTarget = {
  instanceId: string;
  scope: string;
  projectPath?: string;
};
