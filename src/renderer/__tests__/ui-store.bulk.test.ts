import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from '../stores/ui-store';
import type { ComponentId } from '@shared/types';
import { MAX_BULK_SELECTION } from '@shared/constants';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeId(overrides: Partial<ComponentId> = {}): ComponentId {
  return { tool: 'claude-code', type: 'mcp-server', name: 'test', scope: 'user', ...overrides };
}

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  useUiStore.setState({
    selectionMode: false,
    selectedIds: [],
    bulkOperationProgress: null,
  });
});

// ---------------------------------------------------------------------------
// enterSelectionMode
// ---------------------------------------------------------------------------

describe('enterSelectionMode', () => {
  it('sets selectionMode to true', () => {
    useUiStore.getState().enterSelectionMode();

    expect(useUiStore.getState().selectionMode).toBe(true);
  });

  it('clears stale bulkOperationProgress', () => {
    useUiStore.setState({
      bulkOperationProgress: {
        action: 'enable',
        total: 5,
        completed: 5,
        errors: [],
      },
    });

    useUiStore.getState().enterSelectionMode();

    expect(useUiStore.getState().bulkOperationProgress).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// exitSelectionMode
// ---------------------------------------------------------------------------

describe('exitSelectionMode', () => {
  it('clears mode and selections', () => {
    useUiStore.setState({
      selectionMode: true,
      selectedIds: [makeId()],
      bulkOperationProgress: {
        action: 'disable',
        total: 1,
        completed: 1,
        errors: [],
      },
    });

    useUiStore.getState().exitSelectionMode();

    const state = useUiStore.getState();
    expect(state.selectionMode).toBe(false);
    expect(state.selectedIds).toEqual([]);
    expect(state.bulkOperationProgress).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// toggleSelectId
// ---------------------------------------------------------------------------

describe('toggleSelectId', () => {
  it('adds an id', () => {
    const id = makeId();
    useUiStore.getState().toggleSelectId(id);

    expect(useUiStore.getState().selectedIds).toEqual([id]);
  });

  it('removes an existing id', () => {
    const id = makeId();
    useUiStore.setState({ selectedIds: [id] });

    useUiStore.getState().toggleSelectId(id);

    expect(useUiStore.getState().selectedIds).toEqual([]);
  });

  it('uses componentIdKey with projectPath (two ids with different projectPath should both be in selectedIds)', () => {
    const idA = makeId({ scope: 'project', projectPath: '/path/a' });
    const idB = makeId({ scope: 'project', projectPath: '/path/b' });

    useUiStore.getState().toggleSelectId(idA);
    useUiStore.getState().toggleSelectId(idB);

    expect(useUiStore.getState().selectedIds).toHaveLength(2);
    expect(useUiStore.getState().selectedIds).toEqual([idA, idB]);
  });
});

// ---------------------------------------------------------------------------
// setSelectedIds
// ---------------------------------------------------------------------------

describe('setSelectedIds', () => {
  it('replaces the full array', () => {
    const ids = [makeId({ name: 'a' }), makeId({ name: 'b' })];
    useUiStore.setState({ selectedIds: [makeId({ name: 'old' })] });

    useUiStore.getState().setSelectedIds(ids);

    expect(useUiStore.getState().selectedIds).toEqual(ids);
  });

  it('caps at MAX_BULK_SELECTION (250 items -> 200)', () => {
    const ids = Array.from({ length: 250 }, (_, i) => makeId({ name: `item-${i}` }));

    useUiStore.getState().setSelectedIds(ids);

    expect(useUiStore.getState().selectedIds).toHaveLength(MAX_BULK_SELECTION);
  });
});

// ---------------------------------------------------------------------------
// clearSelection
// ---------------------------------------------------------------------------

describe('clearSelection', () => {
  it('clears ids but keeps mode', () => {
    useUiStore.setState({ selectionMode: true, selectedIds: [makeId()] });

    useUiStore.getState().clearSelection();

    const state = useUiStore.getState();
    expect(state.selectedIds).toEqual([]);
    expect(state.selectionMode).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// setActiveTab resets selection mode
// ---------------------------------------------------------------------------

describe('setActiveTab resets selection', () => {
  it('resets selection mode when changing tab', () => {
    useUiStore.setState({ selectionMode: true, selectedIds: [makeId()] });

    useUiStore.getState().setActiveTab('browse');

    const state = useUiStore.getState();
    expect(state.selectionMode).toBe(false);
    expect(state.selectedIds).toEqual([]);
  });
});
