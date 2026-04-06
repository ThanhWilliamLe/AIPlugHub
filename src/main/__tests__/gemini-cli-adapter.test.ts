import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFile: vi.fn(
      (_cmd: string, _args: string[], _opts: unknown, cb: (...a: unknown[]) => void) => {
        cb(null, '', '');
      },
    ),
  };
});

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
    expect(extMcp!.enabled).toBe(true); // toggleable type preserves enabled
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
    expect(skill!.enabled).toBe(true); // toggleable type preserves enabled
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
    expect(cmd!.enabled).toBeUndefined();
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
    expect(agent!.enabled).toBeUndefined();
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
    expect(ctx!.enabled).toBeUndefined();
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
  it('marks toggleable extension components as disabled when enablement says false', async () => {
    await writeFile(
      join(tempDir, 'extensions', 'extension-enablement.json'),
      JSON.stringify({
        'my-ext': { enabled: false },
      }),
    );

    const components = await adapter.scan();
    const extComponents = components.filter((c) => c.id.scope.startsWith('extension:'));

    expect(extComponents.length).toBeGreaterThan(0);
    // mcp-server and skill types preserve enabled; other types strip it
    const toggleable = extComponents.filter(
      (c) => c.id.type === 'mcp-server' || c.id.type === 'skill',
    );
    for (const c of toggleable) {
      expect(c.enabled).toBe(false);
    }
    const nonToggleable = extComponents.filter(
      (c) => c.id.type !== 'mcp-server' && c.id.type !== 'skill',
    );
    for (const c of nonToggleable) {
      expect(c.enabled).toBeUndefined();
    }
  });

  it('strips enabled from non-toggleable types even when enabled is true', async () => {
    await writeFile(
      join(tempDir, 'extensions', 'extension-enablement.json'),
      JSON.stringify({ 'my-ext': { enabled: true } }),
    );

    const components = await adapter.scan();
    const extComponents = components.filter((c) => c.id.scope.startsWith('extension:'));

    // Non-toggleable types always have enabled stripped
    const nonToggleable = extComponents.filter(
      (c) => c.id.type !== 'mcp-server' && c.id.type !== 'skill',
    );
    for (const c of nonToggleable) {
      expect(c.enabled).toBeUndefined();
    }
  });

  it('preserves enabled for toggleable types when enablement file is missing', async () => {
    await rm(join(tempDir, 'extensions', 'extension-enablement.json'), { force: true });

    const components = await adapter.scan();
    const extComponents = components.filter((c) => c.id.scope.startsWith('extension:'));

    expect(extComponents.length).toBeGreaterThan(0);
    // Toggleable types get enabled=true (default when enablement file missing)
    const toggleable = extComponents.filter(
      (c) => c.id.type === 'mcp-server' || c.id.type === 'skill',
    );
    for (const c of toggleable) {
      expect(c.enabled).toBe(true);
    }
    // Non-toggleable types still have enabled stripped
    const nonToggleable = extComponents.filter(
      (c) => c.id.type !== 'mcp-server' && c.id.type !== 'skill',
    );
    for (const c of nonToggleable) {
      expect(c.enabled).toBeUndefined();
    }
  });

  it('handles corrupted enablement file gracefully', async () => {
    await writeFile(join(tempDir, 'extensions', 'extension-enablement.json'), '{corrupted json!!!');

    const components = await adapter.scan();
    const extComponents = components.filter((c) => c.id.scope.startsWith('extension:'));

    expect(extComponents.length).toBeGreaterThan(0);
    // Non-toggleable types always have enabled stripped
    const nonToggleable = extComponents.filter(
      (c) => c.id.type !== 'mcp-server' && c.id.type !== 'skill',
    );
    for (const c of nonToggleable) {
      expect(c.enabled).toBeUndefined();
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

// --- install: MCP servers via CLI delegation ---

describe('GeminiCliAdapter.install -- MCP servers (CLI delegation)', () => {
  it('calls gemini mcp add for stdio server', async () => {
    const cp = await import('child_process');
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

    expect(cp.execFile).toHaveBeenCalledWith(
      'gemini',
      ['mcp', 'add', '--scope', 'user', '-t', 'stdio', 'new-server', 'npx', '-y', 'new-pkg'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
  });

  it('calls gemini mcp add for HTTP server with URL', async () => {
    const cp = await import('child_process');
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'http-server',
      core: {
        transport: 'http',
        url: 'https://example.com/mcp',
        headers: { 'X-Key': 'abc' },
      },
    };

    const result = await adapter.install(portable, DEFAULT_TARGET);
    expect(result.id.name).toBe('http-server');

    expect(cp.execFile).toHaveBeenCalledWith(
      'gemini',
      ['mcp', 'add', '--scope', 'user', '-t', 'http', 'http-server', 'https://example.com/mcp'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
  });

  it('passes env vars with -e flags', async () => {
    const cp = await import('child_process');
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'env-server',
      core: { transport: 'stdio', command: 'node', env: { HOME: '/home', KEY: 'val' } },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    expect(cp.execFile).toHaveBeenCalledWith(
      'gemini',
      expect.arrayContaining(['-e', 'HOME=/home', '-e', 'KEY=val']),
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
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

// --- uninstall: MCP servers via CLI delegation ---

describe('GeminiCliAdapter.uninstall -- MCP servers (CLI delegation)', () => {
  it('calls gemini mcp remove for user-scope server', async () => {
    const cp = await import('child_process');
    await adapter.uninstall({
      tool: 'gemini-cli',
      type: 'mcp-server',
      name: 'filesystem',
      scope: 'user',
    });

    expect(cp.execFile).toHaveBeenCalledWith(
      'gemini',
      ['mcp', 'remove', '--scope', 'user', 'filesystem'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
  });
});

// --- uninstall: skills via CLI delegation ---

describe('GeminiCliAdapter.uninstall -- skills (CLI delegation)', () => {
  it('calls gemini skills uninstall for user-scope skill', async () => {
    const cp = await import('child_process');
    await adapter.uninstall({
      tool: 'gemini-cli',
      type: 'skill',
      name: 'test-skill',
      scope: 'user',
    });

    expect(cp.execFile).toHaveBeenCalledWith(
      'gemini',
      ['skills', 'uninstall', '--scope', 'user', 'test-skill'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
  });
});

// --- error handling: extension scope components ---

describe('GeminiCliAdapter.uninstall -- extension scope components', () => {
  it('uninstalls extension-scope MCP server via Gemini CLI', async () => {
    const cp = await import('child_process');

    await adapter.uninstall({
      tool: 'gemini-cli',
      type: 'mcp-server',
      name: 'my-ext/ext-server',
      scope: 'extension:my-ext',
    });

    expect(cp.execFile).toHaveBeenCalledWith(
      'gemini',
      ['extensions', 'uninstall', 'my-ext'],
      expect.objectContaining({ timeout: 30_000, shell: true }),
      expect.any(Function),
    );
  });

  it('uninstalls extension-scope skill via Gemini CLI', async () => {
    const cp = await import('child_process');

    await adapter.uninstall({
      tool: 'gemini-cli',
      type: 'skill',
      name: 'my-ext/my-skill',
      scope: 'extension:my-ext',
    });

    expect(cp.execFile).toHaveBeenCalledWith(
      'gemini',
      ['extensions', 'uninstall', 'my-ext'],
      expect.objectContaining({ timeout: 30_000, shell: true }),
      expect.any(Function),
    );
  });

  it('uninstalls extension-scope command via Gemini CLI', async () => {
    const cp = await import('child_process');

    await adapter.uninstall({
      tool: 'gemini-cli',
      type: 'command',
      name: 'my-ext/hello',
      scope: 'extension:my-ext',
    });

    expect(cp.execFile).toHaveBeenCalledWith(
      'gemini',
      ['extensions', 'uninstall', 'my-ext'],
      expect.objectContaining({ timeout: 30_000, shell: true }),
      expect.any(Function),
    );
  });

  it('treats unclean exit as success when output contains success message', async () => {
    const cp = await import('child_process');
    const mockExecFile = cp.execFile as unknown as ReturnType<typeof vi.fn>;
    mockExecFile.mockImplementationOnce(
      (_cmd: string, _args: string[], _opts: unknown, cb: (...a: unknown[]) => void) => {
        const err = Object.assign(new Error('Command failed'), {
          stdout: 'Extension "my-ext" successfully uninstalled.\n',
          stderr: 'Assertion failed: ...\n',
          code: 1,
        });
        cb(err, '', '');
      },
    );

    // Should not throw despite non-zero exit
    await adapter.uninstall({
      tool: 'gemini-cli',
      type: 'mcp-server',
      name: 'my-ext/server',
      scope: 'extension:my-ext',
    });
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

  it('install accepts namespaced names with forward slash', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'foo/bar',
      core: { transport: 'stdio', command: 'echo' },
    };

    const result = await adapter.install(portable, DEFAULT_TARGET);
    expect(result.id.name).toBe('foo/bar');
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

// --- canToggle ---

describe('GeminiCliAdapter.canToggle', () => {
  it('returns true for mcp-server', () => {
    expect(adapter.canToggle('mcp-server')).toBe(true);
  });
  it('returns true for skill', () => {
    expect(adapter.canToggle('skill')).toBe(true);
  });
  it('returns false for hook', () => {
    expect(adapter.canToggle('hook')).toBe(false);
  });
  it('returns false for command', () => {
    expect(adapter.canToggle('command')).toBe(false);
  });
  it('returns false for agent', () => {
    expect(adapter.canToggle('agent')).toBe(false);
  });
  it('returns false for context-file', () => {
    expect(adapter.canToggle('context-file')).toBe(false);
  });
  it('returns false for unknown', () => {
    expect(adapter.canToggle('unknown')).toBe(false);
  });
});

// --- enable/disable CLI delegation ---

describe('GeminiCliAdapter.enable/disable -- CLI delegation', () => {
  it('calls gemini extensions enable for extension-scope component', async () => {
    const cp = await import('child_process');
    await adapter.enable({
      tool: 'gemini-cli',
      type: 'mcp-server',
      name: 'my-ext/ext-server',
      scope: 'extension:my-ext',
    });
    expect(cp.execFile).toHaveBeenCalledWith(
      'gemini',
      ['extensions', 'enable', 'my-ext'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
  });

  it('calls gemini extensions disable for extension-scope', async () => {
    const cp = await import('child_process');
    await adapter.disable({
      tool: 'gemini-cli',
      type: 'skill',
      name: 'my-ext/my-skill',
      scope: 'extension:my-ext',
    });
    expect(cp.execFile).toHaveBeenCalledWith(
      'gemini',
      ['extensions', 'disable', 'my-ext'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
  });

  it('calls gemini mcp enable for user-scope MCP server', async () => {
    const cp = await import('child_process');
    await adapter.enable({
      tool: 'gemini-cli',
      type: 'mcp-server',
      name: 'filesystem',
      scope: 'user',
    });
    expect(cp.execFile).toHaveBeenCalledWith(
      'gemini',
      ['mcp', 'enable', 'filesystem'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
  });

  it('calls gemini mcp disable for user-scope MCP server', async () => {
    const cp = await import('child_process');
    await adapter.disable({
      tool: 'gemini-cli',
      type: 'mcp-server',
      name: 'filesystem',
      scope: 'user',
    });
    expect(cp.execFile).toHaveBeenCalledWith(
      'gemini',
      ['mcp', 'disable', 'filesystem'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
  });

  it('calls gemini skills enable for user-scope skill', async () => {
    const cp = await import('child_process');
    await adapter.enable({
      tool: 'gemini-cli',
      type: 'skill',
      name: 'my-skill',
      scope: 'user',
    });
    expect(cp.execFile).toHaveBeenCalledWith(
      'gemini',
      ['skills', 'enable', 'my-skill'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
  });

  it('throws ADAPTER_UNSUPPORTED for hook enable', async () => {
    await expect(
      adapter.enable({
        tool: 'gemini-cli',
        type: 'hook',
        name: 'some-hook',
        scope: 'user',
      }),
    ).rejects.toThrow('Enable not supported for type "hook"');
  });

  it('throws ADAPTER_UNSUPPORTED for hook disable', async () => {
    await expect(
      adapter.disable({
        tool: 'gemini-cli',
        type: 'hook',
        name: 'some-hook',
        scope: 'user',
      }),
    ).rejects.toThrow('Disable not supported for type "hook"');
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

// --- full lifecycle (CLI-delegated) ---

describe('GeminiCliAdapter -- full lifecycle (CLI-delegated)', () => {
  it('MCP server: install returns correct result, uninstall calls CLI', async () => {
    const cp = await import('child_process');
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'lifecycle-server',
      core: { transport: 'stdio', command: 'node', args: ['server.js'] },
    };

    // Install delegates to CLI
    const installed = await adapter.install(portable, DEFAULT_TARGET);
    expect(installed.tracking).toBe('managed');
    expect(installed.id.type).toBe('mcp-server');
    expect(installed.id.tool).toBe('gemini-cli');

    // Uninstall delegates to CLI
    await adapter.uninstall({
      tool: 'gemini-cli',
      type: 'mcp-server',
      name: 'lifecycle-server',
      scope: 'user',
    });

    expect(cp.execFile).toHaveBeenCalledWith(
      'gemini',
      ['mcp', 'remove', '--scope', 'user', 'lifecycle-server'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
  });

  it('skill: install via file I/O, uninstall via CLI', async () => {
    const cp = await import('child_process');
    const portable: PortableComponent = {
      type: 'skill',
      name: 'lifecycle-skill',
      description: 'Lifecycle test',
      core: { description: 'Lifecycle test', content: 'Skill content here.' },
    };

    // Install still uses file I/O
    const installed = await adapter.install(portable, DEFAULT_TARGET);
    expect(installed.tracking).toBe('managed');
    expect(installed.id.type).toBe('skill');

    const content = await readFile(join(tempDir, 'skills', 'lifecycle-skill', 'SKILL.md'), 'utf-8');
    expect(content).toContain('Skill content here.');

    // Uninstall delegates to CLI
    await adapter.uninstall({
      tool: 'gemini-cli',
      type: 'skill',
      name: 'lifecycle-skill',
      scope: 'user',
    });

    expect(cp.execFile).toHaveBeenCalledWith(
      'gemini',
      ['skills', 'uninstall', '--scope', 'user', 'lifecycle-skill'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
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
