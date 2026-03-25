/**
 * Component types, schemas, extensions, and the Component entity.
 * Source: 4B-architecture/data-model.md §2-6
 */

import type { ToolId } from './tools';

// ─── Component Type Hierarchy ────────────────────────────────────────

export type ComponentType =
  | 'mcp-server'
  | 'skill'
  | 'command'
  | 'hook'
  | 'agent'
  | 'context-file'
  | 'lsp-server'
  | 'output-style'
  | 'prompt'
  | 'unknown';

// ─── Identity ────────────────────────────────────────────────────────

/** Installed identity — unique within the plugin manager's database */
export type ComponentId = {
  tool: ToolId;
  type: ComponentType;
  name: string;
  scope: string;
  /** Project root path — set when scope is 'project' to disambiguate across projects */
  projectPath?: string;
};

/** Portable identity — tool-agnostic, for bundles and import matching */
export type PortableComponentKey = {
  type: ComponentType;
  name: string;
};

// ─── Core Schemas (portable fields) ─────────────────────────────────

export type McpServerCore =
  | { transport: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { transport: 'http'; url: string; headers?: Record<string, string> }
  | { transport: 'sse'; url: string; headers?: Record<string, string> };

export type SkillCore = {
  description: string;
  content: string;
  supportingFiles?: string[];
};

export type CommandCore = {
  description?: string;
  content: string;
  arguments?: { name: string; description?: string }[];
};

export type HookCore = {
  event: string;
  handler: { type: 'command'; command: string } | { type: 'http'; url: string };
  blocking?: boolean;
  matcher?: string;
};

export type AgentCore = {
  description: string;
  model?: string;
  tools?: string[];
  disallowedTools?: string[];
  maxTurns?: number;
};

export type PromptCore = {
  content: string;
  arguments?: { name: string; description?: string }[];
};

export type LspServerCore = {
  /** Binary command to launch the LSP server */
  command: string;
  /** CLI arguments passed to the command */
  args?: string[];
  /** Maps file extensions to LSP language identifiers */
  extensionToLanguage: Record<string, string>;
};

export type SkeletonCore = {
  rawConfig?: unknown;
  rawTypeName?: string;
};

/** Maps component types to their core schema */
export type CoreSchemaMap = {
  'mcp-server': McpServerCore;
  skill: SkillCore;
  command: CommandCore;
  hook: HookCore;
  agent: AgentCore;
  'context-file': SkeletonCore;
  'lsp-server': LspServerCore;
  'output-style': SkeletonCore;
  prompt: PromptCore;
  unknown: SkeletonCore;
};

/** Union of all possible core schemas */
export type CoreSchema = CoreSchemaMap[ComponentType];

// ─── Tool Extensions (tool-specific fields) ─────────────────────────

export interface ClaudeCodeMcpExtensions {
  // Currently no CC-specific MCP fields beyond core — placeholder for future extension
}

export type ClaudeCodeSkillExtensions = {
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
  argumentHint?: string;
  model?: string;
  context?: string[];
  agent?: boolean;
  hooks?: unknown;
};

export type ClaudeCodeHookExtensions = {
  handler?: { type: 'prompt'; prompt: string } | { type: 'agent'; agent: string };
};

export type ClaudeCodeAgentExtensions = {
  permissionMode?: string;
  skills?: string[];
  mcpServers?: Record<string, unknown>;
  hooks?: unknown;
  memory?: unknown;
  background?: boolean;
  isolation?: boolean;
};

export type ClaudeDesktopMcpExtensions = {
  userConfig?: Record<string, UserConfigField>;
  guiOnlyRemote?: boolean;
};

export type UserConfigField = {
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
};

export type GeminiCliMcpExtensions = {
  cwd?: string;
  trust?: boolean;
  includeTools?: string[];
  excludeTools?: string[];
  timeout?: number;
};

/**
 * Maps (tool, type) to the correct extension schema.
 * Note: TypeScript cannot index this by runtime ComponentId values,
 * so Component.extensions uses Record<string, unknown> at the container level.
 * Use ToolExtensionsMap for type-safe access when the tool and type are known statically.
 */
export type ToolExtensionsMap = {
  'claude-code': {
    'mcp-server': ClaudeCodeMcpExtensions;
    skill: ClaudeCodeSkillExtensions;
    hook: ClaudeCodeHookExtensions;
    agent: ClaudeCodeAgentExtensions;
  };
  'claude-desktop': {
    'mcp-server': ClaudeDesktopMcpExtensions;
  };
  'gemini-cli': {
    'mcp-server': GeminiCliMcpExtensions;
  };
  antigravity: Record<string, never>;
};

// ─── Component (installed representation) ────────────────────────────

export type Component = {
  id: ComponentId;
  enabled?: boolean;
  tracking: 'managed' | 'detected' | 'imported' | 'manual';
  displayName?: string;
  description?: string;
  version?: string;
  core: CoreSchema;
  /** Tool-specific extensions. Typed as Record<string, unknown> at runtime;
   *  see ToolExtensionsMap for compile-time type-safe access. */
  extensions?: Record<string, unknown>;
  configPath?: string;
  projectPath?: string;
  /** Upstream source reference — set when installed from marketplace (USR-06) */
  installedFrom?: {
    sourceId: string;
    ref: string;
  };
};

/** Manager's own metadata about a component (stored in DataStore) */
export type ComponentMetadata = {
  id: ComponentId;
  tracking: 'managed' | 'detected' | 'imported' | 'manual';
  displayName?: string;
  pluginName?: string;
  /** Upstream source for update tracking (USR-06) */
  installedFrom?: {
    sourceId: string;
    ref: string;
  };
  /** Version string at time of install */
  installedVersion?: string;
  /** SHA-256 content hash at time of install */
  installedHash?: string;
};

// ─── Type Guards ─────────────────────────────────────────────────────

export function isMcpServer(c: Component): c is Component & { core: McpServerCore } {
  return c.id.type === 'mcp-server';
}

export function isSkill(c: Component): c is Component & { core: SkillCore } {
  return c.id.type === 'skill';
}

export function isCommand(c: Component): c is Component & { core: CommandCore } {
  return c.id.type === 'command';
}

export function isHook(c: Component): c is Component & { core: HookCore } {
  return c.id.type === 'hook';
}

export function isAgent(c: Component): c is Component & { core: AgentCore } {
  return c.id.type === 'agent';
}

export function isPrompt(c: Component): c is Component & { core: PromptCore } {
  return c.id.type === 'prompt';
}

export function isLspServer(c: Component): c is Component & { core: LspServerCore } {
  return c.id.type === 'lsp-server';
}

// ─── Native Plugin (plugin system integration) ──────────────────────

/** A managed plugin from Claude Code's native plugin system */
export type NativePlugin = {
  pluginKey: string; // e.g., "agent-teams@claude-code-workflows"
  pluginName: string; // e.g., "agent-teams"
  marketplace: string; // e.g., "claude-code-workflows"
  version: string;
  enabled: boolean;
  scope: string;
  componentCount: number;
  installedAt?: string;
  lastUpdated?: string;
};
