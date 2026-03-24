import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowseTab } from '@renderer/components/browse/BrowseTab';
import { useBrowseStore } from '@renderer/stores/browse-store';
import { useToolStore } from '@renderer/stores/tool-store';
import type { MarketplaceEntry } from '@shared/types';

const MOCK_ENTRIES: MarketplaceEntry[] = [
  {
    name: 'sqlite-mcp',
    sourceId: 'claude-official',
    ref: 'sqlite-mcp',
    description: 'SQLite database MCP server',
    author: 'Anthropic',
    version: '1.2.0',
    tools: ['claude-code'],
    componentCounts: { 'mcp-server': 1 },
    keywords: ['database', 'sql'],
  },
  {
    name: 'code-review-skill',
    sourceId: 'claude-official',
    ref: 'code-review-skill',
    description: 'Automated code review skill',
    author: 'Community',
    version: '0.5.0',
    tools: ['claude-code', 'gemini-cli'],
    componentCounts: { skill: 1 },
    keywords: ['review', 'quality'],
  },
  {
    name: 'desktop-postgres',
    sourceId: 'custom-index',
    ref: 'desktop-postgres',
    description: 'PostgreSQL MCP server for Claude Desktop',
    tools: ['claude-desktop'],
    componentCounts: { 'mcp-server': 1 },
  },
];

function resetStores() {
  useBrowseStore.setState({
    entries: [],
    searchQuery: '',
    toolFilters: [],
    typeFilters: [],
    sortBy: 'name',
    isLoading: false,
    error: null,
    isOffline: false,
    cacheDate: null,
    selectedRef: null,
    detail: null,
    detailLoading: false,
    detailError: null,
    installingRef: null,
    installError: null,
    lastInstalledRef: null,
  });
  useToolStore.setState({
    tools: [{ toolId: 'claude-code', instanceId: 'cc', path: '/test', detected: true }],
    components: [],
    loading: false,
    scanning: false,
    error: null,
  });
}

beforeEach(() => {
  resetStores();
  vi.mocked(window.aiplughub.browse.getEntries).mockResolvedValue(MOCK_ENTRIES);
  // Dismiss Getting Started overlay so browse content is visible for these tests
  vi.mocked(window.aiplughub.preferences.get).mockResolvedValue({
    rescanOnLaunch: false,
    setupComplete: true,
    gettingStartedDismissed: true,
  });
});

describe('BrowseTab', () => {
  it('shows loading state initially', () => {
    useBrowseStore.setState({ isLoading: true, entries: [] });
    render(<BrowseTab />);
    expect(screen.getByText(/loading marketplace/i)).toBeInTheDocument();
  });

  it('loads and displays plugin entries', async () => {
    render(<BrowseTab />);
    await waitFor(() => {
      // Entries may appear in both the Featured section and the main list
      expect(screen.getAllByText('sqlite-mcp').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('code-review-skill').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('desktop-postgres').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows error state when fetch fails with no cached data', async () => {
    vi.mocked(window.aiplughub.browse.getEntries).mockRejectedValueOnce(new Error('Network error'));
    render(<BrowseTab />);
    await waitFor(() => {
      expect(screen.getByText(/couldn't reach marketplace/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  it('shows error banner when fetch fails but has cached data', async () => {
    // Mock getEntries to reject, so loadEntries sets error state
    vi.mocked(window.aiplughub.browse.getEntries).mockRejectedValueOnce(
      new Error('Partial failure'),
    );
    // Pre-populate entries to simulate cached data
    useBrowseStore.setState({ entries: MOCK_ENTRIES });
    render(<BrowseTab />);

    await waitFor(() => {
      expect(screen.getByText('Partial failure')).toBeInTheDocument();
      expect(screen.getAllByText('sqlite-mcp').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows empty state when no plugins available', () => {
    useBrowseStore.setState({ entries: [], isLoading: false, error: null });
    // Need to prevent loadEntries from running
    vi.mocked(window.aiplughub.browse.getEntries).mockResolvedValue([]);
    render(<BrowseTab />);
    // The component will load entries on mount, which resolves to []
    // So we need to check after the async operation
    waitFor(() => {
      expect(screen.getByText(/no plugins available/i)).toBeInTheDocument();
    });
  });

  it('renders search bar and sort selector', async () => {
    useBrowseStore.setState({ entries: MOCK_ENTRIES });
    render(<BrowseTab />);
    await waitFor(() => {
      expect(screen.getByLabelText(/search plugins/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/sort by/i)).toBeInTheDocument();
    });
  });

  it('renders refresh button', async () => {
    useBrowseStore.setState({ entries: MOCK_ENTRIES });
    render(<BrowseTab />);
    await waitFor(() => {
      expect(screen.getByLabelText(/refresh marketplace/i)).toBeInTheDocument();
    });
  });

  it('shows no-results empty state when search has no matches', async () => {
    useBrowseStore.setState({ entries: MOCK_ENTRIES, searchQuery: 'xyznonexistent' });
    render(<BrowseTab />);
    expect(screen.getByText(/no plugins found matching/i)).toBeInTheDocument();
  });
});
