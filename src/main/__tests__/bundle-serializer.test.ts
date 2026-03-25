/**
 * Bundle Serializer tests — serialize/deserialize round-trip, validation.
 * Updated for Bundle v2.0 format.
 */

import { describe, it, expect } from 'vitest';
import {
  serializeBundle,
  deserializeBundle,
  createBundle,
  FORMAT_VERSION,
} from '../bundle/serializer';
import type { Bundle } from '@shared/types';

function makeValidBundle(): Bundle {
  return {
    formatVersion: '2.0',
    name: 'test-bundle',
    description: 'A test bundle',
    target: { scope: 'user', toolId: 'claude-code' },
    exportedFrom: {
      date: '2026-03-19T00:00:00.000Z',
      appVersion: '1.9.0',
    },
    recommendedSources: [],
    plugins: [],
    components: [
      {
        type: 'mcp-server',
        name: 'sqlite-mcp',
        scope: 'user',
        version: '1.0.0',
        core: { transport: 'stdio', command: 'sqlite-mcp' },
      },
    ],
  };
}

describe('serializeBundle', () => {
  it('produces valid JSON', () => {
    const bundle = makeValidBundle();
    const json = serializeBundle(bundle);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('round-trips losslessly', () => {
    const bundle = makeValidBundle();
    const json = serializeBundle(bundle);
    const parsed = deserializeBundle(json);
    expect(parsed).toEqual(bundle);
  });
});

describe('deserializeBundle', () => {
  it('rejects non-JSON', () => {
    expect(() => deserializeBundle('not json')).toThrow('not valid JSON');
  });

  it('rejects non-object', () => {
    expect(() => deserializeBundle('"string"')).toThrow('JSON object');
  });

  it('rejects missing formatVersion', () => {
    expect(() =>
      deserializeBundle(JSON.stringify({ exportedFrom: { date: '', appVersion: '1.9.0' } })),
    ).toThrow('formatVersion');
  });

  it('rejects v1.x bundles with version-specific message', () => {
    expect(() =>
      deserializeBundle(
        JSON.stringify({
          formatVersion: '1.0',
          exportedFrom: { tools: [], date: '' },
          components: [],
          plugins: [],
        }),
      ),
    ).toThrow('no longer supported');
  });

  it('rejects v1.1 bundles with version-specific message', () => {
    expect(() =>
      deserializeBundle(
        JSON.stringify({
          formatVersion: '1.1',
          exportedFrom: { tools: [], date: '' },
          components: [],
          plugins: [],
        }),
      ),
    ).toThrow('no longer supported');
  });

  it('rejects incompatible future major version', () => {
    expect(() =>
      deserializeBundle(
        JSON.stringify({
          formatVersion: '3.0',
          target: { scope: 'user', toolId: 'claude-code' },
          exportedFrom: { date: '', appVersion: '2.0.0' },
          recommendedSources: [],
          components: [],
          plugins: [],
        }),
      ),
    ).toThrow('Unsupported bundle format version');
  });

  it('accepts compatible minor version', () => {
    const json = JSON.stringify({
      formatVersion: '2.1',
      target: { scope: 'user', toolId: 'claude-code' },
      exportedFrom: { date: '2026-01-01', appVersion: '1.9.0' },
      recommendedSources: [],
      components: [],
      plugins: [],
    });
    expect(() => deserializeBundle(json)).not.toThrow();
  });

  it('rejects missing target', () => {
    expect(() =>
      deserializeBundle(
        JSON.stringify({
          formatVersion: '2.0',
          exportedFrom: { date: '', appVersion: '1.9.0' },
          recommendedSources: [],
          components: [],
          plugins: [],
        }),
      ),
    ).toThrow('target');
  });

  it('rejects invalid target scope', () => {
    expect(() =>
      deserializeBundle(
        JSON.stringify({
          formatVersion: '2.0',
          target: { scope: 'global' },
          exportedFrom: { date: '', appVersion: '1.9.0' },
          recommendedSources: [],
          components: [],
          plugins: [],
        }),
      ),
    ).toThrow('Invalid target scope');
  });

  it('rejects user target without toolId', () => {
    expect(() =>
      deserializeBundle(
        JSON.stringify({
          formatVersion: '2.0',
          target: { scope: 'user' },
          exportedFrom: { date: '', appVersion: '1.9.0' },
          recommendedSources: [],
          components: [],
          plugins: [],
        }),
      ),
    ).toThrow('toolId');
  });

  it('rejects project target without projectName', () => {
    expect(() =>
      deserializeBundle(
        JSON.stringify({
          formatVersion: '2.0',
          target: { scope: 'project', tools: ['claude-code'] },
          exportedFrom: { date: '', appVersion: '1.9.0' },
          recommendedSources: [],
          components: [],
          plugins: [],
        }),
      ),
    ).toThrow('projectName');
  });

  it('rejects project target without tools array', () => {
    expect(() =>
      deserializeBundle(
        JSON.stringify({
          formatVersion: '2.0',
          target: { scope: 'project', projectName: 'my-project' },
          exportedFrom: { date: '', appVersion: '1.9.0' },
          recommendedSources: [],
          components: [],
          plugins: [],
        }),
      ),
    ).toThrow('tools array');
  });

  it('accepts valid project target', () => {
    const json = JSON.stringify({
      formatVersion: '2.0',
      target: { scope: 'project', projectName: 'my-project', tools: ['claude-code'] },
      exportedFrom: { date: '2026-01-01', appVersion: '1.9.0' },
      recommendedSources: [],
      components: [],
      plugins: [],
    });
    expect(() => deserializeBundle(json)).not.toThrow();
  });

  it('rejects missing exportedFrom', () => {
    expect(() =>
      deserializeBundle(
        JSON.stringify({
          formatVersion: '2.0',
          target: { scope: 'user', toolId: 'claude-code' },
        }),
      ),
    ).toThrow('exportedFrom');
  });

  it('rejects component without type', () => {
    const json = JSON.stringify({
      formatVersion: '2.0',
      target: { scope: 'user', toolId: 'claude-code' },
      exportedFrom: { date: '', appVersion: '1.9.0' },
      recommendedSources: [],
      components: [{ name: 'test', core: {} }],
      plugins: [],
    });
    expect(() => deserializeBundle(json)).toThrow(/type/);
  });

  it('rejects component without name', () => {
    const json = JSON.stringify({
      formatVersion: '2.0',
      target: { scope: 'user', toolId: 'claude-code' },
      exportedFrom: { date: '', appVersion: '1.9.0' },
      recommendedSources: [],
      components: [{ type: 'skill', core: {} }],
      plugins: [],
    });
    expect(() => deserializeBundle(json)).toThrow('must have a name');
  });

  it('rejects component without core', () => {
    const json = JSON.stringify({
      formatVersion: '2.0',
      target: { scope: 'user', toolId: 'claude-code' },
      exportedFrom: { date: '', appVersion: '1.9.0' },
      recommendedSources: [],
      components: [{ type: 'skill', name: 'test' }],
      plugins: [],
    });
    expect(() => deserializeBundle(json)).toThrow('must have a core');
  });

  it('rejects duplicate component in both plugins and top-level', () => {
    const json = JSON.stringify({
      formatVersion: '2.0',
      target: { scope: 'user', toolId: 'claude-code' },
      exportedFrom: { date: '', appVersion: '1.9.0' },
      recommendedSources: [],
      components: [{ type: 'skill', name: 'dupe', core: { description: '', content: '' } }],
      plugins: [
        {
          name: 'my-plugin',
          components: [{ type: 'skill', name: 'dupe', core: { description: '', content: '' } }],
        },
      ],
    });
    expect(() => deserializeBundle(json)).toThrow('Duplicate component');
  });

  it('accepts valid bundle with plugins and components', () => {
    const json = JSON.stringify({
      formatVersion: '2.0',
      target: { scope: 'user', toolId: 'claude-code' },
      exportedFrom: { date: '2026-01-01', appVersion: '1.9.0' },
      recommendedSources: [],
      components: [{ type: 'mcp-server', name: 'a', core: { transport: 'stdio', command: 'a' } }],
      plugins: [
        {
          name: 'my-plugin',
          components: [{ type: 'skill', name: 'b', core: { description: 'b', content: '#' } }],
        },
      ],
    });
    const bundle = deserializeBundle(json);
    expect(bundle.components).toHaveLength(1);
    expect(bundle.plugins).toHaveLength(1);
    expect(bundle.plugins[0].components).toHaveLength(1);
  });
});

describe('createBundle', () => {
  it('creates a bundle with correct format version', () => {
    const bundle = createBundle('test', { scope: 'user', toolId: 'claude-code' }, '1.9.0');
    expect(bundle.formatVersion).toBe(FORMAT_VERSION);
  });

  it('includes target and description', () => {
    const target = { scope: 'user' as const, toolId: 'claude-code' as const };
    const bundle = createBundle('test', target, '1.9.0', 'My desc');
    expect(bundle.target).toEqual(target);
    expect(bundle.description).toBe('My desc');
  });

  it('includes appVersion in exportedFrom', () => {
    const bundle = createBundle('test', { scope: 'user', toolId: 'claude-code' }, '1.9.0');
    expect(bundle.exportedFrom.appVersion).toBe('1.9.0');
  });

  it('includes a date string', () => {
    const bundle = createBundle('test', { scope: 'user', toolId: 'claude-code' }, '1.9.0');
    expect(bundle.exportedFrom.date).toBeTruthy();
    expect(new Date(bundle.exportedFrom.date).getTime()).not.toBeNaN();
  });

  it('initializes recommendedSources as empty array', () => {
    const bundle = createBundle('test', { scope: 'user', toolId: 'claude-code' }, '1.9.0');
    expect(bundle.recommendedSources).toEqual([]);
  });
});

// ─── v2.0: PortablePlugin with pluginKey (R1) ──────────────────────

describe('deserializeBundle — plugin format', () => {
  it('accepts plugin with pluginKey', () => {
    const json = JSON.stringify({
      formatVersion: '2.0',
      target: { scope: 'user', toolId: 'claude-code' },
      exportedFrom: { date: '2026-03-24', appVersion: '1.9.0' },
      recommendedSources: [],
      components: [],
      plugins: [
        {
          pluginKey: 'agent-teams@workflows',
          pluginName: 'agent-teams',
          marketplace: 'workflows',
          version: '1.0.2',
          enabled: true,
          components: [
            {
              type: 'skill',
              name: 'agent-teams@workflows/team-spawn',
              core: { description: '', content: '' },
            },
          ],
        },
      ],
    });
    const bundle = deserializeBundle(json);
    expect(bundle.plugins).toHaveLength(1);
    expect(bundle.plugins[0].pluginKey).toBe('agent-teams@workflows');
    expect(bundle.plugins[0].components).toHaveLength(1);
  });

  it('accepts legacy plugin with name field (backwards compat)', () => {
    const json = JSON.stringify({
      formatVersion: '2.0',
      target: { scope: 'user', toolId: 'claude-code' },
      exportedFrom: { date: '2026-01-01', appVersion: '1.9.0' },
      recommendedSources: [],
      components: [],
      plugins: [
        {
          name: 'legacy-plugin',
          components: [{ type: 'skill', name: 'foo', core: { description: '', content: '' } }],
        },
      ],
    });
    const bundle = deserializeBundle(json);
    expect(bundle.plugins).toHaveLength(1);
  });

  it('rejects plugin without pluginKey or name', () => {
    const json = JSON.stringify({
      formatVersion: '2.0',
      target: { scope: 'user', toolId: 'claude-code' },
      exportedFrom: { date: '', appVersion: '1.9.0' },
      recommendedSources: [],
      components: [],
      plugins: [{ components: [] }],
    });
    expect(() => deserializeBundle(json)).toThrow('pluginKey or name');
  });

  it('round-trips bundle with plugins', () => {
    const bundle: Bundle = {
      formatVersion: '2.0',
      target: { scope: 'user', toolId: 'claude-code' },
      exportedFrom: { date: '2026-03-24T00:00:00.000Z', appVersion: '1.9.0' },
      recommendedSources: [],
      plugins: [
        {
          pluginKey: 'test@market',
          pluginName: 'test',
          marketplace: 'market',
          version: '1.0.0',
          enabled: true,
          components: [
            { type: 'agent', name: 'test@market/my-agent', core: { description: 'test agent' } },
          ],
        },
      ],
      components: [
        { type: 'mcp-server', name: 'standalone', core: { transport: 'stdio', command: 'x' } },
      ],
    };
    const json = serializeBundle(bundle);
    const parsed = deserializeBundle(json);
    expect(parsed).toEqual(bundle);
  });
});

// ─── v1.x rejection ────────────────────────────────────────────────

describe('deserializeBundle — v1.x rejection', () => {
  it('rejects v1.0 bundle with BUNDLE_VERSION error code', () => {
    expect(() =>
      deserializeBundle(
        JSON.stringify({
          formatVersion: '1.0',
          exportedFrom: { tools: [], date: '' },
          plugins: [],
          components: [],
        }),
      ),
    ).toThrow('no longer supported');
  });
});
