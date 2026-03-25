import { describe, it, expect } from 'vitest';
import { computeDiff } from '../bundle/diff-engine';
import type { PortableComponent } from '@shared/types';

function makeComponent(
  overrides: Partial<PortableComponent> & { type: PortableComponent['type']; name: string },
): PortableComponent {
  return {
    core: { command: 'test' },
    ...overrides,
  } as PortableComponent;
}

describe('computeDiff', () => {
  it('returns empty result for empty inputs', () => {
    const result = computeDiff([], []);
    expect(result.entries).toEqual([]);
    expect(result.summary).toEqual({ added: 0, removed: 0, changed: 0, unchanged: 0 });
  });

  it('marks all as added when left is empty', () => {
    const right = [
      makeComponent({ type: 'mcp-server', name: 'server-a', version: '1.0' }),
      makeComponent({ type: 'skill', name: 'skill-b', version: '2.0' }),
    ];
    const result = computeDiff([], right);
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((e) => e.category === 'added')).toBe(true);
    expect(result.entries[0].rightVersion).toBe('1.0');
    expect(result.summary.added).toBe(2);
  });

  it('marks all as removed when right is empty', () => {
    const left = [
      makeComponent({ type: 'mcp-server', name: 'server-a', version: '1.0' }),
      makeComponent({ type: 'skill', name: 'skill-b', version: '2.0' }),
    ];
    const result = computeDiff(left, []);
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((e) => e.category === 'removed')).toBe(true);
    expect(result.entries[0].leftVersion).toBe('1.0');
    expect(result.summary.removed).toBe(2);
  });

  it('marks identical items as unchanged', () => {
    const comp = makeComponent({ type: 'mcp-server', name: 'server-a', version: '1.0' });
    const result = computeDiff([comp], [{ ...comp }]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].category).toBe('unchanged');
    expect(result.entries[0].leftVersion).toBe('1.0');
    expect(result.entries[0].rightVersion).toBe('1.0');
    expect(result.summary.unchanged).toBe(1);
  });

  it('detects version change with version details', () => {
    const left = makeComponent({ type: 'mcp-server', name: 'server-a', version: '1.0' });
    const right = makeComponent({ type: 'mcp-server', name: 'server-a', version: '2.0' });
    const result = computeDiff([left], [right]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].category).toBe('changed');
    expect(result.entries[0].changeDetails).toBe('v1.0 → v2.0');
    expect(result.entries[0].leftVersion).toBe('1.0');
    expect(result.entries[0].rightVersion).toBe('2.0');
  });

  it('detects content change when version is the same', () => {
    const left = makeComponent({
      type: 'mcp-server',
      name: 'server-a',
      version: '1.0',
      core: { command: 'old-cmd' } as any,
    });
    const right = makeComponent({
      type: 'mcp-server',
      name: 'server-a',
      version: '1.0',
      core: { command: 'new-cmd' } as any,
    });
    const result = computeDiff([left], [right]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].category).toBe('changed');
    expect(result.entries[0].changeDetails).toBe('config changed');
  });

  it('handles mixed scenario correctly', () => {
    const left = [
      makeComponent({ type: 'mcp-server', name: 'unchanged-srv', version: '1.0' }),
      makeComponent({ type: 'skill', name: 'removed-skill', version: '1.0' }),
      makeComponent({ type: 'command', name: 'changed-cmd', version: '1.0' }),
    ];
    const right = [
      makeComponent({ type: 'mcp-server', name: 'unchanged-srv', version: '1.0' }),
      makeComponent({ type: 'command', name: 'changed-cmd', version: '2.0' }),
      makeComponent({ type: 'hook', name: 'new-hook', version: '1.0' }),
    ];
    const result = computeDiff(left, right);

    expect(result.summary).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 1 });

    const added = result.entries.filter((e) => e.category === 'added');
    expect(added).toHaveLength(1);
    expect(added[0].name).toBe('new-hook');

    const removed = result.entries.filter((e) => e.category === 'removed');
    expect(removed).toHaveLength(1);
    expect(removed[0].name).toBe('removed-skill');

    const changed = result.entries.filter((e) => e.category === 'changed');
    expect(changed).toHaveLength(1);
    expect(changed[0].name).toBe('changed-cmd');
    expect(changed[0].changeDetails).toBe('v1.0 → v2.0');

    const unchanged = result.entries.filter((e) => e.category === 'unchanged');
    expect(unchanged).toHaveLength(1);
    expect(unchanged[0].name).toBe('unchanged-srv');
  });

  it('returns correct summary counts', () => {
    const left = [
      makeComponent({ type: 'mcp-server', name: 'a', version: '1.0' }),
      makeComponent({ type: 'mcp-server', name: 'b', version: '1.0' }),
      makeComponent({ type: 'skill', name: 'c', version: '1.0' }),
    ];
    const right = [
      makeComponent({ type: 'mcp-server', name: 'a', version: '1.0' }),
      makeComponent({ type: 'mcp-server', name: 'b', version: '2.0' }),
      makeComponent({ type: 'skill', name: 'd', version: '1.0' }),
    ];
    const result = computeDiff(left, right);
    expect(result.summary).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 1 });
    expect(result.entries).toHaveLength(4);
  });

  it('treats same name with different type as separate entries', () => {
    const left = [
      makeComponent({ type: 'mcp-server', name: 'shared-name', version: '1.0' }),
    ];
    const right = [
      makeComponent({ type: 'skill', name: 'shared-name', version: '1.0' }),
    ];
    const result = computeDiff(left, right);
    // mcp-server:shared-name removed, skill:shared-name added
    expect(result.summary).toEqual({ added: 1, removed: 1, changed: 0, unchanged: 0 });
    const removed = result.entries.find((e) => e.category === 'removed');
    expect(removed?.type).toBe('mcp-server');
    const added = result.entries.find((e) => e.category === 'added');
    expect(added?.type).toBe('skill');
  });

  it('sorts entries by category priority: added, removed, changed, unchanged', () => {
    const left = [
      makeComponent({ type: 'mcp-server', name: 'unchanged', version: '1.0' }),
      makeComponent({ type: 'skill', name: 'removed', version: '1.0' }),
      makeComponent({ type: 'command', name: 'changed', version: '1.0' }),
    ];
    const right = [
      makeComponent({ type: 'mcp-server', name: 'unchanged', version: '1.0' }),
      makeComponent({ type: 'command', name: 'changed', version: '2.0' }),
      makeComponent({ type: 'hook', name: 'added', version: '1.0' }),
    ];
    const result = computeDiff(left, right);
    const categories = result.entries.map((e) => e.category);
    expect(categories).toEqual(['added', 'removed', 'changed', 'unchanged']);
  });
});
