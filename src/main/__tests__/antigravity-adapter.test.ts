import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  createAntigravityAdapter,
  resolveDefaultAntigravityConfigDir,
} from '../adapters/antigravity-adapter';
import { createConfigIO } from '../config-io';
import { createLogger } from '../logger';
import type { ToolAdapter } from '../adapters/tool-adapter';
import type { PortableComponent, InstallTarget, ComponentType } from '@shared/types';
import { AppError } from '@shared/types';

const logger = createLogger();
const configIO = createConfigIO(logger);
let tempDir: string;
let antigravityDir: string;
let adapter: ToolAdapter;

const DEFAULT_TARGET: InstallTarget = { instanceId: 'antigravity-default', scope: 'global' };
const MCP_CONFIG_FILE = 'mcp_config.json';

// -- Fixture helper --

async function createDefaultFixture(baseDir: string): Promise<void> {
  // antigravity/ lives inside baseDir (simulating ~/.gemini/antigravity/)
  const agDir = join(baseDir, 'antigravity');
  await mkdir(agDir, { recursive: true });

  // mcp_config.json with MCP servers
  await writeFile(
    join(agDir, MCP_CONFIG_FILE),
    JSON.stringify({
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/user/projects'],
          env: { HOME: '/home/user' },
        },
        'remote-api': {
          url: 'https://api.example.com/mcp',
        },
      },
    }),
  );

  // skills/code-review/SKILL.md (with frontmatter)
  const skillDir = join(agDir, 'skills', 'code-review');
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, 'SKILL.md'),
    '---\nname: Code Review\ndescription: Reviews code for quality\n---\nReview the code carefully.\n',
  );

  // global_workflows/db-migration.md (workflow file)
  const workflowsDir = join(agDir, 'global_workflows');
  await mkdir(workflowsDir, { recursive: true });
  await writeFile(
    join(workflowsDir, 'db-migration.md'),
    '---\nname: DB Migration\ndescription: Run database migrations\n---\nExecute the migration steps.\n',
  );

  // ../GEMINI.md — one level up from antigravity/ (i.e., baseDir/GEMINI.md)
  await writeFile(join(baseDir, 'GEMINI.md'), 'Global Gemini context instructions.\n');
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'plughub-ag-test-'));
  await createDefaultFixture(tempDir);
  antigravityDir = join(tempDir, 'antigravity');
  adapter = createAntigravityAdapter(antigravityDir, 'antigravity-default', configIO, logger);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// --- detect ---

describe('AntigravityAdapter.detect', () => {
  it('detects when mcp_config.json exists', async () => {
    const result = await adapter.detect();
    expect(result.detected).toBe(true);
    expect(result.toolId).toBe('antigravity');
    expect(result.instanceId).toBe('antigravity-default');
    expect(result.path).toBe(antigravityDir);
  });

  it('detects when only mcp_config.json exists (no skills/ or global_workflows/)', async () => {
    const altDir = join(tempDir, 'mcp-only');
    await mkdir(altDir, { recursive: true });
    await writeFile(join(altDir, MCP_CONFIG_FILE), '{}');
    const altAdapter = createAntigravityAdapter(altDir, 'ag-mcp-only', configIO, logger);
    const result = await altAdapter.detect();
    expect(result.detected).toBe(true);
  });

  it('returns detected: false when only directories exist (configIO.exists checks isFile)', async () => {
    // configIO.exists uses stat().isFile(), so bare directories won't be detected.
    const altDir = join(tempDir, 'dirs-only');
    await mkdir(join(altDir, 'skills'), { recursive: true });
    await mkdir(join(altDir, 'global_workflows'), { recursive: true });
    const altAdapter = createAntigravityAdapter(altDir, 'ag-dirs-only', configIO, logger);
    const result = await altAdapter.detect();
    expect(result.detected).toBe(false);
  });

  it('returns detected: false when nothing exists', async () => {
    const emptyDir = join(tempDir, 'no-config');
    await mkdir(emptyDir, { recursive: true });
    const missing = createAntigravityAdapter(emptyDir, 'ag-missing', configIO, logger);
    const result = await missing.detect();
    expect(result.detected).toBe(false);
  });

  it('returns detected: false when path does not exist', async () => {
    const noDir = createAntigravityAdapter(
      join(tempDir, 'nonexistent'),
      'ag-nodir',
      configIO,
      logger,
    );
    const result = await noDir.detect();
    expect(result.detected).toBe(false);
  });
});

// --- scan: MCP servers from mcp_config.json ---

describe('AntigravityAdapter.scan -- MCP servers from mcp_config.json', () => {
  it('scans stdio MCP servers', async () => {
    const components = await adapter.scan();
    const fs = components.find((c) => c.id.name === 'filesystem');

    expect(fs).toBeDefined();
    expect(fs!.id.type).toBe('mcp-server');
    expect(fs!.id.tool).toBe('antigravity');
    expect(fs!.id.scope).toBe('global');
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
    const core = api!.core as { transport: string; url: string };
    expect(core.transport).toBe('http');
    expect(core.url).toBe('https://api.example.com/mcp');
  });

  it('MCP servers have configPath pointing to mcp_config.json', async () => {
    const components = await adapter.scan();
    const mcpServers = components.filter((c) => c.id.type === 'mcp-server');
    for (const c of mcpServers) {
      expect(c.configPath).toBe(join(antigravityDir, MCP_CONFIG_FILE));
    }
  });

  it('handles empty config file ({})', async () => {
    await writeFile(join(antigravityDir, MCP_CONFIG_FILE), '{}');
    await rm(join(antigravityDir, 'skills'), { recursive: true, force: true });
    await rm(join(antigravityDir, 'global_workflows'), { recursive: true, force: true });
    await rm(join(tempDir, 'GEMINI.md'), { force: true });
    const components = await adapter.scan();
    expect(components).toEqual([]);
  });

  it('handles config with empty mcpServers ({})', async () => {
    await writeFile(join(antigravityDir, MCP_CONFIG_FILE), JSON.stringify({ mcpServers: {} }));
    await rm(join(antigravityDir, 'skills'), { recursive: true, force: true });
    await rm(join(antigravityDir, 'global_workflows'), { recursive: true, force: true });
    await rm(join(tempDir, 'GEMINI.md'), { force: true });
    const components = await adapter.scan();
    expect(components).toEqual([]);
  });

  it('handles corrupted config file gracefully', async () => {
    await writeFile(join(antigravityDir, MCP_CONFIG_FILE), '{not valid json!!!');
    await rm(join(antigravityDir, 'skills'), { recursive: true, force: true });
    await rm(join(antigravityDir, 'global_workflows'), { recursive: true, force: true });
    await rm(join(tempDir, 'GEMINI.md'), { force: true });
    const components = await adapter.scan();
    expect(components).toEqual([]);
  });

  it('handles mcpServers being a non-object value', async () => {
    await writeFile(
      join(antigravityDir, MCP_CONFIG_FILE),
      JSON.stringify({ mcpServers: 'not-an-object' }),
    );
    await rm(join(antigravityDir, 'skills'), { recursive: true, force: true });
    await rm(join(antigravityDir, 'global_workflows'), { recursive: true, force: true });
    await rm(join(tempDir, 'GEMINI.md'), { force: true });
    const components = await adapter.scan();
    expect(components).toEqual([]);
  });

  it('handles mcpServers being an array', async () => {
    await writeFile(
      join(antigravityDir, MCP_CONFIG_FILE),
      JSON.stringify({ mcpServers: [{ command: 'echo' }] }),
    );
    await rm(join(antigravityDir, 'skills'), { recursive: true, force: true });
    await rm(join(antigravityDir, 'global_workflows'), { recursive: true, force: true });
    await rm(join(tempDir, 'GEMINI.md'), { force: true });
    const components = await adapter.scan();
    expect(components).toEqual([]);
  });

  it('skips mcpServers entries that are not objects', async () => {
    await writeFile(
      join(antigravityDir, MCP_CONFIG_FILE),
      JSON.stringify({
        mcpServers: {
          good: { command: 'echo' },
          bad: null,
          worse: 42,
          worst: 'not an object',
        },
      }),
    );
    await rm(join(antigravityDir, 'skills'), { recursive: true, force: true });
    await rm(join(antigravityDir, 'global_workflows'), { recursive: true, force: true });
    await rm(join(tempDir, 'GEMINI.md'), { force: true });
    const components = await adapter.scan();
    expect(components).toHaveLength(1);
    expect(components[0].id.name).toBe('good');
  });
});

// --- scan: skills from skills/<name>/SKILL.md ---

describe('AntigravityAdapter.scan -- skills', () => {
  it('scans skills with YAML frontmatter', async () => {
    const components = await adapter.scan();
    const skill = components.find((c) => c.id.name === 'code-review');

    expect(skill).toBeDefined();
    expect(skill!.id.type).toBe('skill');
    expect(skill!.id.tool).toBe('antigravity');
    expect(skill!.id.scope).toBe('global');
    expect(skill!.tracking).toBe('detected');
    expect(skill!.description).toBe('Reviews code for quality');
    expect(skill!.displayName).toBe('Code Review');

    const core = skill!.core as { description: string; content: string };
    expect(core.description).toBe('Reviews code for quality');
    expect(core.content).toContain('Review the code carefully.');
  });

  it('skill configPath points to SKILL.md file', async () => {
    const components = await adapter.scan();
    const skill = components.find((c) => c.id.name === 'code-review');
    expect(skill!.configPath).toBe(join(antigravityDir, 'skills', 'code-review', 'SKILL.md'));
  });

  it('skips directories without SKILL.md', async () => {
    const noSkillDir = join(antigravityDir, 'skills', 'empty-dir');
    await mkdir(noSkillDir, { recursive: true });

    const components = await adapter.scan();
    const emptySkill = components.find((c) => c.id.name === 'empty-dir');
    expect(emptySkill).toBeUndefined();
  });

  it('skips files (non-directories) in skills/', async () => {
    await writeFile(join(antigravityDir, 'skills', 'not-a-dir.md'), 'plain file');

    const components = await adapter.scan();
    const file = components.find((c) => c.id.name === 'not-a-dir.md');
    expect(file).toBeUndefined();
  });
});

// --- scan: workflows from global_workflows/*.md ---

describe('AntigravityAdapter.scan -- workflows', () => {
  it('scans workflow files as command type', async () => {
    const components = await adapter.scan();
    const wf = components.find((c) => c.id.name === 'db-migration');

    expect(wf).toBeDefined();
    expect(wf!.id.type).toBe('command');
    expect(wf!.id.tool).toBe('antigravity');
    expect(wf!.id.scope).toBe('global');
    expect(wf!.tracking).toBe('detected');
    expect(wf!.description).toBe('Run database migrations');
    expect(wf!.displayName).toBe('DB Migration');
  });

  it('workflow configPath points to the .md file', async () => {
    const components = await adapter.scan();
    const wf = components.find((c) => c.id.name === 'db-migration');
    expect(wf!.configPath).toBe(join(antigravityDir, 'global_workflows', 'db-migration.md'));
  });

  it('workflow core uses CommandCore with content', async () => {
    const components = await adapter.scan();
    const wf = components.find((c) => c.id.name === 'db-migration');
    const core = wf!.core as { content: string; description?: string };
    expect(core.content).toBeDefined();
    expect(typeof core.content).toBe('string');
  });

  it('strips .md extension from workflow name', async () => {
    const components = await adapter.scan();
    const wf = components.find((c) => c.id.name === 'db-migration');
    expect(wf).toBeDefined();
    // Ensure the name does NOT include .md
    const withExt = components.find((c) => c.id.name === 'db-migration.md');
    expect(withExt).toBeUndefined();
  });
});

// --- scan: global GEMINI.md context file ---

describe('AntigravityAdapter.scan -- global GEMINI.md context file', () => {
  it('scans global GEMINI.md as context-file with global scope', async () => {
    const components = await adapter.scan();
    const globalCtx = components.find((c) => c.id.name === 'GEMINI.md' && c.id.scope === 'global');

    expect(globalCtx).toBeDefined();
    expect(globalCtx!.id.type).toBe('context-file');
    expect(globalCtx!.id.tool).toBe('antigravity');
    expect(globalCtx!.description).toBe('Global context file (shared with Gemini CLI)');
    // Path should be rootPath/../GEMINI.md (one level up from antigravity/)
    expect(globalCtx!.configPath).toBe(join(antigravityDir, '..', 'GEMINI.md'));
  });

  it('omits global context when GEMINI.md does not exist', async () => {
    await rm(join(tempDir, 'GEMINI.md'), { force: true });

    const components = await adapter.scan();
    const globalCtx = components.find((c) => c.id.name === 'GEMINI.md' && c.id.scope === 'global');
    expect(globalCtx).toBeUndefined();
  });
});

// --- scan: correct total count ---

describe('AntigravityAdapter.scan -- total component count', () => {
  it('returns correct total count from full fixture', async () => {
    const components = await adapter.scan();
    // 2 MCP servers + 1 skill + 1 workflow + 1 global context = 5
    expect(components).toHaveLength(5);
  });
});

// --- scan: missing directories handled gracefully ---

describe('AntigravityAdapter.scan -- missing directories', () => {
  it('handles missing skills/ directory gracefully', async () => {
    await rm(join(antigravityDir, 'skills'), { recursive: true, force: true });
    const components = await adapter.scan();
    const skills = components.filter((c) => c.id.type === 'skill');
    expect(skills).toEqual([]);
    // Other components should still be scanned
    const mcpServers = components.filter((c) => c.id.type === 'mcp-server');
    expect(mcpServers.length).toBe(2);
  });

  it('handles missing global_workflows/ directory gracefully', async () => {
    await rm(join(antigravityDir, 'global_workflows'), { recursive: true, force: true });
    const components = await adapter.scan();
    const workflows = components.filter((c) => c.id.type === 'command');
    expect(workflows).toEqual([]);
  });

  it('handles missing mcp_config.json gracefully', async () => {
    await rm(join(antigravityDir, MCP_CONFIG_FILE), { force: true });
    const components = await adapter.scan();
    const mcpServers = components.filter((c) => c.id.type === 'mcp-server');
    expect(mcpServers).toEqual([]);
    // Skills and workflows should still be scanned
    const skills = components.filter((c) => c.id.type === 'skill');
    expect(skills.length).toBe(1);
  });

  it('scans successfully when everything is missing', async () => {
    // Use a nested path so ../GEMINI.md also doesn't exist
    const isolatedParent = join(tempDir, 'isolated-parent');
    const emptyDir = join(isolatedParent, 'empty');
    await mkdir(emptyDir, { recursive: true });
    const emptyAdapter = createAntigravityAdapter(emptyDir, 'ag-empty', configIO, logger);
    const components = await emptyAdapter.scan();
    expect(components).toEqual([]);
  });
});

// --- install: MCP servers into mcp_config.json ---

describe('AntigravityAdapter.install -- MCP servers', () => {
  it('installs stdio MCP server to mcp_config.json', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'new-server',
      core: { transport: 'stdio', command: 'npx', args: ['-y', 'new-pkg'] },
    };

    const result = await adapter.install(portable, DEFAULT_TARGET);

    expect(result.id.name).toBe('new-server');
    expect(result.id.type).toBe('mcp-server');
    expect(result.id.tool).toBe('antigravity');
    expect(result.id.scope).toBe('global');
    expect(result.tracking).toBe('managed');
    expect(result.configPath).toBe(join(antigravityDir, MCP_CONFIG_FILE));

    const data = JSON.parse(await readFile(join(antigravityDir, MCP_CONFIG_FILE), 'utf-8'));
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

    const data = JSON.parse(await readFile(join(antigravityDir, MCP_CONFIG_FILE), 'utf-8'));
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

    const data = JSON.parse(await readFile(join(antigravityDir, MCP_CONFIG_FILE), 'utf-8'));
    expect(data.mcpServers.filesystem).toBeDefined();
    expect(data.mcpServers['remote-api']).toBeDefined();
    expect(data.mcpServers['new-server']).toBeDefined();
  });

  it('creates mcp_config.json if missing', async () => {
    const freshDir = join(tempDir, 'fresh');
    await mkdir(freshDir, { recursive: true });
    const freshAdapter = createAntigravityAdapter(freshDir, 'ag-fresh', configIO, logger);

    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'first-server',
      core: { transport: 'stdio', command: 'echo' },
    };

    await freshAdapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(await readFile(join(freshDir, MCP_CONFIG_FILE), 'utf-8'));
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

    const data = JSON.parse(await readFile(join(antigravityDir, MCP_CONFIG_FILE), 'utf-8'));
    expect(data.mcpServers.filesystem).toEqual({ command: 'new-command', args: ['--new'] });
  });

  it('installs successfully when existing config is corrupted', async () => {
    await writeFile(join(antigravityDir, MCP_CONFIG_FILE), '{not valid json!!!');

    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'fresh-server',
      core: { transport: 'stdio', command: 'echo' },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(await readFile(join(antigravityDir, MCP_CONFIG_FILE), 'utf-8'));
    expect(data.mcpServers['fresh-server']).toEqual({ command: 'echo' });
  });

  it('installs stdio server with env variables', async () => {
    const portable: PortableComponent = {
      type: 'mcp-server',
      name: 'env-server',
      core: {
        transport: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: { API_KEY: 'secret123' },
      },
    };

    await adapter.install(portable, DEFAULT_TARGET);

    const data = JSON.parse(await readFile(join(antigravityDir, MCP_CONFIG_FILE), 'utf-8'));
    expect(data.mcpServers['env-server']).toEqual({
      command: 'node',
      args: ['server.js'],
      env: { API_KEY: 'secret123' },
    });
  });
});

// --- install: skills ---

describe('AntigravityAdapter.install -- skills', () => {
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
    expect(result.id.tool).toBe('antigravity');
    expect(result.id.scope).toBe('global');
    expect(result.tracking).toBe('managed');

    const content = await readFile(
      join(antigravityDir, 'skills', 'new-skill', 'SKILL.md'),
      'utf-8',
    );
    expect(content).toContain('---');
    expect(content).toContain('name: new-skill');
    expect(content).toContain('description: A new skill');
    expect(content).toContain('Do the thing.');
  });

  it('creates skills directory if it does not exist', async () => {
    const freshDir = join(tempDir, 'no-skills');
    await mkdir(freshDir, { recursive: true });
    const freshAdapter = createAntigravityAdapter(freshDir, 'ag-sk', configIO, logger);

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

describe('AntigravityAdapter.install -- unsupported types', () => {
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

  it('throws ADAPTER_UNSUPPORTED for context-file type', async () => {
    const portable: PortableComponent = {
      type: 'context-file',
      name: 'some-ctx',
      core: { rawConfig: {}, rawTypeName: 'context-file' },
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

describe('AntigravityAdapter.uninstall -- MCP servers', () => {
  it('removes server from mcp_config.json', async () => {
    await adapter.uninstall({
      tool: 'antigravity',
      type: 'mcp-server',
      name: 'filesystem',
      scope: 'global',
    });

    const data = JSON.parse(await readFile(join(antigravityDir, MCP_CONFIG_FILE), 'utf-8'));
    expect(data.mcpServers.filesystem).toBeUndefined();
    expect(data.mcpServers['remote-api']).toBeDefined();
  });

  it('keeps config file valid after removing last server', async () => {
    await writeFile(
      join(antigravityDir, MCP_CONFIG_FILE),
      JSON.stringify({ mcpServers: { only: { command: 'echo' } } }),
    );

    await adapter.uninstall({
      tool: 'antigravity',
      type: 'mcp-server',
      name: 'only',
      scope: 'global',
    });

    const data = JSON.parse(await readFile(join(antigravityDir, MCP_CONFIG_FILE), 'utf-8'));
    expect(data.mcpServers).toEqual({});
  });

  it('throws COMPONENT_NOT_FOUND for missing server', async () => {
    try {
      await adapter.uninstall({
        tool: 'antigravity',
        type: 'mcp-server',
        name: 'nonexistent',
        scope: 'global',
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
    const emptyAdapter = createAntigravityAdapter(emptyDir, 'ag-empty-u', configIO, logger);

    try {
      await emptyAdapter.uninstall({
        tool: 'antigravity',
        type: 'mcp-server',
        name: 'something',
        scope: 'global',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('COMPONENT_NOT_FOUND');
    }
  });
});

// --- uninstall: skills ---

describe('AntigravityAdapter.uninstall -- skills', () => {
  it('removes skill directory', async () => {
    // First install a skill, then uninstall it
    const portable: PortableComponent = {
      type: 'skill',
      name: 'removable-skill',
      core: { description: 'Temp', content: 'Temp content' },
    };
    await adapter.install(portable, DEFAULT_TARGET);

    await adapter.uninstall({
      tool: 'antigravity',
      type: 'skill',
      name: 'removable-skill',
      scope: 'global',
    });

    // Verify directory was removed
    try {
      await readFile(join(antigravityDir, 'skills', 'removable-skill', 'SKILL.md'), 'utf-8');
      expect.fail('File should not exist');
    } catch {
      // Expected: file/directory removed
    }
  });

  it('does not throw when removing a skill that does not exist (rm force)', async () => {
    // rm with { force: true } should not throw for non-existent dirs
    await adapter.uninstall({
      tool: 'antigravity',
      type: 'skill',
      name: 'nonexistent-skill',
      scope: 'global',
    });
    // No error — success
  });
});

// --- uninstall: unsupported types ---

describe('AntigravityAdapter.uninstall -- unsupported types', () => {
  it('throws ADAPTER_UNSUPPORTED for command type', async () => {
    try {
      await adapter.uninstall({
        tool: 'antigravity',
        type: 'command',
        name: 'some-cmd',
        scope: 'global',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('ADAPTER_UNSUPPORTED');
    }
  });

  it('throws ADAPTER_UNSUPPORTED for context-file type', async () => {
    try {
      await adapter.uninstall({
        tool: 'antigravity',
        type: 'context-file',
        name: 'GEMINI.md',
        scope: 'global',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('ADAPTER_UNSUPPORTED');
    }
  });
});

// --- name validation ---

describe('AntigravityAdapter -- name validation', () => {
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
        tool: 'antigravity',
        type: 'mcp-server',
        name: '../etc/evil',
        scope: 'global',
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
        tool: 'antigravity',
        type: 'mcp-server',
        name: 'foo\0bar',
        scope: 'global',
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
        tool: 'antigravity',
        type: 'skill',
        name: '../evil-skill',
        scope: 'global',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_PERMISSION');
    }
  });
});

// --- canToggle / enable / disable ---

describe('AntigravityAdapter -- toggle support', () => {
  it('canToggle returns false for all types', () => {
    const types: ComponentType[] = ['mcp-server', 'skill', 'command', 'context-file', 'unknown'];
    for (const t of types) {
      expect(adapter.canToggle(t)).toBe(false);
    }
  });

  it('enable throws ADAPTER_UNSUPPORTED', async () => {
    try {
      await adapter.enable({
        tool: 'antigravity',
        type: 'mcp-server',
        name: 'test',
        scope: 'global',
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
        tool: 'antigravity',
        type: 'mcp-server',
        name: 'test',
        scope: 'global',
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('ADAPTER_UNSUPPORTED');
    }
  });
});

// --- metadata methods ---

describe('AntigravityAdapter -- metadata methods', () => {
  it('getConfigPath returns mcp_config.json path', () => {
    const result = adapter.getConfigPath({
      tool: 'antigravity',
      type: 'mcp-server',
      name: 'any',
      scope: 'global',
    });
    expect(result).toBe(join(antigravityDir, MCP_CONFIG_FILE));
  });

  it('getSupportedTypes returns Antigravity types', () => {
    const types = adapter.getSupportedTypes();
    expect(types).toContain('mcp-server');
    expect(types).toContain('skill');
    expect(types).toContain('command');
    expect(types).toContain('context-file');
  });

  it('resolveConfigDir returns rootPath', () => {
    expect(adapter.resolveConfigDir()).toBe(antigravityDir);
  });
});

// --- resolveDefaultAntigravityConfigDir ---

describe('resolveDefaultAntigravityConfigDir', () => {
  it('returns a path ending with .gemini/antigravity', () => {
    const dir = resolveDefaultAntigravityConfigDir();
    expect(dir).toMatch(/[/\\]\.gemini[/\\]antigravity$/);
  });

  it('uses HOME or USERPROFILE as base', () => {
    const dir = resolveDefaultAntigravityConfigDir();
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '/tmp';
    expect(dir).toBe(join(home, '.gemini', 'antigravity'));
  });
});

// --- full lifecycle ---

describe('AntigravityAdapter -- full lifecycle', () => {
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
    expect(found!.id.tool).toBe('antigravity');
    const core = found!.core as { transport: string; command: string; args?: string[] };
    expect(core.transport).toBe('stdio');
    expect(core.command).toBe('node');
    expect(core.args).toEqual(['server.js']);

    // Uninstall
    await adapter.uninstall({
      tool: 'antigravity',
      type: 'mcp-server',
      name: 'lifecycle-server',
      scope: 'global',
    });

    // Verify removal
    components = await adapter.scan();
    found = components.find((c) => c.id.name === 'lifecycle-server');
    expect(found).toBeUndefined();
  });

  it('skill: install -> scan -> uninstall -> scan', async () => {
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

    // Verify via scan
    let components = await adapter.scan();
    let found = components.find((c) => c.id.name === 'lifecycle-skill');
    expect(found).toBeDefined();
    expect(found!.id.type).toBe('skill');
    expect(found!.description).toBe('Lifecycle test');

    // Uninstall
    await adapter.uninstall({
      tool: 'antigravity',
      type: 'skill',
      name: 'lifecycle-skill',
      scope: 'global',
    });

    // Verify removal
    components = await adapter.scan();
    found = components.find((c) => c.id.name === 'lifecycle-skill');
    expect(found).toBeUndefined();
  });
});
