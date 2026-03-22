/**
 * Tests for shared/utils.ts — deepEqual edge cases and all utility functions.
 */

import { describe, it, expect } from 'vitest';
import {
  deepEqual,
  componentIdEquals,
  componentIdKey,
  componentContentHash,
  isSensitiveEnvKey,
  isSensitiveEnvValue,
} from '../utils';
import type { ComponentId, PortableComponent } from '../types';

// ---------------------------------------------------------------------------
// deepEqual
// ---------------------------------------------------------------------------

describe('deepEqual — primitives', () => {
  it('returns true for identical primitives', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('hello', 'hello')).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
  });

  it('returns false for different primitives', () => {
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('a', 'b')).toBe(false);
    expect(deepEqual(true, false)).toBe(false);
  });

  it('returns false when comparing number to string', () => {
    expect(deepEqual(1, '1')).toBe(false);
  });

  it('returns false when comparing null to undefined', () => {
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it('returns false when comparing null to object', () => {
    expect(deepEqual(null, {})).toBe(false);
  });

  it('returns false when comparing undefined to object', () => {
    expect(deepEqual(undefined, {})).toBe(false);
  });

  it('returns false when a is null and b is not', () => {
    expect(deepEqual(null, 'string')).toBe(false);
  });

  it('returns false when b is null and a is not', () => {
    expect(deepEqual('string', null)).toBe(false);
  });
});

describe('deepEqual — arrays', () => {
  it('returns true for identical arrays', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([], [])).toBe(true);
    expect(deepEqual(['a', 'b'], ['a', 'b'])).toBe(true);
  });

  it('returns false for arrays with different lengths', () => {
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('returns false for arrays with different values', () => {
    expect(deepEqual([1, 2], [1, 3])).toBe(false);
  });

  it('returns false when comparing array to non-array', () => {
    expect(deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
  });

  it('returns true for nested equal arrays', () => {
    expect(
      deepEqual(
        [
          [1, 2],
          [3, 4],
        ],
        [
          [1, 2],
          [3, 4],
        ],
      ),
    ).toBe(true);
  });

  it('returns false for nested arrays with different values', () => {
    expect(
      deepEqual(
        [
          [1, 2],
          [3, 4],
        ],
        [
          [1, 2],
          [3, 5],
        ],
      ),
    ).toBe(false);
  });
});

describe('deepEqual — objects', () => {
  it('returns true for identical objects', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(deepEqual({}, {})).toBe(true);
  });

  it('returns false for objects with different values', () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('returns false for objects with different keys', () => {
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  it('returns false for objects with different key counts', () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('returns true for key-order-independent object comparison', () => {
    // This is the primary use case: JSON.stringify would return false for different key orders
    expect(deepEqual({ b: 2, a: 1 }, { a: 1, b: 2 })).toBe(true);
  });

  it('returns true for deeply nested equal objects', () => {
    expect(
      deepEqual(
        { transport: 'stdio', env: { A: '1', B: '2' } },
        { transport: 'stdio', env: { B: '2', A: '1' } }, // different key order in env
      ),
    ).toBe(true);
  });

  it('returns false for objects where nested value differs', () => {
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  it('returns false when b does not have a key that a has', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });

  it('returns false for non-matching types at object level', () => {
    expect(deepEqual({ a: 1 }, 'string')).toBe(false);
  });
});

describe('deepEqual — mixed types', () => {
  it('handles object with array values', () => {
    expect(deepEqual({ args: ['-y', 'pkg'] }, { args: ['-y', 'pkg'] })).toBe(true);
    expect(deepEqual({ args: ['-y'] }, { args: ['-n'] })).toBe(false);
  });

  it('handles array of objects', () => {
    expect(deepEqual([{ a: 1 }, { b: 2 }], [{ a: 1 }, { b: 2 }])).toBe(true);
    expect(deepEqual([{ a: 1 }], [{ a: 2 }])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// componentIdEquals
// ---------------------------------------------------------------------------

describe('componentIdEquals', () => {
  const base: ComponentId = {
    tool: 'claude-code',
    type: 'mcp-server',
    name: 'my-server',
    scope: 'user',
  };

  it('returns true for identical ids', () => {
    expect(componentIdEquals(base, { ...base })).toBe(true);
  });

  it('returns false when tool differs', () => {
    expect(componentIdEquals(base, { ...base, tool: 'claude-desktop' })).toBe(false);
  });

  it('returns false when type differs', () => {
    expect(componentIdEquals(base, { ...base, type: 'skill' })).toBe(false);
  });

  it('returns false when name differs', () => {
    expect(componentIdEquals(base, { ...base, name: 'other' })).toBe(false);
  });

  it('returns false when scope differs', () => {
    expect(componentIdEquals(base, { ...base, scope: 'project' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// componentIdKey
// ---------------------------------------------------------------------------

describe('componentIdKey', () => {
  it('serializes to tool:type:name:scope format', () => {
    const id: ComponentId = {
      tool: 'claude-code',
      type: 'skill',
      name: 'my-skill',
      scope: 'user',
    };
    expect(componentIdKey(id)).toBe('claude-code:skill:my-skill:user');
  });

  it('produces unique keys for different ids', () => {
    const id1: ComponentId = { tool: 'claude-code', type: 'skill', name: 'a', scope: 'user' };
    const id2: ComponentId = { tool: 'claude-code', type: 'skill', name: 'b', scope: 'user' };
    expect(componentIdKey(id1)).not.toBe(componentIdKey(id2));
  });
});

// ---------------------------------------------------------------------------
// componentContentHash
// ---------------------------------------------------------------------------

describe('componentContentHash', () => {
  const baseComponent: PortableComponent = {
    type: 'skill',
    name: 'test-skill',
    description: 'A test skill',
    core: { description: 'test', content: '# Test\nHello' },
  };

  it('produces a 64-char hex string (SHA-256)', () => {
    const hash = componentContentHash(baseComponent);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic — same input produces same hash', () => {
    const hash1 = componentContentHash(baseComponent);
    const hash2 = componentContentHash(baseComponent);
    expect(hash1).toBe(hash2);
  });

  it('is key-order independent', () => {
    const a: PortableComponent = {
      type: 'skill',
      name: 'x',
      core: { description: 'a', content: 'b' },
    };
    const b = {
      name: 'x',
      type: 'skill',
      core: { description: 'a', content: 'b' },
    } as PortableComponent;
    expect(componentContentHash(a)).toBe(componentContentHash(b));
  });

  it('strips undefined values', () => {
    const withUndefined: PortableComponent = {
      type: 'skill',
      name: 'x',
      description: undefined,
      core: { description: 'a', content: 'b' },
    };
    const withoutUndefined: PortableComponent = {
      type: 'skill',
      name: 'x',
      core: { description: 'a', content: 'b' },
    };
    expect(componentContentHash(withUndefined)).toBe(componentContentHash(withoutUndefined));
  });

  it('produces different hashes for different content', () => {
    const a: PortableComponent = {
      type: 'skill',
      name: 'x',
      core: { description: 'a', content: 'b' },
    };
    const b: PortableComponent = {
      type: 'skill',
      name: 'x',
      core: { description: 'CHANGED', content: 'b' },
    };
    expect(componentContentHash(a)).not.toBe(componentContentHash(b));
  });

  it('produces different hashes for different names', () => {
    const a: PortableComponent = {
      type: 'skill',
      name: 'alpha',
      core: { description: 'a', content: 'b' },
    };
    const b: PortableComponent = {
      type: 'skill',
      name: 'beta',
      core: { description: 'a', content: 'b' },
    };
    expect(componentContentHash(a)).not.toBe(componentContentHash(b));
  });

  it('produces same hash regardless of nested key order', () => {
    const a = { type: 'mcp-server' as const, name: 'test', core: { b: 1, a: 2 } } as any;
    const b = { type: 'mcp-server' as const, name: 'test', core: { a: 2, b: 1 } } as any;
    expect(componentContentHash(a)).toBe(componentContentHash(b));
  });
});

// ---------------------------------------------------------------------------
// isSensitiveEnvKey
// ---------------------------------------------------------------------------

describe('isSensitiveEnvKey', () => {
  it('matches API_KEY', () => {
    expect(isSensitiveEnvKey('API_KEY')).toBe(true);
  });

  it('matches SECRET', () => {
    expect(isSensitiveEnvKey('MY_SECRET')).toBe(true);
  });

  it('matches TOKEN', () => {
    expect(isSensitiveEnvKey('ACCESS_TOKEN')).toBe(true);
  });

  it('matches PASSWORD', () => {
    expect(isSensitiveEnvKey('DB_PASSWORD')).toBe(true);
  });

  it('matches CREDENTIAL', () => {
    expect(isSensitiveEnvKey('AWS_CREDENTIAL')).toBe(true);
  });

  it('matches PASSPHRASE', () => {
    expect(isSensitiveEnvKey('PGP_PASSPHRASE')).toBe(true);
  });

  it('matches PRIVATE_KEY', () => {
    expect(isSensitiveEnvKey('PRIVATE_KEY')).toBe(true);
  });

  it('matches AUTH', () => {
    expect(isSensitiveEnvKey('AUTH_HEADER')).toBe(true);
  });

  it('matches BEARER', () => {
    expect(isSensitiveEnvKey('BEARER_TOKEN')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isSensitiveEnvKey('api_key')).toBe(true);
    expect(isSensitiveEnvKey('Api_Key')).toBe(true);
  });

  it('returns false for non-sensitive keys', () => {
    expect(isSensitiveEnvKey('LOG_LEVEL')).toBe(false);
    expect(isSensitiveEnvKey('HOST')).toBe(false);
    expect(isSensitiveEnvKey('PORT')).toBe(false);
    expect(isSensitiveEnvKey('NODE_ENV')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSensitiveEnvValue
// ---------------------------------------------------------------------------

describe('isSensitiveEnvValue', () => {
  it('matches sk- prefix (OpenAI key)', () => {
    expect(isSensitiveEnvValue('sk-abc123')).toBe(true);
  });

  it('matches ghp_ prefix (GitHub personal access token)', () => {
    expect(isSensitiveEnvValue('ghp_abcdefg')).toBe(true);
  });

  it('matches ghs_ prefix (GitHub service token)', () => {
    expect(isSensitiveEnvValue('ghs_xyz')).toBe(true);
  });

  it('matches github_pat_ prefix', () => {
    expect(isSensitiveEnvValue('github_pat_123')).toBe(true);
  });

  it('matches xoxb- prefix (Slack bot token)', () => {
    expect(isSensitiveEnvValue('xoxb-12345-67890')).toBe(true);
  });

  it('matches xoxp- prefix (Slack user token)', () => {
    expect(isSensitiveEnvValue('xoxp-my-token')).toBe(true);
  });

  it('matches AIza prefix (Google API key)', () => {
    expect(isSensitiveEnvValue('AIzaSyAbc123')).toBe(true);
  });

  it('matches AKIA prefix (AWS access key)', () => {
    expect(isSensitiveEnvValue('AKIAIOSFODNN7EXAMPLE')).toBe(true);
  });

  it('matches eyJ prefix (JWT token)', () => {
    expect(isSensitiveEnvValue('eyJhbGciOiJSUzI1NiJ9')).toBe(true);
  });

  it('matches whsec_ prefix (Stripe webhook secret)', () => {
    expect(isSensitiveEnvValue('whsec_abc123')).toBe(true);
  });

  it('matches sk_live_ prefix (Stripe live key)', () => {
    expect(isSensitiveEnvValue('sk_live_abc123')).toBe(true);
  });

  it('matches pk_live_ prefix (Stripe publishable key)', () => {
    expect(isSensitiveEnvValue('pk_live_abc123')).toBe(true);
  });

  it('matches rk_live_ prefix (Stripe restricted key)', () => {
    expect(isSensitiveEnvValue('rk_live_abc123')).toBe(true);
  });

  it('is case-insensitive for prefix matching', () => {
    expect(isSensitiveEnvValue('SK-abc123')).toBe(true);
    expect(isSensitiveEnvValue('GHP_abc')).toBe(true);
  });

  it('returns false for non-secret values', () => {
    expect(isSensitiveEnvValue('localhost')).toBe(false);
    expect(isSensitiveEnvValue('debug')).toBe(false);
    expect(isSensitiveEnvValue('5432')).toBe(false);
    expect(isSensitiveEnvValue('https://api.example.com')).toBe(false);
    expect(isSensitiveEnvValue('')).toBe(false);
  });
});
