import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createClaudeCodeAdapter } from '../adapters/claude-code-adapter';
import type { ClaudeCodeAdapterExtended } from '../adapters/claude-code-adapter';
import { createConfigIO } from '../config-io';
import { createLogger } from '../logger';
import type { PortableComponent, InstallTarget, ComponentType } from '@shared/types';
import { AppError } from '@shared/types';

const logger = createLogger();
const configIO = createConfigIO(logger);
let tempDir: string;
let rootPath: string;
let adapter: ClaudeCodeAdapterExtended;

const DEFAULT_TARGET: InstallTarget = { instanceId: 'claude-code-default', scope: 'user' };

// -- Fixture helpers --

async function createDefaultFixture(baseDir: string): Promise<string> {
  const root = join(baseDir, '.claude');
  await mkdir(root, { recursive: true });

  // MCP config — parent directory of rootPath
  await writeFile(
    join(baseDir, '.claude.json'),
    JSON.stringify({
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem'],
          env: { HOME: '/home/user' },
        },
        'api-server': {
          type: 'http',
          url: 'https://api.example.com/mcp',
          headers: { Authorization: 'Bearer token123' },
        },
        'stream-server': {
          type: 'sse',
          url: 'https://stream.example.com/sse',
        },
      },
    }),
  );

  // Skills
  await mkdir(join(root, 'skills', 'deploy'), { recursive: true });
  await writeFile(
    join(root, 'skills', 'deploy', 'SKILL.md'),
    '---\nname: deploy\ndescription: Deploy to production\nuser-invocable: true\n---\nDeploy the application',
  );

  await mkdir(join(root, 'skills', 'test-runner'), { recursive: true });
  await writeFile(
    join(root, 'skills', 'test-runner', 'SKILL.md'),
    '---\ndescription: Run tests\nmodel: "sonnet"\n---\nRun the test suite',
  );

  // Commands
  await mkdir(join(root, 'commands'), { recursive: true });
  await writeFile(
    join(root, 'commands', 'review.md'),
    '---\nname: review\ndescription: Code review\n---\nReview the code for issues',
  );

  // Agents
  await mkdir(join(root, 'agents'), { recursive: true });
  await writeFile(
    join(root, 'agents', 'code-reviewer.md'),
    '---\nname: code-reviewer\ndescription: Reviews code quality\ntools: "Read, Glob, Grep"\nmodel: "sonnet"\n---\nYou are a code reviewer.',
  );

  // Settings with hooks
  await writeFile(
    join(root, 'settings.json'),
    JSON.stringify({
      hooks: {
        PostToolUse: [
          {
            matcher: 'Write|Edit',
            hooks: [{ type: 'command', command: 'format-code.sh', timeout: 600 }],
          },
        ],
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [
              { type: 'command', command: 'check-dangerous.sh' },
              { type: 'http', url: 'https://hooks.example.com/check' },
            ],
          },
        ],
      },
    }),
  );

  return root;
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'plughub-cc-test-'));
  rootPath = await createDefaultFixture(tempDir);
  adapter = createClaudeCodeAdapter(rootPath, 'claude-code-default', configIO, logger);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ─── detect ──────────────────────────────────────────────────────────

describe('ClaudeCodeAdapter.detect', () => {
  it('detects when rootPath directory exists', async () => {
    const result = await adapter.detect();
    expect(result.detected).toBe(true);
    expect(result.toolId).toBe('claude-code');
    expect(result.instanceId).toBe('claude-code-default');
    expect(result.path).toBe(rootPath);
  });

  it('returns detected: false when rootPath does not exist', async () => {
    const missing = createClaudeCodeAdapter(
      join(tempDir, 'nonexistent'),
      'cc-missing',
      configIO,
      logger,
    );
    const result = await missing.detect();
    expect(result.detected).toBe(false);
  });

  it('returns detected: false when rootPath is a file, not directory', async () => {
    const filePath = join(tempDir, 'not-a-dir');
    await writeFile(filePath, 'I am a file');
    const fileAdapter = createClaudeCodeAdapter(filePath, 'cc-file', configIO, logger);
    const result = await fileAdapter.detect();
    expect(result.detected).toBe(false);
  });
});

// ─── scan: MCP servers ──────────────────────────────────────────────

describe('ClaudeCodeAdapter.scan — MCP servers', () => {
  it('scans stdio MCP servers', async () => {
    const components = await adapter.scan();
    const fs = components.find((c) => c.id.name === 'filesystem');

    expect(fs).toBeDefined();
    expect(fs!.id.type).toBe('mcp-server');
    expect(fs!.id.scope).toBe('user');
    expect(fs!.tracking).toBe('detected');

    const core = fs!.core as { transport: string; command: string; args?: string[] };
    expect(core.transport).toBe('stdio');
    expect(core.command).toBe('npx');
    expect(core.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem']);
  });

  it('scans HTTP MCP servers', async () => {
    const components = await adapter.scan();
    const api = components.find((c) => c.id.name === 'api-server');

    expect(api).toBeDefined();
    const core = api!.core as { transport: string; url: string };
    expect(core.transport).toBe('http');
    expect(core.url).toBe('https://api.example.com/mcp');
  });

  it('scans SSE MCP servers', async () => {
    const components = await adapter.scan();
    const sse = components.find((c) => c.id.name === 'stream-server');

    expect(sse).toBeDefined();
    const core = sse!.core as { transport: string; url: string };
    expect(core.transport).toBe('sse');
    expect(core.url).toBe('https://stream.example.com/sse');
  });

  it('handles missing .claude.json gracefully', async () => {
    // Create adapter pointing to empty dir (no .claude.json in parent)
    const emptyBase = join(tempDir, 'empty-base');
    const emptyRoot = join(emptyBase, '.claude');
    await mkdir(emptyRoot, { recursive: true });
    const emptyAdapter = createClaudeCodeAdapter(emptyRoot, 'cc-empty', configIO, logger);

    const components = await emptyAdapter.scan();
    const mcp = components.filter((c) => c.id.type === 'mcp-server');
    expect(mcp).toEqual([]);
  });

  it('handles corrupted .claude.json gracefully', async () => {
    await writeFile(join(tempDir, '.claude.json'), '{not valid json!!!');
    const components = await adapter.scan();
    // Should still return other types, just no MCP servers
    const mcp = components.filter((c) => c.id.type === 'mcp-server');
    expect(mcp).toEqual([]);
  });

  it('skips mcpServers entries that are not objects', async () => {
    await writeFile(
      join(tempDir, '.claude.json'),
      JSON.stringify({ mcpServers: { good: { command: 'echo' }, bad: null, worse: 42 } }),
    );
    const components = await adapter.scan();
    const mcp = components.filter((c) => c.id.type === 'mcp-server');
    expect(mcp).toHaveLength(1);
    expect(mcp[0].id.name).toBe('good');
  });
});

// ─── scan: Skills ───────────────────────────────────────────────────

describe('ClaudeCodeAdapter.scan — Skills', () => {
  it('scans skills from skills/ directory', async () => {
    const components = await adapter.scan();
    const skills = components.filter((c) => c.id.type === 'skill');
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.id.name).sort()).toEqual(['deploy', 'test-runner']);
  });

  it('parses YAML frontmatter fields', async () => {
    const components = await adapter.scan();
    const deploy = components.find((c) => c.id.name === 'deploy');

    expect(deploy).toBeDefined();
    const core = deploy!.core as { description: string; content: string };
    expect(core.description).toBe('Deploy to production');
    expect(core.content).toBe('Deploy the application');
    expect(deploy!.extensions).toEqual({ userInvocable: true });
  });

  it('uses directory name when name not in frontmatter', async () => {
    const components = await adapter.scan();
    const runner = components.find((c) => c.id.name === 'test-runner');

    // test-runner skill has no 'name' in frontmatter, so dirname is used
    expect(runner).toBeDefined();
    expect(runner!.id.name).toBe('test-runner');
  });

  it('parses model extension', async () => {
    const components = await adapter.scan();
    const runner = components.find((c) => c.id.name === 'test-runner');

    expect(runner).toBeDefined();
    expect(runner!.extensions).toEqual({ model: 'sonnet' });
  });

  it('handles missing skills/ directory', async () => {
    const emptyRoot = join(tempDir, 'empty-root');
    await mkdir(emptyRoot, { recursive: true });
    const emptyAdapter = createClaudeCodeAdapter(emptyRoot, 'cc-empty', configIO, logger);

    const components = await emptyAdapter.scan();
    const skills = components.filter((c) => c.id.type === 'skill');
    expect(skills).toEqual([]);
  });

  it('skips non-directory entries in skills/', async () => {
    // Add a plain file to skills/ — should be ignored
    await writeFile(join(rootPath, 'skills', 'readme.md'), 'Ignore me');
    const components = await adapter.scan();
    const skills = components.filter((c) => c.id.type === 'skill');
    expect(skills).toHaveLength(2); // only the two real skill directories
  });

  it('skips directories without SKILL.md', async () => {
    await mkdir(join(rootPath, 'skills', 'empty-skill'), { recursive: true });
    await writeFile(join(rootPath, 'skills', 'empty-skill', 'README.md'), 'Not a skill');
    const components = await adapter.scan();
    const skills = components.filter((c) => c.id.type === 'skill');
    expect(skills).toHaveLength(2);
  });
});

// ─── scan: Commands ─────────────────────────────────────────────────

describe('ClaudeCodeAdapter.scan — Commands', () => {
  it('scans .md files from commands/ directory', async () => {
    const components = await adapter.scan();
    const commands = components.filter((c) => c.id.type === 'command');

    expect(commands).toHaveLength(1);
    expect(commands[0].id.name).toBe('review');
    expect(commands[0].description).toBe('Code review');
  });

  it('uses filename when name not in frontmatter', async () => {
    await writeFile(
      join(rootPath, 'commands', 'lint.md'),
      '---\ndescription: Run linter\n---\nLint the code',
    );
    const components = await adapter.scan();
    const lint = components.find((c) => c.id.name === 'lint');
    expect(lint).toBeDefined();
    expect(lint!.id.type).toBe('command');
  });

  it('handles missing commands/ directory', async () => {
    const emptyRoot = join(tempDir, 'empty-root2');
    await mkdir(emptyRoot, { recursive: true });
    const emptyAdapter = createClaudeCodeAdapter(emptyRoot, 'cc-empty2', configIO, logger);

    const components = await emptyAdapter.scan();
    const commands = components.filter((c) => c.id.type === 'command');
    expect(commands).toEqual([]);
  });
});

// ─── scan: Agents ───────────────────────────────────────────────────

describe('ClaudeCodeAdapter.scan — Agents', () => {
  it('scans .md files from agents/ directory', async () => {
    const components = await adapter.scan();
    const agents = components.filter((c) => c.id.type === 'agent');

    expect(agents).toHaveLength(1);
    expect(agents[0].id.name).toBe('code-reviewer');
    expect(agents[0].description).toBe('Reviews code quality');
  });

  it('parses agent frontmatter into AgentCore fields', async () => {
    const components = await adapter.scan();
    const agent = components.find((c) => c.id.name === 'code-reviewer');
    const core = agent!.core as { description: string; model?: string };
    expect(core.description).toBe('Reviews code quality');
    expect(core.model).toBe('sonnet');
  });

  it('handles missing agents/ directory', async () => {
    const emptyRoot = join(tempDir, 'empty-root3');
    await mkdir(emptyRoot, { recursive: true });
    const emptyAdapter = createClaudeCodeAdapter(emptyRoot, 'cc-empty3', configIO, logger);

    const components = await emptyAdapter.scan();
    const agents = components.filter((c) => c.id.type === 'agent');
    expect(agents).toEqual([]);
  });
});

// ─── scan: Hooks ────────────────────────────────────────────────────

describe('ClaudeCodeAdapter.scan — Hooks', () => {
  it('scans hooks from settings.json', async () => {
    const components = await adapter.scan();
    const hooks = components.filter((c) => c.id.type === 'hook');

    // PostToolUse: 1 group × 1 handler = 1 hook
    // PreToolUse: 1 group × 2 handlers = 2 hooks
    expect(hooks).toHaveLength(3);
  });

  it('names hooks with event::groupIdx::handlerIdx', async () => {
    const components = await adapter.scan();
    const hooks = components.filter((c) => c.id.type === 'hook');
    const names = hooks.map((h) => h.id.name).sort();
    expect(names).toEqual(['PostToolUse::0::0', 'PreToolUse::0::0', 'PreToolUse::0::1']);
  });

  it('parses command hooks correctly', async () => {
    const components = await adapter.scan();
    const hook = components.find((c) => c.id.name === 'PostToolUse::0::0');

    expect(hook).toBeDefined();
    const core = hook!.core as {
      event: string;
      handler: { type: string; command: string };
      matcher?: string;
    };
    expect(core.event).toBe('PostToolUse');
    expect(core.handler.type).toBe('command');
    expect(core.handler.command).toBe('format-code.sh');
    expect(core.matcher).toBe('Write|Edit');
  });

  it('parses HTTP hooks correctly', async () => {
    const components = await adapter.scan();
    const hook = components.find((c) => c.id.name === 'PreToolUse::0::1');

    expect(hook).toBeDefined();
    const core = hook!.core as { handler: { type: string; url: string } };
    expect(core.handler.type).toBe('http');
    expect(core.handler.url).toBe('https://hooks.example.com/check');
  });

  it('handles prompt handler type via extensions', async () => {
    await writeFile(
      join(rootPath, 'settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Write',
              hooks: [{ type: 'prompt', prompt: 'Check this is safe' }],
            },
          ],
        },
      }),
    );

    const components = await adapter.scan();
    const hook = components.find((c) => c.id.name === 'PreToolUse::0::0');
    expect(hook).toBeDefined();
    expect(hook!.extensions).toEqual({
      handler: { type: 'prompt', prompt: 'Check this is safe' },
    });
  });

  it('handles missing settings.json', async () => {
    const emptyRoot = join(tempDir, 'empty-root4');
    await mkdir(emptyRoot, { recursive: true });
    const emptyAdapter = createClaudeCodeAdapter(emptyRoot, 'cc-empty4', configIO, logger);

    const components = await emptyAdapter.scan();
    const hooks = components.filter((c) => c.id.type === 'hook');
    expect(hooks).toEqual([]);
  });

  it('handles settings.json with no hooks key', async () => {
    await writeFile(join(rootPath, 'settings.json'), JSON.stringify({ someSetting: true }));
    const components = await adapter.scan();
    const hooks = components.filter((c) => c.id.type === 'hook');
    expect(hooks).toEqual([]);
  });
});

// ─── scan: Full integration ─────────────────────────────────────────

describe('ClaudeCodeAdapter.scan — full integration', () => {
  it('returns all component types from a populated directory', async () => {
    const components = await adapter.scan();

    const byType = new Map<string, number>();
    for (const c of components) {
      byType.set(c.id.type, (byType.get(c.id.type) ?? 0) + 1);
    }

    expect(byType.get('mcp-server')).toBe(3);
    expect(byType.get('skill')).toBe(2);
    expect(byType.get('command')).toBe(1);
    expect(byType.get('agent')).toBe(1);
    expect(byType.get('hook')).toBe(3);
    expect(components).toHaveLength(10);
  });

  it('returns empty array for empty directory', async () => {
    // Use nested base so dirname(rootPath) doesn't hit the fixture's .claude.json
    const emptyBase = join(tempDir, 'isolated-empty');
    const emptyRoot = join(emptyBase, '.claude');
    await mkdir(emptyRoot, { recursive: true });
    const emptyAdapter = createClaudeCodeAdapter(emptyRoot, 'cc-empty-full', configIO, logger);

    const components = await emptyAdapter.scan();
    expect(components).toEqual([]);
  });

  it('continues scanning when one type fails', async () => {
    // Corrupt the MCP config but leave skills intact
    await writeFile(join(tempDir, '.claude.json'), '{broken!!!');
    const components = await adapter.scan();

    // MCP servers should be empty, but skills/commands/agents/hooks still scanned
    const mcp = components.filter((c) => c.id.type === 'mcp-server');
    const skills = components.filter((c) => c.id.type === 'skill');
    expect(mcp).toHaveLength(0);
    expect(skills).toHaveLength(2);
  });

  it('all components have configPath set', async () => {
    const components = await adapter.scan();
    for (const c of components) {
      expect(c.configPath).toBeDefined();
      expect(c.configPath!.length).toBeGreaterThan(0);
    }
  });

  it('all components have tracking set to detected', async () => {
    const components = await adapter.scan();
    for (const c of components) {
      expect(c.tracking).toBe('detected');
    }
  });
});

// ─── install ────────────────────────────────────────────────────────

describe('ClaudeCodeAdapter.install', () => {
  it('installs MCP server to .claude.json', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'new-server',
      core: { transport: 'stdio', command: 'npx', args: ['-y', 'new-pkg'] },
    };

    const result = await adapter.install(portable, DEFAULT_TARGET);

    expect(result.id.name).toBe('new-server');
    expect(result.id.type).toBe('mcp-server');
    expect(result.tracking).toBe('managed');

    // Verify file was updated
    const data = JSON.parse(await readFile(join(tempDir, '.claude.json'), 'utf-8'));
    expect(data.mcpServers['new-server']).toEqual({ command: 'npx', args: ['-y', 'new-pkg'] });
  });

  it('installs MCP server preserving existing entries', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'new-server',
      core: { transport: 'stdio', command: 'echo', args: ['hello'] },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(await readFile(join(tempDir, '.claude.json'), 'utf-8'));
    // Original entries preserved
    expect(data.mcpServers.filesystem).toBeDefined();
    expect(data.mcpServers['api-server']).toBeDefined();
    // New entry added
    expect(data.mcpServers['new-server']).toBeDefined();
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

    const data = JSON.parse(await readFile(join(tempDir, '.claude.json'), 'utf-8'));
    expect(data.mcpServers['http-server']).toEqual({
      type: 'http',
      url: 'https://example.com/mcp',
      headers: { 'X-Key': 'abc' },
    });
  });

  it('installs MCP server creating .claude.json if missing', async () => {
    // Remove existing MCP config
    const { unlink: unlinkFile } = await import('fs/promises');
    await unlinkFile(join(tempDir, '.claude.json'));

    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'first-server',
      core: { transport: 'stdio', command: 'echo' },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(await readFile(join(tempDir, '.claude.json'), 'utf-8'));
    expect(data.mcpServers['first-server']).toEqual({ command: 'echo' });
  });

  it('installs skill creating directory and SKILL.md', async () => {
    const portable: PortableComponent = {
      type: 'skill',
      name: 'my-skill',
      core: { description: 'Test skill', content: 'Do the thing' },
    };

    const result = await adapter.install(portable, DEFAULT_TARGET);

    expect(result.id.name).toBe('my-skill');
    expect(result.tracking).toBe('managed');

    // Verify file exists
    const content = await readFile(join(rootPath, 'skills', 'my-skill', 'SKILL.md'), 'utf-8');
    expect(content).toContain('name: my-skill');
    expect(content).toContain('description: Test skill');
    expect(content).toContain('Do the thing');
  });

  it('installs command creating .md file', async () => {
    const portable: PortableComponent = {
      type: 'command',
      name: 'my-cmd',
      core: { description: 'A command', content: 'Run stuff' },
    };

    const result = await adapter.install(portable, DEFAULT_TARGET);
    expect(result.id.type).toBe('command');

    const content = await readFile(join(rootPath, 'commands', 'my-cmd.md'), 'utf-8');
    expect(content).toContain('name: my-cmd');
    expect(content).toContain('Run stuff');
  });

  it('installs agent creating .md file', async () => {
    const portable: PortableComponent = {
      type: 'agent',
      name: 'my-agent',
      description: 'Test agent',
      core: { rawConfig: {}, rawTypeName: 'agent' },
    };

    const result = await adapter.install(portable, DEFAULT_TARGET);
    expect(result.id.type).toBe('agent');
    expect(result.description).toBe('Test agent');

    const content = await readFile(join(rootPath, 'agents', 'my-agent.md'), 'utf-8');
    expect(content).toContain('name: my-agent');
    expect(content).toContain('description: Test agent');
  });

  it('throws ADAPTER_UNSUPPORTED for unsupported types', async () => {
    const portable: PortableComponent = {
      type: 'lsp-server',
      name: 'some-lsp',
      core: { rawConfig: {}, rawTypeName: 'lsp-server' },
    };

    try {
      await adapter.install(portable, DEFAULT_TARGET);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('ADAPTER_UNSUPPORTED');
    }
  });

  it('rejects path traversal in component names', async () => {
    const portable: PortableComponent = {
      type: 'skill',
      name: '../../etc/evil',
      core: { description: 'Malicious', content: 'payload' },
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

  it('rejects names with path separators', async () => {
    const portable: PortableComponent = {
      type: 'command',
      name: 'foo/bar',
      core: { content: 'payload' },
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

describe('ClaudeCodeAdapter.uninstall', () => {
  it('uninstalls MCP server from .claude.json', async () => {
    await adapter.uninstall({
      tool: 'claude-code',
      type: 'mcp-server',
      name: 'filesystem',
      scope: 'user',
    });

    const data = JSON.parse(await readFile(join(tempDir, '.claude.json'), 'utf-8'));
    expect(data.mcpServers.filesystem).toBeUndefined();
    // Other servers still present
    expect(data.mcpServers['api-server']).toBeDefined();
  });

  it('uninstalls skill by deleting directory', async () => {
    await adapter.uninstall({
      tool: 'claude-code',
      type: 'skill',
      name: 'deploy',
      scope: 'user',
    });

    // Verify directory is gone
    const { stat: fsStat } = await import('fs/promises');
    try {
      await fsStat(join(rootPath, 'skills', 'deploy'));
      expect.fail('Directory should be deleted');
    } catch (err) {
      expect((err as NodeJS.ErrnoException).code).toBe('ENOENT');
    }
  });

  it('uninstalls command by deleting file', async () => {
    await adapter.uninstall({
      tool: 'claude-code',
      type: 'command',
      name: 'review',
      scope: 'user',
    });

    try {
      await readFile(join(rootPath, 'commands', 'review.md'), 'utf-8');
      expect.fail('File should be deleted');
    } catch (err) {
      expect((err as NodeJS.ErrnoException).code).toBe('ENOENT');
    }
  });

  it('uninstalls agent by deleting file', async () => {
    await adapter.uninstall({
      tool: 'claude-code',
      type: 'agent',
      name: 'code-reviewer',
      scope: 'user',
    });

    try {
      await readFile(join(rootPath, 'agents', 'code-reviewer.md'), 'utf-8');
      expect.fail('File should be deleted');
    } catch (err) {
      expect((err as NodeJS.ErrnoException).code).toBe('ENOENT');
    }
  });

  it('uninstalls hook from settings.json', async () => {
    // Uninstall the first PreToolUse handler
    await adapter.uninstall({
      tool: 'claude-code',
      type: 'hook',
      name: 'PreToolUse::0::0',
      scope: 'user',
    });

    const settings = JSON.parse(await readFile(join(rootPath, 'settings.json'), 'utf-8'));

    // PreToolUse group should still have 1 handler (the HTTP one shifted to index 0)
    expect(settings.hooks.PreToolUse[0].hooks).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0].hooks[0].type).toBe('http');
    // PostToolUse unchanged
    expect(settings.hooks.PostToolUse[0].hooks).toHaveLength(1);
  });

  it('removes hook group when last handler removed', async () => {
    // Remove the only PostToolUse handler
    await adapter.uninstall({
      tool: 'claude-code',
      type: 'hook',
      name: 'PostToolUse::0::0',
      scope: 'user',
    });

    const settings = JSON.parse(await readFile(join(rootPath, 'settings.json'), 'utf-8'));
    expect(settings.hooks.PostToolUse).toBeUndefined();
    // PreToolUse still present
    expect(settings.hooks.PreToolUse).toBeDefined();
  });

  it('removes hooks key when last event removed', async () => {
    // Write settings with a single hook
    await writeFile(
      join(rootPath, 'settings.json'),
      JSON.stringify({
        hooks: {
          SessionStart: [{ hooks: [{ type: 'command', command: 'init.sh' }] }],
        },
        otherSetting: true,
      }),
    );

    await adapter.uninstall({
      tool: 'claude-code',
      type: 'hook',
      name: 'SessionStart::0::0',
      scope: 'user',
    });

    const settings = JSON.parse(await readFile(join(rootPath, 'settings.json'), 'utf-8'));
    expect(settings.hooks).toBeUndefined();
    expect(settings.otherSetting).toBe(true); // other settings preserved
  });

  it('throws COMPONENT_NOT_FOUND for missing MCP server', async () => {
    try {
      await adapter.uninstall({
        tool: 'claude-code',
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

  it('throws COMPONENT_NOT_FOUND for missing skill', async () => {
    try {
      await adapter.uninstall({
        tool: 'claude-code',
        type: 'skill',
        name: 'nonexistent',
        scope: 'user',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('COMPONENT_NOT_FOUND');
    }
  });

  it('throws ADAPTER_UNSUPPORTED for unsupported types', async () => {
    try {
      await adapter.uninstall({
        tool: 'claude-code',
        type: 'lsp-server',
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

// ─── Full cycle: install → verify → uninstall → verify ─────────────

describe('ClaudeCodeAdapter — full lifecycle', () => {
  it('MCP server: install → scan → uninstall → scan', async () => {
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

    // Uninstall
    await adapter.uninstall({
      tool: 'claude-code',
      type: 'mcp-server',
      name: 'lifecycle-server',
      scope: 'user',
    });

    // Verify removal
    components = await adapter.scan();
    found = components.find((c) => c.id.name === 'lifecycle-server');
    expect(found).toBeUndefined();
  });

  it('Skill: install → scan → uninstall → scan', async () => {
    const portable: PortableComponent = {
      type: 'skill',
      name: 'lifecycle-skill',
      core: { description: 'Temp skill', content: 'Do something' },
    };

    // Install
    await adapter.install(portable, DEFAULT_TARGET);

    // Verify via scan
    let components = await adapter.scan();
    let found = components.find((c) => c.id.name === 'lifecycle-skill');
    expect(found).toBeDefined();
    expect(found!.id.type).toBe('skill');
    expect((found!.core as { description: string }).description).toBe('Temp skill');

    // Uninstall
    await adapter.uninstall({
      tool: 'claude-code',
      type: 'skill',
      name: 'lifecycle-skill',
      scope: 'user',
    });

    // Verify removal
    components = await adapter.scan();
    found = components.find((c) => c.id.name === 'lifecycle-skill');
    expect(found).toBeUndefined();
  });

  it('Command: install → scan → uninstall → scan', async () => {
    const portable: PortableComponent = {
      type: 'command',
      name: 'lifecycle-cmd',
      core: { description: 'Temp cmd', content: 'Do cmd' },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    let components = await adapter.scan();
    expect(components.find((c) => c.id.name === 'lifecycle-cmd')).toBeDefined();

    await adapter.uninstall({
      tool: 'claude-code',
      type: 'command',
      name: 'lifecycle-cmd',
      scope: 'user',
    });

    components = await adapter.scan();
    expect(components.find((c) => c.id.name === 'lifecycle-cmd')).toBeUndefined();
  });
});

// ─── canToggle / enable / disable ───────────────────────────────────

describe('ClaudeCodeAdapter — toggle support', () => {
  it('canToggle returns false for all types', () => {
    const types: ComponentType[] = [
      'mcp-server',
      'skill',
      'command',
      'hook',
      'agent',
      'context-file',
      'lsp-server',
      'output-style',
    ];
    for (const t of types) {
      expect(adapter.canToggle(t)).toBe(false);
    }
  });

  it('enable throws ADAPTER_UNSUPPORTED', async () => {
    try {
      await adapter.enable({
        tool: 'claude-code',
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
        tool: 'claude-code',
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

describe('ClaudeCodeAdapter — metadata methods', () => {
  it('getConfigPath returns correct paths for each type', () => {
    expect(
      adapter.getConfigPath({ tool: 'claude-code', type: 'mcp-server', name: 'fs', scope: 'user' }),
    ).toBe(join(tempDir, '.claude.json'));

    expect(
      adapter.getConfigPath({ tool: 'claude-code', type: 'skill', name: 'deploy', scope: 'user' }),
    ).toBe(join(rootPath, 'skills', 'deploy', 'SKILL.md'));

    expect(
      adapter.getConfigPath({
        tool: 'claude-code',
        type: 'command',
        name: 'review',
        scope: 'user',
      }),
    ).toBe(join(rootPath, 'commands', 'review.md'));

    expect(
      adapter.getConfigPath({
        tool: 'claude-code',
        type: 'agent',
        name: 'reviewer',
        scope: 'user',
      }),
    ).toBe(join(rootPath, 'agents', 'reviewer.md'));

    expect(
      adapter.getConfigPath({ tool: 'claude-code', type: 'hook', name: 'Post-0-0', scope: 'user' }),
    ).toBe(join(rootPath, 'settings.json'));
  });

  it('getSupportedTypes returns Claude Code types', () => {
    const types = adapter.getSupportedTypes();
    expect(types).toContain('mcp-server');
    expect(types).toContain('skill');
    expect(types).toContain('command');
    expect(types).toContain('hook');
    expect(types).toContain('agent');
    expect(types).not.toContain('prompt'); // prompt is Claude Desktop only
  });

  it('resolveConfigDir returns rootPath', () => {
    expect(adapter.resolveConfigDir()).toBe(rootPath);
  });
});

// ─── backup safety ──────────────────────────────────────────────────

describe('ClaudeCodeAdapter — backup safety', () => {
  it('install creates backup of .claude.json', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'backup-test',
      core: { transport: 'stdio', command: 'echo' },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    // Backup should contain the original 3 servers (pre-install state)
    const backup = JSON.parse(await readFile(join(tempDir, '.claude.json.backup'), 'utf-8'));
    expect(Object.keys(backup.mcpServers)).toHaveLength(3);
    expect(backup.mcpServers['backup-test']).toBeUndefined();
  });

  it('uninstall creates backup of config file', async () => {
    await adapter.uninstall({
      tool: 'claude-code',
      type: 'mcp-server',
      name: 'filesystem',
      scope: 'user',
    });

    // Backup should contain all 3 original servers
    const backup = JSON.parse(await readFile(join(tempDir, '.claude.json.backup'), 'utf-8'));
    expect(backup.mcpServers.filesystem).toBeDefined();
  });
});

// ─── scanPlugins ─────────────────────────────────────────────────────

describe('ClaudeCodeAdapter.scanPlugins', () => {
  async function createPluginFixture(root: string): Promise<void> {
    const pluginsDir = join(root, 'plugins');
    await mkdir(pluginsDir, { recursive: true });

    // Create a plugin install directory with skills, commands, agents
    const installDir = join(pluginsDir, 'cache', 'agent-teams@claude-code-workflows');
    await mkdir(join(installDir, 'skills', 'auto-deploy'), { recursive: true });
    await writeFile(
      join(installDir, 'skills', 'auto-deploy', 'SKILL.md'),
      '---\nname: auto-deploy\ndescription: Auto deploy skill\n---\nDeploy automatically',
    );

    await mkdir(join(installDir, 'commands'), { recursive: true });
    await writeFile(
      join(installDir, 'commands', 'run-tests.md'),
      '---\nname: run-tests\ndescription: Run test suite\n---\nRun all tests',
    );

    await mkdir(join(installDir, 'agents'), { recursive: true });
    await writeFile(
      join(installDir, 'agents', 'helper.md'),
      '---\nname: helper\ndescription: Helper agent\n---\nYou are a helper.',
    );

    // installed_plugins.json
    await writeFile(
      join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify({
        version: 1,
        plugins: {
          'agent-teams@claude-code-workflows': [
            {
              scope: 'user',
              installPath: installDir,
              version: '1.2.0',
              installedAt: '2026-01-01T00:00:00Z',
              lastUpdated: '2026-01-02T00:00:00Z',
            },
          ],
        },
      }),
    );
  }

  it('finds plugins from installed_plugins.json', async () => {
    await createPluginFixture(rootPath);
    const components = await adapter.scan();
    const pluginComponents = components.filter((c) => c.id.scope === 'plugin');
    expect(pluginComponents.length).toBeGreaterThanOrEqual(3);
  });

  it('does not expose enabled on plugin sub-components (canToggle is false)', async () => {
    await createPluginFixture(rootPath);

    // Update settings.json with enabledPlugins
    const settings = JSON.parse(await readFile(join(rootPath, 'settings.json'), 'utf-8'));
    settings.enabledPlugins = { 'agent-teams@claude-code-workflows': true };
    await writeFile(join(rootPath, 'settings.json'), JSON.stringify(settings));

    const components = await adapter.scan();
    const pluginComponents = components.filter((c) => c.id.scope === 'plugin');
    for (const c of pluginComponents) {
      expect(c.enabled).toBeUndefined();
    }
  });

  it('handles missing installed_plugins.json gracefully', async () => {
    // No plugins dir at all
    const components = await adapter.scan();
    const pluginComponents = components.filter((c) => c.id.scope === 'plugin');
    expect(pluginComponents).toEqual([]);
  });

  it('scans sub-components (skills, commands, agents) from plugin cache', async () => {
    await createPluginFixture(rootPath);
    const components = await adapter.scan();
    const pluginComponents = components.filter((c) => c.id.scope === 'plugin');

    const types = pluginComponents.map((c) => c.id.type).sort();
    expect(types).toContain('skill');
    expect(types).toContain('command');
    expect(types).toContain('agent');

    // Check naming convention: pluginKey/name
    const skill = pluginComponents.find((c) => c.id.type === 'skill');
    expect(skill!.id.name).toBe('agent-teams@claude-code-workflows/auto-deploy');

    const cmd = pluginComponents.find((c) => c.id.type === 'command');
    expect(cmd!.id.name).toBe('agent-teams@claude-code-workflows/run-tests');

    const agent = pluginComponents.find((c) => c.id.type === 'agent');
    expect(agent!.id.name).toBe('agent-teams@claude-code-workflows/helper');
  });

  it('includes version and extensions on plugin sub-components', async () => {
    await createPluginFixture(rootPath);
    const components = await adapter.scan();
    const skill = components.find((c) => c.id.scope === 'plugin' && c.id.type === 'skill');

    expect(skill).toBeDefined();
    expect(skill!.version).toBe('1.2.0');
    expect(skill!.extensions).toEqual({
      pluginKey: 'agent-teams@claude-code-workflows',
      pluginName: 'agent-teams',
      marketplace: 'claude-code-workflows',
      pluginVersion: '1.2.0',
      pluginEnabled: false,
    });
  });

  it('creates placeholder for plugin with no sub-components', async () => {
    const pluginsDir = join(rootPath, 'plugins');
    await mkdir(pluginsDir, { recursive: true });

    // Empty install path
    const emptyInstall = join(pluginsDir, 'cache', 'empty-plugin@marketplace');
    await mkdir(emptyInstall, { recursive: true });

    await writeFile(
      join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify({
        plugins: {
          'empty-plugin@marketplace': [
            {
              scope: 'user',
              installPath: emptyInstall,
              version: '0.1.0',
              installedAt: '2026-01-01T00:00:00Z',
              lastUpdated: '2026-01-01T00:00:00Z',
            },
          ],
        },
      }),
    );

    const components = await adapter.scan();
    const placeholder = components.find(
      (c) => c.id.name === 'empty-plugin@marketplace' && c.id.type === 'unknown',
    );
    expect(placeholder).toBeDefined();
    expect(placeholder!.id.scope).toBe('plugin');
    expect(placeholder!.version).toBe('0.1.0');
  });

  it('creates placeholder for plugin with non-existent installPath', async () => {
    const pluginsDir = join(rootPath, 'plugins');
    await mkdir(pluginsDir, { recursive: true });

    await writeFile(
      join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify({
        plugins: {
          'missing-dir@mp': [
            {
              scope: 'user',
              installPath: join(pluginsDir, 'cache', 'does-not-exist'),
              version: '0.0.1',
              installedAt: '2026-01-01T00:00:00Z',
              lastUpdated: '2026-01-01T00:00:00Z',
            },
          ],
        },
      }),
    );

    const components = await adapter.scan();
    const placeholder = components.find(
      (c) => c.id.name === 'missing-dir@mp' && c.id.type === 'unknown',
    );
    expect(placeholder).toBeDefined();
  });
});

// ─── Deduplication ──────────────────────────────────────────────────

describe('ClaudeCodeAdapter.scan — deduplication', () => {
  it('standalone skill wins over plugin skill with same name', async () => {
    // Create a plugin that has a skill with the same name as a standalone skill
    const pluginsDir = join(rootPath, 'plugins');
    await mkdir(pluginsDir, { recursive: true });

    const installDir = join(pluginsDir, 'cache', 'my-plugin@mp');
    await mkdir(join(installDir, 'skills', 'deploy'), { recursive: true });
    await writeFile(
      join(installDir, 'skills', 'deploy', 'SKILL.md'),
      '---\nname: deploy\ndescription: Plugin deploy\n---\nPlugin deploy content',
    );

    await writeFile(
      join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify({
        plugins: {
          'my-plugin@mp': [
            {
              scope: 'user',
              installPath: installDir,
              version: '1.0.0',
              installedAt: '2026-01-01T00:00:00Z',
              lastUpdated: '2026-01-01T00:00:00Z',
            },
          ],
        },
      }),
    );

    const components = await adapter.scan();

    // The standalone 'deploy' skill exists from the default fixture
    const deploySkills = components.filter((c) => c.id.type === 'skill' && c.id.name === 'deploy');

    // Only the standalone should remain (scope=user)
    expect(deploySkills).toHaveLength(1);
    expect(deploySkills[0].id.scope).toBe('user');
  });

  it('keeps plugin sub-component when no standalone duplicate exists', async () => {
    const pluginsDir = join(rootPath, 'plugins');
    await mkdir(pluginsDir, { recursive: true });

    const installDir = join(pluginsDir, 'cache', 'unique-plugin@mp');
    await mkdir(join(installDir, 'skills', 'unique-skill'), { recursive: true });
    await writeFile(
      join(installDir, 'skills', 'unique-skill', 'SKILL.md'),
      '---\nname: unique-skill-name\ndescription: Unique\n---\nUnique content',
    );

    await writeFile(
      join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify({
        plugins: {
          'unique-plugin@mp': [
            {
              scope: 'user',
              installPath: installDir,
              version: '1.0.0',
              installedAt: '2026-01-01T00:00:00Z',
              lastUpdated: '2026-01-01T00:00:00Z',
            },
          ],
        },
      }),
    );

    const components = await adapter.scan();
    const unique = components.find((c) => c.id.name === 'unique-plugin@mp/unique-skill-name');
    expect(unique).toBeDefined();
    expect(unique!.id.scope).toBe('plugin');
  });
});

// ─── togglePlugin ───────────────────────────────────────────────────

describe('ClaudeCodeAdapter.togglePlugin', () => {
  it('writes enabledPlugins to settings.json', async () => {
    await adapter.togglePlugin('my-plugin@mp', true);

    const settings = JSON.parse(await readFile(join(rootPath, 'settings.json'), 'utf-8'));
    expect(settings.enabledPlugins).toEqual({ 'my-plugin@mp': true });
  });

  it('preserves existing settings when toggling', async () => {
    // Existing settings have hooks
    await adapter.togglePlugin('my-plugin@mp', false);

    const settings = JSON.parse(await readFile(join(rootPath, 'settings.json'), 'utf-8'));
    expect(settings.hooks).toBeDefined(); // hooks preserved
    expect(settings.enabledPlugins).toEqual({ 'my-plugin@mp': false });
  });

  it('creates settings.json if missing', async () => {
    const emptyBase = join(tempDir, 'toggle-base');
    const emptyRoot = join(emptyBase, '.claude');
    await mkdir(emptyRoot, { recursive: true });
    const emptyAdapter = createClaudeCodeAdapter(emptyRoot, 'cc-toggle', configIO, logger);

    await emptyAdapter.togglePlugin('test-plugin@mp', true);

    const settings = JSON.parse(await readFile(join(emptyRoot, 'settings.json'), 'utf-8'));
    expect(settings.enabledPlugins).toEqual({ 'test-plugin@mp': true });
  });

  it('can toggle multiple plugins', async () => {
    await adapter.togglePlugin('plugin-a@mp', true);
    await adapter.togglePlugin('plugin-b@mp', false);

    const settings = JSON.parse(await readFile(join(rootPath, 'settings.json'), 'utf-8'));
    expect(settings.enabledPlugins['plugin-a@mp']).toBe(true);
    expect(settings.enabledPlugins['plugin-b@mp']).toBe(false);
  });
});

// ─── uninstallPlugin ────────────────────────────────────────────────

describe('ClaudeCodeAdapter.uninstallPlugin', () => {
  async function createUninstallFixture(root: string): Promise<string> {
    const pluginsDir = join(root, 'plugins');
    await mkdir(pluginsDir, { recursive: true });

    const installDir = join(pluginsDir, 'cache', 'test-plugin@mp');
    await mkdir(installDir, { recursive: true });
    await writeFile(join(installDir, 'README.md'), 'plugin content');

    await writeFile(
      join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify({
        plugins: {
          'test-plugin@mp': [
            {
              scope: 'user',
              installPath: installDir,
              version: '1.0.0',
              installedAt: '2026-01-01T00:00:00Z',
              lastUpdated: '2026-01-01T00:00:00Z',
            },
          ],
        },
      }),
    );

    return installDir;
  }

  it('removes from registry and deletes cache', async () => {
    const installDir = await createUninstallFixture(rootPath);

    await adapter.uninstallPlugin('test-plugin@mp');

    // Registry should no longer contain the plugin
    const data = JSON.parse(
      await readFile(join(rootPath, 'plugins', 'installed_plugins.json'), 'utf-8'),
    );
    expect(data.plugins['test-plugin@mp']).toBeUndefined();

    // Install directory should be deleted
    const { stat: fsStat } = await import('fs/promises');
    try {
      await fsStat(installDir);
      expect.fail('Install directory should be deleted');
    } catch (err) {
      expect((err as NodeJS.ErrnoException).code).toBe('ENOENT');
    }
  });

  it('removes from enabledPlugins in settings.json', async () => {
    await createUninstallFixture(rootPath);

    // Enable the plugin first
    await adapter.togglePlugin('test-plugin@mp', true);

    // Then uninstall it
    await adapter.uninstallPlugin('test-plugin@mp');

    const settings = JSON.parse(await readFile(join(rootPath, 'settings.json'), 'utf-8'));
    expect(settings.enabledPlugins?.['test-plugin@mp']).toBeUndefined();
  });

  it('throws COMPONENT_NOT_FOUND for missing plugin', async () => {
    await createUninstallFixture(rootPath);

    try {
      await adapter.uninstallPlugin('nonexistent@mp');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('COMPONENT_NOT_FOUND');
    }
  });

  it('throws COMPONENT_NOT_FOUND when registry file missing', async () => {
    try {
      await adapter.uninstallPlugin('anything@mp');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('COMPONENT_NOT_FOUND');
    }
  });

  it('rejects path traversal in installPath', async () => {
    const pluginsDir = join(rootPath, 'plugins');
    await mkdir(pluginsDir, { recursive: true });

    await writeFile(
      join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify({
        plugins: {
          'evil@mp': [
            {
              scope: 'user',
              installPath: join(rootPath, '..', '..', 'etc', 'evil'),
              version: '1.0.0',
              installedAt: '2026-01-01T00:00:00Z',
              lastUpdated: '2026-01-01T00:00:00Z',
            },
          ],
        },
      }),
    );

    try {
      await adapter.uninstallPlugin('evil@mp');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_PERMISSION');
      expect((err as AppError).message).toContain('escapes');
    }
  });
});

// ─── getKnownMarketplaces ───────────────────────────────────────────

describe('ClaudeCodeAdapter.getKnownMarketplaces', () => {
  it('reads and returns marketplace sources', async () => {
    const pluginsDir = join(rootPath, 'plugins');
    await mkdir(pluginsDir, { recursive: true });

    await writeFile(
      join(pluginsDir, 'known_marketplaces.json'),
      JSON.stringify([
        { name: 'official', url: 'https://marketplace.example.com' },
        { name: 'community', url: 'https://community.example.com' },
      ]),
    );

    const marketplaces = await adapter.getKnownMarketplaces();
    expect(marketplaces).toHaveLength(2);
    expect(marketplaces[0].name).toBe('official');
    expect(marketplaces[1].url).toBe('https://community.example.com');
  });

  it('returns empty array when file missing', async () => {
    const marketplaces = await adapter.getKnownMarketplaces();
    expect(marketplaces).toEqual([]);
  });

  it('returns empty array for corrupted file', async () => {
    const pluginsDir = join(rootPath, 'plugins');
    await mkdir(pluginsDir, { recursive: true });
    await writeFile(join(pluginsDir, 'known_marketplaces.json'), '{not valid!!!');

    const marketplaces = await adapter.getKnownMarketplaces();
    expect(marketplaces).toEqual([]);
  });

  it('returns empty array when file contains non-array', async () => {
    const pluginsDir = join(rootPath, 'plugins');
    await mkdir(pluginsDir, { recursive: true });
    await writeFile(
      join(pluginsDir, 'known_marketplaces.json'),
      JSON.stringify({ notAnArray: true }),
    );

    const marketplaces = await adapter.getKnownMarketplaces();
    expect(marketplaces).toEqual([]);
  });
});
