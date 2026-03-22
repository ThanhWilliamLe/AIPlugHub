import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useComponents } from '../hooks/useComponents';
import { useToolStore } from '../stores/tool-store';
import { useUiStore } from '../stores/ui-store';
import type { Component, ComponentId, ToolDetectionResult } from '@shared/types';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeId(overrides: Partial<ComponentId> = {}): ComponentId {
  return {
    tool: 'claude-code',
    type: 'mcp-server',
    name: 'test-server',
    scope: 'user',
    ...overrides,
  };
}

function makeComponent(overrides: Partial<Component> = {}): Component {
  return {
    id: makeId(),
    enabled: true,
    tracking: 'detected',
    core: { transport: 'stdio', command: 'npx test-server' },
    ...overrides,
  };
}

function makeToolResult(overrides: Partial<ToolDetectionResult> = {}): ToolDetectionResult {
  return {
    toolId: 'claude-code',
    instanceId: 'claude-code',
    path: '/mock/path',
    detected: true,
    configPaths: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  useToolStore.setState({
    tools: [],
    components: [],
    plugins: [],
    loading: false,
    scanning: false,
    error: null,
  });
  useUiStore.setState({
    searchQuery: '',
    toolFilters: [],
    typeFilters: [],
  });
});

// ---------------------------------------------------------------------------
// pluginGroups in tool groups
// ---------------------------------------------------------------------------

describe('useComponents — pluginGroups', () => {
  it('separates standalone and plugin components', () => {
    const standalone = makeComponent({
      id: makeId({ name: 'standalone-server', scope: 'user' }),
    });
    const pluginComp = makeComponent({
      id: makeId({ name: 'plugin-server', scope: 'plugin' }),
      extensions: { pluginKey: 'my-plugin@marketplace' },
    });

    useToolStore.setState({
      tools: [makeToolResult()],
      components: [standalone, pluginComp],
    });

    const { result } = renderHook(() => useComponents());

    expect(result.current.toolGroups).toHaveLength(1);
    const group = result.current.toolGroups[0];
    expect(group.components).toHaveLength(1);
    expect(group.components[0].id.name).toBe('standalone-server');
    expect(group.pluginGroups).toHaveLength(1);
    expect(group.pluginGroups[0].pluginKey).toBe('my-plugin@marketplace');
    expect(group.pluginGroups[0].components).toHaveLength(1);
    expect(group.totalCount).toBe(2);
  });

  it('groups multiple plugin components by pluginKey', () => {
    const comp1 = makeComponent({
      id: makeId({ name: 'comp-1', scope: 'plugin' }),
      extensions: { pluginKey: 'alpha@mkt' },
    });
    const comp2 = makeComponent({
      id: makeId({ name: 'comp-2', scope: 'plugin' }),
      extensions: { pluginKey: 'alpha@mkt' },
    });
    const comp3 = makeComponent({
      id: makeId({ name: 'comp-3', scope: 'plugin' }),
      extensions: { pluginKey: 'beta@mkt' },
    });

    useToolStore.setState({
      tools: [makeToolResult()],
      components: [comp1, comp2, comp3],
    });

    const { result } = renderHook(() => useComponents());

    const group = result.current.toolGroups[0];
    expect(group.pluginGroups).toHaveLength(2);
    expect(group.pluginGroups[0].pluginKey).toBe('alpha@mkt');
    expect(group.pluginGroups[0].components).toHaveLength(2);
    expect(group.pluginGroups[1].pluginKey).toBe('beta@mkt');
    expect(group.pluginGroups[1].components).toHaveLength(1);
  });

  it('parses pluginName and marketplace from pluginKey', () => {
    const comp = makeComponent({
      id: makeId({ name: 'comp-1', scope: 'plugin' }),
      extensions: { pluginKey: 'my-plugin@my-marketplace' },
    });

    useToolStore.setState({
      tools: [makeToolResult()],
      components: [comp],
    });

    const { result } = renderHook(() => useComponents());

    const pg = result.current.toolGroups[0].pluginGroups[0];
    expect(pg.pluginName).toBe('my-plugin');
    expect(pg.marketplace).toBe('my-marketplace');
  });

  it('handles pluginKey without @ separator', () => {
    const comp = makeComponent({
      id: makeId({ name: 'comp-1', scope: 'plugin' }),
      extensions: { pluginKey: 'simple-key' },
    });

    useToolStore.setState({
      tools: [makeToolResult()],
      components: [comp],
    });

    const { result } = renderHook(() => useComponents());

    const pg = result.current.toolGroups[0].pluginGroups[0];
    expect(pg.pluginName).toBe('simple-key');
    expect(pg.marketplace).toBe('');
  });

  it('returns empty pluginGroups when no plugin-scoped components exist', () => {
    const standalone = makeComponent({
      id: makeId({ name: 'standalone', scope: 'user' }),
    });

    useToolStore.setState({
      tools: [makeToolResult()],
      components: [standalone],
    });

    const { result } = renderHook(() => useComponents());

    expect(result.current.toolGroups[0].pluginGroups).toHaveLength(0);
    expect(result.current.toolGroups[0].components).toHaveLength(1);
  });

  it('sorts pluginGroups by pluginKey', () => {
    const comp1 = makeComponent({
      id: makeId({ name: 'comp-z', scope: 'plugin' }),
      extensions: { pluginKey: 'zebra@mkt' },
    });
    const comp2 = makeComponent({
      id: makeId({ name: 'comp-a', scope: 'plugin' }),
      extensions: { pluginKey: 'alpha@mkt' },
    });

    useToolStore.setState({
      tools: [makeToolResult()],
      components: [comp1, comp2],
    });

    const { result } = renderHook(() => useComponents());

    const keys = result.current.toolGroups[0].pluginGroups.map((pg) => pg.pluginKey);
    expect(keys).toEqual(['alpha@mkt', 'zebra@mkt']);
  });
});

// ---------------------------------------------------------------------------
// search matches plugin name
// ---------------------------------------------------------------------------

describe('useComponents — search matches plugin name', () => {
  it('includes all sub-components when search matches a pluginKey', () => {
    const comp1 = makeComponent({
      id: makeId({ name: 'server-a', scope: 'plugin' }),
      extensions: { pluginKey: 'my-plugin@mkt' },
      displayName: 'Server A',
    });
    const comp2 = makeComponent({
      id: makeId({ name: 'server-b', scope: 'plugin' }),
      extensions: { pluginKey: 'my-plugin@mkt' },
      displayName: 'Unrelated Name',
      description: 'does not mention the plugin by its component fields',
    });
    const comp3 = makeComponent({
      id: makeId({ name: 'other-server', scope: 'user' }),
      displayName: 'Other',
    });

    useToolStore.setState({
      tools: [makeToolResult()],
      components: [comp1, comp2, comp3],
    });
    useUiStore.setState({ searchQuery: 'my-plugin' });

    const { result } = renderHook(() => useComponents());

    // comp1 matches directly (pluginKey contains 'my-plugin')
    // comp2 should be included because it shares the same pluginKey
    // comp3 should not match
    const names = result.current.filteredComponents.map((c) => c.id.name);
    expect(names).toContain('server-a');
    expect(names).toContain('server-b');
    expect(names).not.toContain('other-server');
  });
});
