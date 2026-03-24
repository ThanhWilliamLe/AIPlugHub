/**
 * Bundle Serializer tests — serialize/deserialize round-trip, validation.
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
    formatVersion: '1.0',
    name: 'test-bundle',
    description: 'A test bundle',
    exportedFrom: {
      tools: ['claude-code'],
      date: '2026-03-19T00:00:00.000Z',
    },
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
      deserializeBundle(JSON.stringify({ exportedFrom: { tools: [], date: '' } })),
    ).toThrow('formatVersion');
  });

  it('rejects incompatible major version', () => {
    expect(() =>
      deserializeBundle(
        JSON.stringify({
          formatVersion: '2.0',
          exportedFrom: { tools: [], date: '' },
          components: [],
          plugins: [],
        }),
      ),
    ).toThrow('Unsupported bundle format version');
  });

  it('accepts compatible minor version', () => {
    const json = JSON.stringify({
      formatVersion: '1.1',
      exportedFrom: { tools: [], date: '2026-01-01' },
      components: [],
      plugins: [],
    });
    expect(() => deserializeBundle(json)).not.toThrow();
  });

  it('rejects missing exportedFrom', () => {
    expect(() => deserializeBundle(JSON.stringify({ formatVersion: '1.0' }))).toThrow(
      'exportedFrom',
    );
  });

  it('rejects component without type', () => {
    const json = JSON.stringify({
      formatVersion: '1.0',
      exportedFrom: { tools: [], date: '' },
      components: [{ name: 'test', core: {} }],
      plugins: [],
    });
    expect(() => deserializeBundle(json)).toThrow(/type/);
  });

  it('rejects component without name', () => {
    const json = JSON.stringify({
      formatVersion: '1.0',
      exportedFrom: { tools: [], date: '' },
      components: [{ type: 'skill', core: {} }],
      plugins: [],
    });
    expect(() => deserializeBundle(json)).toThrow('must have a name');
  });

  it('rejects component without core', () => {
    const json = JSON.stringify({
      formatVersion: '1.0',
      exportedFrom: { tools: [], date: '' },
      components: [{ type: 'skill', name: 'test' }],
      plugins: [],
    });
    expect(() => deserializeBundle(json)).toThrow('must have a core');
  });

  it('rejects duplicate component in both plugins and top-level', () => {
    const json = JSON.stringify({
      formatVersion: '1.0',
      exportedFrom: { tools: [], date: '' },
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
      formatVersion: '1.0',
      exportedFrom: { tools: ['claude-code'], date: '2026-01-01' },
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
    const bundle = createBundle('test', ['claude-code']);
    expect(bundle.formatVersion).toBe(FORMAT_VERSION);
  });

  it('includes tools and description', () => {
    const bundle = createBundle('test', ['claude-code', 'claude-desktop'], 'My desc');
    expect(bundle.exportedFrom.tools).toEqual(['claude-code', 'claude-desktop']);
    expect(bundle.description).toBe('My desc');
  });

  it('includes a date string', () => {
    const bundle = createBundle('test', []);
    expect(bundle.exportedFrom.date).toBeTruthy();
    expect(new Date(bundle.exportedFrom.date).getTime()).not.toBeNaN();
  });
});

// ─── v1.7.0: PortablePlugin with pluginKey (R1) ────────────────────

describe('deserializeBundle — v1.7.0 plugin format', () => {
  it('accepts v1.7.0 plugin with pluginKey', () => {
    const json = JSON.stringify({
      formatVersion: '1.0',
      exportedFrom: { tools: ['claude-code'], date: '2026-03-24' },
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
      formatVersion: '1.0',
      exportedFrom: { tools: ['claude-code'], date: '2026-01-01' },
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
      formatVersion: '1.0',
      exportedFrom: { tools: [], date: '' },
      components: [],
      plugins: [{ components: [] }],
    });
    expect(() => deserializeBundle(json)).toThrow('pluginKey or name');
  });

  it('round-trips v1.7.0 bundle with plugins', () => {
    const bundle: Bundle = {
      formatVersion: '1.0',
      exportedFrom: { tools: ['claude-code'], date: '2026-03-24T00:00:00.000Z' },
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
