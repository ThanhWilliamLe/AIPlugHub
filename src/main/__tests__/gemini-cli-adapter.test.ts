import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  createGeminiCliAdapter,
  resolveDefaultGeminiConfigDir,
} from '../adapters/gemini-cli-adapter';
import { createConfigIO } from '../config-io';
import { createLogger } from '../logger';
import type { ToolAdapter } from '../adapters/tool-adapter';
import type { PortableComponent, InstallTarget, ComponentType } from '@shared/types';
import { AppError } from '@shared/types';

const logger = createLogger();
const configIO = createConfigIO(logger);
let tempDir: string;
let adapter: ToolAdapter;

const DEFAULT_TARGET: InstallTarget = { instanceId: 'gemini-cli-default', scope: 'user' };
const SETTINGS_FILE = 'settings.json';

// -- Fixture helper --

async function createDefaultFixture(baseDir: string): Promise<void> {
  // settings.json with MCP servers
  await writeFile(
    join(baseDir, SETTINGS_FILE),
    JSON.stringify({
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/user/projects'],
          env: { HOME: '/home/user' },
        },
        'remote-api': {
          url: 'https://api.example.com/mcp',
          headers: { Authorization: 'Bearer token123' },
        },
      },
      theme: 'dark',
    }),
  );

  // extensions/my-ext/gemini-extension.json
  const extDir = join(baseDir, 'extensions', 'my-ext');
  await mkdir(extDir, { recursive: true });
  await writeFile(
    join(extDir, 'gemini-extension.json'),
    JSON.stringify({
      name: 'my-ext',
      version: '1.2.0',
      description: 'Test extension',
      mcpServers: {
        'ext-server': {
          command: 'node',
          args: ['server.js'],
        },
      },
    }),
  );

  // extensions/my-ext/skills/my-skill/SKILL.md
  const skillDir = join(extDir, 'skills', 'my-skill');
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, 'SKILL.md'),
    '---\nname: My Skill\ndescription: A test skill\n---\nDo something useful.\n',
  );

  // extensions/my-ext/commands/hello.toml
  const commandsDir = join(extDir, 'commands');
  await mkdir(commandsDir, { recursive: true });
  await writeFile(
    join(commandsDir, 'hello.toml'),
    'description = "Greet the user"\nprompt = "Say hello to the user"\n',
  );

  // extensions/my-ext/hooks/hooks.json
  const hooksDir = join(extDir, 'hooks');
  await mkdir(hooksDir, { recursive: true });
  await writeFile(
    join(hooksDir, 'hooks.json'),
    JSON.stringify({
      onStart: [{ command: 'echo Starting' }],
      onEnd: [{ url: 'https://hooks.example.com/end' }],
    }),
  );

  // extensions/my-ext/agents/reviewer.md
  const agentsDir = join(extDir, 'agents');
  await mkdir(agentsDir, { recursive: true });
  await writeFile(
    join(agentsDir, 'reviewer.md'),
    '---\nname: reviewer\ndescription: Code review agent\nmodel: gemini-2.0-flash\ntools:\n  - search\n  - read_file\nmaxTurns: 5\n---\nYou are a code reviewer.\n',
  );

  // extensions/my-ext/GEMINI.md (extension context file)
  await writeFile(join(extDir, 'GEMINI.md'), 'Extension-level context instructions.\n');

  // extensions/extension-enablement.json
  await writeFile(
    join(baseDir, 'extensions', 'extension-enablement.json'),
    JSON.stringify({
      'my-ext': { enabled: true },
    }),
  );

  // GEMINI.md (global context file)
  await writeFile(join(baseDir, 'GEMINI.md'), 'Global Gemini context instructions.\n');
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'plughub-gc-test-'));
  await createDefaultFixture(tempDir);
  adapter = createGeminiCliAdapter(tempDir, 'gemini-cli-default', configIO, logger);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// --- detect ---

describe('GeminiCliAdapter.detect', () => {
  it('detects when settings.json exists', async () => {
    const result = await adapter.detect();
    expect(result.detected).toBe(true);
    expect(result.toolId).toBe('gemini-cli');
    expect(result.instanceId).toBe('gemini-cli-default');
    expect(result.path).toBe(tempDir);
  });

  it('returns detected: false when only extensions/ dir exists (configIO.exists checks isFile)', async () => {
    // configIO.exists uses stat().isFile(), so a bare directory won't be detected.
    // Detection requires settings.json to exist as a file.
    const altDir = join(tempDir, 'ext-only');
    await mkdir(join(altDir, 'extensions'), { recursive: true });
    const altAdapter = createGeminiCliAdapter(altDir, 'gc-ext-only', configIO, logger);
    const result = await altAdapter.detect();
    expect(result.detected).toBe(false);
  });

  it('detects when only settings.json exists (no extensions/)', async () => {
    const altDir = join(tempDir, 'settings-only');
    await mkdir(altDir, { recursive: true });
    await writeFile(join(altDir, SETTINGS_FILE), '{}');
    const altAdapter = createGeminiCliAdapter(altDir, 'gc-settings-only', configIO, logger);
    const result = await altAdapter.detect();
    expect(result.detected).toBe(true);
  });

  it('returns detected: false when neither exists', async () => {
    const emptyDir = join(tempDir, 'no-config');
    await mkdir(emptyDir, { recursive: true });
    const missing = createGeminiCliAdapter(emptyDir, 'gc-missing', configIO, logger);
    const result = await missing.detect();
    expect(result.detected).toBe(false);
  });

  it('returns detected: false when path does not exist', async () => {
    const noDir = createGeminiCliAdapter(
      join(tempDir, 'nonexistent'),
      'gc-nodir',
      configIO,
      logger,
    );
    const result = await noDir.detect();
    expect(result.detected).toBe(false);
  });
});

// --- scan: MCP servers from settings.json ---

describe('GeminiCliAdapter.scan -- MCP servers from settings.json', () => {
  it('scans stdio MCP servers', async () => {
    const components = await adapter.scan();
    const fs = components.find((c) => c.id.name === 'filesystem');

    expect(fs).toBeDefined();
    expect(fs!.id.type).toBe('mcp-server');
    expect(fs!.id.tool).toBe('gemini-cli');
    expect(fs!.id.scope).toBe('user');
    expect(fs!.tracking).toBe('detected');

    const core = fs!.core as { transport: string; command: string; args?: string[] };
    expect(core.transport).toBe('stdio');
    expect(core.command).toBe('npx');
    expect(core.args).toEqual([
      '-y',
      '@modelcontextprotocol/server-filesystem',
      '/home/user/projects',
    ]);
  });

  it('scans HTTP/SSE MCP servers', async () => {
    const components = await adapter.scan();
    const api = components.find((c) => c.id.name === 'remote-api');

    expect(api).toBeDefined();
    const core = api!.core as { transport: string; url: string; headers?: Record<string, string> };
    expect(core.url).toBe('https://api.example.com/mcp');
    expect(core.headers).toEqual({ Authorization: 'Bearer token123' });
  });

  it('user-scope MCP servers have configPath pointing to settings.json', async () => {
    const components = await adapter.scan();
    const userMcp = components.filter((c) => c.id.type === 'mcp-server' && c.id.scope === 'user');
    for (const c of userMcp) {
      expect(c.configPath).toBe(join(tempDir, SETTINGS_FILE));
    }
  });

  it('handles empty config file ({})', async () => {
    await writeFile(join(tempDir, SETTINGS_FILE), '{}');
    // Remove extensions to isolate settings scan
    await rm(join(tempDir, 'extensions'), { recursive: true, force: true });
    await rm(join(tempDir, 'GEMINI.md'), { force: true });
    const components = await adapter.scan();
    expect(components).toEqual([]);
  });

  it('handles config with empty mcpServers ({})', async () => {
    await writeFile(join(tempDir, SETTINGS_FILE), JSON.stringify({ mcpServers: {} }));
    await rm(join(tempDir, 'extensions'), { recursive: true, force: true });
    await rm(join(tempDir, 'GEMINI.md'), { force: true });
    const components = await adapter.scan();
    expect(components).toEqual([]);
  });

  it('handles corrupted config file gracefully', async () => {
    await writeFile(join(tempDir, SETTINGS_FILE), '{not valid json!!!');
    await rm(join(tempDir, 'extensions'), { recursive: true, force: true });
    await rm(join(tempDir, 'GEMINI.md'), { force: true });
    const components = await adapter.scan();
    expect(components).toEqual([]);
  });

  it('handles mcpServers being a non-object value', async () => {
    await writeFile(join(tempDir, SETTINGS_FILE), JSON.stringify({ mcpServers: 'not-an-object' }));
    await rm(join(tempDir, 'extensions'), { recursive: true, force: true });
    await rm(join(tempDir, 'GEMINI.md'), { force: true });
    const components = await adapter.scan();
    expect(components).toEqual([]);
  });

  it('handles mcpServers being an array', async () => {
    await writeFile(
      join(tempDir, SETTINGS_FILE),
      JSON.stringify({ mcpServers: [{ command: 'echo' }] }),
    );
    await rm(join(tempDir, 'extensions'), { recursive: true, force: true });
    await rm(join(tempDir, 'GEMINI.md'), { force: true });
    const components = await adapter.scan();
    expect(components).toEqual([]);
  });

  it('skips mcpServers entries that are not objects', async () => {
    await writeFile(
      join(tempDir, SETTINGS_FILE),
      JSON.stringify({
        mcpServers: {
          good: { command: 'echo' },
          bad: null,
          worse: 42,
          worst: 'not an object',
        },
      }),
    );
    await rm(join(tempDir, 'extensions'), { recursive: true, force: true });
    await rm(join(tempDir, 'GEMINI.md'), { force: true });
    const components = await adapter.scan();
    expect(components).toHaveLength(1);
    expect(components[0].id.name).toBe('good');
  });

  it('captures Gemini-specific extensions (cwd, trust, timeout)', async () => {
    await writeFile(
      join(tempDir, SETTINGS_FILE),
      JSON.stringify({
        mcpServers: {
          extended: {
            command: 'node',
            args: ['server.js'],
            cwd: '/work/project',
            trust: true,
            timeout: 30000,
            includeTools: ['tool1'],
            excludeTools: ['tool2'],
          },
        },
      }),
    );
    await rm(join(tempDir, 'extensions'), { recursive: true, force: true });
    await rm(join(tempDir, 'GEMINI.md'), { force: true });
    const components = await adapter.scan();
    expect(components).toHaveLength(1);
    const ext = components[0].extensions as Record<string, unknown>;
    expect(ext.cwd).toBe('/work/project');
    expect(ext.trust).toBe(true);
    expect(ext.timeout).toBe(30000);
    expect(ext.includeTools).toEqual(['tool1']);
    expect(ext.excludeTools).toEqual(['tool2']);
  });
});

// --- scan: extension sub-components ---

describe('GeminiCliAdapter.scan -- extension sub-components', () => {
  it('scans extension MCP servers from manifest', async () => {
    const components = await adapter.scan();
    const extMcp = components.find((c) => c.id.name === 'my-ext/ext-server');

    expect(extMcp).toBeDefined();
    expect(extMcp!.id.type).toBe('mcp-server');
    expect(extMcp!.id.scope).toBe('extension:my-ext');
    expect(extMcp!.enabled).toBe(true);
    expect(extMcp!.version).toBe('1.2.0');

    const core = extMcp!.core as { transport: string; command: string; args?: string[] };
    expect(core.transport).toBe('stdio');
    expect(core.command).toBe('node');
    expect(core.args).toEqual(['server.js']);
  });

  it('scans skills from SKILL.md with YAML frontmatter', async () => {
    const components = await adapter.scan();
    const skill = components.find((c) => c.id.name === 'my-ext/my-skill');

    expect(skill).toBeDefined();
    expect(skill!.id.type).toBe('skill');
    expect(skill!.id.scope).toBe('extension:my-ext');
    expect(skill!.enabled).toBe(true);
    expect(skill!.version).toBe('1.2.0');
    expect(skill!.description).toBe('A test skill');
    expect(skill!.displayName).toBe('My Skill');

    const core = skill!.core as { description: string; content: string };
    expect(core.description).toBe('A test skill');
    expect(core.content).toContain('Do something useful.');
  });

  it('scans commands from TOML files', async () => {
    const components = await adapter.scan();
    const cmd = components.find((c) => c.id.name === 'my-ext/hello');

    expect(cmd).toBeDefined();
    expect(cmd!.id.type).toBe('command');
    expect(cmd!.id.scope).toBe('extension:my-ext');
    expect(cmd!.enabled).toBe(true);
    expect(cmd!.description).toBe('Greet the user');

    const core = cmd!.core as { description?: string; content: string };
    expect(core.description).toBe('Greet the user');
    expect(core.content).toBe('Say hello to the user');
  });

  it('scans hooks from hooks.json', async () => {
    const components = await adapter.scan();
    const hooks = components.filter((c) => c.id.type === 'hook');

    expect(hooks.length).toBe(2);

    const startHook = hooks.find((c) => c.id.name.includes('onStart'));
    expect(startHook).toBeDefined();
    expect(startHook!.id.scope).toBe('extension:my-ext');
    const startCore = startHook!.core as {
      event: string;
      handler: { type: string; command?: string };
    };
    expect(startCore.event).toBe('onStart');
    expect(startCore.handler.type).toBe('command');
    expect(startCore.handler.command).toBe('echo Starting');

    const endHook = hooks.find((c) => c.id.name.includes('onEnd'));
    expect(endHook).toBeDefined();
    const endCore = endHook!.core as { event: string; handler: { type: string; url?: string } };
    expect(endCore.event).toBe('onEnd');
    expect(endCore.handler.type).toBe('http');
    expect(endCore.handler.url).toBe('https://hooks.example.com/end');
  });

  it('scans agents from markdown with YAML frontmatter', async () => {
    const components = await adapter.scan();
    const agent = components.find((c) => c.id.name === 'my-ext/reviewer');

    expect(agent).toBeDefined();
    expect(agent!.id.type).toBe('agent');
    expect(agent!.id.scope).toBe('extension:my-ext');
    expect(agent!.enabled).toBe(true);
    expect(agent!.description).toBe('Code review agent');

    const core = agent!.core as {
      description: string;
      model?: string;
      tools?: string[];
      maxTurns?: number;
    };
    expect(core.description).toBe('Code review agent');
    expect(core.model).toBe('gemini-2.0-flash');
    expect(core.tools).toEqual(['search', 'read_file']);
    expect(core.maxTurns).toBe(5);
  });

  it('scans extension context files (GEMINI.md)', async () => {
    const components = await adapter.scan();
    const ctx = components.find((c) => c.id.name === 'my-ext/GEMINI.md');

    expect(ctx).toBeDefined();
    expect(ctx!.id.type).toBe('context-file');
    expect(ctx!.id.scope).toBe('extension:my-ext');
    expect(ctx!.enabled).toBe(true);
    expect(ctx!.description).toBe('Context file for my-ext');
  });

  it('returns correct total count of components from full fixture', async () => {
    const components = await adapter.scan();
    // 2 user MCP servers + 1 ext MCP server + 1 skill + 1 command + 2 hooks + 1 agent + 1 ext ctx + 1 global ctx = 10
    expect(components).toHaveLength(10);
  });
});

// --- scan: enablement state ---

describe('GeminiCliAdapter.scan -- enablement state', () => {
  it('marks extension components as disabled when enablement says false', async () => {
    await writeFile(
      join(tempDir, 'extensions', 'extension-enablement.json'),
      JSON.stringify({
        'my-ext': { enabled: false },
      }),
    );

    const components = await adapter.scan();
    const extComponents = components.filter((c) => c.id.scope.startsWith('extension:'));

    expect(extComponents.length).toBeGreaterThan(0);
    for (const c of extComponents) {
      expect(c.enabled).toBe(false);
    }
  });

  it('defaults to enabled when extension not in enablement file', async () => {
    await writeFile(join(tempDir, 'extensions', 'extension-enablement.json'), JSON.stringify({}));

    const components = await adapter.scan();
    const extComponents = components.filter((c) => c.id.scope.startsWith('extension:'));

    for (const c of extComponents) {
      expect(c.enabled).toBe(true);
    }
  });

  it('defaults to enabled when enablement file is missing', async () => {
    await rm(join(tempDir, 'extensions', 'extension-enablement.json'), { force: true });

    const components = await adapter.scan();
    const extComponents = components.filter((c) => c.id.scope.startsWith('extension:'));

    expect(extComponents.length).toBeGreaterThan(0);
    for (const c of extComponents) {
      expect(c.enabled).toBe(true);
    }
  });

  it('handles corrupted enablement file gracefully (defaults to enabled)', async () => {
    await writeFile(join(tempDir, 'extensions', 'extension-enablement.json'), '{corrupted json!!!');

    const components = await adapter.scan();
    const extComponents = components.filter((c) => c.id.scope.startsWith('extension:'));

    expect(extComponents.length).toBeGreaterThan(0);
    for (const c of extComponents) {
      expect(c.enabled).toBe(true);
    }
  });
});

// --- scan: global context file ---

describe('GeminiCliAdapter.scan -- global GEMINI.md context file', () => {
  it('scans global GEMINI.md as context-file with user scope', async () => {
    const components = await adapter.scan();
    const globalCtx = components.find((c) => c.id.name === 'GEMINI.md' && c.id.scope === 'user');

    expect(globalCtx).toBeDefined();
    expect(globalCtx!.id.type).toBe('context-file');
    expect(globalCtx!.id.tool).toBe('gemini-cli');
    expect(globalCtx!.description).toBe('Global Gemini context file');
    expect(globalCtx!.configPath).toBe(join(tempDir, 'GEMINI.md'));
  });

  it('omits global context when GEMINI.md does not exist', async () => {
    await rm(join(tempDir, 'GEMINI.md'), { force: true });

    const components = await adapter.scan();
    const globalCtx = components.find((c) => c.id.name === 'GEMINI.md' && c.id.scope === 'user');
    expect(globalCtx).toBeUndefined();
  });
});

// --- scan: missing directories handled gracefully ---

describe('GeminiCliAdapter.scan -- missing directories', () => {
  it('handles missing extensions/ directory gracefully', async () => {
    await rm(join(tempDir, 'extensions'), { recursive: true, force: true });
    const components = await adapter.scan();
    // Should still have user MCP servers and global context
    const userMcp = components.filter((c) => c.id.type === 'mcp-server' && c.id.scope === 'user');
    expect(userMcp.length).toBe(2);
  });

  it('handles missing settings.json gracefully', async () => {
    await rm(join(tempDir, SETTINGS_FILE), { force: true });
    const components = await adapter.scan();
    // Should still have extension components and global context
    const extComponents = components.filter((c) => c.id.scope.startsWith('extension:'));
    expect(extComponents.length).toBeGreaterThan(0);
  });

  it('handles extension without skills/ directory', async () => {
    await rm(join(tempDir, 'extensions', 'my-ext', 'skills'), {
      recursive: true,
      force: true,
    });
    const components = await adapter.scan();
    const skills = components.filter((c) => c.id.type === 'skill');
    expect(skills).toEqual([]);
  });

  it('handles extension without commands/ directory', async () => {
    await rm(join(tempDir, 'extensions', 'my-ext', 'commands'), {
      recursive: true,
      force: true,
    });
    const components = await adapter.scan();
    const commands = components.filter((c) => c.id.type === 'command');
    expect(commands).toEqual([]);
  });

  it('handles extension without hooks/ directory', async () => {
    await rm(join(tempDir, 'extensions', 'my-ext', 'hooks'), {
      recursive: true,
      force: true,
    });
    const components = await adapter.scan();
    const hooks = components.filter((c) => c.id.type === 'hook');
    expect(hooks).toEqual([]);
  });

  it('handles extension without agents/ directory', async () => {
    await rm(join(tempDir, 'extensions', 'my-ext', 'agents'), {
      recursive: true,
      force: true,
    });
    const components = await adapter.scan();
    const agents = components.filter((c) => c.id.type === 'agent');
    expect(agents).toEqual([]);
  });

  it('skips extension without manifest file', async () => {
    // Create an extension dir with no gemini-extension.json
    const noManifestDir = join(tempDir, 'extensions', 'no-manifest');
    await mkdir(noManifestDir, { recursive: true });
    await writeFile(join(noManifestDir, 'README.md'), 'not an extension');

    const components = await adapter.scan();
    const noManifestComponents = components.filter((c) => c.id.name.startsWith('no-manifest/'));
    expect(noManifestComponents).toEqual([]);
  });

  it('scans successfully when everything is missing', async () => {
    const emptyDir = join(tempDir, 'empty');
    await mkdir(emptyDir, { recursive: true });
    const emptyAdapter = createGeminiCliAdapter(emptyDir, 'gc-empty', configIO, logger);
    const components = await emptyAdapter.scan();
    expect(components).toEqual([]);
  });
});

// --- install: MCP servers into settings.json ---

describe('GeminiCliAdapter.install -- MCP servers', () => {
  it('installs stdio MCP server to settings.json', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'new-server',
      core: { transport: 'stdio', command: 'npx', args: ['-y', 'new-pkg'] },
    };

    const result = await adapter.install(portable, DEFAULT_TARGET);

    expect(result.id.name).toBe('new-server');
    expect(result.id.type).toBe('mcp-server');
    expect(result.id.tool).toBe('gemini-cli');
    expect(result.id.scope).toBe('user');
    expect(result.tracking).toBe('managed');
    expect(result.configPath).toBe(join(tempDir, SETTINGS_FILE));

    const data = JSON.parse(await readFile(join(tempDir, SETTINGS_FILE), 'utf-8'));
    expect(data.mcpServers['new-server']).toEqual({ command: 'npx', args: ['-y', 'new-pkg'] });
  });

  it('installs HTTP MCP server', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'http-server',
      core: {
        transport: 'http',
        url: 'https://example.com/mcp',
        headers: { 'X-Key': 'abc' },
      },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(await readFile(join(tempDir, SETTINGS_FILE), 'utf-8'));
    expect(data.mcpServers['http-server']).toEqual({
      url: 'https://example.com/mcp',
      headers: { 'X-Key': 'abc' },
    });
  });

  it('preserves existing servers when installing', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'new-server',
      core: { transport: 'stdio', command: 'echo', args: ['hello'] },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(await readFile(join(tempDir, SETTINGS_FILE), 'utf-8'));
    expect(data.mcpServers.filesystem).toBeDefined();
    expect(data.mcpServers['remote-api']).toBeDefined();
    expect(data.mcpServers['new-server']).toBeDefined();
  });

  it('preserves other top-level config keys when installing', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'new-server',
      core: { transport: 'stdio', command: 'node' },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(await readFile(join(tempDir, SETTINGS_FILE), 'utf-8'));
    expect(data.theme).toBe('dark');
  });

  it('creates settings.json if missing', async () => {
    const emptyDir = join(tempDir, 'fresh');
    await mkdir(emptyDir, { recursive: true });
    const freshAdapter = createGeminiCliAdapter(emptyDir, 'gc-fresh', configIO, logger);

    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'first-server',
      core: { transport: 'stdio', command: 'echo' },
    };

    await freshAdapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(await readFile(join(emptyDir, SETTINGS_FILE), 'utf-8'));
    expect(data.mcpServers['first-server']).toEqual({ command: 'echo' });
  });

  it('overwrites existing server with same name', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'filesystem',
      core: { transport: 'stdio', command: 'new-command', args: ['--new'] },
    };

    const result = await adapter.install(portable, DEFAULT_TARGET);
    expect(result.id.name).toBe('filesystem');

    const data = JSON.parse(await readFile(join(tempDir, SETTINGS_FILE), 'utf-8'));
    expect(data.mcpServers.filesystem).toEqual({ command: 'new-command', args: ['--new'] });
  });

  it('merges Gemini-specific extensions into server config', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'extended-server',
      core: { transport: 'stdio', command: 'node', args: ['server.js'] },
      extensions: {
        cwd: '/work/project',
        trust: true,
        timeout: 30000,
        includeTools: ['tool1'],
        excludeTools: ['tool2'],
      },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(await readFile(join(tempDir, SETTINGS_FILE), 'utf-8'));
    const server = data.mcpServers['extended-server'];
    expect(server.cwd).toBe('/work/project');
    expect(server.trust).toBe(true);
    expect(server.timeout).toBe(30000);
    expect(server.includeTools).toEqual(['tool1']);
    expect(server.excludeTools).toEqual(['tool2']);
  });

  it('installs successfully when existing config is corrupted', async () => {
    await writeFile(join(tempDir, SETTINGS_FILE), '{not valid json!!!');

    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'fresh-server',
      core: { transport: 'stdio', command: 'echo' },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(await readFile(join(tempDir, SETTINGS_FILE), 'utf-8'));
    expect(data.mcpServers['fresh-server']).toEqual({ command: 'echo' });
  });
});

// --- install: skills ---

describe('GeminiCliAdapter.install -- skills', () => {
  it('installs skill into skills/ directory', async () => {
    const portable: PortableComponent = {
      type: 'skill',
      name: 'new-skill',
      description: 'A new skill',
      core: { description: 'A new skill', content: 'Do the thing.\n' },
    };

    const result = await adapter.install(portable, DEFAULT_TARGET);

    expect(result.id.name).toBe('new-skill');
    expect(result.id.type).toBe('skill');
    expect(result.id.tool).toBe('gemini-cli');
    expect(result.id.scope).toBe('user');
    expect(result.tracking).toBe('managed');

    const content = await readFile(join(tempDir, 'skills', 'new-skill', 'SKILL.md'), 'utf-8');
    expect(content).toContain('---');
    expect(content).toContain('name: new-skill');
    expect(content).toContain('description: A new skill');
    expect(content).toContain('Do the thing.');
  });

  it('creates skills directory if it does not exist', async () => {
    const freshDir = join(tempDir, 'no-skills');
    await mkdir(freshDir, { recursive: true });
    const freshAdapter = createGeminiCliAdapter(freshDir, 'gc-sk', configIO, logger);

    const portable: PortableComponent = {
      type: 'skill',
      name: 'first-skill',
      core: { description: '', content: 'Content here.' },
    };

    await freshAdapter.install(portable, DEFAULT_TARGET);

    const content = await readFile(join(freshDir, 'skills', 'first-skill', 'SKILL.md'), 'utf-8');
    expect(content).toContain('Content here.');
  });
});

// --- install: unsupported types ---

describe('GeminiCliAdapter.install -- unsupported types', () => {
  it('throws ADAPTER_UNSUPPORTED for command type', async () => {
    const portable: PortableComponent = {
      type: 'command',
      name: 'some-cmd',
      core: { description: 'Test', content: 'Do stuff' },
    };

    try {
      await adapter.install(portable, DEFAULT_TARGET);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('ADAPTER_UNSUPPORTED');
    }
  });

  it('throws ADAPTER_UNSUPPORTED for hook type', async () => {
    const portable: PortableComponent = {
      type: 'hook',
      name: 'some-hook',
      core: { event: 'onStart', handler: { type: 'command', command: 'echo' } },
    };

    try {
      await adapter.install(portable, DEFAULT_TARGET);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('ADAPTER_UNSUPPORTED');
    }
  });
});

// --- uninstall: MCP servers ---

describe('GeminiCliAdapter.uninstall -- MCP servers', () => {
  it('removes server from settings.json', async () => {
    await adapter.uninstall({
      tool: 'gemini-cli',
      type: 'mcp-server',
      name: 'filesystem',
      scope: 'user',
    });

    const data = JSON.parse(await readFile(join(tempDir, SETTINGS_FILE), 'utf-8'));
    expect(data.mcpServers.filesystem).toBeUndefined();
    expect(data.mcpServers['remote-api']).toBeDefined();
  });

  it('keeps config file valid after removing last server', async () => {
    await writeFile(
      join(tempDir, SETTINGS_FILE),
      JSON.stringify({ mcpServers: { only: { command: 'echo' } } }),
    );

    await adapter.uninstall({
      tool: 'gemini-cli',
      type: 'mcp-server',
      name: 'only',
      scope: 'user',
    });

    const data = JSON.parse(await readFile(join(tempDir, SETTINGS_FILE), 'utf-8'));
    expect(data.mcpServers).toEqual({});
  });

  it('preserves other top-level config keys', async () => {
    await adapter.uninstall({
      tool: 'gemini-cli',
      type: 'mcp-server',
      name: 'filesystem',
      scope: 'user',
    });

    const data = JSON.parse(await readFile(join(tempDir, SETTINGS_FILE), 'utf-8'));
    expect(data.theme).toBe('dark');
  });

  it('throws COMPONENT_NOT_FOUND for missing server', async () => {
    try {
      await adapter.uninstall({
        tool: 'gemini-cli',
        type: 'mcp-server',
        name: 'nonexistent',
        scope: 'user',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('COMPONENT_NOT_FOUND');
    }
  });

  it('throws COMPONENT_NOT_FOUND when config file missing', async () => {
    const emptyDir = join(tempDir, 'empty-uninstall');
    await mkdir(emptyDir, { recursive: true });
    const emptyAdapter = createGeminiCliAdapter(emptyDir, 'gc-empty-u', configIO, logger);

    try {
      await emptyAdapter.uninstall({
        tool: 'gemini-cli',
        type: 'mcp-server',
        name: 'something',
        scope: 'user',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('COMPONENT_NOT_FOUND');
    }
  });
});

// --- uninstall: skills ---

describe('GeminiCliAdapter.uninstall -- skills', () => {
  it('removes skill directory', async () => {
    // First install a skill, then uninstall it
    const portable: PortableComponent = {
      type: 'skill',
      name: 'removable-skill',
      core: { description: 'Temp', content: 'Temp content' },
    };
    await adapter.install(portable, DEFAULT_TARGET);

    await adapter.uninstall({
      tool: 'gemini-cli',
      type: 'skill',
      name: 'removable-skill',
      scope: 'user',
    });

    // Verify directory was removed
    try {
      await readFile(join(tempDir, 'skills', 'removable-skill', 'SKILL.md'), 'utf-8');
      expect.fail('File should not exist');
    } catch {
      // Expected: file/directory removed
    }
  });
});

// --- error handling: extension scope components ---

describe('GeminiCliAdapter.uninstall -- extension scope components', () => {
  it('rejects extension-scope MCP server (name contains slash, caught by validateName)', async () => {
    // Extension-scoped names like "my-ext/ext-server" contain "/" which
    // validateName rejects before the scope check can run.
    try {
      await adapter.uninstall({
        tool: 'gemini-cli',
        type: 'mcp-server',
        name: 'my-ext/ext-server',
        scope: 'extension:my-ext',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_PERMISSION');
    }
  });

  it('rejects extension-scope skill (name contains slash, caught by validateName)', async () => {
    try {
      await adapter.uninstall({
        tool: 'gemini-cli',
        type: 'skill',
        name: 'my-ext/my-skill',
        scope: 'extension:my-ext',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_PERMISSION');
    }
  });

  it('throws ADAPTER_UNSUPPORTED for unsupported uninstall types', async () => {
    // For types not handled in the uninstall switch (command, hook, agent, etc.),
    // the default case fires before any name validation.
    try {
      await adapter.uninstall({
        tool: 'gemini-cli',
        type: 'command',
        name: 'my-ext/hello',
        scope: 'extension:my-ext',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('ADAPTER_UNSUPPORTED');
    }
  });
});

// --- name validation ---

describe('GeminiCliAdapter -- name validation', () => {
  it('install rejects names with path traversal (..)', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: '../etc/evil',
      core: { transport: 'stdio', command: 'echo' },
    };

    try {
      await adapter.install(portable, DEFAULT_TARGET);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_PERMISSION');
      expect((err as AppError).message).toContain('invalid characters');
    }
  });

  it('install rejects names with forward slash', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'foo/bar',
      core: { transport: 'stdio', command: 'echo' },
    };

    try {
      await adapter.install(portable, DEFAULT_TARGET);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_PERMISSION');
    }
  });

  it('install rejects names with backslash', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'foo\\bar',
      core: { transport: 'stdio', command: 'echo' },
    };

    try {
      await adapter.install(portable, DEFAULT_TARGET);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_PERMISSION');
    }
  });

  it('install rejects names with null byte', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'foo\0bar',
      core: { transport: 'stdio', command: 'echo' },
    };

    try {
      await adapter.install(portable, DEFAULT_TARGET);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_PERMISSION');
    }
  });

  it('uninstall rejects names with path traversal', async () => {
    try {
      await adapter.uninstall({
        tool: 'gemini-cli',
        type: 'mcp-server',
        name: '../etc/evil',
        scope: 'user',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_PERMISSION');
    }
  });

  it('uninstall rejects names with null byte', async () => {
    try {
      await adapter.uninstall({
        tool: 'gemini-cli',
        type: 'mcp-server',
        name: 'foo\0bar',
        scope: 'user',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_PERMISSION');
    }
  });

  it('skill install rejects names with path traversal', async () => {
    const portable: PortableComponent = {
      type: 'skill',
      name: '../evil-skill',
      core: { description: '', content: 'bad' },
    };

    try {
      await adapter.install(portable, DEFAULT_TARGET);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_PERMISSION');
    }
  });

  it('skill uninstall rejects names with path traversal', async () => {
    try {
      await adapter.uninstall({
        tool: 'gemini-cli',
        type: 'skill',
        name: '../evil-skill',
        scope: 'user',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_PERMISSION');
    }
  });
});

// --- canToggle / enable / disable ---

describe('GeminiCliAdapter -- toggle support', () => {
  it('canToggle returns false for all types', () => {
    const types: ComponentType[] = [
      'mcp-server',
      'skill',
      'command',
      'hook',
      'agent',
      'context-file',
      'unknown',
    ];
    for (const t of types) {
      expect(adapter.canToggle(t)).toBe(false);
    }
  });

  it('enable throws ADAPTER_UNSUPPORTED', async () => {
    try {
      await adapter.enable({
        tool: 'gemini-cli',
        type: 'mcp-server',
        name: 'test',
        scope: 'user',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('ADAPTER_UNSUPPORTED');
    }
  });

  it('disable throws ADAPTER_UNSUPPORTED', async () => {
    try {
      await adapter.disable({
        tool: 'gemini-cli',
        type: 'mcp-server',
        name: 'test',
        scope: 'user',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('ADAPTER_UNSUPPORTED');
    }
  });
});

// --- metadata methods ---

describe('GeminiCliAdapter -- metadata methods', () => {
  it('getConfigPath returns settings.json path for user-scope components', () => {
    const result = adapter.getConfigPath({
      tool: 'gemini-cli',
      type: 'mcp-server',
      name: 'any',
      scope: 'user',
    });
    expect(result).toBe(join(tempDir, SETTINGS_FILE));
  });

  it('getConfigPath returns manifest path for extension-scope components', () => {
    const result = adapter.getConfigPath({
      tool: 'gemini-cli',
      type: 'mcp-server',
      name: 'my-ext/ext-server',
      scope: 'extension:my-ext',
    });
    expect(result).toBe(join(tempDir, 'extensions', 'my-ext', 'gemini-extension.json'));
  });

  it('getSupportedTypes returns Gemini CLI types', () => {
    const types = adapter.getSupportedTypes();
    expect(types).toContain('mcp-server');
    expect(types).toContain('skill');
    expect(types).toContain('command');
    expect(types).toContain('hook');
    expect(types).toContain('agent');
    expect(types).toContain('context-file');
    expect(types).toContain('unknown');
  });

  it('resolveConfigDir returns rootPath', () => {
    expect(adapter.resolveConfigDir()).toBe(tempDir);
  });
});

// --- full lifecycle ---

describe('GeminiCliAdapter -- full lifecycle', () => {
  it('MCP server: install -> scan -> uninstall -> scan', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'lifecycle-server',
      core: { transport: 'stdio', command: 'node', args: ['server.js'] },
    };

    // Install
    const installed = await adapter.install(portable, DEFAULT_TARGET);
    expect(installed.tracking).toBe('managed');

    // Verify via scan
    let components = await adapter.scan();
    let found = components.find((c) => c.id.name === 'lifecycle-server');
    expect(found).toBeDefined();
    expect(found!.id.type).toBe('mcp-server');
    expect(found!.id.tool).toBe('gemini-cli');
    const core = found!.core as { transport: string; command: string; args?: string[] };
    expect(core.transport).toBe('stdio');
    expect(core.command).toBe('node');
    expect(core.args).toEqual(['server.js']);

    // Uninstall
    await adapter.uninstall({
      tool: 'gemini-cli',
      type: 'mcp-server',
      name: 'lifecycle-server',
      scope: 'user',
    });

    // Verify removal
    components = await adapter.scan();
    found = components.find((c) => c.id.name === 'lifecycle-server');
    expect(found).toBeUndefined();
  });

  it('skill: install -> uninstall', async () => {
    const portable: PortableComponent = {
      type: 'skill',
      name: 'lifecycle-skill',
      description: 'Lifecycle test',
      core: { description: 'Lifecycle test', content: 'Skill content here.' },
    };

    // Install
    const installed = await adapter.install(portable, DEFAULT_TARGET);
    expect(installed.tracking).toBe('managed');
    expect(installed.id.type).toBe('skill');

    // Uninstall
    await adapter.uninstall({
      tool: 'gemini-cli',
      type: 'skill',
      name: 'lifecycle-skill',
      scope: 'user',
    });

    // Verify removal
    try {
      await readFile(join(tempDir, 'skills', 'lifecycle-skill', 'SKILL.md'), 'utf-8');
      expect.fail('File should not exist after uninstall');
    } catch {
      // Expected
    }
  });
});

// --- backup safety ---

describe('GeminiCliAdapter -- backup safety', () => {
  it('install creates backup of settings.json', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'backup-test',
      core: { transport: 'stdio', command: 'echo' },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    const backup = JSON.parse(await readFile(join(tempDir, SETTINGS_FILE + '.backup'), 'utf-8'));
    expect(Object.keys(backup.mcpServers)).toHaveLength(2);
    expect(backup.mcpServers['backup-test']).toBeUndefined();
  });

  it('uninstall creates backup of settings.json', async () => {
    await adapter.uninstall({
      tool: 'gemini-cli',
      type: 'mcp-server',
      name: 'filesystem',
      scope: 'user',
    });

    const backup = JSON.parse(await readFile(join(tempDir, SETTINGS_FILE + '.backup'), 'utf-8'));
    expect(backup.mcpServers.filesystem).toBeDefined();
  });
});

// --- platform path resolution ---

describe('resolveDefaultGeminiConfigDir', () => {
  it('returns a path containing .gemini', () => {
    const result = resolveDefaultGeminiConfigDir();
    expect(result).toContain('.gemini');
  });

  it('uses HOME or USERPROFILE env var', () => {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '/tmp';
    const result = resolveDefaultGeminiConfigDir();
    expect(result).toBe(join(home, '.gemini'));
  });
});
