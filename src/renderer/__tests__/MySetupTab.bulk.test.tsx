// 7A-app/src/renderer/__tests__/MySetupTab.bulk.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MySetupTab } from '../components/my-setup/MySetupTab';
import { useUiStore } from '../stores/ui-store';
import { useToolStore } from '../stores/tool-store';
import type { Component } from '@shared/types';

function makeComp(name: string): Component {
  return {
    id: { tool: 'claude-code', type: 'mcp-server', name, scope: 'user' },
    enabled: true,
    tracking: 'detected',
    core: { transport: 'stdio', command: name },
  };
}

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
    updatePanelOpen: false,
    updatePanelScrollTo: null,
    selectionMode: false,
    selectedIds: [],
    bulkOperationProgress: null,
  });
  useToolStore.setState({
    tools: [{ toolId: 'claude-code', instanceId: 'cc-1', detected: true, path: '/usr/bin/claude' }],
    components: [makeComp('a'), makeComp('b'), makeComp('c')],
    plugins: [],
    scanning: false,
    loading: false,
    error: null,
  });
  vi.clearAllMocks();
});

describe('MySetupTab selection mode', () => {
  it('renders Select button in toolbar', () => {
    render(<MySetupTab />);
    expect(screen.getByText(/Select/)).toBeDefined();
  });

  it('entering selection mode shows Selecting button', () => {
    render(<MySetupTab />);
    fireEvent.click(screen.getByText(/Select/));
    expect(useUiStore.getState().selectionMode).toBe(true);
  });

  it('Escape exits selection mode', () => {
    useUiStore.setState({ selectionMode: true });
    render(<MySetupTab />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useUiStore.getState().selectionMode).toBe(false);
  });

  it('shows BulkActionBar when items selected', () => {
    const comp = makeComp('a');
    useUiStore.setState({ selectionMode: true, selectedIds: [comp.id] });
    render(<MySetupTab />);
    expect(screen.getByRole('toolbar', { name: /bulk/i })).toBeDefined();
  });
});
