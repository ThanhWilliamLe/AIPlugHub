import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  createClaudeDesktopAdapter,
  resolveDefaultDesktopConfigDir,
} from '../adapters/claude-desktop-adapter';
import { createConfigIO } from '../config-io';
import { createLogger } from '../logger';
import type { ToolAdapter } from '../adapters/tool-adapter';
import type { PortableComponent, InstallTarget, ComponentType } from '@shared/types';
import { AppError } from '@shared/types';

const logger = createLogger();
const configIO = createConfigIO(logger);
let tempDir: string;
let adapter: ToolAdapter;

const DEFAULT_TARGET: InstallTarget = { instanceId: 'claude-desktop-default', scope: 'user' };
const CONFIG_FILE = 'claude_desktop_config.json';

// -- Fixture helper --

async function createDefaultFixture(baseDir: string): Promise<void> {
  await writeFile(
    join(baseDir, CONFIG_FILE),
    JSON.stringify({
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/user/projects'],
          env: { HOME: '/home/user' },
        },
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_TOKEN: 'ghp_test123' },
        },
        'remote-api': {
          type: 'http',
          url: 'https://api.example.com/mcp',
          headers: { Authorization: 'Bearer token123' },
        },
      },
    }),
  );
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'plughub-cd-test-'));
  await createDefaultFixture(tempDir);
  adapter = createClaudeDesktopAdapter(tempDir, 'claude-desktop-default', configIO, logger);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ─── detect ──────────────────────────────────────────────────────────

describe('ClaudeDesktopAdapter.detect', () => {
  it('detects when config file exists', async () => {
    const result = await adapter.detect();
    expect(result.detected).toBe(true);
    expect(result.toolId).toBe('claude-desktop');
    expect(result.instanceId).toBe('claude-desktop-default');
    expect(result.path).toBe(tempDir);
  });

  it('returns detected: false when config file does not exist', async () => {
    const emptyDir = join(tempDir, 'no-config');
    await mkdir(emptyDir, { recursive: true });
    const missing = createClaudeDesktopAdapter(emptyDir, 'cd-missing', configIO, logger);
    const result = await missing.detect();
    expect(result.detected).toBe(false);
  });

  it('returns detected: false when path does not exist', async () => {
    const noDir = createClaudeDesktopAdapter(
      join(tempDir, 'nonexistent'),
      'cd-nodir',
      configIO,
      logger,
    );
    const result = await noDir.detect();
    expect(result.detected).toBe(false);
  });
});

// ─── scan: MCP servers ──────────────────────────────────────────────

describe('ClaudeDesktopAdapter.scan — MCP servers', () => {
  it('scans stdio MCP servers', async () => {
    const components = await adapter.scan();
    const fs = components.find((c) => c.id.name === 'filesystem');

    expect(fs).toBeDefined();
    expect(fs!.id.type).toBe('mcp-server');
    expect(fs!.id.tool).toBe('claude-desktop');
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

  it('scans HTTP MCP servers', async () => {
    const components = await adapter.scan();
    const api = components.find((c) => c.id.name === 'remote-api');

    expect(api).toBeDefined();
    const core = api!.core as { transport: string; url: string; headers?: Record<string, string> };
    expect(core.transport).toBe('http');
    expect(core.url).toBe('https://api.example.com/mcp');
    expect(core.headers).toEqual({ Authorization: 'Bearer token123' });
  });

  it('scans SSE MCP servers', async () => {
    await writeFile(
      join(tempDir, CONFIG_FILE),
      JSON.stringify({
        mcpServers: {
          'sse-server': {
            type: 'sse',
            url: 'https://stream.example.com/sse',
          },
        },
      }),
    );

    const components = await adapter.scan();
    const sse = components.find((c) => c.id.name === 'sse-server');

    expect(sse).toBeDefined();
    const core = sse!.core as { transport: string; url: string };
    expect(core.transport).toBe('sse');
    expect(core.url).toBe('https://stream.example.com/sse');
  });

  it('returns correct count of servers', async () => {
    const components = await adapter.scan();
    expect(components).toHaveLength(3);
  });

  it('handles empty config file ({})', async () => {
    await writeFile(join(tempDir, CONFIG_FILE), '{}');
    const components = await adapter.scan();
    expect(components).toEqual([]);
  });

  it('handles config with empty mcpServers ({})', async () => {
    await writeFile(join(tempDir, CONFIG_FILE), JSON.stringify({ mcpServers: {} }));
    const components = await adapter.scan();
    expect(components).toEqual([]);
  });

  it('handles missing config file gracefully', async () => {
    const emptyDir = join(tempDir, 'empty');
    await mkdir(emptyDir, { recursive: true });
    const emptyAdapter = createClaudeDesktopAdapter(emptyDir, 'cd-empty', configIO, logger);
    const components = await emptyAdapter.scan();
    expect(components).toEqual([]);
  });

  it('handles corrupted config file gracefully', async () => {
    await writeFile(join(tempDir, CONFIG_FILE), '{not valid json!!!');
    const components = await adapter.scan();
    expect(components).toEqual([]);
  });

  it('skips mcpServers entries that are not objects', async () => {
    await writeFile(
      join(tempDir, CONFIG_FILE),
      JSON.stringify({
        mcpServers: {
          good: { command: 'echo' },
          bad: null,
          worse: 42,
          worst: 'not an object',
        },
      }),
    );
    const components = await adapter.scan();
    expect(components).toHaveLength(1);
    expect(components[0].id.name).toBe('good');
  });

  it('handles mcpServers being a non-object value', async () => {
    await writeFile(join(tempDir, CONFIG_FILE), JSON.stringify({ mcpServers: 'not-an-object' }));
    const components = await adapter.scan();
    expect(components).toEqual([]);
  });

  it('handles mcpServers being an array', async () => {
    await writeFile(
      join(tempDir, CONFIG_FILE),
      JSON.stringify({ mcpServers: [{ command: 'echo' }] }),
    );
    const components = await adapter.scan();
    expect(components).toEqual([]);
  });

  it('all components have configPath set', async () => {
    const components = await adapter.scan();
    for (const c of components) {
      expect(c.configPath).toBe(join(tempDir, CONFIG_FILE));
    }
  });

  it('all components have tracking set to detected', async () => {
    const components = await adapter.scan();
    for (const c of components) {
      expect(c.tracking).toBe('detected');
    }
  });

  it('all components have scope set to user', async () => {
    const components = await adapter.scan();
    for (const c of components) {
      expect(c.id.scope).toBe('user');
    }
  });

  it('preserves other top-level config keys during scan', async () => {
    await writeFile(
      join(tempDir, CONFIG_FILE),
      JSON.stringify({
        mcpServers: { test: { command: 'echo' } },
        otherSetting: true,
        anotherThing: 'value',
      }),
    );
    const components = await adapter.scan();
    expect(components).toHaveLength(1);
  });
});

// ─── install ────────────────────────────────────────────────────────

describe('ClaudeDesktopAdapter.install', () => {
  it('installs stdio MCP server to config file', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'new-server',
      core: { transport: 'stdio', command: 'npx', args: ['-y', 'new-pkg'] },
    };

    const result = await adapter.install(portable, DEFAULT_TARGET);

    expect(result.id.name).toBe('new-server');
    expect(result.id.type).toBe('mcp-server');
    expect(result.id.tool).toBe('claude-desktop');
    expect(result.tracking).toBe('managed');
    expect(result.configPath).toBe(join(tempDir, CONFIG_FILE));

    // Verify file was updated
    const data = JSON.parse(await readFile(join(tempDir, CONFIG_FILE), 'utf-8'));
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

    const data = JSON.parse(await readFile(join(tempDir, CONFIG_FILE), 'utf-8'));
    expect(data.mcpServers['http-server']).toEqual({
      type: 'http',
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

    const data = JSON.parse(await readFile(join(tempDir, CONFIG_FILE), 'utf-8'));
    expect(data.mcpServers.filesystem).toBeDefined();
    expect(data.mcpServers.github).toBeDefined();
    expect(data.mcpServers['remote-api']).toBeDefined();
    expect(data.mcpServers['new-server']).toBeDefined();
  });

  it('preserves other top-level config keys when installing', async () => {
    await writeFile(
      join(tempDir, CONFIG_FILE),
      JSON.stringify({
        mcpServers: { existing: { command: 'echo' } },
        customSetting: 'keep-me',
      }),
    );

    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'new-server',
      core: { transport: 'stdio', command: 'node' },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(await readFile(join(tempDir, CONFIG_FILE), 'utf-8'));
    expect(data.customSetting).toBe('keep-me');
    expect(data.mcpServers.existing).toBeDefined();
    expect(data.mcpServers['new-server']).toBeDefined();
  });

  it('creates config file if missing', async () => {
    const emptyDir = join(tempDir, 'fresh');
    await mkdir(emptyDir, { recursive: true });
    const freshAdapter = createClaudeDesktopAdapter(emptyDir, 'cd-fresh', configIO, logger);

    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'first-server',
      core: { transport: 'stdio', command: 'echo' },
    };

    await freshAdapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(await readFile(join(emptyDir, CONFIG_FILE), 'utf-8'));
    expect(data.mcpServers['first-server']).toEqual({ command: 'echo' });
  });

  it('creates config file even when directory does not exist', async () => {
    const deepDir = join(tempDir, 'new', 'nested', 'dir');
    const deepAdapter = createClaudeDesktopAdapter(deepDir, 'cd-deep', configIO, logger);

    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'deep-server',
      core: { transport: 'stdio', command: 'echo' },
    };

    await deepAdapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(await readFile(join(deepDir, CONFIG_FILE), 'utf-8'));
    expect(data.mcpServers['deep-server']).toEqual({ command: 'echo' });
  });

  it('overwrites existing server with same name', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'filesystem', // already exists in fixture
      core: { transport: 'stdio', command: 'new-command', args: ['--new'] },
    };

    const result = await adapter.install(portable, DEFAULT_TARGET);
    expect(result.id.name).toBe('filesystem');

    // Verify it was overwritten
    const data = JSON.parse(await readFile(join(tempDir, CONFIG_FILE), 'utf-8'));
    expect(data.mcpServers.filesystem).toEqual({ command: 'new-command', args: ['--new'] });
    // Other servers preserved
    expect(data.mcpServers.github).toBeDefined();
  });

  it('throws ADAPTER_UNSUPPORTED for non-mcp-server types', async () => {
    const portable: PortableComponent = {
      type: 'skill',
      name: 'some-skill',
      core: { description: 'Test', content: 'Do stuff' },
    };

    try {
      await adapter.install(portable, DEFAULT_TARGET);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('ADAPTER_UNSUPPORTED');
      expect((err as AppError).message).toContain('mcp-server');
    }
  });

  it('rejects names with path traversal characters', async () => {
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

  it('rejects names with forward slash', async () => {
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

  it('rejects names with backslash', async () => {
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

  it('rejects names with null byte', async () => {
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
});

// ─── uninstall ──────────────────────────────────────────────────────

describe('ClaudeDesktopAdapter.uninstall', () => {
  it('removes server from config file', async () => {
    await adapter.uninstall({
      tool: 'claude-desktop',
      type: 'mcp-server',
      name: 'filesystem',
      scope: 'user',
    });

    const data = JSON.parse(await readFile(join(tempDir, CONFIG_FILE), 'utf-8'));
    expect(data.mcpServers.filesystem).toBeUndefined();
    // Other servers preserved
    expect(data.mcpServers.github).toBeDefined();
    expect(data.mcpServers['remote-api']).toBeDefined();
  });

  it('keeps config file valid after removing last server', async () => {
    // Write config with single server
    await writeFile(
      join(tempDir, CONFIG_FILE),
      JSON.stringify({ mcpServers: { only: { command: 'echo' } } }),
    );

    await adapter.uninstall({
      tool: 'claude-desktop',
      type: 'mcp-server',
      name: 'only',
      scope: 'user',
    });

    const data = JSON.parse(await readFile(join(tempDir, CONFIG_FILE), 'utf-8'));
    expect(data.mcpServers).toEqual({});
  });

  it('preserves other top-level config keys', async () => {
    await writeFile(
      join(tempDir, CONFIG_FILE),
      JSON.stringify({
        mcpServers: { target: { command: 'echo' } },
        keepMe: 'important',
      }),
    );

    await adapter.uninstall({
      tool: 'claude-desktop',
      type: 'mcp-server',
      name: 'target',
      scope: 'user',
    });

    const data = JSON.parse(await readFile(join(tempDir, CONFIG_FILE), 'utf-8'));
    expect(data.keepMe).toBe('important');
  });

  it('throws COMPONENT_NOT_FOUND for missing server', async () => {
    try {
      await adapter.uninstall({
        tool: 'claude-desktop',
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
    const emptyAdapter = createClaudeDesktopAdapter(emptyDir, 'cd-empty-u', configIO, logger);

    try {
      await emptyAdapter.uninstall({
        tool: 'claude-desktop',
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

  it('throws ADAPTER_UNSUPPORTED for non-mcp-server types', async () => {
    try {
      await adapter.uninstall({
        tool: 'claude-desktop',
        type: 'skill',
        name: 'something',
        scope: 'user',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('ADAPTER_UNSUPPORTED');
    }
  });
});

// ─── uninstall: name validation ──────────────────────────────────────

describe('ClaudeDesktopAdapter.uninstall — name validation', () => {
  it('rejects names with path traversal characters', async () => {
    try {
      await adapter.uninstall({
        tool: 'claude-desktop',
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

  it('rejects names with forward slash', async () => {
    try {
      await adapter.uninstall({
        tool: 'claude-desktop',
        type: 'mcp-server',
        name: 'foo/bar',
        scope: 'user',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_PERMISSION');
    }
  });

  it('rejects names with null byte', async () => {
    try {
      await adapter.uninstall({
        tool: 'claude-desktop',
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
});

// ─── install: additional edge cases ─────────────────────────────────

describe('ClaudeDesktopAdapter.install — edge cases', () => {
  it('installs SSE MCP server', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'sse-server',
      core: {
        transport: 'sse',
        url: 'https://stream.example.com/sse',
      },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(await readFile(join(tempDir, CONFIG_FILE), 'utf-8'));
    expect(data.mcpServers['sse-server']).toEqual({
      type: 'sse',
      url: 'https://stream.example.com/sse',
    });
  });

  it('installs successfully when existing config is corrupted', async () => {
    await writeFile(join(tempDir, CONFIG_FILE), '{not valid json!!!');

    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'fresh-server',
      core: { transport: 'stdio', command: 'echo' },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(await readFile(join(tempDir, CONFIG_FILE), 'utf-8'));
    expect(data.mcpServers['fresh-server']).toEqual({ command: 'echo' });
    // Old corrupted content is gone — fresh start
  });

  it('install returns scope as user regardless of target scope', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'scope-test',
      core: { transport: 'stdio', command: 'echo' },
    };

    const result = await adapter.install(portable, {
      instanceId: 'claude-desktop-default',
      scope: 'project', // wrong scope for Desktop — should still return 'user'
    });

    expect(result.id.scope).toBe('user');
  });
});

// ─── Full lifecycle: install → scan → uninstall → scan ──────────────

describe('ClaudeDesktopAdapter — full lifecycle', () => {
  it('MCP server: install → scan → uninstall → scan', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'lifecycle-server',
      core: { transport: 'stdio', command: 'node', args: ['server.js'] },
    };

    // Install
    const installed = await adapter.install(portable, DEFAULT_TARGET);
    expect(installed.tracking).toBe('managed');

    // Verify via scan — check core field round-trip fidelity
    let components = await adapter.scan();
    let found = components.find((c) => c.id.name === 'lifecycle-server');
    expect(found).toBeDefined();
    expect(found!.id.type).toBe('mcp-server');
    expect(found!.id.tool).toBe('claude-desktop');
    const core = found!.core as { transport: string; command: string; args?: string[] };
    expect(core.transport).toBe('stdio');
    expect(core.command).toBe('node');
    expect(core.args).toEqual(['server.js']);

    // Uninstall
    await adapter.uninstall({
      tool: 'claude-desktop',
      type: 'mcp-server',
      name: 'lifecycle-server',
      scope: 'user',
    });

    // Verify removal
    components = await adapter.scan();
    found = components.find((c) => c.id.name === 'lifecycle-server');
    expect(found).toBeUndefined();
  });

  it('install on empty dir → scan → uninstall → empty scan', async () => {
    const freshDir = join(tempDir, 'lifecycle-fresh');
    await mkdir(freshDir, { recursive: true });
    const freshAdapter = createClaudeDesktopAdapter(freshDir, 'cd-lc', configIO, logger);

    // Initially empty
    let components = await freshAdapter.scan();
    expect(components).toEqual([]);

    // Install
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'only-server',
      core: { transport: 'stdio', command: 'echo' },
    };
    await freshAdapter.install(portable, DEFAULT_TARGET);

    // Verify
    components = await freshAdapter.scan();
    expect(components).toHaveLength(1);
    expect(components[0].id.name).toBe('only-server');

    // Uninstall
    await freshAdapter.uninstall({
      tool: 'claude-desktop',
      type: 'mcp-server',
      name: 'only-server',
      scope: 'user',
    });

    // Back to empty
    components = await freshAdapter.scan();
    expect(components).toEqual([]);
  });
});

// ─── canToggle / enable / disable ───────────────────────────────────

describe('ClaudeDesktopAdapter — toggle support', () => {
  it('canToggle returns false for all types', () => {
    const types: ComponentType[] = [
      'mcp-server',
      'skill',
      'command',
      'hook',
      'agent',
      'prompt',
      'unknown',
    ];
    for (const t of types) {
      expect(adapter.canToggle(t)).toBe(false);
    }
  });

  it('enable throws ADAPTER_UNSUPPORTED', async () => {
    try {
      await adapter.enable({
        tool: 'claude-desktop',
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
        tool: 'claude-desktop',
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

// ─── getConfigPath / getSupportedTypes / resolveConfigDir ───────────

describe('ClaudeDesktopAdapter — metadata methods', () => {
  it('getConfigPath returns path to config file', () => {
    const result = adapter.getConfigPath({
      tool: 'claude-desktop',
      type: 'mcp-server',
      name: 'any',
      scope: 'user',
    });
    expect(result).toBe(join(tempDir, CONFIG_FILE));
  });

  it('getSupportedTypes returns Claude Desktop types', () => {
    const types = adapter.getSupportedTypes();
    expect(types).toContain('mcp-server');
    expect(types).toContain('prompt');
    expect(types).toContain('unknown');
    expect(types).not.toContain('skill');
    expect(types).not.toContain('hook');
    expect(types).not.toContain('command');
  });

  it('resolveConfigDir returns rootPath', () => {
    expect(adapter.resolveConfigDir()).toBe(tempDir);
  });
});

// ─── backup safety ──────────────────────────────────────────────────

describe('ClaudeDesktopAdapter — backup safety', () => {
  it('install creates backup of config file', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'backup-test',
      core: { transport: 'stdio', command: 'echo' },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    // Backup should contain the original 3 servers (pre-install state)
    const backup = JSON.parse(await readFile(join(tempDir, CONFIG_FILE + '.backup'), 'utf-8'));
    expect(Object.keys(backup.mcpServers)).toHaveLength(3);
    expect(backup.mcpServers['backup-test']).toBeUndefined();
  });

  it('uninstall creates backup of config file', async () => {
    await adapter.uninstall({
      tool: 'claude-desktop',
      type: 'mcp-server',
      name: 'filesystem',
      scope: 'user',
    });

    // Backup should contain all 3 original servers
    const backup = JSON.parse(await readFile(join(tempDir, CONFIG_FILE + '.backup'), 'utf-8'));
    expect(backup.mcpServers.filesystem).toBeDefined();
  });
});

// ─── platform path resolution ───────────────────────────────────────

describe('resolveDefaultDesktopConfigDir', () => {
  it('returns macOS path for darwin', () => {
    const result = resolveDefaultDesktopConfigDir('darwin');
    expect(result).toContain('Library');
    expect(result).toContain('Application Support');
    expect(result).toContain('Claude');
  });

  it('returns Windows path for win32', () => {
    const result = resolveDefaultDesktopConfigDir('win32');
    expect(result).toContain('Claude');
    // On Windows, should use APPDATA env var
    if (process.env.APPDATA) {
      expect(result).toContain(process.env.APPDATA);
    }
  });

  it('returns Linux path for linux', () => {
    const result = resolveDefaultDesktopConfigDir('linux');
    expect(result).toContain('.config');
    expect(result).toContain('claude');
  });

  it('returns Linux-style path for unknown platforms', () => {
    const result = resolveDefaultDesktopConfigDir('freebsd');
    expect(result).toContain('.config');
    expect(result).toContain('claude');
  });

  it('uses HOME environment variable on macOS', () => {
    const originalHome = process.env.HOME;
    try {
      process.env.HOME = '/test/home';
      const result = resolveDefaultDesktopConfigDir('darwin');
      expect(result).toBe(join('/test/home', 'Library', 'Application Support', 'Claude'));
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it('uses APPDATA environment variable on Windows', () => {
    const originalAppData = process.env.APPDATA;
    try {
      process.env.APPDATA = 'C:\\Users\\TestUser\\AppData\\Roaming';
      const result = resolveDefaultDesktopConfigDir('win32');
      expect(result).toBe(join('C:\\Users\\TestUser\\AppData\\Roaming', 'Claude'));
    } finally {
      process.env.APPDATA = originalAppData;
    }
  });

  it('uses HOME environment variable on Linux', () => {
    const originalHome = process.env.HOME;
    try {
      process.env.HOME = '/home/testuser';
      const result = resolveDefaultDesktopConfigDir('linux');
      expect(result).toBe(join('/home/testuser', '.config', 'claude'));
    } finally {
      process.env.HOME = originalHome;
    }
  });
});
