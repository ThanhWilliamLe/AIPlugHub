import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { BrowseDetailPanel } from '@renderer/components/browse/BrowseDetailPanel';
import { useBrowseStore } from '@renderer/stores/browse-store';
import { useToolStore } from '@renderer/stores/tool-store';
import type { MarketplaceEntry, MarketplaceDetail } from '@shared/types';

const MOCK_ENTRY: MarketplaceEntry = {
  name: 'sqlite-mcp',
  sourceId: 'claude-official',
  ref: 'sqlite-mcp',
  displayName: 'SQLite MCP Server',
  description: 'SQLite database MCP server',
  author: 'Anthropic',
  version: '1.2.0',
  tools: ['claude-code'],
  componentCounts: { 'mcp-server': 1 },
};

const MOCK_DETAIL: MarketplaceDetail = {
  entry: MOCK_ENTRY,
  longDescription: 'A comprehensive SQLite MCP server for database operations.',
  repository: 'https://github.com/anthropics/sqlite-mcp',
  license: 'MIT',
  components: [
    {
      type: 'mcp-server',
      name: 'sqlite-mcp',
      description: 'SQLite MCP server',
      core: { transport: 'stdio', command: 'sqlite-mcp-server' },
    },
  ],
  installSource: { type: 'marketplace', marketplace: 'claude-official', ref: 'sqlite-mcp' },
};

function resetStores() {
  useBrowseStore.setState({
    entries: [MOCK_ENTRY],
    selectedRef: null,
    detail: null,
    detailLoading: false,
    detailError: null,
    installingRef: null,
    installError: null,
    lastInstalledRef: null,
    searchQuery: '',
    toolFilters: [],
    typeFilters: [],
    sortBy: 'name',
    isLoading: false,
    error: null,
    isOffline: false,
    cacheDate: null,
  });
  useToolStore.setState({
    tools: [{ toolId: 'claude-code', instanceId: 'cc', path: '/test', detected: true }],
    components: [],
    loading: false,
    scanning: false,
    error: null,
  });
}

beforeEach(resetStores);

describe('BrowseDetailPanel', () => {
  it('renders nothing when no ref is selected', () => {
    const { container } = render(<BrowseDetailPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('renders panel when ref is selected with entry data', () => {
    useBrowseStore.setState({
      selectedRef: { sourceId: 'claude-official', ref: 'sqlite-mcp' },
    });
    render(<BrowseDetailPanel />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('SQLite MCP Server')).toBeInTheDocument();
  });

  it('shows loading state when fetching detail', () => {
    useBrowseStore.setState({
      selectedRef: { sourceId: 'claude-official', ref: 'sqlite-mcp' },
      detailLoading: true,
    });
    render(<BrowseDetailPanel />);
    expect(screen.getByText(/loading details/i)).toBeInTheDocument();
  });

  it('shows error state when detail fetch fails', () => {
    useBrowseStore.setState({
      selectedRef: { sourceId: 'claude-official', ref: 'sqlite-mcp' },
      detailError: 'Network error',
    });
    render(<BrowseDetailPanel />);
    expect(screen.getByText(/couldn't load plugin details/i)).toBeInTheDocument();
    expect(screen.getByText(/retry/i)).toBeInTheDocument();
  });

  it('shows full detail when loaded', () => {
    useBrowseStore.setState({
      selectedRef: { sourceId: 'claude-official', ref: 'sqlite-mcp' },
      detail: MOCK_DETAIL,
    });
    render(<BrowseDetailPanel />);
    expect(
      screen.getByText('A comprehensive SQLite MCP server for database operations.'),
    ).toBeInTheDocument();
    expect(screen.getByText('MIT')).toBeInTheDocument();
    expect(screen.getByText('sqlite-mcp')).toBeInTheDocument(); // component name
  });

  it('shows component counts from entry when detail not loaded', () => {
    useBrowseStore.setState({
      selectedRef: { sourceId: 'claude-official', ref: 'sqlite-mcp' },
      detail: null,
    });
    render(<BrowseDetailPanel />);
    expect(screen.getByText('MCP Server')).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  it('shows compatible tools badges', () => {
    useBrowseStore.setState({
      selectedRef: { sourceId: 'claude-official', ref: 'sqlite-mcp' },
    });
    render(<BrowseDetailPanel />);
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
  });

  it('closes on Escape key', async () => {
    const user = userEvent.setup();
    useBrowseStore.setState({
      selectedRef: { sourceId: 'claude-official', ref: 'sqlite-mcp' },
    });
    render(<BrowseDetailPanel />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(useBrowseStore.getState().selectedRef).toBeNull();
  });

  it('closes when close button is clicked', async () => {
    const user = userEvent.setup();
    useBrowseStore.setState({
      selectedRef: { sourceId: 'claude-official', ref: 'sqlite-mcp' },
    });
    render(<BrowseDetailPanel />);

    await user.click(screen.getByLabelText(/close panel/i));
    expect(useBrowseStore.getState().selectedRef).toBeNull();
  });

  it('shows install button', () => {
    useBrowseStore.setState({
      selectedRef: { sourceId: 'claude-official', ref: 'sqlite-mcp' },
    });
    render(<BrowseDetailPanel />);
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
  });

  it('detects isInstalled by matching name + tool', () => {
    useToolStore.setState({
      components: [
        {
          id: { tool: 'claude-code', type: 'mcp-server', name: 'sqlite-mcp', scope: 'user' },
          tracking: 'detected',
          core: { transport: 'stdio' as const, command: 'sqlite' },
          version: '1.0.0',
        },
      ],
    });
    useBrowseStore.setState({
      selectedRef: { sourceId: 'claude-official', ref: 'sqlite-mcp' },
    });
    render(<BrowseDetailPanel />);
    // InstallButton should show "Installed" when component matches by name + tool
    expect(screen.getByRole('button', { name: /installed/i })).toBeInTheDocument();
  });

  it('does not mark as installed when name matches but tool does not', () => {
    useToolStore.setState({
      components: [
        {
          id: { tool: 'gemini-cli', type: 'mcp-server', name: 'sqlite-mcp', scope: 'user' },
          tracking: 'detected',
          core: { transport: 'stdio' as const, command: 'sqlite' },
        },
      ],
    });
    useBrowseStore.setState({
      selectedRef: { sourceId: 'claude-official', ref: 'sqlite-mcp' },
    });
    render(<BrowseDetailPanel />);
    // gemini-cli is not in MOCK_ENTRY.tools (['claude-code']), so NOT installed
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^installed/i })).not.toBeInTheDocument();
  });

  it('retry button calls openDetail on click', async () => {
    const user = userEvent.setup();
    const ref = { sourceId: 'claude-official', ref: 'sqlite-mcp' };
    useBrowseStore.setState({
      selectedRef: ref,
      detailError: 'Failed to load',
    });
    const openDetailSpy = vi.spyOn(useBrowseStore.getState(), 'openDetail');
    render(<BrowseDetailPanel />);
    await user.click(screen.getByText(/retry/i));
    expect(openDetailSpy).toHaveBeenCalledWith(ref);
  });

  it('shows last updated date when available', () => {
    useBrowseStore.setState({
      selectedRef: { sourceId: 'claude-official', ref: 'sqlite-mcp' },
      detail: MOCK_DETAIL,
      entries: [{ ...MOCK_ENTRY, lastUpdated: '2026-01-15T00:00:00Z' }],
    });
    render(<BrowseDetailPanel />);
    expect(screen.getByText('Updated')).toBeInTheDocument();
  });
});
