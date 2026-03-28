/**
 * Conflict Detector unit tests — all 4 conflict types + edge cases.
 * Quality gate: 90%+ coverage on pure logic.
 */

import { describe, it, expect } from 'vitest';
import { detectConflicts } from '../bundle/conflict-detector';
import type { PortableComponent, Component, ToolId } from '@shared/types';

// ─── Helpers ─────────────────────────────────────────────────────────

function makePortable(overrides: Partial<PortableComponent> = {}): PortableComponent {
  return {
    type: 'mcp-server',
    name: 'test-server',
    scope: 'user',
    version: '1.0.0',
    core: { transport: 'stdio', command: 'test' },
    ...overrides,
  };
}

function makeExisting(overrides: Partial<Component> = {}): Component {
  return {
    id: { tool: 'claude-code', type: 'mcp-server', name: 'test-server', scope: 'user' },
    enabled: true,
    tracking: 'detected',
    version: '1.0.0',
    core: { transport: 'stdio', command: 'test' },
    ...overrides,
  };
}

const DETECTED_TOOLS: ToolId[] = ['claude-code', 'claude-desktop'];

// ─── Tests ───────────────────────────────────────────────────────────

describe('detectConflicts', () => {
  // ── New components ───────────────────────────────────────────────

  it('classifies component as new when no existing match', () => {
    const incoming = [makePortable({ name: 'new-server' })];
    const existing: Component[] = [];
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    expect(result.newComponents).toHaveLength(1);
    expect(result.newComponents[0].name).toBe('new-server');
    expect(result.conflicts).toHaveLength(0);
    expect(result.incompatible).toHaveLength(0);
  });

  it('classifies as new when name matches but type differs', () => {
    const incoming = [
      makePortable({
        type: 'skill',
        name: 'test-server',
        core: { description: 'test', content: '#' },
      }),
    ];
    const existing = [makeExisting()];
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    expect(result.newComponents).toHaveLength(1);
  });

  // ── Identical ───────────────────────────────────────────────────

  it('classifies as identical when version, scope, and core match', () => {
    const incoming = [makePortable()];
    const existing = [makeExisting()];
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toBe('identical');
  });

  it('classifies as identical when both versions are undefined', () => {
    const incoming = [makePortable({ version: undefined })];
    const existing = [makeExisting({ version: undefined })];
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    expect(result.conflicts[0].conflictType).toBe('identical');
  });

  // ── Version conflict ────────────────────────────────────────────

  it('classifies as version conflict when versions differ', () => {
    const incoming = [makePortable({ version: '2.0.0' })];
    const existing = [makeExisting({ version: '1.0.0' })];
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toBe('version');
  });

  it('classifies as version conflict when existing has version but incoming does not', () => {
    const incoming = [makePortable({ version: undefined })];
    const existing = [makeExisting({ version: '1.0.0' })];
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    expect(result.conflicts[0].conflictType).toBe('version');
  });

  // ── Content conflict ────────────────────────────────────────────

  it('classifies as content conflict when same version but different core', () => {
    const incoming = [
      makePortable({ version: '1.0.0', core: { transport: 'stdio', command: 'different' } }),
    ];
    const existing = [makeExisting({ version: '1.0.0' })];
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    expect(result.conflicts[0].conflictType).toBe('content');
  });

  // ── Scope mismatch ──────────────────────────────────────────────

  it('classifies as scope-mismatch when scopes differ but content matches', () => {
    const incoming = [makePortable({ scope: 'project' })];
    const existing = [makeExisting()]; // scope: 'user'
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    expect(result.conflicts[0].conflictType).toBe('scope-mismatch');
  });

  it('does not flag scope mismatch when incoming has no scope preference', () => {
    const incoming = [makePortable({ scope: undefined })];
    const existing = [makeExisting()];
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    expect(result.conflicts[0].conflictType).toBe('identical');
  });

  // ── Incompatible ────────────────────────────────────────────────

  it('marks incompatible when sourceTools are not installed', () => {
    const incoming = [makePortable({ sourceTools: ['gemini-cli'] })];
    const existing: Component[] = [];
    const detectedTools: ToolId[] = ['claude-code']; // gemini not detected
    const result = detectConflicts(incoming, existing, detectedTools);
    expect(result.incompatible).toHaveLength(1);
    expect(result.incompatible[0].reason).toContain('gemini-cli');
  });

  it('marks incompatible when no detected tool supports the type', () => {
    const incoming = [
      makePortable({
        type: 'hook',
        sourceTools: undefined,
        core: { event: 'test', handler: { type: 'command', command: 'echo' } },
      }),
    ];
    const existing: Component[] = [];
    const detectedTools: ToolId[] = ['claude-desktop']; // Desktop doesn't support hooks
    const result = detectConflicts(incoming, existing, detectedTools);
    expect(result.incompatible).toHaveLength(1);
    expect(result.incompatible[0].reason).toContain('hook');
  });

  it('allows component when at least one sourceTools is installed', () => {
    const incoming = [makePortable({ sourceTools: ['gemini-cli', 'claude-code'] })];
    const existing: Component[] = [];
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    expect(result.newComponents).toHaveLength(1);
    expect(result.incompatible).toHaveLength(0);
  });

  // ── Multiple components ─────────────────────────────────────────

  it('handles mixed results — new, conflicts, and incompatible', () => {
    const incoming = [
      makePortable({ name: 'brand-new', core: { transport: 'stdio', command: 'new' } }),
      makePortable({ name: 'existing-same', version: '1.0.0' }),
      makePortable({ name: 'existing-diff', version: '2.0.0' }),
      makePortable({ name: 'no-tool', sourceTools: ['antigravity'] }),
    ];
    const existing = [
      makeExisting({
        id: { tool: 'claude-code', type: 'mcp-server', name: 'existing-same', scope: 'user' },
      }),
      makeExisting({
        id: { tool: 'claude-code', type: 'mcp-server', name: 'existing-diff', scope: 'user' },
        version: '1.0.0',
      }),
    ];
    const detectedTools: ToolId[] = ['claude-code'];
    const result = detectConflicts(incoming, existing, detectedTools);

    expect(result.newComponents).toHaveLength(1);
    expect(result.newComponents[0].name).toBe('brand-new');
    expect(result.conflicts).toHaveLength(2);
    expect(result.incompatible).toHaveLength(1);
    expect(result.incompatible[0].component.name).toBe('no-tool');
  });

  // ── Edge cases ──────────────────────────────────────────────────

  it('handles empty incoming array', () => {
    const result = detectConflicts([], [makeExisting()], DETECTED_TOOLS);
    expect(result.newComponents).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
    expect(result.incompatible).toHaveLength(0);
  });

  it('handles empty existing array — all are new', () => {
    const incoming = [makePortable(), makePortable({ name: 'second' })];
    const result = detectConflicts(incoming, [], DETECTED_TOOLS);
    expect(result.newComponents).toHaveLength(2);
  });

  it('treats different key ordering as identical (JSON.stringify ordering)', () => {
    // This tests a known fragility: JSON.stringify order dependence
    const incoming = [
      makePortable({
        core: { transport: 'stdio', command: 'test', args: ['--flag'] },
      }),
    ];
    const existing = [
      makeExisting({
        core: { transport: 'stdio', command: 'test', args: ['--flag'] },
      }),
    ];
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    // Same shape, same values — should be identical
    expect(result.conflicts[0].conflictType).toBe('identical');
  });

  it('detects content conflict when core values differ', () => {
    const incoming = [
      makePortable({
        core: { transport: 'stdio', command: 'test', args: ['--new'] },
      }),
    ];
    const existing = [
      makeExisting({
        core: { transport: 'stdio', command: 'test', args: ['--old'] },
      }),
    ];
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    expect(result.conflicts[0].conflictType).toBe('content');
  });

  it('handles empty detected tools — all with sourceTools are incompatible', () => {
    const incoming = [makePortable({ sourceTools: ['claude-code'] })];
    const result = detectConflicts(incoming, [], []);
    expect(result.incompatible).toHaveLength(1);
  });

  it('filters unknown-type components into incompatible with placeholder reason', () => {
    const incoming = [
      makePortable({
        type: 'unknown' as PortableComponent['type'],
        name: 'plugin-placeholder',
        sourceTools: ['claude-code'],
        core: {},
      }),
    ];
    const result = detectConflicts(incoming, [], DETECTED_TOOLS);
    expect(result.newComponents).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
    expect(result.incompatible).toHaveLength(1);
    expect(result.incompatible[0].reason).toContain('Plugin placeholder');
  });

  // ── BUG-03: export-then-import sensitive env stripping ────────────

  it('classifies as identical when existing has sensitive env vars stripped during export', () => {
    // Simulates: export strips API_KEY from env, re-import has no API_KEY
    const incoming = [
      makePortable({
        core: { transport: 'stdio', command: 'sqlite', env: { PATH: '/bin' } },
      }),
    ];
    const existing = [
      makeExisting({
        core: { transport: 'stdio', command: 'sqlite', env: { PATH: '/bin', API_KEY: 'sk-secret123' } },
      }),
    ];
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toBe('identical');
  });

  it('classifies as identical when no sensitive env vars are present', () => {
    const incoming = [
      makePortable({
        core: { transport: 'stdio', command: 'sqlite', env: { PATH: '/bin', HOME: '/home/user' } },
      }),
    ];
    const existing = [
      makeExisting({
        core: { transport: 'stdio', command: 'sqlite', env: { PATH: '/bin', HOME: '/home/user' } },
      }),
    ];
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toBe('identical');
  });

  it('still detects content conflict when command actually differs', () => {
    const incoming = [
      makePortable({
        core: { transport: 'stdio', command: 'new-tool', env: { PATH: '/bin' } },
      }),
    ];
    const existing = [
      makeExisting({
        core: { transport: 'stdio', command: 'sqlite', env: { PATH: '/bin', API_KEY: 'sk-secret123' } },
      }),
    ];
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toBe('content');
  });

  it('still detects version mismatch even when env stripping normalizes core', () => {
    const incoming = [
      makePortable({
        version: '2.0.0',
        core: { transport: 'stdio', command: 'sqlite', env: { PATH: '/bin' } },
      }),
    ];
    const existing = [
      makeExisting({
        version: '1.0.0',
        core: { transport: 'stdio', command: 'sqlite', env: { PATH: '/bin', SECRET_TOKEN: 'ghp_abc' } },
      }),
    ];
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toBe('version');
  });

  it('classifies as identical when sensitive env detected by value pattern', () => {
    // Key name is not sensitive, but value matches a known prefix (sk-)
    const incoming = [
      makePortable({
        core: { transport: 'stdio', command: 'sqlite', env: { PATH: '/bin' } },
      }),
    ];
    const existing = [
      makeExisting({
        core: { transport: 'stdio', command: 'sqlite', env: { PATH: '/bin', MY_VAR: 'sk-live-abc123' } },
      }),
    ];
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toBe('identical');
  });

  it('classifies as identical when ALL env vars are sensitive (empty env vs no env)', () => {
    // Export strips all sensitive vars → env becomes undefined (absent in JSON).
    // Existing has env with only sensitive vars → stripSensitiveEnv produces empty {}.
    // Both sides should be considered identical.
    const incoming = [
      makePortable({
        core: { transport: 'stdio', command: 'sqlite' }, // no env key at all
      }),
    ];
    const existing = [
      makeExisting({
        core: { transport: 'stdio', command: 'sqlite', env: { API_KEY: 'secret-123', TOKEN: 'sk-live-xyz' } },
      }),
    ];
    const result = detectConflicts(incoming, existing, DETECTED_TOOLS);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].conflictType).toBe('identical');
  });
});
