import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUiStore } from '../stores/ui-store';
import type { ComponentId } from '@shared/types';

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

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  useUiStore.setState({
    activeTab: 'my-setup',
    searchQuery: '',
    toolFilters: [],
    typeFilters: [],
    selectedComponentId: null,
    showSettings: false,
    showFirstRun: false,
    showUninstallConfirm: null,
  });
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// setActiveTab
// ---------------------------------------------------------------------------

describe('setActiveTab', () => {
  it('changes activeTab to browse', () => {
    useUiStore.getState().setActiveTab('browse');

    expect(useUiStore.getState().activeTab).toBe('browse');
  });

  it('changes activeTab to transfer', () => {
    useUiStore.getState().setActiveTab('transfer');

    expect(useUiStore.getState().activeTab).toBe('transfer');
  });

  it('changes activeTab back to my-setup', () => {
    useUiStore.setState({ activeTab: 'browse' });

    useUiStore.getState().setActiveTab('my-setup');

    expect(useUiStore.getState().activeTab).toBe('my-setup');
  });

  it('clears selectedComponentId when changing tab', () => {
    useUiStore.setState({ selectedComponentId: makeId() });

    useUiStore.getState().setActiveTab('browse');

    expect(useUiStore.getState().selectedComponentId).toBeNull();
  });

  it('clears selectedComponentId even when switching to the same tab', () => {
    useUiStore.setState({ activeTab: 'my-setup', selectedComponentId: makeId() });

    useUiStore.getState().setActiveTab('my-setup');

    expect(useUiStore.getState().selectedComponentId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// selectComponent
// ---------------------------------------------------------------------------

describe('selectComponent', () => {
  it('sets selectedComponentId', () => {
    const id = makeId();

    useUiStore.getState().selectComponent(id);

    expect(useUiStore.getState().selectedComponentId).toEqual(id);
  });

  it('can set selectedComponentId to null (deselect)', () => {
    useUiStore.setState({ selectedComponentId: makeId() });

    useUiStore.getState().selectComponent(null);

    expect(useUiStore.getState().selectedComponentId).toBeNull();
  });

  it('replaces an existing selection', () => {
    const idA = makeId({ name: 'server-a' });
    const idB = makeId({ name: 'server-b' });
    useUiStore.setState({ selectedComponentId: idA });

    useUiStore.getState().selectComponent(idB);

    expect(useUiStore.getState().selectedComponentId).toEqual(idB);
  });
});

// ---------------------------------------------------------------------------
// setShowSettings
// ---------------------------------------------------------------------------

describe('setShowSettings', () => {
  it('sets showSettings to true', () => {
    useUiStore.getState().setShowSettings(true);

    expect(useUiStore.getState().showSettings).toBe(true);
  });

  it('sets showSettings to false', () => {
    useUiStore.setState({ showSettings: true });

    useUiStore.getState().setShowSettings(false);

    expect(useUiStore.getState().showSettings).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setShowFirstRun
// ---------------------------------------------------------------------------

describe('setShowFirstRun', () => {
  it('sets showFirstRun to true', () => {
    useUiStore.getState().setShowFirstRun(true);

    expect(useUiStore.getState().showFirstRun).toBe(true);
  });

  it('sets showFirstRun to false', () => {
    useUiStore.setState({ showFirstRun: true });

    useUiStore.getState().setShowFirstRun(false);

    expect(useUiStore.getState().showFirstRun).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setShowUninstallConfirm
// ---------------------------------------------------------------------------

describe('setShowUninstallConfirm', () => {
  it('sets showUninstallConfirm to a ComponentId', () => {
    const id = makeId();

    useUiStore.getState().setShowUninstallConfirm(id);

    expect(useUiStore.getState().showUninstallConfirm).toEqual(id);
  });

  it('sets showUninstallConfirm to null (dismisses confirm)', () => {
    useUiStore.setState({ showUninstallConfirm: makeId() });

    useUiStore.getState().setShowUninstallConfirm(null);

    expect(useUiStore.getState().showUninstallConfirm).toBeNull();
  });

  it('replaces an existing ComponentId', () => {
    const idA = makeId({ name: 'server-a' });
    const idB = makeId({ name: 'server-b' });
    useUiStore.setState({ showUninstallConfirm: idA });

    useUiStore.getState().setShowUninstallConfirm(idB);

    expect(useUiStore.getState().showUninstallConfirm).toEqual(idB);
  });
});

// ---------------------------------------------------------------------------
// setSearchQuery
// ---------------------------------------------------------------------------

describe('setSearchQuery', () => {
  it('updates searchQuery', () => {
    useUiStore.getState().setSearchQuery('my filter');

    expect(useUiStore.getState().searchQuery).toBe('my filter');
  });

  it('accepts empty string', () => {
    useUiStore.setState({ searchQuery: 'previous' });

    useUiStore.getState().setSearchQuery('');

    expect(useUiStore.getState().searchQuery).toBe('');
  });

  it('does not affect other state', () => {
    useUiStore.setState({ toolFilters: ['claude-code'] });

    useUiStore.getState().setSearchQuery('test');

    expect(useUiStore.getState().toolFilters).toEqual(['claude-code']);
  });
});

// ---------------------------------------------------------------------------
// toggleToolFilter
// ---------------------------------------------------------------------------

describe('toggleToolFilter', () => {
  it('adds toolId when not in filter list', () => {
    useUiStore.getState().toggleToolFilter('claude-code');

    expect(useUiStore.getState().toolFilters).toContain('claude-code');
  });

  it('removes toolId when already in filter list', () => {
    useUiStore.setState({ toolFilters: ['claude-code'] });

    useUiStore.getState().toggleToolFilter('claude-code');

    expect(useUiStore.getState().toolFilters).not.toContain('claude-code');
  });

  it('preserves other toolIds when removing one', () => {
    useUiStore.setState({ toolFilters: ['claude-code', 'claude-desktop'] });

    useUiStore.getState().toggleToolFilter('claude-code');

    expect(useUiStore.getState().toolFilters).toEqual(['claude-desktop']);
  });

  it('accumulates multiple distinct toolIds', () => {
    useUiStore.getState().toggleToolFilter('claude-code');
    useUiStore.getState().toggleToolFilter('gemini-cli');

    expect(useUiStore.getState().toolFilters).toHaveLength(2);
    expect(useUiStore.getState().toolFilters).toContain('claude-code');
    expect(useUiStore.getState().toolFilters).toContain('gemini-cli');
  });

  it('round-trips add then remove back to empty', () => {
    useUiStore.getState().toggleToolFilter('claude-code');
    useUiStore.getState().toggleToolFilter('claude-code');

    expect(useUiStore.getState().toolFilters).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// toggleTypeFilter
// ---------------------------------------------------------------------------

describe('toggleTypeFilter', () => {
  it('adds type when not in filter list', () => {
    useUiStore.getState().toggleTypeFilter('mcp-server');

    expect(useUiStore.getState().typeFilters).toContain('mcp-server');
  });

  it('removes type when already in filter list', () => {
    useUiStore.setState({ typeFilters: ['mcp-server'] });

    useUiStore.getState().toggleTypeFilter('mcp-server');

    expect(useUiStore.getState().typeFilters).not.toContain('mcp-server');
  });

  it('preserves other types when removing one', () => {
    useUiStore.setState({ typeFilters: ['mcp-server', 'skill'] });

    useUiStore.getState().toggleTypeFilter('mcp-server');

    expect(useUiStore.getState().typeFilters).toEqual(['skill']);
  });

  it('accumulates multiple distinct types', () => {
    useUiStore.getState().toggleTypeFilter('mcp-server');
    useUiStore.getState().toggleTypeFilter('skill');

    expect(useUiStore.getState().typeFilters).toHaveLength(2);
  });

  it('round-trips add then remove back to empty', () => {
    useUiStore.getState().toggleTypeFilter('skill');
    useUiStore.getState().toggleTypeFilter('skill');

    expect(useUiStore.getState().typeFilters).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// clearFilters
// ---------------------------------------------------------------------------

describe('clearFilters', () => {
  it('resets searchQuery to empty string', () => {
    useUiStore.setState({ searchQuery: 'old query' });

    useUiStore.getState().clearFilters();

    expect(useUiStore.getState().searchQuery).toBe('');
  });

  it('resets toolFilters to empty array', () => {
    useUiStore.setState({ toolFilters: ['claude-code', 'gemini-cli'] });

    useUiStore.getState().clearFilters();

    expect(useUiStore.getState().toolFilters).toEqual([]);
  });

  it('resets typeFilters to empty array', () => {
    useUiStore.setState({ typeFilters: ['mcp-server', 'skill'] });

    useUiStore.getState().clearFilters();

    expect(useUiStore.getState().typeFilters).toEqual([]);
  });

  it('clears all three filter state fields simultaneously', () => {
    useUiStore.setState({
      searchQuery: 'search',
      toolFilters: ['claude-code'],
      typeFilters: ['mcp-server'],
    });

    useUiStore.getState().clearFilters();

    const state = useUiStore.getState();
    expect(state.searchQuery).toBe('');
    expect(state.toolFilters).toEqual([]);
    expect(state.typeFilters).toEqual([]);
  });

  it('does not affect non-filter state', () => {
    useUiStore.setState({ activeTab: 'browse', showSettings: true });

    useUiStore.getState().clearFilters();

    expect(useUiStore.getState().activeTab).toBe('browse');
    expect(useUiStore.getState().showSettings).toBe(true);
  });
});
