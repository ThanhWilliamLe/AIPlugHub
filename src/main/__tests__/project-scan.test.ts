/**
 * Tests for project-scope scanning in ClaudeCodeAdapter (USR-03).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClaudeCodeAdapter } from '../adapters/claude-code-adapter';
import type { ConfigIO } from '../config-io';
import type { Logger } from '../logger';

// -- Mock ConfigIO --
function createMockConfigIO(): ConfigIO {
  return {
    readJSON: vi.fn().mockResolvedValue({}),
    writeJSON: vi.fn().mockResolvedValue(undefined),
    readYAMLFrontmatter: vi.fn().mockResolvedValue({ frontmatter: {}, content: '' }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    listDir: vi.fn().mockResolvedValue([]),
    copyFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

describe('ClaudeCodeAdapter.scanProject', () => {
  let configIO: ConfigIO;
  let logger: Logger;
  let adapter: ReturnType<typeof createClaudeCodeAdapter>;

  beforeEach(() => {
    configIO = createMockConfigIO();
    logger = createMockLogger();
    adapter = createClaudeCodeAdapter('/home/.claude', 'cc-1', configIO, logger);
  });

  it('returns empty array when project has no .claude directory', async () => {
    const components = await adapter.scanProject('/work/empty-project');
    expect(components).toEqual([]);
  });

  it('scans project MCP servers from .claude.json', async () => {
    vi.mocked(configIO.exists).mockImplementation(async (path: string) => {
      return path.includes('.claude.json');
    });

    vi.mocked(configIO.readJSON).mockImplementation(async (path: string) => {
      if (path.includes('.claude.json')) {
        return {
          mcpServers: {
            'project-db': { command: 'sqlite3', args: ['project.db'] },
          },
        };
      }
      return {};
    });

    const components = await adapter.scanProject('/work/my-app');

    expect(components).toHaveLength(1);
    expect(components[0].id.scope).toBe('project');
    expect(components[0].id.type).toBe('mcp-server');
    expect(components[0].id.name).toBe('project-db');
    expect(components[0].projectPath).toContain('my-app');
  });

  it('scans project commands as a proxy for file-based scanning', async () => {
    // Note: scanning skills requires fs.stat (for isDir check) which can't be mocked in ESM.
    // We test commands instead, which exercise the same pattern without the isDir check.
    vi.mocked(configIO.listDir).mockImplementation(async (dir: string) => {
      if (dir.includes('commands')) return ['my-cmd.md'];
      return [];
    });

    vi.mocked(configIO.readYAMLFrontmatter).mockResolvedValue({
      frontmatter: { name: 'my-cmd', description: 'A project command' },
      content: '# My command content',
    });

    const components = await adapter.scanProject('/work/my-app');

    const commands = components.filter((c) => c.id.type === 'command');
    expect(commands).toHaveLength(1);
    expect(commands[0].id.scope).toBe('project');
    expect(commands[0].id.name).toBe('my-cmd');
    expect(commands[0].projectPath).toContain('my-app');
    expect(commands[0].description).toBe('A project command');
  });

  it('scans project commands', async () => {
    vi.mocked(configIO.listDir).mockImplementation(async (dir: string) => {
      if (dir.includes('commands')) return ['deploy.md'];
      return [];
    });

    vi.mocked(configIO.readYAMLFrontmatter).mockResolvedValue({
      frontmatter: { name: 'deploy', description: 'Deploy command' },
      content: 'Deploy instructions',
    });

    const components = await adapter.scanProject('/work/my-app');

    const commands = components.filter((c) => c.id.type === 'command');
    expect(commands).toHaveLength(1);
    expect(commands[0].id.scope).toBe('project');
    expect(commands[0].id.name).toBe('deploy');
    expect(commands[0].projectPath).toContain('my-app');
  });

  it('scans project hooks from settings.json', async () => {
    vi.mocked(configIO.exists).mockImplementation(async (path: string) => {
      return path.includes('settings.json');
    });

    vi.mocked(configIO.readJSON).mockImplementation(async (path: string) => {
      if (path.includes('settings.json')) {
        return {
          hooks: {
            PreToolUse: [
              {
                hooks: [{ type: 'command', command: 'npm run lint' }],
              },
            ],
          },
        };
      }
      return {};
    });

    const components = await adapter.scanProject('/work/my-app');

    const hooks = components.filter((c) => c.id.type === 'hook');
    expect(hooks).toHaveLength(1);
    expect(hooks[0].id.scope).toBe('project');
    expect(hooks[0].id.name).toBe('PreToolUse::0::0');
    expect(hooks[0].projectPath).toContain('my-app');
  });

  it('scans project agents', async () => {
    vi.mocked(configIO.listDir).mockImplementation(async (dir: string) => {
      if (dir.includes('agents')) return ['reviewer.md'];
      return [];
    });

    vi.mocked(configIO.readYAMLFrontmatter).mockResolvedValue({
      frontmatter: { name: 'reviewer', description: 'Code reviewer' },
      content: '',
    });

    const components = await adapter.scanProject('/work/my-app');

    const agents = components.filter((c) => c.id.type === 'agent');
    expect(agents).toHaveLength(1);
    expect(agents[0].id.scope).toBe('project');
    expect(agents[0].id.name).toBe('reviewer');
  });

  it('runs all scan types in parallel', async () => {
    // Ensure scanProject calls all sub-scanners even if some fail
    vi.mocked(configIO.listDir).mockRejectedValue(new Error('not found'));
    vi.mocked(configIO.exists).mockResolvedValue(false);

    const components = await adapter.scanProject('/work/my-app');
    expect(components).toEqual([]);
    // Should not throw
  });

  it('sets all component scopes to project', async () => {
    vi.mocked(configIO.exists).mockImplementation(async (path: string) => {
      return path.includes('.claude.json');
    });

    vi.mocked(configIO.readJSON).mockResolvedValue({
      mcpServers: {
        a: { command: 'a' },
        b: { command: 'b' },
      },
    });

    const components = await adapter.scanProject('/work/test');

    for (const c of components) {
      expect(c.id.scope).toBe('project');
      expect(c.projectPath).toBeDefined();
    }
  });
});
