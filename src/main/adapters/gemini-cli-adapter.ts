/**
 * GeminiCliAdapter — adapter for Gemini CLI tool.
 * Rich extension system with 8 component types in a single package.
 * Source: 2A-research/plugin-ecosystems.md §Gemini CLI
 *
 * Gemini CLI config layout:
 *   rootPath/                        (~/.gemini/)
 *     settings.json                  — MCP server config, admin, security, hooks
 *     GEMINI.md                      — global context file
 *     extensions/                    — installed extensions
 *       <name>/
 *         gemini-extension.json      — extension manifest (required)
 *         GEMINI.md                  — extension context file
 *         commands/*.toml            — custom commands
 *         skills/<name>/SKILL.md     — agent skills
 *         agents/*.md                — sub-agents (preview)
 *         hooks/hooks.json           — lifecycle hooks
 *       extension-enablement.json    — tracks enabled/disabled state
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
  HookCore,
  AgentCore,
  SkeletonCore,
} from '@shared/types';
import { AppError } from '@shared/types';
import { TOOL_COMPONENTS, CACHE_PATTERNS } from '@shared/constants';
import { join, basename, resolve } from 'path';
import { stat, mkdir } from 'fs/promises';
import * as yaml from 'js-yaml';

// -- Types for Gemini CLI config structures --

type GeminiSettingsData = {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
};

type ExtensionManifest = {
  name: string;
  version: string;
  description?: string;
  contextFileName?: string;
  mcpServers?: Record<string, unknown>;
  settings?: ExtensionSetting[];
  themes?: unknown[];
  [key: string]: unknown;
};

type ExtensionSetting = {
  name: string;
  description?: string;
  envVar: string;
  sensitive?: boolean;
};

type EnablementData = Record<string, { enabled?: boolean }>;

type HooksJsonData = {
  [eventName: string]: Array<{ command: string } | { url: string }>;
};

// -- Constants --

const TOOL_ID = 'gemini-cli' as const;
const SETTINGS_FILENAME = 'settings.json';
const EXTENSIONS_DIR = 'extensions';
const MANIFEST_FILENAME = 'gemini-extension.json';
const ENABLEMENT_FILENAME = 'extension-enablement.json';

// -- Public API --

export function createGeminiCliAdapter(
  rootPath: string,
  instanceId: string,
  configIO: ConfigIO,
  logger: Logger,
): ToolAdapter {
  const MODULE = 'GeminiCliAdapter';

  // -- Path helpers --

  function settingsPath(): string {
    return join(rootPath, SETTINGS_FILENAME);
  }

  function extensionsDir(): string {
    return join(rootPath, EXTENSIONS_DIR);
  }

  function extensionDir(name: string): string {
    return join(extensionsDir(), name);
  }

  function manifestPath(extName: string): string {
    return join(extensionDir(extName), MANIFEST_FILENAME);
  }

  function enablementPath(): string {
    return join(extensionsDir(), ENABLEMENT_FILENAME);
  }

  // -- Helpers --

  function validateName(name: string): void {
    if (name.includes('..') || name.includes('\\') || name.includes('\0')) {
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

  async function readEnablement(): Promise<EnablementData> {
    try {
      const ePath = enablementPath();
      if (await configIO.exists(ePath)) {
        return (await configIO.readJSON(ePath)) as EnablementData;
      }
    } catch {
      // Enablement file missing or corrupted — treat all as enabled
    }
    return {};
  }

  async function readManifest(extName: string): Promise<ExtensionManifest | null> {
    try {
      const mPath = manifestPath(extName);
      if (await configIO.exists(mPath)) {
        return (await configIO.readJSON(mPath)) as ExtensionManifest;
      }
    } catch (err) {
      logger.warn(MODULE, `Failed to read manifest for extension "${extName}"`, err);
    }
    return null;
  }

  function isExtensionEnabled(extName: string, enablement: EnablementData): boolean {
    const entry = enablement[extName];
    return entry?.enabled !== false; // Default to enabled
  }

  // -- Scan: MCP servers from settings.json --

  async function scanSettingsMcpServers(): Promise<Component[]> {
    const components: Component[] = [];
    const cfgPath = settingsPath();

    if (!(await configIO.exists(cfgPath))) return components;

    try {
      const raw = (await configIO.readJSON(cfgPath)) as GeminiSettingsData;
      const servers = raw?.mcpServers;
      if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return components;

      for (const [name, config] of Object.entries(servers)) {
        if (!config || typeof config !== 'object') continue;
        const core = normalizeMcpCore(config as Record<string, unknown>);
        const cfg = config as Record<string, unknown>;

        const extensions: Record<string, unknown> = {};
        if (cfg.cwd) extensions.cwd = String(cfg.cwd);
        if (typeof cfg.trust === 'boolean') extensions.trust = cfg.trust;
        if (Array.isArray(cfg.includeTools)) extensions.includeTools = cfg.includeTools;
        if (Array.isArray(cfg.excludeTools)) extensions.excludeTools = cfg.excludeTools;
        if (typeof cfg.timeout === 'number') extensions.timeout = cfg.timeout;

        components.push({
          id: { tool: TOOL_ID, type: 'mcp-server', name, scope: 'user' },
          core,
          extensions: Object.keys(extensions).length > 0 ? extensions : undefined,
          configPath: cfgPath,
          tracking: 'detected',
        });
      }
    } catch (err) {
      logger.warn(MODULE, 'Failed to scan settings.json MCP servers', err);
    }

    return components;
  }

  // -- Scan: extension sub-components --

  async function scanExtensionMcpServers(
    extName: string,
    manifest: ExtensionManifest,
    enabled: boolean,
  ): Promise<Component[]> {
    const components: Component[] = [];
    const servers = manifest.mcpServers;
    if (!servers || typeof servers !== 'object') return components;

    for (const [name, config] of Object.entries(servers)) {
      if (!config || typeof config !== 'object') continue;
      const core = normalizeMcpCore(config as Record<string, unknown>);
      components.push({
        id: {
          tool: TOOL_ID,
          type: 'mcp-server',
          name: `${extName}/${name}`,
          scope: `extension:${extName}`,
        },
        core,
        enabled,
        configPath: manifestPath(extName),
        tracking: 'detected',
        version: manifest.version,
      });
    }

    return components;
  }

  async function scanExtensionSkills(
    extName: string,
    enabled: boolean,
    version: string,
  ): Promise<Component[]> {
    const components: Component[] = [];
    const skillsDir = join(extensionDir(extName), 'skills');

    try {
      const entries = await configIO.listDir(skillsDir);
      for (const entry of entries) {
        const skillDir = join(skillsDir, entry);
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
            id: {
              tool: TOOL_ID,
              type: 'skill',
              name: `${extName}/${entry}`,
              scope: `extension:${extName}`,
            },
            core,
            enabled,
            configPath: skillFile,
            tracking: 'detected',
            version,
            description: fm.description ? String(fm.description) : undefined,
            displayName: fm.name ? String(fm.name) : entry,
          });
        } catch (err) {
          logger.warn(MODULE, `Failed to parse skill: ${skillDir}`, err);
        }
      }
    } catch {
      // No skills/ directory — acceptable
    }

    return components;
  }

  async function scanExtensionCommands(
    extName: string,
    enabled: boolean,
    version: string,
  ): Promise<Component[]> {
    const components: Component[] = [];
    const commandsDir = join(extensionDir(extName), 'commands');

    try {
      const entries = await configIO.listDir(commandsDir, '*.toml');
      for (const entry of entries) {
        const filePath = join(commandsDir, entry);
        try {
          const data = (await configIO.readTOML(filePath)) as Record<string, unknown>;
          const name = basename(entry, '.toml');

          const core: CommandCore = {
            description: data.description ? String(data.description) : undefined,
            content: data.prompt ? String(data.prompt) : '',
          };

          components.push({
            id: {
              tool: TOOL_ID,
              type: 'command',
              name: `${extName}/${name}`,
              scope: `extension:${extName}`,
            },
            core,
            enabled,
            configPath: filePath,
            tracking: 'detected',
            version,
            description: core.description,
          });
        } catch (err) {
          logger.warn(MODULE, `Failed to parse command: ${filePath}`, err);
        }
      }
    } catch {
      // No commands/ directory — acceptable
    }

    return components;
  }

  async function scanExtensionHooks(
    extName: string,
    enabled: boolean,
    version: string,
  ): Promise<Component[]> {
    const components: Component[] = [];
    const hooksFile = join(extensionDir(extName), 'hooks', 'hooks.json');

    try {
      if (!(await configIO.exists(hooksFile))) return components;

      const data = (await configIO.readJSON(hooksFile)) as HooksJsonData;
      for (const [eventName, handlers] of Object.entries(data)) {
        if (!Array.isArray(handlers)) continue;

        for (let i = 0; i < handlers.length; i++) {
          const handler = handlers[i];
          if (!handler || typeof handler !== 'object') continue;

          const isCommand = 'command' in handler;
          const hookName = `${extName}/${eventName}${handlers.length > 1 ? `[${i}]` : ''}`;

          const core: HookCore = {
            event: eventName,
            handler: isCommand
              ? { type: 'command', command: String((handler as { command: string }).command) }
              : { type: 'http', url: String((handler as { url: string }).url) },
          };

          components.push({
            id: { tool: TOOL_ID, type: 'hook', name: hookName, scope: `extension:${extName}` },
            core,
            enabled,
            configPath: hooksFile,
            tracking: 'detected',
            version,
          });
        }
      }
    } catch (err) {
      logger.warn(MODULE, `Failed to scan hooks for ${extName}`, err);
    }

    return components;
  }

  async function scanExtensionAgents(
    extName: string,
    enabled: boolean,
    version: string,
  ): Promise<Component[]> {
    const components: Component[] = [];
    const agentsDir = join(extensionDir(extName), 'agents');

    try {
      const entries = await configIO.listDir(agentsDir, '*.md');
      for (const entry of entries) {
        const filePath = join(agentsDir, entry);
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
            id: {
              tool: TOOL_ID,
              type: 'agent',
              name: `${extName}/${name}`,
              scope: `extension:${extName}`,
            },
            core,
            enabled,
            configPath: filePath,
            tracking: 'detected',
            version,
            description: fm.description ? String(fm.description) : undefined,
          });
        } catch (err) {
          logger.warn(MODULE, `Failed to parse agent: ${filePath}`, err);
        }
      }
    } catch {
      // No agents/ directory — acceptable
    }

    return components;
  }

  async function scanExtensionContext(
    extName: string,
    manifest: ExtensionManifest,
    enabled: boolean,
  ): Promise<Component[]> {
    const ctxFileName = manifest.contextFileName ?? 'GEMINI.md';
    // Validate contextFileName from untrusted manifest — block path traversal
    if (
      ctxFileName.includes('..') ||
      ctxFileName.includes('/') ||
      ctxFileName.includes('\\') ||
      ctxFileName.includes('\0')
    ) {
      logger.warn(MODULE, `Skipping context file with unsafe name: "${ctxFileName}" in ${extName}`);
      return [];
    }
    const ctxPath = join(extensionDir(extName), ctxFileName);
    assertPathWithin(ctxPath, extensionDir(extName));

    try {
      if (!(await configIO.exists(ctxPath))) return [];

      // Use readYAMLFrontmatter to read the file content (works for plain markdown too)
      const { content } = await configIO.readYAMLFrontmatter(ctxPath);
      const core: SkeletonCore = {
        rawConfig: { fileName: ctxFileName, contentLength: content.length },
        rawTypeName: 'context-file',
      };

      return [
        {
          id: {
            tool: TOOL_ID,
            type: 'context-file',
            name: `${extName}/${ctxFileName}`,
            scope: `extension:${extName}`,
          },
          core,
          enabled,
          configPath: ctxPath,
          tracking: 'detected',
          version: manifest.version,
          description: `Context file for ${extName}`,
        },
      ];
    } catch {
      return [];
    }
  }

  // -- Scan: all extensions --

  async function scanAllExtensions(): Promise<Component[]> {
    const components: Component[] = [];
    const extDir = extensionsDir();

    try {
      const entries = await configIO.listDir(extDir);
      const enablement = await readEnablement();

      for (const entry of entries) {
        // Skip non-directories and special files
        if (entry === ENABLEMENT_FILENAME || entry.startsWith('.')) continue;

        try {
          const extPath = join(extDir, entry);
          const s = await stat(extPath);
          if (!s.isDirectory()) continue;

          const manifest = await readManifest(entry);
          if (!manifest) continue; // No manifest = not a valid extension

          const enabled = isExtensionEnabled(entry, enablement);
          const version = manifest.version;

          // Scan all sub-component types
          const [mcpServers, skills, commands, hooks, agents, context] = await Promise.all([
            scanExtensionMcpServers(entry, manifest, enabled),
            scanExtensionSkills(entry, enabled, version),
            scanExtensionCommands(entry, enabled, version),
            scanExtensionHooks(entry, enabled, version),
            scanExtensionAgents(entry, enabled, version),
            scanExtensionContext(entry, manifest, enabled),
          ]);

          const all = [...mcpServers, ...skills, ...commands, ...hooks, ...agents, ...context];
          // Strip `enabled` from types that can't be toggled — prevents confusing disabled UI rows
          for (const c of all) {
            if (
              c.id.type === 'hook' ||
              c.id.type === 'command' ||
              c.id.type === 'agent' ||
              c.id.type === 'context-file'
            ) {
              delete (c as Record<string, unknown>).enabled;
            }
          }
          components.push(...all);
        } catch (err) {
          logger.warn(MODULE, `Failed to scan extension: ${entry}`, err);
        }
      }
    } catch {
      // extensions/ directory doesn't exist — acceptable
    }

    return components;
  }

  // -- Scan: global context file --

  async function scanGlobalContext(): Promise<Component[]> {
    const ctxPath = join(rootPath, 'GEMINI.md');
    try {
      if (!(await configIO.exists(ctxPath))) return [];

      const { content } = await configIO.readYAMLFrontmatter(ctxPath);
      return [
        {
          id: { tool: TOOL_ID, type: 'context-file', name: 'GEMINI.md', scope: 'user' },
          core: {
            rawConfig: { fileName: 'GEMINI.md', contentLength: content.length },
            rawTypeName: 'context-file',
          } as SkeletonCore,
          configPath: ctxPath,
          tracking: 'detected',
          description: 'Global Gemini context file',
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
    const { execCli } = await import('./cli-exec');
    const core = portable.core as McpServerCore;

    const args = ['mcp', 'add', '--scope', 'user', '-t', core.transport ?? 'stdio'];
    if (core.transport === 'stdio') {
      if (core.env) {
        for (const [k, v] of Object.entries(core.env)) {
          args.push('-e', `${k}=${v}`);
        }
      }
      args.push(portable.name);
      if (core.command) args.push(core.command);
      if (core.args) args.push(...core.args);
    } else {
      args.push(portable.name);
      if (core.url) args.push(core.url);
    }

    await execCli('gemini', args);
    logger.info(MODULE, `MCP server "${portable.name}" installed via Gemini CLI`);

    return {
      id: { tool: TOOL_ID, type: 'mcp-server', name: portable.name, scope: 'user' },
      core,
      configPath: settingsPath(),
      tracking: 'managed',
    };
  }

  async function installSkill(
    portable: PortableComponent,
    _target: InstallTarget,
  ): Promise<Component> {
    validateName(portable.name);
    // File I/O justified: `gemini skills install` expects a source URL/path,
    // but we have inline content from bundles/marketplace. No CLI for piped content.
    const skillDir = join(rootPath, 'skills', portable.name);
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
      id: { tool: TOOL_ID, type: 'skill', name: portable.name, scope: 'user' },
      core,
      configPath: filePath,
      tracking: 'managed',
      description: portable.description,
    };
  }

  // -- Uninstall --

  async function uninstallExtension(extName: string): Promise<void> {
    const { execCli } = await import('./cli-exec');
    await execCli('gemini', ['extensions', 'uninstall', extName], {
      successPattern: 'successfully uninstalled',
    });
    logger.info(MODULE, `Extension "${extName}" uninstalled via Gemini CLI`);
  }

  async function uninstallMcpServer(id: ComponentId): Promise<void> {
    validateName(id.name);

    if (id.scope.startsWith('extension:')) {
      return uninstallExtension(id.scope.slice('extension:'.length));
    }

    const { execCli } = await import('./cli-exec');
    await execCli('gemini', ['mcp', 'remove', '--scope', 'user', id.name]);
    logger.info(MODULE, `MCP server "${id.name}" removed via Gemini CLI`);
  }

  async function uninstallSkill(id: ComponentId): Promise<void> {
    validateName(id.name);

    if (id.scope.startsWith('extension:')) {
      return uninstallExtension(id.scope.slice('extension:'.length));
    }

    const { execCli } = await import('./cli-exec');
    await execCli('gemini', ['skills', 'uninstall', '--scope', 'user', id.name]);
    logger.info(MODULE, `Skill "${id.name}" uninstalled via Gemini CLI`);
  }

  // -- ToolAdapter implementation --

  return {
    toolId: TOOL_ID,
    instanceId,
    rootPath,

    async detect(): Promise<ToolDetectionResult> {
      // Detect by settings.json — configIO.exists uses isFile(), directory checks won't work
      const detected = await configIO.exists(settingsPath());
      let cliAvailable: boolean | undefined;
      if (detected) {
        try {
          const { execCli } = await import('./cli-exec');
          await execCli('gemini', ['--version'], { timeout: 5_000 });
          cliAvailable = true;
        } catch {
          cliAvailable = false;
        }
      }
      logger.info(MODULE, `detect: ${rootPath} → ${detected} (cli: ${cliAvailable})`);
      return { toolId: TOOL_ID, instanceId, path: rootPath, detected, cliAvailable };
    },

    async scan(): Promise<Component[]> {
      logger.info(MODULE, `Scanning: ${rootPath}`);

      try {
        const [settingsMcp, extensionComponents, globalCtx] = await Promise.all([
          scanSettingsMcpServers(),
          scanAllExtensions(),
          scanGlobalContext(),
        ]);

        const components = [...settingsMcp, ...extensionComponents, ...globalCtx];
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
            `Gemini CLI install not supported for type "${portable.type}". Use "gemini extensions install" for extension components.`,
            false,
          );
      }
    },

    async uninstall(id) {
      logger.info(MODULE, `Uninstalling ${id.type} "${id.name}"`);

      // Extension-scoped components are uninstalled via the Gemini CLI
      if (id.scope.startsWith('extension:')) {
        return uninstallExtension(id.scope.slice('extension:'.length));
      }

      switch (id.type) {
        case 'mcp-server':
          return uninstallMcpServer(id);
        case 'skill':
          return uninstallSkill(id);
        default:
          throw new AppError(
            'ADAPTER_UNSUPPORTED',
            `Gemini CLI uninstall not supported for type "${id.type}".`,
            false,
          );
      }
    },

    async enable(id: ComponentId) {
      const { execCli } = await import('./cli-exec');

      if (id.scope.startsWith('extension:')) {
        const extName = id.scope.slice('extension:'.length);
        await execCli('gemini', ['extensions', 'enable', extName]);
        logger.info(MODULE, `Extension "${extName}" enabled via Gemini CLI`);
        return;
      }

      const typeCmd = id.type === 'mcp-server' ? 'mcp' : id.type === 'skill' ? 'skills' : null;
      if (!typeCmd) {
        throw new AppError(
          'ADAPTER_UNSUPPORTED',
          `Enable not supported for type "${id.type}"`,
          false,
        );
      }
      await execCli('gemini', [typeCmd, 'enable', id.name]);
      logger.info(MODULE, `${id.type} "${id.name}" enabled via Gemini CLI`);
    },

    async disable(id: ComponentId) {
      const { execCli } = await import('./cli-exec');

      if (id.scope.startsWith('extension:')) {
        const extName = id.scope.slice('extension:'.length);
        await execCli('gemini', ['extensions', 'disable', extName]);
        logger.info(MODULE, `Extension "${extName}" disabled via Gemini CLI`);
        return;
      }

      const typeCmd = id.type === 'mcp-server' ? 'mcp' : id.type === 'skill' ? 'skills' : null;
      if (!typeCmd) {
        throw new AppError(
          'ADAPTER_UNSUPPORTED',
          `Disable not supported for type "${id.type}"`,
          false,
        );
      }
      await execCli('gemini', [typeCmd, 'disable', id.name]);
      logger.info(MODULE, `${id.type} "${id.name}" disabled via Gemini CLI`);
    },

    canToggle(type: ComponentType) {
      return type === 'mcp-server' || type === 'skill';
    },

    getConfigPath(id: ComponentId): string {
      if (id.scope.startsWith('extension:')) {
        const extName = id.name.split('/')[0];
        return manifestPath(extName);
      }
      return settingsPath();
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

function safeHeaders(val: unknown): Record<string, string> | undefined {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return undefined;
  return val as Record<string, string>;
}

function normalizeMcpCore(config: Record<string, unknown>): McpServerCore {
  // HTTP/SSE transport
  if (config.url || config.httpUrl) {
    const url = String(config.url ?? config.httpUrl);
    if (config.type === 'sse' || (config.url && !config.httpUrl)) {
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

// -- Platform path resolution --

/**
 * Resolve the default Gemini CLI config directory.
 * Gemini CLI uses ~/.gemini/ on all platforms.
 */
export function resolveDefaultGeminiConfigDir(): string {
  return join(process.env.HOME ?? process.env.USERPROFILE ?? '/tmp', '.gemini');
}
