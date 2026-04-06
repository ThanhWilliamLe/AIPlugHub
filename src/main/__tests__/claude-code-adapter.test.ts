import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createClaudeCodeAdapter } from '../adapters/claude-code-adapter';
import type { ClaudeCodeAdapterExtended } from '../adapters/claude-code-adapter';
import { createConfigIO } from '../config-io';
import { createLogger } from '../logger';
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
  it('installs stdio MCP server via CLI', async () => {
    const cp = await import('child_process');
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'new-server',
      core: { transport: 'stdio', command: 'npx', args: ['-y', 'new-pkg'] },
    };

    const result = await adapter.install(portable, DEFAULT_TARGET);

    expect(result.id.name).toBe('new-server');
    expect(result.id.type).toBe('mcp-server');
    expect(result.tracking).toBe('managed');
    expect(cp.execFile).toHaveBeenCalledWith(
      'claude',
      ['mcp', 'add', '--scope', 'user', '-t', 'stdio', 'new-server', 'npx', '-y', 'new-pkg'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
  });

  it('installs HTTP MCP server via CLI', async () => {
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
    expect(result.id.type).toBe('mcp-server');
    expect(cp.execFile).toHaveBeenCalledWith(
      'claude',
      ['mcp', 'add', '--scope', 'user', '-t', 'http', 'http-server', 'https://example.com/mcp'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
  });

  it('installs MCP server with env vars via CLI', async () => {
    const cp = await import('child_process');
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'env-server',
      core: {
        transport: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: { HOME: '/home/user' },
      },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    expect(cp.execFile).toHaveBeenCalledWith(
      'claude',
      [
        'mcp',
        'add',
        '--scope',
        'user',
        '-t',
        'stdio',
        '-e',
        'HOME=/home/user',
        'env-server',
        'node',
        'server.js',
      ],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
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
      type: 'output-style',
      name: 'some-style',
      core: { rawConfig: {}, rawTypeName: 'output-style' },
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

  it('accepts namespaced names with forward slash', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'foo/bar',
      core: { transport: 'stdio', command: 'echo' },
    };

    const result = await adapter.install(portable, DEFAULT_TARGET);
    expect(result.id.name).toBe('foo/bar');
  });

  it('installs skill to project path when target has projectPath', async () => {
    const projectDir = join(tempDir, 'my-project');
    await mkdir(join(projectDir, '.claude', 'skills'), { recursive: true });

    const portable: PortableComponent = {
      type: 'skill',
      name: 'proj-skill',
      core: { description: 'Project skill', content: 'Do project thing' },
    };
    const target: InstallTarget = {
      instanceId: 'claude-code-default',
      scope: 'project',
      projectPath: projectDir,
    };

    const result = await adapter.install(portable, target);
    expect(result.id.scope).toBe('project');

    const content = await readFile(
      join(projectDir, '.claude', 'skills', 'proj-skill', 'SKILL.md'),
      'utf-8',
    );
    expect(content).toContain('name: proj-skill');
  });

  it('installs command to project path when target has projectPath', async () => {
    const projectDir = join(tempDir, 'my-project-cmd');
    await mkdir(join(projectDir, '.claude', 'commands'), { recursive: true });

    const portable: PortableComponent = {
      type: 'command',
      name: 'proj-cmd',
      core: { description: 'Project cmd', content: 'Do cmd' },
    };
    const target: InstallTarget = {
      instanceId: 'claude-code-default',
      scope: 'project',
      projectPath: projectDir,
    };

    const result = await adapter.install(portable, target);
    expect(result.id.scope).toBe('project');

    const content = await readFile(join(projectDir, '.claude', 'commands', 'proj-cmd.md'), 'utf-8');
    expect(content).toContain('name: proj-cmd');
  });

  it('installs agent to project path when target has projectPath', async () => {
    const projectDir = join(tempDir, 'my-project-agt');
    await mkdir(join(projectDir, '.claude', 'agents'), { recursive: true });

    const portable: PortableComponent = {
      type: 'agent',
      name: 'proj-agent',
      description: 'Project agent',
      core: { description: 'Project agent', model: 'sonnet' },
    };
    const target: InstallTarget = {
      instanceId: 'claude-code-default',
      scope: 'project',
      projectPath: projectDir,
    };

    const result = await adapter.install(portable, target);
    expect(result.id.scope).toBe('project');

    const content = await readFile(join(projectDir, '.claude', 'agents', 'proj-agent.md'), 'utf-8');
    expect(content).toContain('name: proj-agent');
  });
});

// ─── uninstall ──────────────────────────────────────────────────────

describe('ClaudeCodeAdapter.uninstall', () => {
  it('uninstalls MCP server via CLI', async () => {
    const cp = await import('child_process');
    await adapter.uninstall({
      tool: 'claude-code',
      type: 'mcp-server',
      name: 'filesystem',
      scope: 'user',
    });

    expect(cp.execFile).toHaveBeenCalledWith(
      'claude',
      ['mcp', 'remove', '--scope', 'user', 'filesystem'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
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

  it('throws CLI_EXEC_FAILED when MCP server removal fails', async () => {
    const cp = await import('child_process');
    (cp.execFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_cmd: string, _args: string[], _opts: unknown, cb: (...a: unknown[]) => void) => {
        cb(new Error('MCP server "nonexistent" not found'), '', '');
      },
    );
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
      expect((err as AppError).code).toBe('CLI_EXEC_FAILED');
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
        type: 'output-style',
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
  it('MCP server: install → uninstall delegates to CLI', async () => {
    const cp = await import('child_process');
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'lifecycle-server',
      core: { transport: 'stdio', command: 'node', args: ['server.js'] },
    };

    // Install
    const installed = await adapter.install(portable, DEFAULT_TARGET);
    expect(installed.tracking).toBe('managed');
    expect(cp.execFile).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['mcp', 'add', 'lifecycle-server']),
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );

    // Uninstall
    await adapter.uninstall({
      tool: 'claude-code',
      type: 'mcp-server',
      name: 'lifecycle-server',
      scope: 'user',
    });

    expect(cp.execFile).toHaveBeenCalledWith(
      'claude',
      ['mcp', 'remove', '--scope', 'user', 'lifecycle-server'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
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
  it('MCP install delegates to CLI (no local file backup needed)', async () => {
    const cp = await import('child_process');
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'backup-test',
      core: { transport: 'stdio', command: 'echo' },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    // CLI handles the file operations — verify delegation happened
    expect(cp.execFile).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['mcp', 'add', 'backup-test']),
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
  });

  it('MCP uninstall delegates to CLI (no local file backup needed)', async () => {
    const cp = await import('child_process');
    await adapter.uninstall({
      tool: 'claude-code',
      type: 'mcp-server',
      name: 'filesystem',
      scope: 'user',
    });

    expect(cp.execFile).toHaveBeenCalledWith(
      'claude',
      ['mcp', 'remove', '--scope', 'user', 'filesystem'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
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

  it('discovers sub-components in .claude/ subdirectory', async () => {
    const pluginsDir = join(rootPath, 'plugins');
    await mkdir(pluginsDir, { recursive: true });

    const installDir = join(pluginsDir, 'cache', 'impeccable@impeccable');
    await mkdir(join(installDir, '.claude', 'skills', 'polish'), { recursive: true });
    await writeFile(
      join(installDir, '.claude', 'skills', 'polish', 'SKILL.md'),
      '---\nname: polish\ndescription: Final polish pass\n---\nPolish the UI',
    );

    await mkdir(join(installDir, '.claude', 'commands'), { recursive: true });
    await writeFile(
      join(installDir, '.claude', 'commands', 'audit.md'),
      '---\nname: audit\ndescription: Run audit\n---\nAudit everything',
    );

    await mkdir(join(installDir, '.claude', 'agents'), { recursive: true });
    await writeFile(
      join(installDir, '.claude', 'agents', 'reviewer.md'),
      '---\nname: reviewer\ndescription: Review agent\n---\nYou review code.',
    );

    await writeFile(
      join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify({
        plugins: {
          'impeccable@impeccable': [
            {
              scope: 'user',
              installPath: installDir,
              version: '1.5.1',
              installedAt: '2026-01-01T00:00:00Z',
              lastUpdated: '2026-01-01T00:00:00Z',
            },
          ],
        },
      }),
    );

    const components = await adapter.scan();
    const impeccable = components.filter(
      (c) => c.id.scope === 'plugin' && c.id.name.startsWith('impeccable@impeccable/'),
    );

    expect(impeccable.length).toBe(3);
    const types = impeccable.map((c) => c.id.type).sort();
    expect(types).toEqual(['agent', 'command', 'skill']);

    const placeholder = components.find(
      (c) => c.id.name === 'impeccable@impeccable' && c.id.type === 'unknown',
    );
    expect(placeholder).toBeUndefined();
  });

  it('prefers direct skills/ over .claude/skills/ when both exist', async () => {
    const pluginsDir = join(rootPath, 'plugins');
    await mkdir(pluginsDir, { recursive: true });

    const installDir = join(pluginsDir, 'cache', 'dual-plugin@mp');

    await mkdir(join(installDir, 'skills', 'direct-skill'), { recursive: true });
    await writeFile(
      join(installDir, 'skills', 'direct-skill', 'SKILL.md'),
      '---\nname: direct-skill\ndescription: From direct\n---\nDirect',
    );
    await mkdir(join(installDir, '.claude', 'skills', 'dotclaude-skill'), { recursive: true });
    await writeFile(
      join(installDir, '.claude', 'skills', 'dotclaude-skill', 'SKILL.md'),
      '---\nname: dotclaude-skill\ndescription: From .claude\n---\nDotClaude',
    );

    await writeFile(
      join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify({
        plugins: {
          'dual-plugin@mp': [
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
    const skills = components.filter(
      (c) =>
        c.id.scope === 'plugin' && c.id.type === 'skill' && c.id.name.startsWith('dual-plugin@mp/'),
    );

    expect(skills).toHaveLength(1);
    expect(skills[0].id.name).toBe('dual-plugin@mp/direct-skill');
  });

  it('placeholder core does not contain install path or rawConfig', async () => {
    const pluginsDir = join(rootPath, 'plugins');
    await mkdir(pluginsDir, { recursive: true });

    const emptyInstall = join(pluginsDir, 'cache', 'bare-plugin@mp');
    await mkdir(emptyInstall, { recursive: true });

    await writeFile(
      join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify({
        plugins: {
          'bare-plugin@mp': [
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
      (c) => c.id.name === 'bare-plugin@mp' && c.id.type === 'unknown',
    );
    expect(placeholder).toBeDefined();

    const core = placeholder!.core as Record<string, unknown>;
    expect(core.rawConfig).toBeUndefined();
    expect(core.rawTypeName).toBe('plugin');
    expect(JSON.stringify(core)).not.toContain('installPath');
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
  it('enables plugin via CLI', async () => {
    const cp = await import('child_process');
    await adapter.togglePlugin('my-plugin@mp', true);

    expect(cp.execFile).toHaveBeenCalledWith(
      'claude',
      ['plugins', 'enable', '--scope', 'user', 'my-plugin@mp'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
  });

  it('disables plugin via CLI', async () => {
    const cp = await import('child_process');
    await adapter.togglePlugin('my-plugin@mp', false);

    expect(cp.execFile).toHaveBeenCalledWith(
      'claude',
      ['plugins', 'disable', '--scope', 'user', 'my-plugin@mp'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
  });

  it('can toggle multiple plugins via CLI', async () => {
    const cp = await import('child_process');
    await adapter.togglePlugin('plugin-a@mp', true);
    await adapter.togglePlugin('plugin-b@mp', false);

    expect(cp.execFile).toHaveBeenCalledWith(
      'claude',
      ['plugins', 'enable', '--scope', 'user', 'plugin-a@mp'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
    expect(cp.execFile).toHaveBeenCalledWith(
      'claude',
      ['plugins', 'disable', '--scope', 'user', 'plugin-b@mp'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
  });
});

// ─── uninstallPlugin ────────────────────────────────────────────────

describe('ClaudeCodeAdapter.uninstallPlugin', () => {
  it('uninstalls plugin via CLI', async () => {
    const cp = await import('child_process');
    await adapter.uninstallPlugin('test-plugin@mp');

    expect(cp.execFile).toHaveBeenCalledWith(
      'claude',
      ['plugins', 'uninstall', '--scope', 'user', 'test-plugin@mp'],
      expect.objectContaining({ shell: true }),
      expect.any(Function),
    );
  });

  it('throws CLI_EXEC_FAILED when uninstall fails', async () => {
    const cp = await import('child_process');
    (cp.execFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_cmd: string, _args: string[], _opts: unknown, cb: (...a: unknown[]) => void) => {
        cb(new Error('Plugin "nonexistent@mp" not found'), '', '');
      },
    );

    try {
      await adapter.uninstallPlugin('nonexistent@mp');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CLI_EXEC_FAILED');
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

// ─── LSP Server Support ──────────────────────────────────────────────

describe('ClaudeCodeAdapter — LSP server support', () => {
  // -- Helpers --

  async function createPluginWithLspJson(
    root: string,
    pluginKey: string,
    lspServers: Record<
      string,
      { command: string; args?: string[]; extensionToLanguage: Record<string, string> }
    >,
  ) {
    const pluginsDir = join(root, 'plugins');
    const safeDirName = pluginKey.replace(/[^a-zA-Z0-9@_-]/g, '_');
    const installPath = join(pluginsDir, safeDirName);
    await mkdir(installPath, { recursive: true });

    // Write .lsp-servers.json
    await writeFile(join(installPath, '.lsp-servers.json'), JSON.stringify(lspServers));

    // Register in installed_plugins.json
    const regPath = join(pluginsDir, 'installed_plugins.json');
    let data: { version: number; plugins: Record<string, unknown[]> } = { version: 1, plugins: {} };
    try {
      data = JSON.parse(await readFile(regPath, 'utf-8'));
    } catch {
      /* start fresh */
    }
    data.plugins[pluginKey] = [{ version: '1.0.0', installPath }];
    await writeFile(regPath, JSON.stringify(data));

    // Enable in settings.json
    const settingsPath = join(root, 'settings.json');
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
    } catch {
      /* start fresh */
    }
    if (!settings.enabledPlugins) settings.enabledPlugins = {};
    (settings.enabledPlugins as Record<string, boolean>)[pluginKey] = true;
    await writeFile(settingsPath, JSON.stringify(settings));
  }

  async function createMarketplaceManifest(
    root: string,
    marketplace: string,
    plugins: { name: string; lspServers?: Record<string, unknown> }[],
  ) {
    const manifestDir = join(root, 'plugins', 'marketplaces', marketplace, '.claude-plugin');
    await mkdir(manifestDir, { recursive: true });
    const manifest = {
      name: marketplace,
      plugins: plugins.map((p) => ({ ...p, source: `./${p.name}` })),
    };
    await writeFile(join(manifestDir, 'marketplace.json'), JSON.stringify(manifest));
  }

  it('scans LSP servers from .lsp-servers.json (Source B)', async () => {
    await createPluginWithLspJson(rootPath, 'rust-lsp@test-market', {
      'rust-analyzer': {
        command: 'rust-analyzer',
        extensionToLanguage: { '.rs': 'rust' },
      },
    });

    const components = await adapter.scan();
    const lsp = components.find((c) => c.id.type === 'lsp-server');
    expect(lsp).toBeDefined();
    expect(lsp!.id.name).toBe('rust-lsp@test-market/rust-analyzer');
    expect(lsp!.id.scope).toBe('plugin');
    expect((lsp!.core as { command: string }).command).toBe('rust-analyzer');
    expect(
      (lsp!.core as { extensionToLanguage: Record<string, string> }).extensionToLanguage,
    ).toEqual({ '.rs': 'rust' });
  });

  it('scans LSP servers from marketplace manifest (Source A)', async () => {
    // Register installed plugin (empty install dir — no .lsp-servers.json)
    const pluginsDir = join(rootPath, 'plugins');
    const installPath = join(pluginsDir, 'pyright-lsp_test-market');
    await mkdir(installPath, { recursive: true });

    const regPath = join(pluginsDir, 'installed_plugins.json');
    await writeFile(
      regPath,
      JSON.stringify({
        version: 1,
        plugins: { 'pyright-lsp@test-market': [{ version: '1.0.0', installPath }] },
      }),
    );

    await writeFile(
      join(rootPath, 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'pyright-lsp@test-market': true } }),
    );

    // Create marketplace manifest with lspServers
    await createMarketplaceManifest(rootPath, 'test-market', [
      {
        name: 'pyright-lsp',
        lspServers: {
          pyright: {
            command: 'pyright-langserver',
            args: ['--stdio'],
            extensionToLanguage: { '.py': 'python', '.pyi': 'python' },
          },
        },
      },
    ]);

    const components = await adapter.scan();
    const lsp = components.find((c) => c.id.type === 'lsp-server');
    expect(lsp).toBeDefined();
    expect(lsp!.id.name).toBe('pyright-lsp@test-market/pyright');
    expect((lsp!.core as { command: string }).command).toBe('pyright-langserver');
    expect((lsp!.core as { args: string[] }).args).toEqual(['--stdio']);
  });

  it('marketplace source (A) wins over install-dir source (B) on dedup', async () => {
    // Source B: .lsp-servers.json with older config
    await createPluginWithLspJson(rootPath, 'ts-lsp@test-market', {
      typescript: {
        command: 'old-tsserver',
        extensionToLanguage: { '.ts': 'typescript' },
      },
    });

    // Source A: marketplace manifest with newer config
    await createMarketplaceManifest(rootPath, 'test-market', [
      {
        name: 'ts-lsp',
        lspServers: {
          typescript: {
            command: 'typescript-language-server',
            args: ['--stdio'],
            extensionToLanguage: { '.ts': 'typescript', '.tsx': 'typescriptreact' },
          },
        },
      },
    ]);

    const components = await adapter.scan();
    const lspComponents = components.filter((c) => c.id.type === 'lsp-server');

    // Should have exactly 1 (deduped), from Source A
    expect(lspComponents).toHaveLength(1);
    expect((lspComponents[0].core as { command: string }).command).toBe(
      'typescript-language-server',
    );
  });

  it('installPlugin writes .lsp-servers.json for LSP components (non-marketplace fallback)', async () => {
    const plugin = {
      pluginKey: 'rust-lsp-local',
      pluginName: 'rust-lsp',
      marketplace: '',
      version: '1.0.0',
      enabled: true,
      components: [
        {
          type: 'lsp-server' as const,
          name: 'rust-lsp-local/rust-analyzer',
          core: {
            command: 'rust-analyzer',
            extensionToLanguage: { '.rs': 'rust' },
          },
        },
      ],
    };

    const installed = await adapter.installPlugin(plugin);
    expect(installed).toHaveLength(1);
    expect(installed[0].id.type).toBe('lsp-server');
    expect(installed[0].id.name).toBe('rust-lsp-local/rust-analyzer');
    expect(installed[0].configPath).toContain('.lsp-servers.json');

    // Verify .lsp-servers.json was written
    const lspPath = installed[0].configPath!;
    const lspData = JSON.parse(await readFile(lspPath, 'utf-8'));
    expect(lspData['rust-analyzer']).toEqual({
      command: 'rust-analyzer',
      extensionToLanguage: { '.rs': 'rust' },
    });
  });

  it('auto-generates description from LspServerCore', async () => {
    await createPluginWithLspJson(rootPath, 'multi-lsp@test-market', {
      'ts-server': {
        command: 'typescript-language-server',
        extensionToLanguage: {
          '.ts': 'typescript',
          '.tsx': 'typescriptreact',
          '.js': 'javascript',
          '.jsx': 'javascriptreact',
          '.mts': 'typescript',
          '.cts': 'typescript',
        },
      },
      'no-ext': {
        command: 'bare-server',
        extensionToLanguage: {},
      },
    });

    const components = await adapter.scan();
    const lspComponents = components.filter((c) => c.id.type === 'lsp-server');

    const tsLsp = lspComponents.find((c) => c.id.name.includes('ts-server'));
    expect(tsLsp?.description).toBe(
      'LSP: typescript-language-server (.ts, .tsx, .js, .jsx, +2 more)',
    );

    const bareLsp = lspComponents.find((c) => c.id.name.includes('no-ext'));
    expect(bareLsp?.description).toBe('LSP: bare-server');
  });

  it('LSP-only plugin does not produce unknown placeholder', async () => {
    // Create a plugin with only .lsp-servers.json (no skills, commands, or agents)
    await createPluginWithLspJson(rootPath, 'lsp-only@test-market', {
      gopls: {
        command: 'gopls',
        extensionToLanguage: { '.go': 'go' },
      },
    });

    const components = await adapter.scan();

    // Should have an lsp-server component, not an unknown placeholder
    const lsp = components.find(
      (c) => c.id.name.includes('lsp-only@test-market') && c.id.type === 'lsp-server',
    );
    expect(lsp).toBeDefined();

    const unknown = components.find(
      (c) =>
        c.id.type === 'unknown' &&
        (c.extensions as Record<string, unknown>)?.pluginKey === 'lsp-only@test-market',
    );
    expect(unknown).toBeUndefined();
  });

  it('gracefully handles missing marketplace cache', async () => {
    // Plugin installed but no marketplace manifest exists
    await createPluginWithLspJson(rootPath, 'orphan-lsp@missing-market', {
      orphan: {
        command: 'orphan-server',
        extensionToLanguage: { '.x': 'x-lang' },
      },
    });

    // No marketplace manifest created — Source A will find nothing

    const components = await adapter.scan();
    // Should still detect via Source B (install dir)
    const lsp = components.find((c) => c.id.name.includes('orphan-lsp@missing-market/orphan'));
    expect(lsp).toBeDefined();
    expect((lsp!.core as { command: string }).command).toBe('orphan-server');
  });

  it('round-trip: export → uninstall → import → scan', async () => {
    // 1. Create a plugin with LSP server
    await createPluginWithLspJson(rootPath, 'roundtrip-lsp@test-market', {
      analyzer: {
        command: 'my-analyzer',
        args: ['--stdio'],
        extensionToLanguage: { '.xyz': 'xyz-lang' },
      },
    });

    // 2. Scan to verify it's detected
    let components = await adapter.scan();
    let lsp = components.find((c) => c.id.name.includes('roundtrip-lsp@test-market/analyzer'));
    expect(lsp).toBeDefined();

    // 3. Simulate export: build a PortablePlugin from the scan result
    //    Use empty marketplace to test the direct-write fallback path
    const portablePlugin = {
      pluginKey: 'roundtrip-lsp-local',
      pluginName: 'roundtrip-lsp',
      marketplace: '',
      version: '1.0.0',
      enabled: true,
      components: [
        {
          type: 'lsp-server' as const,
          name: 'roundtrip-lsp-local/analyzer',
          core: lsp!.core,
        },
      ],
    };

    // 4. Uninstall the plugin (delegates to CLI)
    await adapter.uninstallPlugin('roundtrip-lsp@test-market');

    // Simulate the CLI's file cleanup (the mock doesn't actually delete files)
    await rm(join(rootPath, 'plugins', 'roundtrip-lsp@test-market'), {
      recursive: true,
      force: true,
    });
    const regPath = join(rootPath, 'plugins', 'installed_plugins.json');
    const regData = JSON.parse(await readFile(regPath, 'utf-8'));
    delete regData.plugins['roundtrip-lsp@test-market'];
    await writeFile(regPath, JSON.stringify(regData));
    // Also remove enabledPlugins entry from settings.json
    const settingsContent = JSON.parse(await readFile(join(rootPath, 'settings.json'), 'utf-8'));
    if (settingsContent.enabledPlugins) {
      delete settingsContent.enabledPlugins['roundtrip-lsp@test-market'];
    }
    await writeFile(join(rootPath, 'settings.json'), JSON.stringify(settingsContent));

    // 5. Verify it's gone
    components = await adapter.scan();
    lsp = components.find((c) => c.id.name.includes('roundtrip-lsp@test-market/analyzer'));
    expect(lsp).toBeUndefined();

    // 6. Re-import
    const installed = await adapter.installPlugin(portablePlugin);
    expect(installed).toHaveLength(1);
    expect(installed[0].id.type).toBe('lsp-server');

    // 7. Scan again — should be back (under the local key now)
    components = await adapter.scan();
    lsp = components.find((c) => c.id.name.includes('roundtrip-lsp-local/analyzer'));
    expect(lsp).toBeDefined();
    expect((lsp!.core as { command: string }).command).toBe('my-analyzer');
    expect((lsp!.core as { args: string[] }).args).toEqual(['--stdio']);
  });

  it('installPlugin uses CLI for marketplace plugins', async () => {
    const cp = await import('child_process');

    // Inline fixture: create installed_plugins.json + plugin dir so scanPlugins() finds them
    const pluginsDir = join(rootPath, 'plugins');
    await mkdir(pluginsDir, { recursive: true });
    const installDir = join(pluginsDir, 'cache', 'agent-teams@claude-code-workflows');
    await mkdir(join(installDir, 'skills', 'auto-deploy'), { recursive: true });
    await writeFile(
      join(installDir, 'skills', 'auto-deploy', 'SKILL.md'),
      '---\nname: auto-deploy\ndescription: Auto deploy skill\n---\nDeploy automatically',
    );
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

    const plugin = {
      pluginKey: 'agent-teams@claude-code-workflows',
      pluginName: 'agent-teams',
      marketplace: 'claude-code-workflows',
      version: '1.2.0',
      enabled: true,
      components: [],
    };

    const target = { instanceId: 'claude-code-default', scope: 'user' };
    const installed = await adapter.installPlugin(plugin, target);

    // Should have called CLI instead of writing files directly
    expect(cp.execFile).toHaveBeenCalledWith(
      'claude',
      ['plugins', 'install', '--scope', 'user', 'agent-teams@claude-code-workflows'],
      expect.any(Object),
      expect.any(Function),
    );

    // Should return components found by re-scan
    expect(installed.length).toBeGreaterThanOrEqual(1);
  });

  it('installPlugin falls back to direct writes for non-marketplace plugins', async () => {
    const cp = await import('child_process');
    (cp.execFile as unknown as ReturnType<typeof vi.fn>).mockClear();

    const plugin = {
      pluginKey: 'local-plugin',
      pluginName: 'local-plugin',
      marketplace: '',
      version: '1.0.0',
      enabled: true,
      components: [
        {
          type: 'skill' as const,
          name: 'local-plugin/my-skill',
          core: { description: 'A local skill', content: 'Do something' },
        },
      ],
    };

    const installed = await adapter.installPlugin(plugin);
    expect(installed).toHaveLength(1);
    expect(installed[0].id.type).toBe('skill');

    // Should NOT have called `claude plugins install` — no marketplace
    const calls = (cp.execFile as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const pluginInstallCall = calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && c[1].includes('plugins') && c[1].includes('install'),
    );
    expect(pluginInstallCall).toBeUndefined();
  });

  it('installPlugin passes --scope to CLI', async () => {
    const cp = await import('child_process');
    (cp.execFile as unknown as ReturnType<typeof vi.fn>).mockClear();

    // Inline fixture for scanPlugins() re-scan
    const pluginsDir2 = join(rootPath, 'plugins');
    await mkdir(pluginsDir2, { recursive: true });
    const installDir2 = join(pluginsDir2, 'cache', 'agent-teams@claude-code-workflows');
    await mkdir(join(installDir2, 'skills', 'auto-deploy'), { recursive: true });
    await writeFile(
      join(installDir2, 'skills', 'auto-deploy', 'SKILL.md'),
      '---\nname: auto-deploy\ndescription: Auto deploy skill\n---\nDeploy automatically',
    );
    await writeFile(
      join(pluginsDir2, 'installed_plugins.json'),
      JSON.stringify({
        version: 1,
        plugins: {
          'agent-teams@claude-code-workflows': [
            {
              scope: 'user',
              installPath: installDir2,
              version: '1.2.0',
              installedAt: '2026-01-01T00:00:00Z',
              lastUpdated: '2026-01-02T00:00:00Z',
            },
          ],
        },
      }),
    );

    const plugin = {
      pluginKey: 'agent-teams@claude-code-workflows',
      pluginName: 'agent-teams',
      marketplace: 'claude-code-workflows',
      version: '1.2.0',
      enabled: true,
      components: [],
    };

    const target = { instanceId: 'claude-code-default', scope: 'project' };
    await adapter.installPlugin(plugin, target);

    expect(cp.execFile).toHaveBeenCalledWith(
      'claude',
      ['plugins', 'install', '--scope', 'project', 'agent-teams@claude-code-workflows'],
      expect.any(Object),
      expect.any(Function),
    );
  });
});
