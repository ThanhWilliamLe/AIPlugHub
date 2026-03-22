/**
 * ClaudeCodeAdapter — adapter for Claude Code CLI tool.
 * Most complex adapter: 4 scopes, 8+ component types, multiple file formats.
 * Source: 6C-build-plan/implementation-plan.md §M2
 *
 * Claude Code config layout (user scope):
 *   rootPath/                    (~/.claude/)
 *     settings.json              — hooks, preferences
 *     skills/<name>/SKILL.md     — skill definitions (YAML frontmatter + markdown)
 *     commands/<name>.md         — command definitions (legacy, merging into skills)
 *     agents/<name>.md           — sub-agent definitions (YAML frontmatter + markdown)
 *   <parent of rootPath>/
 *     .claude.json               — MCP server config { mcpServers: { ... } }
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
  SkillCore,
  CommandCore,
  HookCore,
  AgentCore,
} from '@shared/types';
import { AppError } from '@shared/types';
import { TOOL_COMPONENTS, CACHE_PATTERNS } from '@shared/constants';
import { join, dirname, basename, resolve, sep } from 'path';
import { stat, lstat, unlink, rm, mkdir } from 'fs/promises';
import * as yaml from 'js-yaml';

// -- Types for Claude Code config structures --

type McpConfigData = {
  mcpServers?: Record<string, unknown>;
};

type SettingsData = {
  hooks?: Record<string, HookGroupEntry[]>;
  enabledPlugins?: Record<string, boolean>;
  [key: string]: unknown;
};

type InstalledPluginsData = {
  version?: number;
  plugins: Record<string, InstalledPluginEntry[]>;
};

type InstalledPluginEntry = {
  scope: string;
  projectPath?: string;
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated: string;
  gitCommitSha?: string;
};

type EnabledPluginsMap = Record<string, boolean>;

export type KnownMarketplaceEntry = {
  name: string;
  url: string;
  [key: string]: unknown;
};

type HookGroupEntry = {
  matcher?: string;
  hooks: HookHandlerEntry[];
};

type HookHandlerEntry = {
  type: string;
  command?: string;
  url?: string;
  prompt?: string;
  agent?: string;
  timeout?: number;
};

// -- Constants --

const TOOL_ID = 'claude-code' as const;

// -- Public API --

export type ClaudeCodeAdapterExtended = ToolAdapter & {
  togglePlugin(pluginKey: string, enabled: boolean): Promise<void>;
  uninstallPlugin(pluginKey: string): Promise<void>;
  getKnownMarketplaces(): Promise<KnownMarketplaceEntry[]>;
};

export function createClaudeCodeAdapter(
  rootPath: string,
  instanceId: string,
  configIO: ConfigIO,
  logger: Logger,
): ClaudeCodeAdapterExtended {
  const MODULE = 'ClaudeCodeAdapter';

  // -- Path helpers --

  /** User-scope MCP config: ~/.claude.json (parent of rootPath) */
  function mcpConfigPath(): string {
    return join(dirname(rootPath), '.claude.json');
  }

  function settingsPath(): string {
    return join(rootPath, 'settings.json');
  }

  function skillsDir(): string {
    return join(rootPath, 'skills');
  }

  function commandsDir(): string {
    return join(rootPath, 'commands');
  }

  function agentsDir(): string {
    return join(rootPath, 'agents');
  }

  function pluginsDir(): string {
    return join(rootPath, 'plugins');
  }

  function installedPluginsPath(): string {
    return join(pluginsDir(), 'installed_plugins.json');
  }

  function knownMarketplacesPath(): string {
    return join(pluginsDir(), 'known_marketplaces.json');
  }

  // -- Helpers --

  async function isDir(path: string): Promise<boolean> {
    try {
      const info = await stat(path);
      return info.isDirectory();
    } catch {
      return false;
    }
  }

  /** Validate component name does not contain path traversal characters. */
  function validateName(name: string): void {
    if (
      name.includes('..') ||
      name.includes(sep) ||
      name.includes('/') ||
      name.includes('\\') ||
      name.includes('\0')
    ) {
      throw new AppError(
        'CONFIG_PERMISSION',
        `Component name contains invalid characters: "${name}"`,
        false,
      );
    }
  }

  /** Verify path resolves within the allowed root directory. */
  function assertPathWithin(target: string, allowedRoot: string): void {
    const resolved = resolve(target);
    const root = resolve(allowedRoot);
    if (!resolved.startsWith(root + sep) && resolved !== root) {
      throw new AppError('CONFIG_PERMISSION', `Path escapes config directory: ${target}`, false);
    }
  }

  /** Check that a path is not a symlink before destructive operations. */
  async function assertNotSymlink(path: string): Promise<void> {
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink()) {
        throw new AppError('CONFIG_PERMISSION', `Refusing to delete symlink: ${path}`, false);
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Path doesn't exist — fine, nothing to delete
    }
  }

  // -- Scan context for scope parameterization --

  type ScanContext = {
    scope: string;
    projectPath?: string;
  };

  // -- Scan sub-routines --

  async function scanMcpServers(ctx?: ScanContext): Promise<Component[]> {
    const components: Component[] = [];
    const mcpPath = ctx?.projectPath ? join(ctx.projectPath, '.claude.json') : mcpConfigPath();
    const scope = ctx?.scope ?? 'user';

    try {
      if (!(await configIO.exists(mcpPath))) return components;

      const raw = (await configIO.readJSON(mcpPath)) as McpConfigData;
      const servers = raw?.mcpServers;
      if (!servers || typeof servers !== 'object') return components;

      for (const [name, config] of Object.entries(servers)) {
        if (!config || typeof config !== 'object') continue;
        const core = normalizeMcpCore(config as Record<string, unknown>);
        components.push({
          id: { tool: TOOL_ID, type: 'mcp-server', name, scope, projectPath: ctx?.projectPath },
          core,
          configPath: mcpPath,
          tracking: 'detected',
          projectPath: ctx?.projectPath,
        });
      }
    } catch (err) {
      logger.warn(MODULE, `Failed to scan MCP servers: ${mcpPath}`, err);
    }

    return components;
  }

  async function scanSkills(ctx?: ScanContext): Promise<Component[]> {
    const components: Component[] = [];
    const dir = ctx?.projectPath ? join(ctx.projectPath, '.claude', 'skills') : skillsDir();
    const scope = ctx?.scope ?? 'user';

    try {
      const entries = await configIO.listDir(dir);
      for (const entry of entries) {
        const entryPath = join(dir, entry);
        if (!(await isDir(entryPath))) continue;

        const skillMd = join(entryPath, 'SKILL.md');
        if (!(await configIO.exists(skillMd))) continue;

        try {
          const { frontmatter, content } = await configIO.readYAMLFrontmatter(skillMd);
          const fm = (frontmatter as Record<string, unknown>) ?? {};

          const core: SkillCore = {
            description: String(fm.description ?? ''),
            content,
          };

          // Extract CC-specific extension fields from frontmatter
          const extensions: Record<string, unknown> = {};
          if (fm['disable-model-invocation'] != null)
            extensions.disableModelInvocation = Boolean(fm['disable-model-invocation']);
          if (fm['user-invocable'] != null)
            extensions.userInvocable = Boolean(fm['user-invocable']);
          if (fm['argument-hint'] != null) extensions.argumentHint = String(fm['argument-hint']);
          if (fm.model != null) extensions.model = String(fm.model);
          if (fm.context != null)
            extensions.context = Array.isArray(fm.context)
              ? fm.context.map(String)
              : [String(fm.context)];
          if (fm.agent != null) extensions.agent = fm.agent;

          const skillName = String(fm.name ?? entry);

          components.push({
            id: {
              tool: TOOL_ID,
              type: 'skill',
              name: skillName,
              scope,
              projectPath: ctx?.projectPath,
            },
            core,
            extensions: Object.keys(extensions).length > 0 ? extensions : undefined,
            configPath: skillMd,
            tracking: 'detected',
            description: core.description || undefined,
            projectPath: ctx?.projectPath,
          });
        } catch (err) {
          logger.warn(MODULE, `Failed to parse skill: ${skillMd}`, err);
        }
      }
    } catch {
      // skills/ doesn't exist — acceptable
    }

    return components;
  }

  async function scanCommands(ctx?: ScanContext): Promise<Component[]> {
    const components: Component[] = [];
    const dir = ctx?.projectPath ? join(ctx.projectPath, '.claude', 'commands') : commandsDir();
    const scope = ctx?.scope ?? 'user';

    try {
      const entries = await configIO.listDir(dir, '*.md');
      for (const entry of entries) {
        const filePath = join(dir, entry);
        try {
          const { frontmatter, content } = await configIO.readYAMLFrontmatter(filePath);
          const fm = (frontmatter as Record<string, unknown>) ?? {};
          const name = String(fm.name ?? basename(entry, '.md'));

          const core: CommandCore = {
            description: fm.description ? String(fm.description) : undefined,
            content,
          };

          if (Array.isArray(fm.arguments)) {
            core.arguments = (fm.arguments as unknown[]).map((arg) => {
              if (typeof arg === 'string') return { name: arg };
              const a = arg as Record<string, unknown>;
              return {
                name: String(a.name ?? ''),
                description: a.description ? String(a.description) : undefined,
              };
            });
          }

          components.push({
            id: { tool: TOOL_ID, type: 'command', name, scope, projectPath: ctx?.projectPath },
            core,
            configPath: filePath,
            tracking: 'detected',
            description: core.description || undefined,
            projectPath: ctx?.projectPath,
          });
        } catch (err) {
          logger.warn(MODULE, `Failed to parse command: ${filePath}`, err);
        }
      }
    } catch {
      // commands/ doesn't exist — acceptable
    }

    return components;
  }

  async function scanAgents(ctx?: ScanContext): Promise<Component[]> {
    const components: Component[] = [];
    const dir = ctx?.projectPath ? join(ctx.projectPath, '.claude', 'agents') : agentsDir();
    const scope = ctx?.scope ?? 'user';

    try {
      const entries = await configIO.listDir(dir, '*.md');
      for (const entry of entries) {
        const filePath = join(dir, entry);
        try {
          const { frontmatter } = await configIO.readYAMLFrontmatter(filePath);
          const fm = (frontmatter as Record<string, unknown>) ?? {};
          const name = String(fm.name ?? basename(entry, '.md'));

          const core: AgentCore = {
            description: fm.description ? String(fm.description) : '',
            model: fm.model ? String(fm.model) : undefined,
            tools: Array.isArray(fm.tools) ? fm.tools.map(String) : undefined,
            disallowedTools: Array.isArray(fm.disallowedTools)
              ? fm.disallowedTools.map(String)
              : undefined,
            maxTurns: typeof fm.maxTurns === 'number' ? fm.maxTurns : undefined,
          };

          const extensions: Record<string, unknown> = {};
          if (fm.permissionMode) extensions.permissionMode = String(fm.permissionMode);
          if (Array.isArray(fm.skills)) extensions.skills = fm.skills.map(String);
          if (fm.mcpServers) extensions.mcpServers = fm.mcpServers;
          if (fm.hooks) extensions.hooks = fm.hooks;
          if (fm.memory) extensions.memory = fm.memory;
          if (typeof fm.background === 'boolean') extensions.background = fm.background;
          if (typeof fm.isolation === 'boolean') extensions.isolation = fm.isolation;

          components.push({
            id: { tool: TOOL_ID, type: 'agent', name, scope, projectPath: ctx?.projectPath },
            core,
            extensions: Object.keys(extensions).length > 0 ? extensions : undefined,
            configPath: filePath,
            tracking: 'detected',
            description: fm.description ? String(fm.description) : undefined,
            projectPath: ctx?.projectPath,
          });
        } catch (err) {
          logger.warn(MODULE, `Failed to parse agent: ${filePath}`, err);
        }
      }
    } catch {
      // agents/ doesn't exist — acceptable
    }

    return components;
  }

  async function scanHooks(ctx?: ScanContext): Promise<Component[]> {
    const components: Component[] = [];
    const path = ctx?.projectPath
      ? join(ctx.projectPath, '.claude', 'settings.json')
      : settingsPath();
    const scope = ctx?.scope ?? 'user';

    try {
      if (!(await configIO.exists(path))) return components;
      const settings = (await configIO.readJSON(path)) as SettingsData;
      if (!settings?.hooks || typeof settings.hooks !== 'object') return components;

      for (const [event, groups] of Object.entries(settings.hooks)) {
        if (!Array.isArray(groups)) continue;

        for (let gi = 0; gi < groups.length; gi++) {
          const group = groups[gi];
          if (!group?.hooks || !Array.isArray(group.hooks)) continue;

          for (let hi = 0; hi < group.hooks.length; hi++) {
            const handler = group.hooks[hi];
            const hookName = `${event}::${gi}::${hi}`;

            let coreHandler: HookCore['handler'];
            const hookExtensions: Record<string, unknown> = {};

            if (handler.type === 'command' && handler.command) {
              coreHandler = { type: 'command', command: handler.command };
            } else if (handler.type === 'http' && handler.url) {
              coreHandler = { type: 'http', url: handler.url };
            } else if (handler.type === 'prompt' && handler.prompt) {
              // prompt handler is CC-specific — store in extensions
              coreHandler = { type: 'command', command: '' };
              hookExtensions.handler = { type: 'prompt', prompt: handler.prompt };
            } else if (handler.type === 'agent' && handler.agent) {
              // agent handler is CC-specific — store in extensions
              coreHandler = { type: 'command', command: '' };
              hookExtensions.handler = { type: 'agent', agent: handler.agent };
            } else {
              continue; // skip unknown handler types
            }

            const core: HookCore = {
              event,
              handler: coreHandler,
              matcher: group.matcher,
            };

            components.push({
              id: {
                tool: TOOL_ID,
                type: 'hook',
                name: hookName,
                scope,
                projectPath: ctx?.projectPath,
              },
              core,
              extensions: Object.keys(hookExtensions).length > 0 ? hookExtensions : undefined,
              configPath: path,
              tracking: 'detected',
              projectPath: ctx?.projectPath,
            });
          }
        }
      }
    } catch (err) {
      logger.warn(MODULE, `Failed to scan hooks: ${path}`, err);
    }

    return components;
  }

  // -- Plugin scan helpers --

  async function readEnabledPlugins(): Promise<EnabledPluginsMap> {
    try {
      const path = settingsPath();
      if (!(await configIO.exists(path))) return {};
      const settings = (await configIO.readJSON(path)) as SettingsData;
      if (!settings?.enabledPlugins || typeof settings.enabledPlugins !== 'object') return {};
      return settings.enabledPlugins;
    } catch {
      return {};
    }
  }

  async function scanPluginSubComponents(
    installPath: string,
    pluginKey: string,
    pluginName: string,
    marketplace: string,
    pluginVersion: string,
    isEnabled: boolean,
  ): Promise<Component[]> {
    const components: Component[] = [];

    const makeExtensions = () => ({
      pluginKey,
      pluginName,
      marketplace,
      pluginVersion,
    });

    // Scan skills subdirectory
    const skillsPath = join(installPath, 'skills');
    try {
      const entries = await configIO.listDir(skillsPath);
      for (const entry of entries) {
        const entryPath = join(skillsPath, entry);
        if (!(await isDir(entryPath))) continue;

        const skillMd = join(entryPath, 'SKILL.md');
        if (!(await configIO.exists(skillMd))) continue;

        try {
          const { frontmatter, content } = await configIO.readYAMLFrontmatter(skillMd);
          const fm = (frontmatter as Record<string, unknown>) ?? {};

          const core: SkillCore = {
            description: String(fm.description ?? ''),
            content,
          };

          const skillName = String(fm.name ?? entry);

          components.push({
            id: {
              tool: TOOL_ID,
              type: 'skill',
              name: `${pluginKey}/${skillName}`,
              scope: 'plugin',
            },
            enabled: isEnabled,
            core,
            extensions: makeExtensions(),
            configPath: skillMd,
            tracking: 'detected',
            version: pluginVersion,
            description: core.description || undefined,
          });
        } catch (err) {
          logger.warn(MODULE, `Failed to parse plugin skill: ${skillMd}`, err);
        }
      }
    } catch {
      // no skills/ subdirectory — fine
    }

    // Scan commands subdirectory
    const commandsPath = join(installPath, 'commands');
    try {
      const entries = await configIO.listDir(commandsPath, '*.md');
      for (const entry of entries) {
        const filePath = join(commandsPath, entry);
        try {
          const { frontmatter, content } = await configIO.readYAMLFrontmatter(filePath);
          const fm = (frontmatter as Record<string, unknown>) ?? {};
          const name = String(fm.name ?? basename(entry, '.md'));

          const core: CommandCore = {
            description: fm.description ? String(fm.description) : undefined,
            content,
          };

          components.push({
            id: { tool: TOOL_ID, type: 'command', name: `${pluginKey}/${name}`, scope: 'plugin' },
            enabled: isEnabled,
            core,
            extensions: makeExtensions(),
            configPath: filePath,
            tracking: 'detected',
            version: pluginVersion,
            description: core.description || undefined,
          });
        } catch (err) {
          logger.warn(MODULE, `Failed to parse plugin command: ${filePath}`, err);
        }
      }
    } catch {
      // no commands/ subdirectory — fine
    }

    // Scan agents subdirectory
    const agentsPath = join(installPath, 'agents');
    try {
      const entries = await configIO.listDir(agentsPath, '*.md');
      for (const entry of entries) {
        const filePath = join(agentsPath, entry);
        try {
          const { frontmatter } = await configIO.readYAMLFrontmatter(filePath);
          const fm = (frontmatter as Record<string, unknown>) ?? {};
          const name = String(fm.name ?? basename(entry, '.md'));

          const core: AgentCore = {
            description: fm.description ? String(fm.description) : '',
            model: fm.model ? String(fm.model) : undefined,
            tools: Array.isArray(fm.tools) ? fm.tools.map(String) : undefined,
            disallowedTools: Array.isArray(fm.disallowedTools)
              ? fm.disallowedTools.map(String)
              : undefined,
            maxTurns: typeof fm.maxTurns === 'number' ? fm.maxTurns : undefined,
          };

          components.push({
            id: { tool: TOOL_ID, type: 'agent', name: `${pluginKey}/${name}`, scope: 'plugin' },
            enabled: isEnabled,
            core,
            extensions: makeExtensions(),
            configPath: filePath,
            tracking: 'detected',
            version: pluginVersion,
            description: fm.description ? String(fm.description) : undefined,
          });
        } catch (err) {
          logger.warn(MODULE, `Failed to parse plugin agent: ${filePath}`, err);
        }
      }
    } catch {
      // no agents/ subdirectory — fine
    }

    return components;
  }

  async function scanPlugins(): Promise<Component[]> {
    const components: Component[] = [];
    const regPath = installedPluginsPath();

    try {
      if (!(await configIO.exists(regPath))) return components;

      const raw = (await configIO.readJSON(regPath)) as InstalledPluginsData;
      if (!raw?.plugins || typeof raw.plugins !== 'object') return components;

      const enabledMap = await readEnabledPlugins();

      for (const [pluginKey, entries] of Object.entries(raw.plugins)) {
        if (!Array.isArray(entries)) continue;

        // Parse pluginKey: name@marketplace
        const atIdx = pluginKey.lastIndexOf('@');
        const pluginName = atIdx > 0 ? pluginKey.slice(0, atIdx) : pluginKey;
        const marketplace = atIdx > 0 ? pluginKey.slice(atIdx + 1) : '';
        const isEnabled = enabledMap[pluginKey] ?? false;

        for (const entry of entries) {
          if (!entry || typeof entry !== 'object' || !entry.installPath) continue;

          let subComponents: Component[] = [];

          // Walk installPath looking for sub-components
          try {
            if (await isDir(entry.installPath)) {
              subComponents = await scanPluginSubComponents(
                entry.installPath,
                pluginKey,
                pluginName,
                marketplace,
                entry.version,
                isEnabled,
              );
            }
          } catch (err) {
            logger.warn(MODULE, `Failed to scan plugin install dir: ${entry.installPath}`, err);
          }

          if (subComponents.length > 0) {
            components.push(...subComponents);
          } else {
            // No scannable sub-components — create a placeholder
            components.push({
              id: { tool: TOOL_ID, type: 'unknown', name: pluginKey, scope: 'plugin' },
              enabled: isEnabled,
              core: { rawConfig: entry, rawTypeName: 'plugin' },
              extensions: {
                pluginKey,
                pluginName,
                marketplace,
                pluginVersion: entry.version,
              },
              tracking: 'detected',
              version: entry.version,
            });
          }
        }
      }
    } catch (err) {
      logger.warn(MODULE, `Failed to scan plugins: ${regPath}`, err);
    }

    return components;
  }

  // -- Install sub-routines --

  async function installMcpServer(
    portable: PortableComponent,
    target: InstallTarget,
  ): Promise<Component> {
    const mcpPath = mcpConfigPath();
    let data: McpConfigData = {};

    try {
      if (await configIO.exists(mcpPath)) {
        data = (await configIO.readJSON(mcpPath)) as McpConfigData;
      }
    } catch {
      // Start fresh
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
    await configIO.writeJSON(mcpPath, data);

    return {
      id: { tool: TOOL_ID, type: 'mcp-server', name: portable.name, scope: target.scope },
      core,
      configPath: mcpPath,
      tracking: 'managed',
    };
  }

  async function installSkill(
    portable: PortableComponent,
    target: InstallTarget,
  ): Promise<Component> {
    validateName(portable.name);
    const dir = join(skillsDir(), portable.name);
    assertPathWithin(dir, rootPath);
    await mkdir(dir, { recursive: true });

    const core = portable.core as SkillCore;

    // Build YAML frontmatter via js-yaml for safe escaping
    const fmObj: Record<string, unknown> = { name: portable.name };
    if (core.description) fmObj.description = core.description;

    const exts = portable.toolExtensions?.['claude-code'] as Record<string, unknown> | undefined;
    if (exts) {
      if (exts.disableModelInvocation != null)
        fmObj['disable-model-invocation'] = exts.disableModelInvocation;
      if (exts.userInvocable != null) fmObj['user-invocable'] = exts.userInvocable;
      if (exts.argumentHint) fmObj['argument-hint'] = exts.argumentHint;
      if (exts.model) fmObj.model = exts.model;
      if (exts.context != null) fmObj.context = exts.context;
      if (exts.agent != null) fmObj.agent = exts.agent;
    }

    const fmYaml = yaml.dump(fmObj, { lineWidth: -1 }).trimEnd();
    const content = `---\n${fmYaml}\n---\n${core.content}`;
    const skillPath = join(dir, 'SKILL.md');
    await configIO.writeFile(skillPath, content);

    return {
      id: { tool: TOOL_ID, type: 'skill', name: portable.name, scope: target.scope },
      core,
      configPath: skillPath,
      tracking: 'managed',
      description: core.description || undefined,
    };
  }

  async function installCommand(
    portable: PortableComponent,
    target: InstallTarget,
  ): Promise<Component> {
    validateName(portable.name);
    const dir = commandsDir();
    await mkdir(dir, { recursive: true });

    const core = portable.core as CommandCore;
    const fmObj: Record<string, unknown> = { name: portable.name };
    if (core.description) fmObj.description = core.description;
    if (core.arguments && core.arguments.length > 0) fmObj.arguments = core.arguments;

    const fmYaml = yaml.dump(fmObj, { lineWidth: -1 }).trimEnd();
    const content = `---\n${fmYaml}\n---\n${core.content}`;
    const filePath = join(dir, `${portable.name}.md`);
    assertPathWithin(filePath, rootPath);
    await configIO.writeFile(filePath, content);

    return {
      id: { tool: TOOL_ID, type: 'command', name: portable.name, scope: target.scope },
      core,
      configPath: filePath,
      tracking: 'managed',
      description: core.description || undefined,
    };
  }

  async function installAgent(
    portable: PortableComponent,
    target: InstallTarget,
  ): Promise<Component> {
    validateName(portable.name);
    const dir = agentsDir();
    await mkdir(dir, { recursive: true });

    const core = portable.core as AgentCore;
    // Build frontmatter from AgentCore + extensions
    const fmObj: Record<string, unknown> = { name: portable.name };
    if (portable.description) fmObj.description = portable.description;
    if (core.model) fmObj.model = core.model;
    if (core.tools) fmObj.tools = core.tools;
    if (core.disallowedTools) fmObj.disallowedTools = core.disallowedTools;
    if (core.maxTurns) fmObj.maxTurns = core.maxTurns;
    // Merge any extensions (permissionMode, skills, mcpServers, etc.)
    if (portable.extensions) {
      for (const [k, v] of Object.entries(portable.extensions)) {
        if (v !== undefined) fmObj[k] = v;
      }
    }

    const fmYaml = yaml.dump(fmObj, { lineWidth: -1 }).trimEnd();
    const content = `---\n${fmYaml}\n---\n`;
    const filePath = join(dir, `${portable.name}.md`);
    assertPathWithin(filePath, rootPath);
    await configIO.writeFile(filePath, content);

    return {
      id: { tool: TOOL_ID, type: 'agent', name: portable.name, scope: target.scope },
      core,
      configPath: filePath,
      tracking: 'managed',
      description: portable.description,
    };
  }

  // -- Uninstall sub-routines --

  async function uninstallMcpServer(id: ComponentId): Promise<void> {
    const mcpPath = mcpConfigPath();
    if (!(await configIO.exists(mcpPath))) {
      throw new AppError('COMPONENT_NOT_FOUND', `MCP config not found: ${mcpPath}`, true);
    }

    const data = (await configIO.readJSON(mcpPath)) as McpConfigData;
    if (!data.mcpServers || !(id.name in data.mcpServers)) {
      throw new AppError('COMPONENT_NOT_FOUND', `MCP server "${id.name}" not found`, true);
    }

    delete data.mcpServers[id.name];
    await configIO.writeJSON(mcpPath, data);
  }

  async function uninstallFileComponent(id: ComponentId): Promise<void> {
    validateName(id.name);

    switch (id.type) {
      case 'skill': {
        const dir = join(skillsDir(), id.name);
        assertPathWithin(dir, rootPath);
        const filePath = join(dir, 'SKILL.md');
        if (!(await configIO.exists(filePath))) {
          throw new AppError('COMPONENT_NOT_FOUND', `Skill "${id.name}" not found`, true);
        }
        await assertNotSymlink(dir);
        logger.info(MODULE, `Deleting skill directory: ${dir}`);
        await rm(dir, { recursive: true });
        return;
      }
      case 'command': {
        const filePath = join(commandsDir(), `${id.name}.md`);
        assertPathWithin(filePath, rootPath);
        if (!(await configIO.exists(filePath))) {
          throw new AppError('COMPONENT_NOT_FOUND', `Command "${id.name}" not found`, true);
        }
        await assertNotSymlink(filePath);
        logger.info(MODULE, `Deleting command file: ${filePath}`);
        await unlink(filePath);
        return;
      }
      case 'agent': {
        const filePath = join(agentsDir(), `${id.name}.md`);
        assertPathWithin(filePath, rootPath);
        if (!(await configIO.exists(filePath))) {
          throw new AppError('COMPONENT_NOT_FOUND', `Agent "${id.name}" not found`, true);
        }
        await assertNotSymlink(filePath);
        logger.info(MODULE, `Deleting agent file: ${filePath}`);
        await unlink(filePath);
        return;
      }
      default:
        throw new AppError('ADAPTER_UNSUPPORTED', `Cannot uninstall type "${id.type}"`, false);
    }
  }

  async function uninstallHook(id: ComponentId): Promise<void> {
    const path = settingsPath();
    if (!(await configIO.exists(path))) {
      throw new AppError('COMPONENT_NOT_FOUND', 'Settings file not found', true);
    }

    const settings = (await configIO.readJSON(path)) as SettingsData;
    if (!settings?.hooks) {
      throw new AppError('COMPONENT_NOT_FOUND', `Hook "${id.name}" not found`, true);
    }

    // Parse hook name: <event>::<groupIdx>::<handlerIdx>
    const match = id.name.match(/^(.+)::(\d+)::(\d+)$/);
    if (!match) {
      throw new AppError('COMPONENT_NOT_FOUND', `Invalid hook name: "${id.name}"`, false);
    }

    const [, event, giStr, hiStr] = match;
    const gi = parseInt(giStr, 10);
    const hi = parseInt(hiStr, 10);

    const groups = settings.hooks[event];
    if (!groups?.[gi]?.hooks?.[hi]) {
      throw new AppError('COMPONENT_NOT_FOUND', `Hook "${id.name}" not found in settings`, true);
    }

    // NOTE: splice shifts indices — callers must re-scan between batch uninstalls
    // of hooks in the same group. M4 operation serialization will enforce this.
    groups[gi].hooks.splice(hi, 1);
    if (groups[gi].hooks.length === 0) groups.splice(gi, 1);
    if (groups.length === 0) delete settings.hooks[event];
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

    await configIO.writeJSON(path, settings);
  }

  // -- ToolAdapter implementation --

  return {
    toolId: TOOL_ID,
    instanceId,
    rootPath,

    async detect(): Promise<ToolDetectionResult> {
      const detected = await isDir(rootPath);
      logger.info(MODULE, `detect: ${rootPath} → ${detected}`);
      return { toolId: TOOL_ID, instanceId, path: rootPath, detected };
    },

    async scan(): Promise<Component[]> {
      logger.info(MODULE, `Scanning: ${rootPath}`);

      const results = await Promise.all([
        scanMcpServers(),
        scanSkills(),
        scanCommands(),
        scanAgents(),
        scanHooks(),
        scanPlugins(),
      ]);

      const components = results.flat();

      // Deduplicate: if a standalone component (scope='user') has the same
      // type+name as a plugin sub-component, keep the standalone and drop the duplicate.
      const standaloneKeys = new Set<string>();
      for (const c of components) {
        if (c.id.scope === 'user') {
          standaloneKeys.add(`${c.id.type}::${c.id.name}`);
        }
      }
      const deduplicated = components.filter((c) => {
        if (c.id.scope === 'plugin') {
          return !standaloneKeys.has(`${c.id.type}::${c.id.name}`);
        }
        return true;
      });

      logger.info(MODULE, `Scan complete: ${deduplicated.length} components`);
      return deduplicated;
    },

    async install(portable, target) {
      logger.info(MODULE, `Installing ${portable.type} "${portable.name}"`);

      switch (portable.type) {
        case 'mcp-server':
          return installMcpServer(portable, target);
        case 'skill':
          return installSkill(portable, target);
        case 'command':
          return installCommand(portable, target);
        case 'agent':
          return installAgent(portable, target);
        default:
          throw new AppError(
            'ADAPTER_UNSUPPORTED',
            `Install not supported for type "${portable.type}"`,
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
        case 'command':
        case 'agent':
          return uninstallFileComponent(id);
        case 'hook':
          return uninstallHook(id);
        default:
          throw new AppError(
            'ADAPTER_UNSUPPORTED',
            `Uninstall not supported for type "${id.type}"`,
            false,
          );
      }
    },

    async enable() {
      throw new AppError(
        'ADAPTER_UNSUPPORTED',
        'Claude Code does not support native component toggle',
        false,
      );
    },

    async disable() {
      throw new AppError(
        'ADAPTER_UNSUPPORTED',
        'Claude Code does not support native component toggle',
        false,
      );
    },

    canToggle() {
      return false;
    },

    getConfigPath(id) {
      switch (id.type) {
        case 'mcp-server':
          return mcpConfigPath();
        case 'skill':
          return join(skillsDir(), id.name, 'SKILL.md');
        case 'command':
          return join(commandsDir(), `${id.name}.md`);
        case 'agent':
          return join(agentsDir(), `${id.name}.md`);
        case 'hook':
          return settingsPath();
        default:
          return rootPath;
      }
    },

    getSupportedTypes() {
      return TOOL_COMPONENTS[TOOL_ID];
    },

    resolveConfigDir() {
      return rootPath;
    },

    async scanProject(projectPath: string): Promise<Component[]> {
      logger.info(MODULE, `Scanning project: ${projectPath}`);
      const resolvedPath = resolve(projectPath);

      const ctx: ScanContext = { scope: 'project', projectPath: resolvedPath };
      const results = await Promise.all([
        scanMcpServers(ctx),
        scanSkills(ctx),
        scanCommands(ctx),
        scanAgents(ctx),
        scanHooks(ctx),
      ]);

      const components = results.flat();
      logger.info(
        MODULE,
        `Project scan complete: ${components.length} components in ${resolvedPath}`,
      );
      return components;
    },

    async togglePlugin(pluginKey: string, enabled: boolean): Promise<void> {
      logger.info(MODULE, `togglePlugin: ${pluginKey} → ${enabled}`);
      const path = settingsPath();
      let settings: SettingsData = {};

      try {
        if (await configIO.exists(path)) {
          settings = (await configIO.readJSON(path)) as SettingsData;
        }
      } catch {
        // Start fresh
      }

      if (!settings.enabledPlugins) settings.enabledPlugins = {};
      settings.enabledPlugins[pluginKey] = enabled;
      await configIO.writeJSON(path, settings);
    },

    async uninstallPlugin(pluginKey: string): Promise<void> {
      logger.info(MODULE, `uninstallPlugin: ${pluginKey}`);
      const regPath = installedPluginsPath();

      if (!(await configIO.exists(regPath))) {
        throw new AppError('COMPONENT_NOT_FOUND', `Plugin registry not found: ${regPath}`, true);
      }

      const data = (await configIO.readJSON(regPath)) as InstalledPluginsData;
      if (!data?.plugins || !(pluginKey in data.plugins)) {
        throw new AppError(
          'COMPONENT_NOT_FOUND',
          `Plugin "${pluginKey}" not found in registry`,
          true,
        );
      }

      const entries = data.plugins[pluginKey];
      const pDir = pluginsDir();

      // Delete each entry's installPath (with safety checks)
      for (const entry of entries) {
        if (!entry.installPath) continue;

        // Path traversal protection: installPath must be within pluginsDir
        assertPathWithin(entry.installPath, pDir);

        // Symlink protection
        await assertNotSymlink(entry.installPath);

        // Delete the cache directory
        try {
          await rm(entry.installPath, { recursive: true, force: true });
          logger.info(MODULE, `Deleted plugin cache: ${entry.installPath}`);
        } catch (err) {
          logger.warn(MODULE, `Failed to delete plugin cache: ${entry.installPath}`, err);
        }
      }

      // Remove from registry
      delete data.plugins[pluginKey];
      await configIO.writeJSON(regPath, data);

      // Remove from enabledPlugins in settings.json if present
      try {
        const sPath = settingsPath();
        if (await configIO.exists(sPath)) {
          const settings = (await configIO.readJSON(sPath)) as SettingsData;
          if (settings?.enabledPlugins && pluginKey in settings.enabledPlugins) {
            delete settings.enabledPlugins[pluginKey];
            if (Object.keys(settings.enabledPlugins).length === 0) {
              delete settings.enabledPlugins;
            }
            await configIO.writeJSON(sPath, settings);
          }
        }
      } catch (err) {
        logger.warn(MODULE, `Failed to clean up enabledPlugins for ${pluginKey}`, err);
      }
    },

    async getKnownMarketplaces(): Promise<KnownMarketplaceEntry[]> {
      const path = knownMarketplacesPath();
      try {
        if (!(await configIO.exists(path))) return [];
        const raw = await configIO.readJSON(path);
        if (Array.isArray(raw)) return raw as KnownMarketplaceEntry[];
        return [];
      } catch {
        return [];
      }
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
