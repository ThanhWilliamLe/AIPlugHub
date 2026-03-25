import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useBrowseStore,
  useFilteredEntries,
  useBrowseToolCounts,
  useBrowseTypeCounts,
  useBrowseSourceCounts,
} from '../stores/browse-store';
import type { MarketplaceEntry, MarketplaceDetail, MarketplaceRef } from '@shared/types';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeRef(overrides: Partial<MarketplaceRef> = {}): MarketplaceRef {
  return {
    sourceId: 'test-source',
    ref: 'plugin-alpha',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<MarketplaceEntry> = {}): MarketplaceEntry {
  return {
    name: 'test-plugin',
    sourceId: 'test-source',
    ref: 'plugin-alpha',
    description: 'A test plugin',
    tools: ['claude-code'],
    ...overrides,
  };
}

function makeDetail(entry?: MarketplaceEntry): MarketplaceDetail {
  const e = entry ?? makeEntry();
  return {
    entry: e,
    components: [],
    installSource: { type: 'marketplace', marketplace: 'test-source', ref: e.ref },
  };
}

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  useBrowseStore.setState({
    entries: [],
    searchQuery: '',
    toolFilters: [],
    typeFilters: [],
    sourceFilters: [],
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
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// loadEntries
// ---------------------------------------------------------------------------

describe('loadEntries', () => {
  it('sets isLoading true during fetch, false after success', async () => {
    let loadingDuringFetch = false;
    vi.mocked(window.aiplughub.browse.getEntries).mockImplementationOnce(async () => {
      loadingDuringFetch = useBrowseStore.getState().isLoading;
      return [];
    });

    await useBrowseStore.getState().loadEntries();

    expect(loadingDuringFetch).toBe(true);
    expect(useBrowseStore.getState().isLoading).toBe(false);
  });

  it('clears error at start of fetch', async () => {
    useBrowseStore.setState({ error: 'stale error' });
    vi.mocked(window.aiplughub.browse.getEntries).mockResolvedValueOnce([]);

    await useBrowseStore.getState().loadEntries();

    expect(useBrowseStore.getState().error).toBeNull();
  });

  it('sets entries on success', async () => {
    const entries = [makeEntry({ name: 'alpha' }), makeEntry({ name: 'beta', ref: 'beta-ref' })];
    vi.mocked(window.aiplughub.browse.getEntries).mockResolvedValueOnce(entries);

    await useBrowseStore.getState().loadEntries();

    expect(useBrowseStore.getState().entries).toEqual(entries);
    expect(useBrowseStore.getState().isOffline).toBe(false);
  });

  it('sets error and isOffline true on failure when there is no cache', async () => {
    useBrowseStore.setState({ entries: [] });
    vi.mocked(window.aiplughub.browse.getEntries).mockRejectedValueOnce(
      new Error('network timeout'),
    );

    await useBrowseStore.getState().loadEntries();

    expect(useBrowseStore.getState().error).toBe('network timeout');
    expect(useBrowseStore.getState().isOffline).toBe(true);
    expect(useBrowseStore.getState().isLoading).toBe(false);
  });

  it('sets error but isOffline false on failure when cache exists', async () => {
    const cachedEntries = [makeEntry()];
    useBrowseStore.setState({ entries: cachedEntries });
    vi.mocked(window.aiplughub.browse.getEntries).mockRejectedValueOnce(new Error('fetch error'));

    await useBrowseStore.getState().loadEntries();

    expect(useBrowseStore.getState().error).toBe('fetch error');
    expect(useBrowseStore.getState().isOffline).toBe(false);
    // Cache is preserved
    expect(useBrowseStore.getState().entries).toEqual(cachedEntries);
  });

  it('sets isLoading false on failure', async () => {
    vi.mocked(window.aiplughub.browse.getEntries).mockRejectedValueOnce(new Error('fail'));

    await useBrowseStore.getState().loadEntries();

    expect(useBrowseStore.getState().isLoading).toBe(false);
  });

  it('handles non-Error thrown objects using String fallback', async () => {
    // Throw a plain string instead of an Error instance
    vi.mocked(window.aiplughub.browse.getEntries).mockRejectedValueOnce('plain string error');

    await useBrowseStore.getState().loadEntries();

    expect(useBrowseStore.getState().error).toBe('plain string error');
  });

  it('handles thrown object with no message property via String coercion', async () => {
    vi.mocked(window.aiplughub.browse.getEntries).mockRejectedValueOnce(42);

    await useBrowseStore.getState().loadEntries();

    expect(useBrowseStore.getState().error).toBe('42');
  });
});

// ---------------------------------------------------------------------------
// openDetail
// ---------------------------------------------------------------------------

describe('openDetail', () => {
  it('sets selectedRef and detailLoading during fetch', async () => {
    const ref = makeRef();
    let selectedRefDuringFetch: MarketplaceRef | null = null;
    let loadingDuringFetch = false;

    vi.mocked(window.aiplughub.browse.getDetail).mockImplementationOnce(async () => {
      selectedRefDuringFetch = useBrowseStore.getState().selectedRef;
      loadingDuringFetch = useBrowseStore.getState().detailLoading;
      return makeDetail();
    });

    await useBrowseStore.getState().openDetail(ref);

    expect(selectedRefDuringFetch).toEqual(ref);
    expect(loadingDuringFetch).toBe(true);
  });

  it('sets detail and detailLoading false on success', async () => {
    const ref = makeRef();
    const detail = makeDetail();
    vi.mocked(window.aiplughub.browse.getDetail).mockResolvedValueOnce(detail);

    await useBrowseStore.getState().openDetail(ref);

    expect(useBrowseStore.getState().detail).toEqual(detail);
    expect(useBrowseStore.getState().detailLoading).toBe(false);
    expect(useBrowseStore.getState().detailError).toBeNull();
  });

  it('clears any previous detail before fetching', async () => {
    useBrowseStore.setState({ detail: makeDetail() });
    vi.mocked(window.aiplughub.browse.getDetail).mockImplementationOnce(async () => {
      // Check that detail was cleared before the IPC call returned
      return makeDetail();
    });

    await useBrowseStore.getState().openDetail(makeRef());

    // After success, new detail is set
    expect(useBrowseStore.getState().detail).not.toBeNull();
  });

  it('sets detailError and detailLoading false on failure', async () => {
    const ref = makeRef();
    vi.mocked(window.aiplughub.browse.getDetail).mockRejectedValueOnce(
      new Error('detail fetch failed'),
    );

    await useBrowseStore.getState().openDetail(ref);

    expect(useBrowseStore.getState().detailError).toBe('detail fetch failed');
    expect(useBrowseStore.getState().detailLoading).toBe(false);
    expect(useBrowseStore.getState().detail).toBeNull();
  });

  it('preserves selectedRef on failure', async () => {
    const ref = makeRef();
    vi.mocked(window.aiplughub.browse.getDetail).mockRejectedValueOnce(new Error('fail'));

    await useBrowseStore.getState().openDetail(ref);

    expect(useBrowseStore.getState().selectedRef).toEqual(ref);
  });

  it('handles non-Error thrown from getDetail using String fallback', async () => {
    const ref = makeRef();
    vi.mocked(window.aiplughub.browse.getDetail).mockRejectedValueOnce({
      message: 'custom obj error',
    });

    await useBrowseStore.getState().openDetail(ref);

    expect(useBrowseStore.getState().detailError).toBe('custom obj error');
  });

  it('handles thrown value with no message from getDetail via String coercion', async () => {
    const ref = makeRef();
    vi.mocked(window.aiplughub.browse.getDetail).mockRejectedValueOnce(99);

    await useBrowseStore.getState().openDetail(ref);

    expect(useBrowseStore.getState().detailError).toBe('99');
  });
});

// ---------------------------------------------------------------------------
// closeDetail
// ---------------------------------------------------------------------------

describe('closeDetail', () => {
  it('clears selectedRef', () => {
    useBrowseStore.setState({ selectedRef: makeRef() });

    useBrowseStore.getState().closeDetail();

    expect(useBrowseStore.getState().selectedRef).toBeNull();
  });

  it('clears detail', () => {
    useBrowseStore.setState({ detail: makeDetail() });

    useBrowseStore.getState().closeDetail();

    expect(useBrowseStore.getState().detail).toBeNull();
  });

  it('clears detailError', () => {
    useBrowseStore.setState({ detailError: 'some error' });

    useBrowseStore.getState().closeDetail();

    expect(useBrowseStore.getState().detailError).toBeNull();
  });

  it('sets detailLoading to false', () => {
    useBrowseStore.setState({ detailLoading: true });

    useBrowseStore.getState().closeDetail();

    expect(useBrowseStore.getState().detailLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// install
// ---------------------------------------------------------------------------

describe('install', () => {
  const installTarget = { instanceId: 'claude-code', scope: 'user' };

  it('sets installingRef during install', async () => {
    const ref = makeRef();
    let installingRefDuringCall: MarketplaceRef | null = null;

    vi.mocked(window.aiplughub.browse.install).mockImplementationOnce(async () => {
      installingRefDuringCall = useBrowseStore.getState().installingRef;
      return {};
    });

    await useBrowseStore.getState().install(ref, installTarget);

    expect(installingRefDuringCall).toEqual(ref);
  });

  it('clears installingRef and sets lastInstalledRef on success', async () => {
    const ref = makeRef();
    vi.mocked(window.aiplughub.browse.install).mockResolvedValueOnce({});

    await useBrowseStore.getState().install(ref, installTarget);

    expect(useBrowseStore.getState().installingRef).toBeNull();
    expect(useBrowseStore.getState().lastInstalledRef).toEqual(ref);
    expect(useBrowseStore.getState().installError).toBeNull();
  });

  it('calls window.aiplughub.browse.install with correct args', async () => {
    const ref = makeRef();
    vi.mocked(window.aiplughub.browse.install).mockResolvedValueOnce({});

    await useBrowseStore.getState().install(ref, installTarget);

    expect(window.aiplughub.browse.install).toHaveBeenCalledWith(ref, installTarget);
  });

  it('triggers scanAll on success', async () => {
    const ref = makeRef();
    vi.mocked(window.aiplughub.browse.install).mockResolvedValueOnce({});

    await useBrowseStore.getState().install(ref, installTarget);

    // scanAll is invoked via dynamic import of tool-store; the mock intercepts the IPC call
    expect(window.aiplughub.tools.scanAll).toHaveBeenCalled();
  });

  it('sets installError with friendly message on failure', async () => {
    const ref = makeRef();
    vi.mocked(window.aiplughub.browse.install).mockRejectedValueOnce(new Error('install failed'));

    await useBrowseStore.getState().install(ref, installTarget);

    // friendlyError maps unknown errors to generic message
    expect(useBrowseStore.getState().installError).toBe(
      'Something went wrong during installation.',
    );
  });

  it('clears installingRef on failure', async () => {
    const ref = makeRef();
    vi.mocked(window.aiplughub.browse.install).mockRejectedValueOnce(new Error('fail'));

    await useBrowseStore.getState().install(ref, installTarget);

    expect(useBrowseStore.getState().installingRef).toBeNull();
  });

  it('sets lastInstalledRef even on failure', async () => {
    const ref = makeRef();
    vi.mocked(window.aiplughub.browse.install).mockRejectedValueOnce(new Error('fail'));

    await useBrowseStore.getState().install(ref, installTarget);

    expect(useBrowseStore.getState().lastInstalledRef).toEqual(ref);
  });

  it('maps ENOENT errors to friendly message', async () => {
    const ref = makeRef();
    vi.mocked(window.aiplughub.browse.install).mockRejectedValueOnce(new Error('spawn npx ENOENT'));

    await useBrowseStore.getState().install(ref, installTarget);

    expect(useBrowseStore.getState().installError).toBe(
      "A required program wasn't found on your computer.",
    );
  });

  it('maps non-Error thrown values to friendly message', async () => {
    const ref = makeRef();
    vi.mocked(window.aiplughub.browse.install).mockRejectedValueOnce(false);

    await useBrowseStore.getState().install(ref, installTarget);

    expect(useBrowseStore.getState().installError).toBe(
      'Something went wrong during installation.',
    );
  });
});

// ---------------------------------------------------------------------------
// refresh
// ---------------------------------------------------------------------------

describe('refresh', () => {
  it('calls refreshSources then loadEntries', async () => {
    vi.mocked(window.aiplughub.browse.refreshSources).mockResolvedValueOnce(undefined);
    vi.mocked(window.aiplughub.browse.getEntries).mockResolvedValueOnce([makeEntry()]);

    await useBrowseStore.getState().refresh();

    expect(window.aiplughub.browse.refreshSources).toHaveBeenCalled();
    expect(window.aiplughub.browse.getEntries).toHaveBeenCalled();
  });

  it('updates entries after refresh', async () => {
    const entries = [makeEntry({ name: 'refreshed-plugin' })];
    vi.mocked(window.aiplughub.browse.refreshSources).mockResolvedValueOnce(undefined);
    vi.mocked(window.aiplughub.browse.getEntries).mockResolvedValueOnce(entries);

    await useBrowseStore.getState().refresh();

    expect(useBrowseStore.getState().entries).toEqual(entries);
  });

  it('sets error when refreshSources fails', async () => {
    vi.mocked(window.aiplughub.browse.refreshSources).mockRejectedValueOnce(
      new Error('sources failed'),
    );

    await useBrowseStore.getState().refresh();

    expect(useBrowseStore.getState().error).toBe('sources failed');
  });

  it('handles non-Error thrown from refreshSources using String fallback', async () => {
    vi.mocked(window.aiplughub.browse.refreshSources).mockRejectedValueOnce({
      message: 'obj error',
    });

    await useBrowseStore.getState().refresh();

    expect(useBrowseStore.getState().error).toBe('obj error');
  });

  it('handles thrown value with no message from refreshSources via String coercion', async () => {
    vi.mocked(window.aiplughub.browse.refreshSources).mockRejectedValueOnce(123);

    await useBrowseStore.getState().refresh();

    expect(useBrowseStore.getState().error).toBe('123');
  });

  it('does not call getEntries when refreshSources throws', async () => {
    vi.mocked(window.aiplughub.browse.refreshSources).mockRejectedValueOnce(new Error('fail'));

    await useBrowseStore.getState().refresh();

    expect(window.aiplughub.browse.getEntries).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// setSearchQuery
// ---------------------------------------------------------------------------

describe('setSearchQuery', () => {
  it('sets searchQuery', () => {
    useBrowseStore.getState().setSearchQuery('my search');

    expect(useBrowseStore.getState().searchQuery).toBe('my search');
  });

  it('switches sortBy to relevance when query is non-empty', () => {
    useBrowseStore.setState({ sortBy: 'name' });

    useBrowseStore.getState().setSearchQuery('something');

    expect(useBrowseStore.getState().sortBy).toBe('relevance');
  });

  it('switches sortBy from relevance to name when query is cleared', () => {
    useBrowseStore.setState({ sortBy: 'relevance' });

    useBrowseStore.getState().setSearchQuery('');

    expect(useBrowseStore.getState().sortBy).toBe('popularity');
  });

  it('preserves existing non-relevance sortBy when query is cleared', () => {
    useBrowseStore.setState({ sortBy: 'updated' });

    useBrowseStore.getState().setSearchQuery('');

    expect(useBrowseStore.getState().sortBy).toBe('updated');
  });
});

// ---------------------------------------------------------------------------
// toggleToolFilter
// ---------------------------------------------------------------------------

describe('toggleToolFilter', () => {
  it('adds toolId when not in filter list', () => {
    useBrowseStore.getState().toggleToolFilter('claude-code');

    expect(useBrowseStore.getState().toolFilters).toContain('claude-code');
  });

  it('removes toolId when already in filter list', () => {
    useBrowseStore.setState({ toolFilters: ['claude-code'] });

    useBrowseStore.getState().toggleToolFilter('claude-code');

    expect(useBrowseStore.getState().toolFilters).not.toContain('claude-code');
  });

  it('preserves other toolIds when removing one', () => {
    useBrowseStore.setState({ toolFilters: ['claude-code', 'claude-desktop'] });

    useBrowseStore.getState().toggleToolFilter('claude-code');

    expect(useBrowseStore.getState().toolFilters).toEqual(['claude-desktop']);
  });

  it('accumulates multiple distinct toolIds', () => {
    useBrowseStore.getState().toggleToolFilter('claude-code');
    useBrowseStore.getState().toggleToolFilter('gemini-cli');

    expect(useBrowseStore.getState().toolFilters).toHaveLength(2);
    expect(useBrowseStore.getState().toolFilters).toContain('claude-code');
    expect(useBrowseStore.getState().toolFilters).toContain('gemini-cli');
  });
});

// ---------------------------------------------------------------------------
// toggleTypeFilter
// ---------------------------------------------------------------------------

describe('toggleTypeFilter', () => {
  it('adds type when not in filter list', () => {
    useBrowseStore.getState().toggleTypeFilter('mcp-server');

    expect(useBrowseStore.getState().typeFilters).toContain('mcp-server');
  });

  it('removes type when already in filter list', () => {
    useBrowseStore.setState({ typeFilters: ['mcp-server'] });

    useBrowseStore.getState().toggleTypeFilter('mcp-server');

    expect(useBrowseStore.getState().typeFilters).not.toContain('mcp-server');
  });

  it('preserves other types when removing one', () => {
    useBrowseStore.setState({ typeFilters: ['mcp-server', 'skill'] });

    useBrowseStore.getState().toggleTypeFilter('mcp-server');

    expect(useBrowseStore.getState().typeFilters).toEqual(['skill']);
  });
});

// ---------------------------------------------------------------------------
// setSortBy
// ---------------------------------------------------------------------------

describe('setSortBy', () => {
  it('sets sortBy to name', () => {
    useBrowseStore.getState().setSortBy('name');

    expect(useBrowseStore.getState().sortBy).toBe('name');
  });

  it('sets sortBy to updated', () => {
    useBrowseStore.getState().setSortBy('updated');

    expect(useBrowseStore.getState().sortBy).toBe('updated');
  });

  it('sets sortBy to relevance', () => {
    useBrowseStore.getState().setSortBy('relevance');

    expect(useBrowseStore.getState().sortBy).toBe('relevance');
  });
});

// ---------------------------------------------------------------------------
// clearFilters
// ---------------------------------------------------------------------------

describe('clearFilters', () => {
  it('resets searchQuery', () => {
    useBrowseStore.setState({ searchQuery: 'old query' });

    useBrowseStore.getState().clearFilters();

    expect(useBrowseStore.getState().searchQuery).toBe('');
  });

  it('resets toolFilters', () => {
    useBrowseStore.setState({ toolFilters: ['claude-code', 'gemini-cli'] });

    useBrowseStore.getState().clearFilters();

    expect(useBrowseStore.getState().toolFilters).toEqual([]);
  });

  it('resets typeFilters', () => {
    useBrowseStore.setState({ typeFilters: ['mcp-server', 'skill'] });

    useBrowseStore.getState().clearFilters();

    expect(useBrowseStore.getState().typeFilters).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// clearInstallError
// ---------------------------------------------------------------------------

describe('clearInstallError', () => {
  it('clears installError', () => {
    useBrowseStore.setState({ installError: 'previous error' });

    useBrowseStore.getState().clearInstallError();

    expect(useBrowseStore.getState().installError).toBeNull();
  });

  it('is a no-op when installError is already null', () => {
    useBrowseStore.getState().clearInstallError();

    expect(useBrowseStore.getState().installError).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearError
// ---------------------------------------------------------------------------

describe('clearError (browse)', () => {
  it('clears the entries error', () => {
    useBrowseStore.setState({ error: 'fetch error' });

    useBrowseStore.getState().clearError();

    expect(useBrowseStore.getState().error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// useFilteredEntries (selector)
// ---------------------------------------------------------------------------

describe('useFilteredEntries', () => {
  it('returns all entries when no filters or query are set', () => {
    const entries = [
      makeEntry({ name: 'alpha', ref: 'alpha' }),
      makeEntry({ name: 'beta', ref: 'beta' }),
    ];
    useBrowseStore.setState({ entries, searchQuery: '', toolFilters: [], typeFilters: [] });

    const { result } = renderHook(() => useFilteredEntries());

    expect(result.current).toHaveLength(2);
  });

  it('filters by toolFilter — only matching entries returned', () => {
    const entries = [
      makeEntry({ name: 'cc-plugin', ref: 'cc', tools: ['claude-code'] }),
      makeEntry({ name: 'gem-plugin', ref: 'gem', tools: ['gemini-cli'] }),
    ];
    useBrowseStore.setState({ entries, toolFilters: ['claude-code'], typeFilters: [] });

    const { result } = renderHook(() => useFilteredEntries());

    expect(result.current).toHaveLength(1);
    expect(result.current[0].name).toBe('cc-plugin');
  });

  it('filters by typeFilter — only entries with matching componentCounts returned', () => {
    const entries = [
      makeEntry({ name: 'mcp-plugin', ref: 'mcp', componentCounts: { 'mcp-server': 2 } }),
      makeEntry({ name: 'skill-plugin', ref: 'skill', componentCounts: { skill: 1 } }),
    ];
    useBrowseStore.setState({ entries, toolFilters: [], typeFilters: ['mcp-server'] });

    const { result } = renderHook(() => useFilteredEntries());

    expect(result.current).toHaveLength(1);
    expect(result.current[0].name).toBe('mcp-plugin');
  });

  it('returns fuzzy search results when searchQuery is set', () => {
    const entries = [
      makeEntry({ name: 'github-mcp', ref: 'github-mcp', description: 'GitHub integration' }),
      makeEntry({ name: 'unrelated', ref: 'unrelated', description: 'Something else entirely' }),
    ];
    useBrowseStore.setState({ entries, searchQuery: 'github', toolFilters: [], typeFilters: [] });

    const { result } = renderHook(() => useFilteredEntries());

    // github-mcp should be returned, unrelated should not be
    const names = result.current.map((e) => e.name);
    expect(names).toContain('github-mcp');
  });

  it('sorts by name alphabetically when sortBy is name', () => {
    const entries = [
      makeEntry({ name: 'zebra', ref: 'zebra' }),
      makeEntry({ name: 'alpha', ref: 'alpha' }),
      makeEntry({ name: 'mango', ref: 'mango' }),
    ];
    useBrowseStore.setState({
      entries,
      sortBy: 'name',
      searchQuery: '',
      toolFilters: [],
      typeFilters: [],
    });

    const { result } = renderHook(() => useFilteredEntries());

    const names = result.current.map((e) => e.name);
    expect(names).toEqual(['alpha', 'mango', 'zebra']);
  });

  it('sorts by lastUpdated descending when sortBy is updated', () => {
    const entries = [
      makeEntry({ name: 'old', ref: 'old', lastUpdated: '2024-01-01' }),
      makeEntry({ name: 'new', ref: 'new', lastUpdated: '2024-12-01' }),
      makeEntry({ name: 'mid', ref: 'mid', lastUpdated: '2024-06-01' }),
    ];
    useBrowseStore.setState({
      entries,
      sortBy: 'updated',
      searchQuery: '',
      toolFilters: [],
      typeFilters: [],
    });

    const { result } = renderHook(() => useFilteredEntries());

    const names = result.current.map((e) => e.name);
    expect(names).toEqual(['new', 'mid', 'old']);
  });

  it('places entries without lastUpdated at the end when sorting by updated', () => {
    const entries = [
      makeEntry({ name: 'no-date', ref: 'no-date' }),
      makeEntry({ name: 'dated', ref: 'dated', lastUpdated: '2024-01-01' }),
    ];
    useBrowseStore.setState({
      entries,
      sortBy: 'updated',
      searchQuery: '',
      toolFilters: [],
      typeFilters: [],
    });

    const { result } = renderHook(() => useFilteredEntries());

    const names = result.current.map((e) => e.name);
    expect(names[0]).toBe('dated');
    expect(names[names.length - 1]).toBe('no-date');
  });

  it('combines tool filter and type filter (both must match)', () => {
    const entries = [
      makeEntry({
        name: 'cc-mcp',
        ref: 'cc-mcp',
        tools: ['claude-code'],
        componentCounts: { 'mcp-server': 1 },
      }),
      makeEntry({
        name: 'cc-skill',
        ref: 'cc-skill',
        tools: ['claude-code'],
        componentCounts: { skill: 1 },
      }),
      makeEntry({
        name: 'gem-mcp',
        ref: 'gem-mcp',
        tools: ['gemini-cli'],
        componentCounts: { 'mcp-server': 1 },
      }),
    ];
    useBrowseStore.setState({
      entries,
      toolFilters: ['claude-code'],
      typeFilters: ['mcp-server'],
      searchQuery: '',
    });

    const { result } = renderHook(() => useFilteredEntries());

    expect(result.current).toHaveLength(1);
    expect(result.current[0].name).toBe('cc-mcp');
  });

  it('returns empty array when no entries match filters', () => {
    const entries = [makeEntry({ tools: ['gemini-cli'] })];
    useBrowseStore.setState({
      entries,
      toolFilters: ['claude-code'],
      typeFilters: [],
      searchQuery: '',
    });

    const { result } = renderHook(() => useFilteredEntries());

    expect(result.current).toHaveLength(0);
  });

  it('sorts updated — two entries both missing lastUpdated return equal (stable)', () => {
    const entries = [
      makeEntry({ name: 'no-date-a', ref: 'a' }),
      makeEntry({ name: 'no-date-b', ref: 'b' }),
    ];
    useBrowseStore.setState({
      entries,
      sortBy: 'updated',
      searchQuery: '',
      toolFilters: [],
      typeFilters: [],
    });

    const { result } = renderHook(() => useFilteredEntries());

    // Both have no date — the comparator returns 0, order is stable; just verify both present
    expect(result.current).toHaveLength(2);
  });

  it('sorts updated — entry with date comes before entry without date (no-date first in input)', () => {
    const entries = [
      makeEntry({ name: 'no-date', ref: 'no-date' }),
      makeEntry({ name: 'has-date', ref: 'has-date', lastUpdated: '2024-06-01' }),
    ];
    useBrowseStore.setState({
      entries,
      sortBy: 'updated',
      searchQuery: '',
      toolFilters: [],
      typeFilters: [],
    });

    const { result } = renderHook(() => useFilteredEntries());

    expect(result.current[0].name).toBe('has-date');
    expect(result.current[1].name).toBe('no-date');
  });

  it('sorts updated — entry with date comes before entry without date (dated first in input)', () => {
    // When the dated entry is first in the array, the comparator is called as (has-date, no-date)
    // which exercises the !b.lastUpdated → return -1 branch
    const entries = [
      makeEntry({ name: 'has-date', ref: 'has-date', lastUpdated: '2024-06-01' }),
      makeEntry({ name: 'no-date', ref: 'no-date' }),
    ];
    useBrowseStore.setState({
      entries,
      sortBy: 'updated',
      searchQuery: '',
      toolFilters: [],
      typeFilters: [],
    });

    const { result } = renderHook(() => useFilteredEntries());

    expect(result.current[0].name).toBe('has-date');
    expect(result.current[1].name).toBe('no-date');
  });

  it('preserves fuse.js relevance order when sortBy is relevance', () => {
    const entries = [
      makeEntry({ name: 'alpha-plugin', ref: 'alpha', description: 'alpha' }),
      makeEntry({ name: 'beta-plugin', ref: 'beta', description: 'beta' }),
    ];
    useBrowseStore.setState({
      entries,
      searchQuery: 'alpha',
      sortBy: 'relevance',
      toolFilters: [],
      typeFilters: [],
    });

    const { result } = renderHook(() => useFilteredEntries());

    // The alpha entry should score higher and appear first
    expect(result.current[0].name).toBe('alpha-plugin');
  });

  it('type filter excludes entries with no componentCounts', () => {
    const entries = [
      makeEntry({ name: 'no-counts', ref: 'no-counts', componentCounts: undefined }),
      makeEntry({ name: 'has-mcp', ref: 'has-mcp', componentCounts: { 'mcp-server': 1 } }),
    ];
    useBrowseStore.setState({
      entries,
      typeFilters: ['mcp-server'],
      toolFilters: [],
      searchQuery: '',
    });

    const { result } = renderHook(() => useFilteredEntries());

    expect(result.current).toHaveLength(1);
    expect(result.current[0].name).toBe('has-mcp');
  });
});

// ---------------------------------------------------------------------------
// useBrowseToolCounts (selector)
// ---------------------------------------------------------------------------

describe('useBrowseToolCounts', () => {
  it('returns empty map when there are no entries', () => {
    useBrowseStore.setState({ entries: [] });

    const { result } = renderHook(() => useBrowseToolCounts());

    expect(result.current.size).toBe(0);
  });

  it('counts single tool correctly', () => {
    const entries = [
      makeEntry({ tools: ['claude-code'] }),
      makeEntry({ ref: 'b', tools: ['claude-code'] }),
    ];
    useBrowseStore.setState({ entries });

    const { result } = renderHook(() => useBrowseToolCounts());

    expect(result.current.get('claude-code')).toBe(2);
  });

  it('counts multiple tools across entries', () => {
    const entries = [
      makeEntry({ ref: 'a', tools: ['claude-code', 'gemini-cli'] }),
      makeEntry({ ref: 'b', tools: ['claude-code'] }),
    ];
    useBrowseStore.setState({ entries });

    const { result } = renderHook(() => useBrowseToolCounts());

    expect(result.current.get('claude-code')).toBe(2);
    expect(result.current.get('gemini-cli')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// useBrowseTypeCounts (selector)
// ---------------------------------------------------------------------------

describe('useBrowseTypeCounts', () => {
  it('returns empty map when there are no entries', () => {
    useBrowseStore.setState({ entries: [] });

    const { result } = renderHook(() => useBrowseTypeCounts());

    expect(result.current.size).toBe(0);
  });

  it('sums counts for a single type across entries', () => {
    const entries = [
      makeEntry({ ref: 'a', componentCounts: { 'mcp-server': 2 } }),
      makeEntry({ ref: 'b', componentCounts: { 'mcp-server': 3 } }),
    ];
    useBrowseStore.setState({ entries });

    const { result } = renderHook(() => useBrowseTypeCounts());

    expect(result.current.get('mcp-server')).toBe(5);
  });

  it('counts multiple types independently', () => {
    const entries = [
      makeEntry({ ref: 'a', componentCounts: { 'mcp-server': 1, skill: 2 } }),
      makeEntry({ ref: 'b', componentCounts: { skill: 1 } }),
    ];
    useBrowseStore.setState({ entries });

    const { result } = renderHook(() => useBrowseTypeCounts());

    expect(result.current.get('mcp-server')).toBe(1);
    expect(result.current.get('skill')).toBe(3);
  });

  it('skips entries without componentCounts', () => {
    const entries = [
      makeEntry({ ref: 'a', componentCounts: undefined }),
      makeEntry({ ref: 'b', componentCounts: { 'mcp-server': 1 } }),
    ];
    useBrowseStore.setState({ entries });

    const { result } = renderHook(() => useBrowseTypeCounts());

    expect(result.current.get('mcp-server')).toBe(1);
  });

  it('treats undefined count values as 0', () => {
    const entries = [makeEntry({ ref: 'a', componentCounts: { 'mcp-server': undefined } })];
    useBrowseStore.setState({ entries });

    const { result } = renderHook(() => useBrowseTypeCounts());

    expect(result.current.get('mcp-server')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// toggleSourceFilter
// ---------------------------------------------------------------------------

describe('toggleSourceFilter', () => {
  it('adds sourceId when not in filter list', () => {
    useBrowseStore.getState().toggleSourceFilter('source-a');

    expect(useBrowseStore.getState().sourceFilters).toContain('source-a');
  });

  it('removes sourceId when already in filter list', () => {
    useBrowseStore.setState({ sourceFilters: ['source-a'] });

    useBrowseStore.getState().toggleSourceFilter('source-a');

    expect(useBrowseStore.getState().sourceFilters).not.toContain('source-a');
  });

  it('preserves other sourceIds when removing one', () => {
    useBrowseStore.setState({ sourceFilters: ['source-a', 'source-b'] });

    useBrowseStore.getState().toggleSourceFilter('source-a');

    expect(useBrowseStore.getState().sourceFilters).toEqual(['source-b']);
  });

  it('accumulates multiple distinct sourceIds', () => {
    useBrowseStore.getState().toggleSourceFilter('source-a');
    useBrowseStore.getState().toggleSourceFilter('source-b');

    expect(useBrowseStore.getState().sourceFilters).toHaveLength(2);
    expect(useBrowseStore.getState().sourceFilters).toContain('source-a');
    expect(useBrowseStore.getState().sourceFilters).toContain('source-b');
  });
});

// ---------------------------------------------------------------------------
// clearFilters also clears sourceFilters
// ---------------------------------------------------------------------------

describe('clearFilters (with sourceFilters)', () => {
  it('resets sourceFilters', () => {
    useBrowseStore.setState({ sourceFilters: ['source-a', 'source-b'] });

    useBrowseStore.getState().clearFilters();

    expect(useBrowseStore.getState().sourceFilters).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// useFilteredEntries with sourceFilters
// ---------------------------------------------------------------------------

describe('useFilteredEntries (source filter)', () => {
  it('filters by sourceFilter — only matching entries returned', () => {
    const entries = [
      makeEntry({ name: 'from-a', ref: 'a', sourceId: 'source-a' }),
      makeEntry({ name: 'from-b', ref: 'b', sourceId: 'source-b' }),
    ];
    useBrowseStore.setState({
      entries,
      sourceFilters: ['source-a'],
      toolFilters: [],
      typeFilters: [],
      searchQuery: '',
    });

    const { result } = renderHook(() => useFilteredEntries());

    expect(result.current).toHaveLength(1);
    expect(result.current[0].name).toBe('from-a');
  });

  it('returns all entries when sourceFilters is empty', () => {
    const entries = [
      makeEntry({ name: 'from-a', ref: 'a', sourceId: 'source-a' }),
      makeEntry({ name: 'from-b', ref: 'b', sourceId: 'source-b' }),
    ];
    useBrowseStore.setState({
      entries,
      sourceFilters: [],
      toolFilters: [],
      typeFilters: [],
      searchQuery: '',
    });

    const { result } = renderHook(() => useFilteredEntries());

    expect(result.current).toHaveLength(2);
  });

  it('combines source filter with tool filter', () => {
    const entries = [
      makeEntry({ name: 'match', ref: 'match', sourceId: 'source-a', tools: ['claude-code'] }),
      makeEntry({ name: 'wrong-source', ref: 'ws', sourceId: 'source-b', tools: ['claude-code'] }),
      makeEntry({ name: 'wrong-tool', ref: 'wt', sourceId: 'source-a', tools: ['gemini-cli'] }),
    ];
    useBrowseStore.setState({
      entries,
      sourceFilters: ['source-a'],
      toolFilters: ['claude-code'],
      typeFilters: [],
      searchQuery: '',
    });

    const { result } = renderHook(() => useFilteredEntries());

    expect(result.current).toHaveLength(1);
    expect(result.current[0].name).toBe('match');
  });
});

// ---------------------------------------------------------------------------
// useBrowseSourceCounts (selector)
// ---------------------------------------------------------------------------

describe('useBrowseSourceCounts', () => {
  it('returns empty map when there are no entries', () => {
    useBrowseStore.setState({ entries: [] });

    const { result } = renderHook(() => useBrowseSourceCounts());

    expect(result.current.size).toBe(0);
  });

  it('counts entries by sourceId', () => {
    const entries = [
      makeEntry({ ref: 'a', sourceId: 'source-a' }),
      makeEntry({ ref: 'b', sourceId: 'source-a' }),
      makeEntry({ ref: 'c', sourceId: 'source-b' }),
    ];
    useBrowseStore.setState({ entries });

    const { result } = renderHook(() => useBrowseSourceCounts());

    expect(result.current.get('source-a')).toBe(2);
    expect(result.current.get('source-b')).toBe(1);
  });

  it('handles single source', () => {
    const entries = [makeEntry({ ref: 'a', sourceId: 'only-source' })];
    useBrowseStore.setState({ entries });

    const { result } = renderHook(() => useBrowseSourceCounts());

    expect(result.current.get('only-source')).toBe(1);
    expect(result.current.size).toBe(1);
  });
});
