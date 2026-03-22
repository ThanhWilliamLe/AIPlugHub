/**
 * ClaudeDesktopAdapter — adapter for Claude Desktop app.
 * Simplest adapter: MCP servers only, single scope ('user'), platform-specific paths.
 * Source: 6C-build-plan/implementation-plan.md §M3
 *
 * Claude Desktop config layout:
 *   rootPath/                    (platform-specific, see resolveConfigDir)
 *     claude_desktop_config.json — MCP server config { mcpServers: { ... } }
 *
 * Platform default paths:
 *   macOS:   ~/Library/Application Support/Claude/
 *   Windows: %APPDATA%/Claude/
 *   Linux:   ~/.config/claude/
 */

import type { ConfigIO } from '../config-io';
import type { Logger } from '../logger';
import type { ToolAdapter } from './tool-adapter';
import type {
  ToolDetectionResult,
  ComponentId,
  Component,
  PortableComponent,
  InstallTarget,
  McpServerCore,
} from '@shared/types';
import { AppError } from '@shared/types';
import { TOOL_COMPONENTS, CACHE_PATTERNS } from '@shared/constants';
import { join } from 'path';

// -- Types for Claude Desktop config structure --

type DesktopConfigData = {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
};

// -- Constants --

const TOOL_ID = 'claude-desktop' as const;
const CONFIG_FILENAME = 'claude_desktop_config.json';

// -- Public API --

export function createClaudeDesktopAdapter(
  rootPath: string,
  instanceId: string,
  configIO: ConfigIO,
  logger: Logger,
): ToolAdapter {
  const MODULE = 'ClaudeDesktopAdapter';

  // -- Path helpers --

  function configFilePath(): string {
    return join(rootPath, CONFIG_FILENAME);
  }

  // -- Helpers --

  /** Validate component name does not contain path traversal characters. */
  function validateName(name: string): void {
    if (name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0')) {
      throw new AppError(
        'CONFIG_PERMISSION',
        `Component name contains invalid characters: "${name}"`,
        false,
      );
    }
  }

  // -- Scan --

  async function scanMcpServers(): Promise<Component[]> {
    const components: Component[] = [];
    const cfgPath = configFilePath();

    if (!(await configIO.exists(cfgPath))) return components;

    const raw = (await configIO.readJSON(cfgPath)) as DesktopConfigData;
    const servers = raw?.mcpServers;
    if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return components;

    for (const [name, config] of Object.entries(servers)) {
      if (!config || typeof config !== 'object') continue;
      const core = normalizeMcpCore(config as Record<string, unknown>);
      components.push({
        id: { tool: TOOL_ID, type: 'mcp-server', name, scope: 'user' },
        core,
        configPath: cfgPath,
        tracking: 'detected',
      });
    }

    return components;
  }

  // -- Install --

  async function installMcpServer(
    portable: PortableComponent,
    _target: InstallTarget,
  ): Promise<Component> {
    validateName(portable.name);

    const cfgPath = configFilePath();
    let data: DesktopConfigData = {};

    try {
      if (await configIO.exists(cfgPath)) {
        data = (await configIO.readJSON(cfgPath)) as DesktopConfigData;
      }
    } catch (err) {
      if (err instanceof AppError && err.code === 'CONFIG_CORRUPTED') {
        logger.warn(MODULE, `Config corrupted, starting fresh: ${cfgPath}`, err);
        // Start fresh — existing config is unreadable
      } else {
        throw err; // Re-throw permission/lock errors — don't silently destroy config
      }
    }

    if (!data.mcpServers) data.mcpServers = {};

    const core = portable.core as McpServerCore;
    let serverConfig: Record<string, unknown>;

    if (core.transport === 'stdio') {
      serverConfig = { command: core.command };
      if (core.args) serverConfig.args = core.args;
      if (core.env) serverConfig.env = core.env;
    } else {
      serverConfig = { type: core.transport, url: core.url };
      if (core.headers) serverConfig.headers = core.headers;
    }

    if (data.mcpServers[portable.name]) {
      logger.warn(MODULE, `Overwriting existing MCP server "${portable.name}"`);
    }
    data.mcpServers[portable.name] = serverConfig;
    await configIO.writeJSON(cfgPath, data);

    return {
      id: { tool: TOOL_ID, type: 'mcp-server', name: portable.name, scope: 'user' },
      core,
      configPath: cfgPath,
      tracking: 'managed',
    };
  }

  // -- Uninstall --

  async function uninstallMcpServer(id: ComponentId): Promise<void> {
    validateName(id.name);
    const cfgPath = configFilePath();
    if (!(await configIO.exists(cfgPath))) {
      throw new AppError('COMPONENT_NOT_FOUND', `Config file not found: ${cfgPath}`, true);
    }

    const data = (await configIO.readJSON(cfgPath)) as DesktopConfigData;
    if (!data.mcpServers || !(id.name in data.mcpServers)) {
      throw new AppError('COMPONENT_NOT_FOUND', `MCP server "${id.name}" not found`, true);
    }

    delete data.mcpServers[id.name];
    await configIO.writeJSON(cfgPath, data);
  }

  // -- ToolAdapter implementation --

  return {
    toolId: TOOL_ID,
    instanceId,
    rootPath,

    async detect(): Promise<ToolDetectionResult> {
      const cfgPath = configFilePath();
      const detected = await configIO.exists(cfgPath);
      logger.info(MODULE, `detect: ${cfgPath} → ${detected}`);
      return { toolId: TOOL_ID, instanceId, path: rootPath, detected };
    },

    async scan(): Promise<Component[]> {
      logger.info(MODULE, `Scanning: ${rootPath}`);

      try {
        const components = await scanMcpServers();
        logger.info(MODULE, `Scan complete: ${components.length} components`);
        return components;
      } catch (err) {
        logger.warn(MODULE, `Scan failed: ${rootPath}`, err);
        return [];
      }
    },

    async install(portable, target) {
      logger.info(MODULE, `Installing ${portable.type} "${portable.name}"`);

      if (portable.type !== 'mcp-server') {
        throw new AppError(
          'ADAPTER_UNSUPPORTED',
          `Claude Desktop only supports mcp-server, got "${portable.type}"`,
          false,
        );
      }

      return installMcpServer(portable, target);
    },

    async uninstall(id) {
      logger.info(MODULE, `Uninstalling ${id.type} "${id.name}"`);

      if (id.type !== 'mcp-server') {
        throw new AppError(
          'ADAPTER_UNSUPPORTED',
          `Claude Desktop only supports uninstalling mcp-server, got "${id.type}"`,
          false,
        );
      }

      return uninstallMcpServer(id);
    },

    async enable() {
      throw new AppError(
        'ADAPTER_UNSUPPORTED',
        'Claude Desktop does not support native component toggle',
        false,
      );
    },

    async disable() {
      throw new AppError(
        'ADAPTER_UNSUPPORTED',
        'Claude Desktop does not support native component toggle',
        false,
      );
    },

    canToggle() {
      return false;
    },

    getConfigPath() {
      return configFilePath();
    },

    getSupportedTypes() {
      return TOOL_COMPONENTS[TOOL_ID];
    },

    resolveConfigDir() {
      return rootPath;
    },

    getCachePatterns(): string[] {
      return (CACHE_PATTERNS[TOOL_ID] ?? []).map((e) => e.pattern);
    },
  };
}

// -- Utility functions --

function safeHeaders(val: unknown): Record<string, string> | undefined {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return undefined;
  return val as Record<string, string>;
}

function normalizeMcpCore(config: Record<string, unknown>): McpServerCore {
  // HTTP/SSE transport
  if (config.url) {
    const url = String(config.url);
    if (config.type === 'sse') {
      return { transport: 'sse', url, headers: safeHeaders(config.headers) };
    }
    return { transport: 'http', url, headers: safeHeaders(config.headers) };
  }

  // Stdio transport (default)
  return {
    transport: 'stdio',
    command: String(config.command ?? ''),
    args: Array.isArray(config.args) ? config.args.map(String) : undefined,
    env:
      config.env && typeof config.env === 'object' && !Array.isArray(config.env)
        ? (config.env as Record<string, string>)
        : undefined,
  };
}

// -- Platform path resolution (static utility) --

/**
 * Resolve the default Claude Desktop config directory for the current platform.
 * Used by the boot sequence to create adapter instances when no custom path is set.
 */
export function resolveDefaultDesktopConfigDir(platform: string = process.platform): string {
  switch (platform) {
    case 'darwin':
      return join(process.env.HOME ?? '/tmp', 'Library', 'Application Support', 'Claude');
    case 'win32':
      return join(process.env.APPDATA ?? 'C:\\Users\\Default\\AppData\\Roaming', 'Claude');
    case 'linux':
      return join(process.env.HOME ?? '/tmp', '.config', 'claude');
    default:
      return join(process.env.HOME ?? '/tmp', '.config', 'claude');
  }
}
