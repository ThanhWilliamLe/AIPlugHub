/**
 * Export Builder tests — secret stripping, portability warnings, bundle construction.
 * Security-critical: verifies secrets never leak into bundles.
 */

import { describe, it, expect } from 'vitest';
import { buildBundle } from '../bundle/export-builder';
import type { Component, ComponentId, ExportOptions } from '@shared/types';

function makeComponent(overrides: Partial<Component> & { id: ComponentId }): Component {
  return {
    enabled: true,
    tracking: 'detected',
    core: { transport: 'stdio', command: 'test' },
    ...overrides,
  };
}

const baseId: ComponentId = {
  tool: 'claude-code',
  type: 'mcp-server',
  name: 'test-server',
  scope: 'user',
};

describe('buildBundle', () => {
  it('filters components by selectedIds', () => {
    const components: Component[] = [
      makeComponent({ id: { ...baseId, name: 'selected' } }),
      makeComponent({ id: { ...baseId, name: 'not-selected' } }),
    ];
    const bundle = buildBundle([{ ...baseId, name: 'selected' }], components, {});
    expect(bundle.components).toHaveLength(1);
    expect(bundle.components[0].name).toBe('selected');
  });

  it('uses custom name from options', () => {
    const bundle = buildBundle([], [], { name: 'my-bundle' });
    expect(bundle.name).toBe('my-bundle');
  });

  it('generates auto-name when none provided', () => {
    const bundle = buildBundle([], [], {});
    expect(bundle.name).toMatch(/^my-setup-\d{4}-\d{2}-\d{2}$/);
  });

  it('includes description from options', () => {
    const bundle = buildBundle([], [], { description: 'Team setup' });
    expect(bundle.description).toBe('Team setup');
  });

  it('collects source tools from selected components', () => {
    const components: Component[] = [
      makeComponent({ id: { ...baseId, tool: 'claude-code', name: 'a' } }),
      makeComponent({ id: { ...baseId, tool: 'claude-desktop', name: 'b' } }),
    ];
    const bundle = buildBundle(
      components.map((c) => c.id),
      components,
      {},
    );
    expect(bundle.exportedFrom.tools).toContain('claude-code');
    expect(bundle.exportedFrom.tools).toContain('claude-desktop');
  });
});

describe('toPortable — secret stripping', () => {
  it('strips env vars matching API_KEY pattern', () => {
    const component = makeComponent({
      id: baseId,
      core: {
        transport: 'stdio',
        command: 'test',
        env: { API_KEY: 'secret-value', DATABASE_PATH: '/data/db' },
      },
    });
    const bundle = buildBundle([baseId], [component], {});
    const portable = bundle.components[0];

    // Secret should NOT be in core env
    const env = (portable.core as { env?: Record<string, string> }).env;
    expect(env).toBeDefined();
    expect(env!['API_KEY']).toBeUndefined();
    expect(env!['DATABASE_PATH']).toBe('/data/db');
  });

  it('strips multiple secrets correctly', () => {
    const component = makeComponent({
      id: baseId,
      core: {
        transport: 'stdio',
        command: 'test',
        env: {
          API_KEY: 'key1',
          SECRET_TOKEN: 'token1',
          NORMAL_VAR: 'safe',
          PASSWORD: 'pass1',
        },
      },
    });
    const bundle = buildBundle([baseId], [component], {});
    const portable = bundle.components[0];
    const env = (portable.core as { env?: Record<string, string> }).env;

    expect(env!['API_KEY']).toBeUndefined();
    expect(env!['SECRET_TOKEN']).toBeUndefined();
    expect(env!['PASSWORD']).toBeUndefined();
    expect(env!['NORMAL_VAR']).toBe('safe');
  });

  it('generates requiredConfig entries for stripped secrets', () => {
    const component = makeComponent({
      id: baseId,
      core: {
        transport: 'stdio',
        command: 'test',
        env: { API_KEY: 'secret' },
      },
    });
    const bundle = buildBundle([baseId], [component], {});
    const portable = bundle.components[0];

    expect(portable.requiredConfig).toBeDefined();
    const secret = portable.requiredConfig!.find((r) => r.key === 'API_KEY');
    expect(secret).toBeDefined();
    expect(secret!.sensitive).toBe(true);
  });

  it('generates requiredConfig for non-sensitive env vars with default', () => {
    const component = makeComponent({
      id: baseId,
      core: {
        transport: 'stdio',
        command: 'test',
        env: { DATABASE_PATH: '/data/db' },
      },
    });
    const bundle = buildBundle([baseId], [component], {});
    const portable = bundle.components[0];

    const entry = portable.requiredConfig!.find((r) => r.key === 'DATABASE_PATH');
    expect(entry).toBeDefined();
    expect(entry!.sensitive).toBe(false);
    expect(entry!.default).toBe('/data/db');
  });

  it('removes env key from core when all env vars are secrets', () => {
    const component = makeComponent({
      id: baseId,
      core: {
        transport: 'stdio',
        command: 'test',
        env: { API_KEY: 'secret', TOKEN: 'another-secret' },
      },
    });
    const bundle = buildBundle([baseId], [component], {});
    const portable = bundle.components[0];
    const env = (portable.core as { env?: Record<string, string> }).env;
    expect(env).toBeUndefined();
  });
});

describe('toPortable — portability warnings', () => {
  it('warns about HTTP MCP servers', () => {
    const component = makeComponent({
      id: baseId,
      core: { transport: 'http', url: 'https://example.com' },
    });
    const bundle = buildBundle([baseId], [component], {});
    const portable = bundle.components[0];
    expect(portable.portabilityWarnings).toBeDefined();
    expect(portable.portabilityWarnings![0]).toContain('Remote MCP');
  });

  it('warns about SSE MCP servers', () => {
    const component = makeComponent({
      id: baseId,
      core: { transport: 'sse', url: 'https://example.com/sse' },
    });
    const bundle = buildBundle([baseId], [component], {});
    expect(bundle.components[0].portabilityWarnings).toBeDefined();
  });

  it('does not warn about stdio MCP servers', () => {
    const component = makeComponent({ id: baseId });
    const bundle = buildBundle([baseId], [component], {});
    expect(bundle.components[0].portabilityWarnings).toBeUndefined();
  });

  it('warns about skills with supporting files', () => {
    const component = makeComponent({
      id: { ...baseId, type: 'skill' },
      core: {
        description: 'test',
        content: '# Test',
        supportingFiles: ['scripts/run.sh', 'data/config.yml'],
      },
    });
    const bundle = buildBundle([{ ...baseId, type: 'skill' }], [component], {});
    expect(bundle.components[0].portabilityWarnings![0]).toContain('2 supporting file');
  });
});

describe('toPortable — tool extensions', () => {
  it('passes through tool extensions keyed by tool', () => {
    const component = makeComponent({
      id: baseId,
      extensions: { customField: true },
    });
    const bundle = buildBundle([baseId], [component], {});
    expect(bundle.components[0].toolExtensions).toEqual({
      'claude-code': { customField: true },
    });
  });

  it('omits toolExtensions when none present', () => {
    const component = makeComponent({ id: baseId, extensions: undefined });
    const bundle = buildBundle([baseId], [component], {});
    expect(bundle.components[0].toolExtensions).toBeUndefined();
  });
});

// ─── v1.7.0: Plugin grouping in export (R1) ────────────────────────

describe('buildBundle — plugin grouping (R1)', () => {
  const pluginSkillId: ComponentId = {
    tool: 'claude-code',
    type: 'skill',
    name: 'agent-teams@workflows/team-spawn',
    scope: 'plugin',
  };

  const pluginAgentId: ComponentId = {
    tool: 'claude-code',
    type: 'agent',
    name: 'agent-teams@workflows/team-lead',
    scope: 'plugin',
  };

  const standaloneId: ComponentId = {
    tool: 'claude-code',
    type: 'skill',
    name: 'my-custom-skill',
    scope: 'user',
  };

  function makePluginComponent(id: ComponentId): Component {
    return makeComponent({
      id,
      extensions: {
        pluginKey: 'agent-teams@workflows',
        pluginName: 'agent-teams',
        marketplace: 'workflows',
        pluginVersion: '1.0.2',
        pluginEnabled: true,
      },
      version: '1.0.2',
      core: { description: 'test', content: '# test' },
    });
  }

  it('groups plugin-scope components into bundle.plugins', () => {
    const components = [
      makePluginComponent(pluginSkillId),
      makePluginComponent(pluginAgentId),
      makeComponent({
        id: standaloneId,
        core: { description: 'standalone', content: '# standalone' },
      }),
    ];

    const bundle = buildBundle([pluginSkillId, pluginAgentId, standaloneId], components, {});

    // Plugin components should be in bundle.plugins, not bundle.components
    expect(bundle.plugins).toHaveLength(1);
    expect(bundle.plugins[0].pluginKey).toBe('agent-teams@workflows');
    expect(bundle.plugins[0].pluginName).toBe('agent-teams');
    expect(bundle.plugins[0].marketplace).toBe('workflows');
    expect(bundle.plugins[0].version).toBe('1.0.2');
    expect(bundle.plugins[0].enabled).toBe(true);
    expect(bundle.plugins[0].components).toHaveLength(2);

    // Standalone should be in bundle.components
    expect(bundle.components).toHaveLength(1);
    expect(bundle.components[0].name).toBe('my-custom-skill');
  });

  it('does not put plugin components in flat components array', () => {
    const components = [makePluginComponent(pluginSkillId)];
    const bundle = buildBundle([pluginSkillId], components, {});

    expect(bundle.components).toHaveLength(0);
    expect(bundle.plugins).toHaveLength(1);
    expect(bundle.plugins[0].components).toHaveLength(1);
  });

  it('groups multiple plugins separately', () => {
    const otherPluginId: ComponentId = {
      tool: 'claude-code',
      type: 'skill',
      name: 'code-review@marketplace/review',
      scope: 'plugin',
    };
    const otherPluginComp = makeComponent({
      id: otherPluginId,
      extensions: {
        pluginKey: 'code-review@marketplace',
        pluginName: 'code-review',
        marketplace: 'marketplace',
        pluginVersion: '2.0.0',
        pluginEnabled: false,
      },
      version: '2.0.0',
      core: { description: 'review', content: '# review' },
    });

    const components = [makePluginComponent(pluginSkillId), otherPluginComp];
    const bundle = buildBundle([pluginSkillId, otherPluginId], components, {});

    expect(bundle.plugins).toHaveLength(2);
    const keys = bundle.plugins.map((p) => p.pluginKey);
    expect(keys).toContain('agent-teams@workflows');
    expect(keys).toContain('code-review@marketplace');
  });

  it('handles empty plugin selection', () => {
    const components = [
      makeComponent({
        id: standaloneId,
        core: { description: 'standalone', content: '# standalone' },
      }),
    ];
    const bundle = buildBundle([standaloneId], components, {});
    expect(bundle.plugins).toHaveLength(0);
    expect(bundle.components).toHaveLength(1);
  });

  it('populates marketplaceSource on plugin from marketplace sources map', () => {
    const components = [makePluginComponent(pluginSkillId)];
    const marketplaceSources = new Map([
      ['workflows', { sourceId: 'workflows', url: 'https://github.com/wshobson/agents' }],
    ]);
    const bundle = buildBundle([pluginSkillId], components, {}, marketplaceSources);

    expect(bundle.plugins[0].marketplaceSource).toEqual({
      sourceId: 'workflows',
      url: 'https://github.com/wshobson/agents',
    });
  });

  it('omits marketplaceSource when marketplace not in sources map', () => {
    const components = [makePluginComponent(pluginSkillId)];
    const bundle = buildBundle([pluginSkillId], components, {});

    expect(bundle.plugins[0].marketplaceSource).toBeUndefined();
  });

  it('omits marketplaceSource when plugin has empty marketplace string', () => {
    const emptyMktId: ComponentId = {
      tool: 'claude-code',
      type: 'skill',
      name: 'local-plugin/my-skill',
      scope: 'plugin',
    };
    const comp = makeComponent({
      id: emptyMktId,
      extensions: {
        pluginKey: 'local-plugin',
        pluginName: 'local-plugin',
        marketplace: '',
        pluginVersion: '1.0.0',
        pluginEnabled: true,
      },
      core: { description: 'test', content: '# test' },
    });
    const marketplaceSources = new Map([
      ['', { sourceId: '', url: 'https://should-not-match.com' }],
    ]);
    const bundle = buildBundle([emptyMktId], [comp], {}, marketplaceSources);
    expect(bundle.plugins[0].marketplaceSource).toBeUndefined();
  });
});
