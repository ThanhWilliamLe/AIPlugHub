/**
 * Tests for project-scope grouping in useComponents hook (USR-03).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useToolStore } from '../stores/tool-store';
import { useUiStore } from '../stores/ui-store';
import { useComponents } from '../hooks/useComponents';
import type { Component, ToolDetectionResult } from '@shared/types';

const tool: ToolDetectionResult = {
  toolId: 'claude-code',
  instanceId: 'cc-1',
  path: '/home/.claude',
  detected: true,
};

const userComponent: Component = {
  id: { tool: 'claude-code', type: 'mcp-server', name: 'sqlite', scope: 'user' },
  core: { transport: 'stdio', command: 'sqlite' },
  tracking: 'detected',
};

const projectComponent1: Component = {
  id: { tool: 'claude-code', type: 'mcp-server', name: 'db-mcp', scope: 'project' },
  core: { transport: 'stdio', command: 'db' },
  tracking: 'detected',
  projectPath: '/work/my-app',
};

const projectComponent2: Component = {
  id: { tool: 'claude-code', type: 'skill', name: 'deploy', scope: 'project' },
  core: { description: 'Deploy skill', content: '# deploy' },
  tracking: 'detected',
  projectPath: '/work/my-app',
};

const projectComponent3: Component = {
  id: { tool: 'claude-code', type: 'hook', name: 'lint::0::0', scope: 'project' },
  core: { event: 'lint', handler: { type: 'command', command: 'npm lint' } },
  tracking: 'detected',
  projectPath: '/work/other-project',
};

const pluginComponent: Component = {
  id: { tool: 'claude-code', type: 'skill', name: 'review', scope: 'plugin' },
  core: { description: '', content: '' },
  tracking: 'detected',
  extensions: { pluginKey: 'superpowers@market' },
};

beforeEach(() => {
  useToolStore.setState({
    tools: [tool],
    components: [userComponent, projectComponent1, projectComponent2, projectComponent3, pluginComponent],
    scanning: false,
  });
  useUiStore.setState({ searchQuery: '', toolFilters: [], typeFilters: [] });
});

describe('useComponents project grouping', () => {
  it('creates project groups from project-scope components', () => {
    const { result } = renderHook(() => useComponents());
    const ccGroup = result.current.toolGroups.find((g) => g.toolId === 'claude-code');

    expect(ccGroup).toBeDefined();
    expect(ccGroup!.projectGroups).toHaveLength(2);
    expect(ccGroup!.projectGroups.map((g) => g.projectName).sort()).toEqual([
      'my-app',
      'other-project',
    ]);
  });

  it('groups project components by projectPath', () => {
    const { result } = renderHook(() => useComponents());
    const ccGroup = result.current.toolGroups.find((g) => g.toolId === 'claude-code')!;
    const myApp = ccGroup.projectGroups.find((g) => g.projectName === 'my-app');

    expect(myApp).toBeDefined();
    expect(myApp!.components).toHaveLength(2);
    expect(myApp!.components.map((c) => c.id.name).sort()).toEqual(['db-mcp', 'deploy']);
  });

  it('separates project components from standalone user-scope components', () => {
    const { result } = renderHook(() => useComponents());
    const ccGroup = result.current.toolGroups.find((g) => g.toolId === 'claude-code')!;

    // Standalone = only user-scope components not in plugin or project groups
    expect(ccGroup.components).toHaveLength(1);
    expect(ccGroup.components[0].id.name).toBe('sqlite');
  });

  it('excludes project components from tool totalCount (shown as top-level sections)', () => {
    const { result } = renderHook(() => useComponents());
    const ccGroup = result.current.toolGroups.find((g) => g.toolId === 'claude-code')!;

    // 1 user + 1 plugin = 2 (project components are separate top-level sections)
    expect(ccGroup.totalCount).toBe(2);
  });

  it('exposes projectGroups at top level for rendering as siblings of tools', () => {
    const { result } = renderHook(() => useComponents());
    expect(result.current.projectGroups.length).toBeGreaterThan(0);
    const myApp = result.current.projectGroups.find((g) => g.projectName === 'my-app');
    expect(myApp).toBeDefined();
    expect(myApp!.components).toHaveLength(2);
  });

  it('keeps plugin groups separate from project groups', () => {
    const { result } = renderHook(() => useComponents());
    const ccGroup = result.current.toolGroups.find((g) => g.toolId === 'claude-code')!;

    expect(ccGroup.pluginGroups).toHaveLength(1);
    expect(ccGroup.pluginGroups[0].pluginKey).toBe('superpowers@market');
  });

  it('includes project components in search results', () => {
    useUiStore.setState({ searchQuery: 'deploy' });
    const { result } = renderHook(() => useComponents());

    expect(result.current.filteredCount).toBeGreaterThanOrEqual(1);
    const projectComps = result.current.filteredComponents.filter(
      (c) => c.id.scope === 'project' && c.id.name === 'deploy',
    );
    expect(projectComps).toHaveLength(1);
  });

  it('handles no project components gracefully', () => {
    useToolStore.setState({
      tools: [tool],
      components: [userComponent, pluginComponent],
      scanning: false,
    });

    const { result } = renderHook(() => useComponents());
    const ccGroup = result.current.toolGroups.find((g) => g.toolId === 'claude-code')!;

    expect(ccGroup.projectGroups).toHaveLength(0);
  });

  it('derives project name from last path segment', () => {
    const deepPathComponent: Component = {
      id: { tool: 'claude-code', type: 'skill', name: 'test', scope: 'project' },
      core: { description: '', content: '' },
      tracking: 'detected',
      projectPath: 'D:\\Work\\deeply\\nested\\project-name',
    };

    useToolStore.setState({
      tools: [tool],
      components: [deepPathComponent],
      scanning: false,
    });

    const { result } = renderHook(() => useComponents());
    const ccGroup = result.current.toolGroups.find((g) => g.toolId === 'claude-code')!;

    expect(ccGroup.projectGroups[0].projectName).toBe('project-name');
  });
});
