import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../App';
import { useToolStore } from '@renderer/stores/tool-store';
import { useUiStore } from '@renderer/stores/ui-store';

// Reset stores between tests
beforeEach(() => {
  useToolStore.setState({
    tools: [],
    components: [],
    loading: false,
    scanning: false,
    error: null,
  });
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
  vi.mocked(window.aiplughub.tools.detect).mockResolvedValue([]);
  vi.mocked(window.aiplughub.tools.scanAll).mockResolvedValue([]);
});

describe('App', () => {
  it('renders the app and shows first-run when no tools detected', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/find your AI tools/i)).toBeInTheDocument();
    });
  });

  it('renders My Setup tab when tools are detected', async () => {
    vi.mocked(window.aiplughub.tools.detect).mockResolvedValue([
      {
        toolId: 'claude-code',
        instanceId: 'cc-default',
        path: '/home/user/.claude',
        detected: true,
      },
    ]);
    vi.mocked(window.aiplughub.tools.scanAll).mockResolvedValue([]);

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('AI Plug Hub')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'My Setup' })).toBeInTheDocument();
    });
  });

  it('shows tab bar with three tabs', async () => {
    // Pre-set state so first-run is skipped
    useUiStore.setState({ showFirstRun: false });
    useToolStore.setState({
      tools: [
        { toolId: 'claude-code', instanceId: 'cc', path: '/test', detected: true },
      ],
      loading: false,
    });

    render(<App />);
    expect(screen.getByRole('tab', { name: 'My Setup' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Browse' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Transfer' })).toBeInTheDocument();
  });
});
