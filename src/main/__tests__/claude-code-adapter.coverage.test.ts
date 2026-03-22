/**
 * Coverage push for claude-code-adapter.ts — edge cases in scan/install/uninstall
 * that bring statement coverage above 90%.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createClaudeCodeAdapter } from '../adapters/claude-code-adapter';
import { createConfigIO } from '../config-io';
import { createLogger } from '../logger';
import type { ToolAdapter } from '../adapters/tool-adapter';
import type { PortableComponent, InstallTarget } from '@shared/types';
import { AppError } from '@shared/types';

const logger = createLogger();
const configIO = createConfigIO(logger);
let tempDir: string;
let rootPath: string;
let adapter: ToolAdapter;

const DEFAULT_TARGET: InstallTarget = { instanceId: 'cc', scope: 'user' };

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'plughub-cc-cov-'));
  rootPath = join(tempDir, '.claude');
  await mkdir(rootPath, { recursive: true });
  adapter = createClaudeCodeAdapter(rootPath, 'cc', configIO, logger);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// normalizeMcpCore — all branches
// ---------------------------------------------------------------------------

describe('normalizeMcpCore — via scan', () => {
  it('parses SSE transport (type=sse in config)', async () => {
    await writeFile(
      join(tempDir, '.claude.json'),
      JSON.stringify({
        mcpServers: {
          'sse-srv': { type: 'sse', url: 'https://sse.example.com/stream' },
        },
      }),
    );
    const components = await adapter.scan();
    const sse = components.find((c) => c.id.name === 'sse-srv');
    expect(sse).toBeDefined();
    const core = sse!.core as { transport: string; url: string };
    expect(core.transport).toBe('sse');
    expect(core.url).toBe('https://sse.example.com/stream');
  });

  it('parses http transport when url present but type != sse', async () => {
    await writeFile(
      join(tempDir, '.claude.json'),
      JSON.stringify({
        mcpServers: {
          'http-srv': { type: 'http', url: 'https://http.example.com/mcp' },
        },
      }),
    );
    const components = await adapter.scan();
    const http = components.find((c) => c.id.name === 'http-srv');
    expect(http).toBeDefined();
    const core = http!.core as { transport: string };
    expect(core.transport).toBe('http');
  });

  it('handles stdio server with env dict', async () => {
    await writeFile(
      join(tempDir, '.claude.json'),
      JSON.stringify({
        mcpServers: {
          'env-srv': {
            command: 'node',
            args: ['server.js'],
            env: { DEBUG: 'true', API_KEY: 'secret' },
          },
        },
      }),
    );
    const components = await adapter.scan();
    const srv = components.find((c) => c.id.name === 'env-srv');
    const core = srv!.core as { env: Record<string, string> };
    expect(core.env).toEqual({ DEBUG: 'true', API_KEY: 'secret' });
  });

  it('ignores non-object env values in stdio config', async () => {
    await writeFile(
      join(tempDir, '.claude.json'),
      JSON.stringify({
        mcpServers: {
          'bad-env-srv': {
            command: 'node',
            env: 'not-an-object',
          },
        },
      }),
    );
    const components = await adapter.scan();
    const srv = components.find((c) => c.id.name === 'bad-env-srv');
    const core = srv!.core as { env?: unknown };
    expect(core.env).toBeUndefined();
  });

  it('handles mcpServers key missing from .claude.json', async () => {
    await writeFile(
      join(tempDir, '.claude.json'),
      JSON.stringify({ otherConfig: true }),
    );
    const components = await adapter.scan();
    expect(components.filter((c) => c.id.type === 'mcp-server')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// scanSkills — frontmatter extension branches
// ---------------------------------------------------------------------------

describe('scanSkills — extension fields', () => {
  it('parses argument-hint extension', async () => {
    await mkdir(join(rootPath, 'skills', 'hint-skill'), { recursive: true });
    await writeFile(
      join(rootPath, 'skills', 'hint-skill', 'SKILL.md'),
      '---\nname: hint-skill\nargument-hint: "<file>"\n---\nDo hint things',
    );
    const components = await adapter.scan();
    const skill = components.find((c) => c.id.name === 'hint-skill');
    expect(skill?.extensions).toMatchObject({ argumentHint: '<file>' });
  });

  it('parses context extension as array', async () => {
    await mkdir(join(rootPath, 'skills', 'ctx-skill'), { recursive: true });
    await writeFile(
      join(rootPath, 'skills', 'ctx-skill', 'SKILL.md'),
      '---\nname: ctx-skill\ncontext:\n  - files\n  - shell\n---\nContext skill',
    );
    const components = await adapter.scan();
    const skill = components.find((c) => c.id.name === 'ctx-skill');
    expect(skill?.extensions).toMatchObject({ context: ['files', 'shell'] });
  });

  it('parses context extension as string (converts to array)', async () => {
    await mkdir(join(rootPath, 'skills', 'ctx-str-skill'), { recursive: true });
    await writeFile(
      join(rootPath, 'skills', 'ctx-str-skill', 'SKILL.md'),
      '---\nname: ctx-str-skill\ncontext: files\n---\nContext string',
    );
    const components = await adapter.scan();
    const skill = components.find((c) => c.id.name === 'ctx-str-skill');
    expect(skill?.extensions).toMatchObject({ context: ['files'] });
  });

  it('parses agent extension field', async () => {
    await mkdir(join(rootPath, 'skills', 'agent-skill'), { recursive: true });
    await writeFile(
      join(rootPath, 'skills', 'agent-skill', 'SKILL.md'),
      '---\nname: agent-skill\nagent: my-sub-agent\n---\nAgent skill',
    );
    const components = await adapter.scan();
    const skill = components.find((c) => c.id.name === 'agent-skill');
    expect(skill?.extensions).toMatchObject({ agent: 'my-sub-agent' });
  });

  it('sets no extensions when no extra frontmatter fields', async () => {
    await mkdir(join(rootPath, 'skills', 'minimal-skill'), { recursive: true });
    await writeFile(
      join(rootPath, 'skills', 'minimal-skill', 'SKILL.md'),
      '---\nname: minimal-skill\ndescription: Minimal\n---\nJust content',
    );
    const components = await adapter.scan();
    const skill = components.find((c) => c.id.name === 'minimal-skill');
    expect(skill?.extensions).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// scanHooks — agent and prompt handler types
// ---------------------------------------------------------------------------

describe('scanHooks — agent handler type', () => {
  it('stores agent hook handler in extensions', async () => {
    await writeFile(
      join(rootPath, 'settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: '*',
              hooks: [{ type: 'agent', agent: 'security-checker' }],
            },
          ],
        },
      }),
    );
    const components = await adapter.scan();
    const hook = components.find((c) => c.id.type === 'hook');
    expect(hook).toBeDefined();
    expect(hook!.extensions).toEqual({
      handler: { type: 'agent', agent: 'security-checker' },
    });
  });

  it('skips hooks with unknown type', async () => {
    await writeFile(
      join(rootPath, 'settings.json'),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              hooks: [{ type: 'unknown-type', something: 'data' }],
            },
          ],
        },
      }),
    );
    const components = await adapter.scan();
    const hooks = components.filter((c) => c.id.type === 'hook');
    expect(hooks).toHaveLength(0);
  });

  it('skips hooks groups where hooks array is not an array', async () => {
    await writeFile(
      join(rootPath, 'settings.json'),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            { hooks: 'not-an-array' },
          ],
        },
      }),
    );
    const components = await adapter.scan();
    expect(components.filter((c) => c.id.type === 'hook')).toHaveLength(0);
  });

  it('skips hooks entries where event value is not an array', async () => {
    await writeFile(
      join(rootPath, 'settings.json'),
      JSON.stringify({
        hooks: {
          PostToolUse: 'not-an-array',
        },
      }),
    );
    const components = await adapter.scan();
    expect(components.filter((c) => c.id.type === 'hook')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// installMcpServer — http/sse with env field
// ---------------------------------------------------------------------------

describe('installMcpServer — http transport with env', () => {
  it('installs SSE server correctly', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'sse-server',
      core: {
        transport: 'sse',
        url: 'https://stream.example.com/sse',
      },
    };

    const result = await adapter.install(portable, DEFAULT_TARGET);
    expect(result.id.name).toBe('sse-server');

    const data = JSON.parse(
      await (await import('fs/promises')).readFile(join(tempDir, '.claude.json'), 'utf-8'),
    );
    expect(data.mcpServers['sse-server']).toEqual({
      type: 'sse',
      url: 'https://stream.example.com/sse',
    });
  });

  it('installs stdio MCP with env object', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'env-server',
      core: {
        transport: 'stdio',
        command: 'node',
        args: ['srv.js'],
        env: { NODE_ENV: 'production', PORT: '8080' },
      },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(
      await (await import('fs/promises')).readFile(join(tempDir, '.claude.json'), 'utf-8'),
    );
    expect(data.mcpServers['env-server'].env).toEqual({ NODE_ENV: 'production', PORT: '8080' });
  });

  it('warns but overwrites when MCP server already exists', async () => {
    await writeFile(
      join(tempDir, '.claude.json'),
      JSON.stringify({ mcpServers: { 'existing-srv': { command: 'old' } } }),
    );

    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'existing-srv',
      core: { transport: 'stdio', command: 'new' },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(
      await (await import('fs/promises')).readFile(join(tempDir, '.claude.json'), 'utf-8'),
    );
    expect(data.mcpServers['existing-srv'].command).toBe('new');
  });
});

// ---------------------------------------------------------------------------
// installSkill — with tool extensions
// ---------------------------------------------------------------------------

describe('installSkill — with tool extensions', () => {
  it('writes disable-model-invocation and user-invocable extension fields', async () => {
    const portable: PortableComponent = {
      type: 'skill',
      name: 'ext-skill',
      core: { description: 'Extended skill', content: 'Do stuff' },
      toolExtensions: {
        'claude-code': {
          disableModelInvocation: true,
          userInvocable: false,
          argumentHint: '<path>',
          model: 'sonnet',
        },
      },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    const content = await (await import('fs/promises')).readFile(
      join(rootPath, 'skills', 'ext-skill', 'SKILL.md'),
      'utf-8',
    );
    expect(content).toContain('disable-model-invocation: true');
    expect(content).toContain('user-invocable: false');
    expect(content).toContain('argument-hint: <path>');
    expect(content).toContain('model: sonnet');
  });
});

// ---------------------------------------------------------------------------
// uninstallHook — error paths
// ---------------------------------------------------------------------------

describe('uninstallHook — error paths', () => {
  it('throws COMPONENT_NOT_FOUND when settings.json does not exist', async () => {
    try {
      await adapter.uninstall({
        tool: 'claude-code',
        type: 'hook',
        name: 'PostToolUse::0::0',
        scope: 'user',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('COMPONENT_NOT_FOUND');
    }
  });

  it('throws COMPONENT_NOT_FOUND when settings.json has no hooks', async () => {
    await writeFile(join(rootPath, 'settings.json'), JSON.stringify({ otherSetting: true }));
    try {
      await adapter.uninstall({
        tool: 'claude-code',
        type: 'hook',
        name: 'PostToolUse::0::0',
        scope: 'user',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('COMPONENT_NOT_FOUND');
    }
  });

  it('throws COMPONENT_NOT_FOUND for invalid hook name format', async () => {
    await writeFile(
      join(rootPath, 'settings.json'),
      JSON.stringify({ hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: 'x' }] }] } }),
    );
    try {
      await adapter.uninstall({
        tool: 'claude-code',
        type: 'hook',
        name: 'bad-name-without-double-colon',
        scope: 'user',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('COMPONENT_NOT_FOUND');
    }
  });

  it('throws COMPONENT_NOT_FOUND when hook index is out of bounds', async () => {
    await writeFile(
      join(rootPath, 'settings.json'),
      JSON.stringify({
        hooks: {
          PostToolUse: [{ hooks: [{ type: 'command', command: 'x' }] }],
        },
      }),
    );
    try {
      await adapter.uninstall({
        tool: 'claude-code',
        type: 'hook',
        name: 'PostToolUse::0::99', // index 99 doesn't exist
        scope: 'user',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('COMPONENT_NOT_FOUND');
    }
  });
});

// ---------------------------------------------------------------------------
// uninstallMcpServer — missing config file
// ---------------------------------------------------------------------------

describe('uninstallMcpServer — missing config', () => {
  it('throws COMPONENT_NOT_FOUND when .claude.json does not exist', async () => {
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
});

// ---------------------------------------------------------------------------
// uninstallFileComponent — missing files
// ---------------------------------------------------------------------------

describe('uninstallFileComponent — missing file errors', () => {
  it('throws COMPONENT_NOT_FOUND when command file does not exist', async () => {
    try {
      await adapter.uninstall({
        tool: 'claude-code',
        type: 'command',
        name: 'nonexistent-cmd',
        scope: 'user',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('COMPONENT_NOT_FOUND');
    }
  });

  it('throws COMPONENT_NOT_FOUND when agent file does not exist', async () => {
    try {
      await adapter.uninstall({
        tool: 'claude-code',
        type: 'agent',
        name: 'nonexistent-agent',
        scope: 'user',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('COMPONENT_NOT_FOUND');
    }
  });
});

// ---------------------------------------------------------------------------
// getConfigPath — all branches
// ---------------------------------------------------------------------------

describe('getConfigPath', () => {
  it('returns mcp config path for mcp-server type', () => {
    const path = adapter.getConfigPath({
      tool: 'claude-code',
      type: 'mcp-server',
      name: 'srv',
      scope: 'user',
    });
    expect(path).toContain('.claude.json');
  });

  it('returns SKILL.md path for skill type', () => {
    const path = adapter.getConfigPath({
      tool: 'claude-code',
      type: 'skill',
      name: 'my-skill',
      scope: 'user',
    });
    expect(path).toContain('skills');
    expect(path).toContain('my-skill');
    expect(path).toContain('SKILL.md');
  });

  it('returns .md path for command type', () => {
    const path = adapter.getConfigPath({
      tool: 'claude-code',
      type: 'command',
      name: 'my-cmd',
      scope: 'user',
    });
    expect(path).toContain('commands');
    expect(path).toContain('my-cmd.md');
  });

  it('returns .md path for agent type', () => {
    const path = adapter.getConfigPath({
      tool: 'claude-code',
      type: 'agent',
      name: 'my-agent',
      scope: 'user',
    });
    expect(path).toContain('agents');
    expect(path).toContain('my-agent.md');
  });

  it('returns settings.json path for hook type', () => {
    const path = adapter.getConfigPath({
      tool: 'claude-code',
      type: 'hook',
      name: 'PreToolUse::0::0',
      scope: 'user',
    });
    expect(path).toContain('settings.json');
  });

  it('returns rootPath for unknown type', () => {
    const path = adapter.getConfigPath({
      tool: 'claude-code',
      type: 'lsp-server',
      name: 'some-lsp',
      scope: 'user',
    });
    expect(path).toBe(rootPath);
  });
});

// ---------------------------------------------------------------------------
// getSupportedTypes / resolveConfigDir
// ---------------------------------------------------------------------------

describe('adapter metadata', () => {
  it('getSupportedTypes returns claude-code types', () => {
    const types = adapter.getSupportedTypes();
    expect(types).toContain('mcp-server');
    expect(types).toContain('skill');
    expect(types).toContain('command');
  });

  it('resolveConfigDir returns rootPath', () => {
    expect(adapter.resolveConfigDir()).toBe(rootPath);
  });
});

// ---------------------------------------------------------------------------
// scan — skill with parse error
// ---------------------------------------------------------------------------

describe('scanSkills — per-skill parse error', () => {
  it('skips skills with malformed SKILL.md (invalid YAML)', async () => {
    await mkdir(join(rootPath, 'skills', 'bad-skill'), { recursive: true });
    // Write a SKILL.md that will cause parse error
    await writeFile(
      join(rootPath, 'skills', 'bad-skill', 'SKILL.md'),
      '---\nname: bad-skill\n: invalid yaml: :\n---\nContent',
    );
    // Also create a valid skill
    await mkdir(join(rootPath, 'skills', 'good-skill'), { recursive: true });
    await writeFile(
      join(rootPath, 'skills', 'good-skill', 'SKILL.md'),
      '---\nname: good-skill\n---\nGood content',
    );

    // Should not throw, bad-skill is skipped
    const components = await adapter.scan();
    const skills = components.filter((c) => c.id.type === 'skill');
    const names = skills.map((s) => s.id.name);
    expect(names).toContain('good-skill');
  });
});
