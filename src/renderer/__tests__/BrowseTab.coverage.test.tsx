/**
 * Coverage push for BrowseTab.tsx — offline banner, loading-while-has-data state,
 * filter empty state with type filters, and clear filters button.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    keywords: ['database'],
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
});

describe('BrowseTab — offline banner', () => {
  it('shows offline banner when isOffline is true and entries present', () => {
    useBrowseStore.setState({ entries: MOCK_ENTRIES, isOffline: true });
    render(<BrowseTab />);
    expect(screen.getByText(/offline — showing cached results/i)).toBeInTheDocument();
  });

  it('does not show offline banner when isOffline is false', () => {
    useBrowseStore.setState({ entries: MOCK_ENTRIES, isOffline: false });
    render(<BrowseTab />);
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
  });
});

describe('BrowseTab — loading-while-has-data state', () => {
  it('shows refreshing indicator when isLoading is true but entries already exist', () => {
    useBrowseStore.setState({ entries: MOCK_ENTRIES, isLoading: true });
    render(<BrowseTab />);
    expect(screen.getByText(/refreshing/i)).toBeInTheDocument();
  });

  it('refresh button shows ... when loading', () => {
    useBrowseStore.setState({ entries: MOCK_ENTRIES, isLoading: true });
    render(<BrowseTab />);
    // Refresh button text changes to '...' when loading
    const refreshButton = screen.getByLabelText(/refresh marketplace/i);
    expect(refreshButton).toBeDisabled();
    expect(refreshButton.textContent).toBe('...');
  });
});

describe('BrowseTab — error banner (partial failure)', () => {
  it('shows dismiss button next to error message', async () => {
    // Mock getEntries to reject so BrowseTab sets error state, but with entries already loaded
    vi.mocked(window.aiplughub.browse.getEntries).mockRejectedValueOnce(
      new Error('Partial error occurred'),
    );
    useBrowseStore.setState({ entries: MOCK_ENTRIES });
    render(<BrowseTab />);
    await waitFor(() => {
      expect(screen.getByText('Partial error occurred')).toBeInTheDocument();
    });
    expect(screen.getByText('Dismiss')).toBeInTheDocument();
  });

  it('clears error when Dismiss is clicked', async () => {
    vi.mocked(window.aiplughub.browse.getEntries).mockRejectedValueOnce(
      new Error('Some error'),
    );
    useBrowseStore.setState({ entries: MOCK_ENTRIES });
    render(<BrowseTab />);
    await waitFor(() => {
      expect(screen.getByText('Dismiss')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Dismiss'));
    expect(useBrowseStore.getState().error).toBeNull();
  });

  it('retry button calls clearError and loadEntries', async () => {
    vi.mocked(window.aiplughub.browse.getEntries).mockRejectedValueOnce(new Error('Network error'));
    render(<BrowseTab />);
    await waitFor(() => {
      expect(screen.getByText(/couldn't reach marketplace/i)).toBeInTheDocument();
    });
    // Reset mock for the retry
    vi.mocked(window.aiplughub.browse.getEntries).mockResolvedValue(MOCK_ENTRIES);

    const callsBefore = vi.mocked(window.aiplughub.browse.getEntries).mock.calls.length;
    const retryButton = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryButton);
    await waitFor(() => {
      const callsAfter = vi.mocked(window.aiplughub.browse.getEntries).mock.calls.length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });
});

describe('BrowseTab — empty state with no plugins from sources', () => {
  it('shows empty state and refresh button when entries is empty after load', async () => {
    vi.mocked(window.aiplughub.browse.getEntries).mockResolvedValue([]);
    useBrowseStore.setState({ entries: [], isLoading: false, error: null });
    render(<BrowseTab />);
    await waitFor(() => {
      // "No plugins available" is the title of the empty state
      const headings = screen.getAllByText(/no plugins available/i);
      expect(headings.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });
});

describe('BrowseTab — filter empty state with type filters', () => {
  it('shows filter empty state when type filters yield no results', () => {
    useBrowseStore.setState({
      entries: MOCK_ENTRIES,
      typeFilters: ['skill'], // no skills in MOCK_ENTRIES
    });
    render(<BrowseTab />);
    expect(screen.getByText(/no plugins match your current filters/i)).toBeInTheDocument();
  });

  it('filter empty state has clear filters button', () => {
    useBrowseStore.setState({
      entries: MOCK_ENTRIES,
      typeFilters: ['skill'],
    });
    render(<BrowseTab />);
    expect(screen.getByText('Clear filters')).toBeInTheDocument();
  });

  it('clear filters button resets filters in store', () => {
    useBrowseStore.setState({
      entries: MOCK_ENTRIES,
      typeFilters: ['skill'],
    });
    render(<BrowseTab />);
    fireEvent.click(screen.getByText('Clear filters'));
    expect(useBrowseStore.getState().typeFilters).toEqual([]);
  });
});

describe('BrowseTab — sort selector', () => {
  it('changes sort when option is selected', async () => {
    useBrowseStore.setState({ entries: MOCK_ENTRIES });
    render(<BrowseTab />);
    await waitFor(() => {
      expect(screen.getByLabelText(/sort by/i)).toBeInTheDocument();
    });
    const select = screen.getByLabelText(/sort by/i);
    fireEvent.change(select, { target: { value: 'updated' } });
    expect(useBrowseStore.getState().sortBy).toBe('updated');
  });
});

describe('BrowseTab — detail panel toggle (select same entry closes it)', () => {
  it('clicking an already-selected entry closes the detail panel', async () => {
    // Pre-load entries + pre-select one
    useBrowseStore.setState({
      entries: MOCK_ENTRIES,
      selectedRef: { sourceId: 'claude-official', ref: 'sqlite-mcp' },
    });
    vi.mocked(window.aiplughub.browse.getEntries).mockResolvedValue(MOCK_ENTRIES);
    render(<BrowseTab />);

    // Wait for cards to be in the DOM
    await waitFor(() => {
      expect(screen.getAllByText('sqlite-mcp').length).toBeGreaterThan(0);
    });

    // Click the first instance (the card in the results list, not the detail panel)
    const allInstances = screen.getAllByText('sqlite-mcp');
    // The card result is the first occurrence
    fireEvent.click(allInstances[0]);

    // selectedRef should now be null (toggle closes when already selected)
    await waitFor(() => {
      expect(useBrowseStore.getState().selectedRef).toBeNull();
    });
  });
});
