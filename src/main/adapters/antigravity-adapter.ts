/**
 * AntigravityAdapter — adapter for Google Antigravity IDE.
 * Agentic IDE (VS Code fork) with skills, workflows, rules, MCP, and IDE extensions.
 * Source: 2A-research/plugin-ecosystems.md §Antigravity
 *
 * Antigravity config layout:
 *   rootPath/                          (~/.gemini/antigravity/)
 *     mcp_config.json                  — MCP server config { mcpServers: { ... } }
 *     skills/<name>/SKILL.md           — global skills (YAML frontmatter + markdown)
 *     global_workflows/*.md            — global workflow definitions (slash commands)
 *   ~/.gemini/GEMINI.md                — global context/rules (shared with Gemini CLI)
 *   <workspace>/.agent/
 *     skills/<name>/SKILL.md           — workspace-level skills
 *     workflows/*.md                   — workspace-level workflows
 *     rules/*.md                       — workspace-level rules/context
 */

import type { ConfigIO } from '../config-io';
import type { Logger } from '../logger';
import type { ToolAdapter } from './tool-adapter';
import type {
  ToolDetectionResult,
  ComponentId,
  ComponentType,
  Component,
  PortableComponent,
  InstallTarget,
  McpServerCore,
  SkillCore,
  CommandCore,
  SkeletonCore,
} from '@shared/types';
import { AppError } from '@shared/types';
import { TOOL_COMPONENTS, CACHE_PATTERNS } from '@shared/constants';
import { join, basename, resolve } from 'path';
import { stat, mkdir, rm } from 'fs/promises';
import * as yaml from 'js-yaml';

// -- Types --

type McpConfigData = {
  mcpServers?: Record<string, unknown>;
};

// -- Constants --

const TOOL_ID = 'antigravity' as const;
const MCP_CONFIG_FILENAME = 'mcp_config.json';

// -- Public API --

export function createAntigravityAdapter(
  rootPath: string,
  instanceId: string,
  configIO: ConfigIO,
  logger: Logger,
): ToolAdapter {
  const MODULE = 'AntigravityAdapter';

  // -- Path helpers --

  function mcpConfigPath(): string {
    return join(rootPath, MCP_CONFIG_FILENAME);
  }

  function skillsDir(): string {
    return join(rootPath, 'skills');
  }

  function workflowsDir(): string {
    return join(rootPath, 'global_workflows');
  }

  // -- Helpers --

  function validateName(name: string): void {
    if (name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0')) {
      throw new AppError(
        'CONFIG_PERMISSION',
        `Component name contains invalid characters: "${name}"`,
        false,
      );
    }
  }

  /** Verify resolved path stays within the expected root directory. */
  function assertPathWithin(target: string, root: string): void {
    const resolved = resolve(target);
    const resolvedRoot = resolve(root);
    if (
      !resolved.startsWith(resolvedRoot + '/') &&
      !resolved.startsWith(resolvedRoot + '\\') &&
      resolved !== resolvedRoot
    ) {
      throw new AppError(
        'CONFIG_PERMISSION',
        `Path escapes root: ${resolved} is not within ${resolvedRoot}`,
        false,
      );
    }
  }

  // -- Scan: MCP servers --

  async function scanMcpServers(): Promise<Component[]> {
    const components: Component[] = [];
    const cfgPath = mcpConfigPath();

    if (!(await configIO.exists(cfgPath))) return components;

    try {
      const raw = (await configIO.readJSON(cfgPath)) as McpConfigData;
      const servers = raw?.mcpServers;
      if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return components;

      for (const [name, config] of Object.entries(servers)) {
        if (!config || typeof config !== 'object') continue;
        const core = normalizeMcpCore(config as Record<string, unknown>);
        components.push({
          id: { tool: TOOL_ID, type: 'mcp-server', name, scope: 'global' },
          core,
          configPath: cfgPath,
          tracking: 'detected',
        });
      }
    } catch (err) {
      logger.warn(MODULE, 'Failed to scan MCP config', err);
    }

    return components;
  }

  // -- Scan: Skills --

  async function scanSkills(): Promise<Component[]> {
    const components: Component[] = [];
    const dir = skillsDir();

    try {
      const entries = await configIO.listDir(dir);
      for (const entry of entries) {
        const skillDir = join(dir, entry);
        try {
          const s = await stat(skillDir);
          if (!s.isDirectory()) continue;

          const skillFile = join(skillDir, 'SKILL.md');
          if (!(await configIO.exists(skillFile))) continue;

          const { frontmatter, content } = await configIO.readYAMLFrontmatter(skillFile);
          const fm = (frontmatter as Record<string, unknown>) ?? {};

          const core: SkillCore = {
            description: fm.description ? String(fm.description) : '',
            content,
          };

          components.push({
            id: { tool: TOOL_ID, type: 'skill', name: entry, scope: 'global' },
            core,
            configPath: skillFile,
            tracking: 'detected',
            description: fm.description ? String(fm.description) : undefined,
            displayName: fm.name ? String(fm.name) : entry,
          });
        } catch (err) {
          logger.warn(MODULE, `Failed to parse skill: ${skillDir}`, err);
        }
      }
    } catch {
      // skills/ doesn't exist — acceptable
    }

    return components;
  }

  // -- Scan: Workflows (slash commands) --

  async function scanWorkflows(): Promise<Component[]> {
    const components: Component[] = [];
    const dir = workflowsDir();

    try {
      const entries = await configIO.listDir(dir, '*.md');
      for (const entry of entries) {
        const filePath = join(dir, entry);
        try {
          const { frontmatter, content } = await configIO.readYAMLFrontmatter(filePath);
          const fm = (frontmatter as Record<string, unknown>) ?? {};
          const name = basename(entry, '.md');

          const core: CommandCore = {
            description: fm.description ? String(fm.description) : undefined,
            content,
          };

          components.push({
            id: { tool: TOOL_ID, type: 'command', name, scope: 'global' },
            core,
            configPath: filePath,
            tracking: 'detected',
            description: fm.description ? String(fm.description) : undefined,
            displayName: fm.name ? String(fm.name) : name,
          });
        } catch (err) {
          logger.warn(MODULE, `Failed to parse workflow: ${filePath}`, err);
        }
      }
    } catch {
      // global_workflows/ doesn't exist — acceptable
    }

    return components;
  }

  // -- Scan: Global context file --

  async function scanGlobalContext(): Promise<Component[]> {
    // Antigravity shares ~/.gemini/GEMINI.md with Gemini CLI
    const ctxPath = join(rootPath, '..', 'GEMINI.md');

    try {
      if (!(await configIO.exists(ctxPath))) return [];

      const { content } = await configIO.readYAMLFrontmatter(ctxPath);
      return [
        {
          id: { tool: TOOL_ID, type: 'context-file', name: 'GEMINI.md', scope: 'global' },
          core: {
            rawConfig: { fileName: 'GEMINI.md', contentLength: content.length },
            rawTypeName: 'context-file',
          } as SkeletonCore,
          configPath: ctxPath,
          tracking: 'detected',
          description: 'Global context file (shared with Gemini CLI)',
        },
      ];
    } catch {
      return [];
    }
  }

  // -- Install --

  async function installMcpServer(
    portable: PortableComponent,
    _target: InstallTarget,
  ): Promise<Component> {
    validateName(portable.name);

    const cfgPath = mcpConfigPath();
    let data: McpConfigData = {};

    try {
      if (await configIO.exists(cfgPath)) {
        data = (await configIO.readJSON(cfgPath)) as McpConfigData;
      }
    } catch (err) {
      if (err instanceof AppError && err.code === 'CONFIG_CORRUPTED') {
        logger.warn(MODULE, `Config corrupted, starting fresh: ${cfgPath}`, err);
      } else {
        throw err;
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
      serverConfig = { url: core.url };
      if (core.headers) serverConfig.headers = core.headers;
    }

    if (data.mcpServers[portable.name]) {
      logger.warn(MODULE, `Overwriting existing MCP server "${portable.name}"`);
    }
    data.mcpServers[portable.name] = serverConfig;
    await configIO.writeJSON(cfgPath, data);

    return {
      id: { tool: TOOL_ID, type: 'mcp-server', name: portable.name, scope: 'global' },
      core,
      configPath: cfgPath,
      tracking: 'managed',
    };
  }

  async function installSkill(
    portable: PortableComponent,
    _target: InstallTarget,
  ): Promise<Component> {
    validateName(portable.name);
    const skillDir = join(skillsDir(), portable.name);
    assertPathWithin(skillDir, rootPath);
    await mkdir(skillDir, { recursive: true });

    const core = portable.core as SkillCore;
    const fmObj: Record<string, unknown> = { name: portable.name };
    if (portable.description) fmObj.description = portable.description;

    const fmYaml = yaml.dump(fmObj, { lineWidth: -1 }).trimEnd();
    const content = `---\n${fmYaml}\n---\n${core.content}\n`;
    const filePath = join(skillDir, 'SKILL.md');
    await configIO.writeFile(filePath, content);

    return {
      id: { tool: TOOL_ID, type: 'skill', name: portable.name, scope: 'global' },
      core,
      configPath: filePath,
      tracking: 'managed',
      description: portable.description,
    };
  }

  // -- Uninstall --

  async function uninstallMcpServer(id: ComponentId): Promise<void> {
    validateName(id.name);
    const cfgPath = mcpConfigPath();
    if (!(await configIO.exists(cfgPath))) {
      throw new AppError('COMPONENT_NOT_FOUND', `Config file not found: ${cfgPath}`, true);
    }

    const data = (await configIO.readJSON(cfgPath)) as McpConfigData;
    if (!data.mcpServers || !(id.name in data.mcpServers)) {
      throw new AppError('COMPONENT_NOT_FOUND', `MCP server "${id.name}" not found`, true);
    }

    delete data.mcpServers[id.name];
    await configIO.writeJSON(cfgPath, data);
  }

  async function uninstallSkill(id: ComponentId): Promise<void> {
    validateName(id.name);
    const dir = join(skillsDir(), id.name);
    assertPathWithin(dir, rootPath);
    await rm(dir, { recursive: true, force: true });
  }

  // -- ToolAdapter implementation --

  return {
    toolId: TOOL_ID,
    instanceId,
    rootPath,

    async detect(): Promise<ToolDetectionResult> {
      // Detect by mcp_config.json — configIO.exists uses isFile(), so directory checks won't work
      const detected = await configIO.exists(mcpConfigPath());
      logger.info(MODULE, `detect: ${rootPath} → ${detected}`);
      return { toolId: TOOL_ID, instanceId, path: rootPath, detected };
    },

    async scan(): Promise<Component[]> {
      logger.info(MODULE, `Scanning: ${rootPath}`);

      try {
        const [mcpServers, skills, workflows, globalCtx] = await Promise.all([
          scanMcpServers(),
          scanSkills(),
          scanWorkflows(),
          scanGlobalContext(),
        ]);

        const components = [...mcpServers, ...skills, ...workflows, ...globalCtx];
        logger.info(MODULE, `Scan complete: ${components.length} components`);
        return components;
      } catch (err) {
        logger.warn(MODULE, `Scan failed: ${rootPath}`, err);
        return [];
      }
    },

    async install(portable, target) {
      logger.info(MODULE, `Installing ${portable.type} "${portable.name}"`);

      switch (portable.type) {
        case 'mcp-server':
          return installMcpServer(portable, target);
        case 'skill':
          return installSkill(portable, target);
        default:
          throw new AppError(
            'ADAPTER_UNSUPPORTED',
            `Antigravity install not supported for type "${portable.type}"`,
            false,
          );
      }
    },

    async uninstall(id) {
      logger.info(MODULE, `Uninstalling ${id.type} "${id.name}"`);

      switch (id.type) {
        case 'mcp-server':
          return uninstallMcpServer(id);
        case 'skill':
          return uninstallSkill(id);
        default:
          throw new AppError(
            'ADAPTER_UNSUPPORTED',
            `Antigravity uninstall not supported for type "${id.type}"`,
            false,
          );
      }
    },

    async enable() {
      throw new AppError(
        'ADAPTER_UNSUPPORTED',
        'Antigravity does not support native component toggle',
        false,
      );
    },

    async disable() {
      throw new AppError(
        'ADAPTER_UNSUPPORTED',
        'Antigravity does not support native component toggle',
        false,
      );
    },

    canToggle() {
      return false;
    },

    getConfigPath() {
      return mcpConfigPath();
    },

    getSupportedTypes(): ComponentType[] {
      return TOOL_COMPONENTS[TOOL_ID];
    },

    resolveConfigDir(): string {
      return rootPath;
    },

    getCachePatterns(): string[] {
      return (CACHE_PATTERNS[TOOL_ID] ?? []).map((e) => e.pattern);
    },
  };
}

// -- Utility functions --

function normalizeMcpCore(config: Record<string, unknown>): McpServerCore {
  if (config.url) {
    const url = String(config.url);
    return { transport: 'http', url };
  }

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

// -- Platform path resolution --

/**
 * Resolve the default Antigravity config directory.
 * Antigravity uses ~/.gemini/antigravity/ on all platforms.
 */
export function resolveDefaultAntigravityConfigDir(): string {
  return join(process.env.HOME ?? process.env.USERPROFILE ?? '/tmp', '.gemini', 'antigravity');
}
