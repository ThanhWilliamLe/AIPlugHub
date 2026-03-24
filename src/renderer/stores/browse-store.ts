/**
 * Browse tab state management.
 * Owns marketplace entries, search (fuse.js), filters, detail, and install state.
 * Source: 5A-specs/browse-tab-spec.md §9
 */

import { create } from 'zustand';
import Fuse, { type IFuseOptions } from 'fuse.js';
import type {
  MarketplaceEntry,
  MarketplaceDetail,
  MarketplaceRef,
  BrowseInstallTarget,
  ToolId,
  ComponentType,
} from '@shared/types';
import { useToolStore } from './tool-store';
import { useToastStore } from './toast-store';

export type BrowseSortBy = 'relevance' | 'name' | 'updated' | 'popularity';

export type BrowseStoreState = {
  // Data
  entries: MarketplaceEntry[];
  searchQuery: string;
  toolFilters: ToolId[];
  typeFilters: ComponentType[];
  sourceFilters: string[];
  sortBy: BrowseSortBy;

  // Loading / error
  isLoading: boolean;
  error: string | null;
  isOffline: boolean;
  cacheDate: string | null;

  // Detail panel
  selectedRef: MarketplaceRef | null;
  detail: MarketplaceDetail | null;
  detailLoading: boolean;
  detailError: string | null;

  // Install state
  installingRef: MarketplaceRef | null;
  installError: string | null;
  lastInstalledRef: MarketplaceRef | null;

  // Actions
  loadEntries: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  toggleToolFilter: (toolId: ToolId) => void;
  toggleTypeFilter: (type: ComponentType) => void;
  toggleSourceFilter: (sourceId: string) => void;
  clearFilters: () => void;
  setSortBy: (sort: BrowseSortBy) => void;
  openDetail: (ref: MarketplaceRef) => Promise<void>;
  closeDetail: () => void;
  install: (ref: MarketplaceRef, target: BrowseInstallTarget) => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
  clearInstallError: () => void;
};

/** Fuse.js search options — matches spec §4 search behavior */
const FUSE_OPTIONS: IFuseOptions<MarketplaceEntry> = {
  keys: [
    { name: 'name', weight: 2 },
    { name: 'keywords', weight: 1.5 },
    { name: 'description', weight: 1 },
    { name: 'author', weight: 0.5 },
  ],
  threshold: 0.4,
  includeScore: true,
};

export const useBrowseStore = create<BrowseStoreState>((set, get) => ({
  entries: [],
  searchQuery: '',
  toolFilters: [],
  typeFilters: [],
  sourceFilters: [],
  sortBy: 'popularity',
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

  loadEntries: async () => {
    set({ isLoading: true, error: null });
    try {
      const entries = await window.aiplughub.browse.getEntries();
      set({ entries, isLoading: false, isOffline: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String((err as { message?: string }).message ?? err);
      // Only show offline banner when we have no cached entries to fall back on
      const hasCache = get().entries.length > 0;
      set({ isLoading: false, error: message, isOffline: !hasCache });
    }
  },

  setSearchQuery: (searchQuery) => {
    set({
      searchQuery,
      sortBy: searchQuery.trim()
        ? 'relevance'
        : get().sortBy === 'relevance'
          ? 'popularity'
          : get().sortBy,
    });
  },

  toggleToolFilter: (toolId) =>
    set((state) => ({
      toolFilters: state.toolFilters.includes(toolId)
        ? state.toolFilters.filter((t) => t !== toolId)
        : [...state.toolFilters, toolId],
    })),

  toggleTypeFilter: (type) =>
    set((state) => ({
      typeFilters: state.typeFilters.includes(type)
        ? state.typeFilters.filter((t) => t !== type)
        : [...state.typeFilters, type],
    })),

  toggleSourceFilter: (sourceId) =>
    set((state) => ({
      sourceFilters: state.sourceFilters.includes(sourceId)
        ? state.sourceFilters.filter((s) => s !== sourceId)
        : [...state.sourceFilters, sourceId],
    })),

  clearFilters: () => set({ toolFilters: [], typeFilters: [], sourceFilters: [], searchQuery: '' }),

  setSortBy: (sortBy) => set({ sortBy }),

  openDetail: async (ref) => {
    set({ selectedRef: ref, detailLoading: true, detailError: null, detail: null });
    try {
      const detail = await window.aiplughub.browse.getDetail(ref);
      set({ detail, detailLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String((err as { message?: string }).message ?? err);
      set({ detailLoading: false, detailError: message });
    }
  },

  closeDetail: () =>
    set({ selectedRef: null, detail: null, detailLoading: false, detailError: null }),

  install: async (ref, target) => {
    set({ installingRef: ref, installError: null, lastInstalledRef: null });
    try {
      await window.aiplughub.browse.install(ref, target);
      set({ installingRef: null, lastInstalledRef: ref });
      // Refresh toolStore so My Setup sees the new component
      useToolStore.getState().scanAll();
      // Show install success toast
      useToastStore.getState().addToast({
        message: `"${ref.ref}" installed — you can manage it in My Setup`,
        type: 'success',
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String((err as { message?: string }).message ?? err);
      set({ installingRef: null, installError: message, lastInstalledRef: ref });
    }
  },

  refresh: async () => {
    try {
      await window.aiplughub.browse.refreshSources();
      await get().loadEntries();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String((err as { message?: string }).message ?? err);
      set({ error: message });
    }
  },

  clearError: () => set({ error: null }),
  clearInstallError: () => set({ installError: null }),
}));

// ─── Derived Selectors ──────────────────────────────────────────────

/** Get filtered + searched + sorted entries. Call this in components. */
export function useFilteredEntries(): MarketplaceEntry[] {
  const entries = useBrowseStore((s) => s.entries);
  const searchQuery = useBrowseStore((s) => s.searchQuery);
  const toolFilters = useBrowseStore((s) => s.toolFilters);
  const typeFilters = useBrowseStore((s) => s.typeFilters);
  const sourceFilters = useBrowseStore((s) => s.sourceFilters);
  const sortBy = useBrowseStore((s) => s.sortBy);

  // 1. Search (fuse.js or passthrough)
  let results: MarketplaceEntry[];
  if (searchQuery.trim()) {
    const fuse = new Fuse(entries, FUSE_OPTIONS);
    results = fuse.search(searchQuery).map((r) => r.item);
  } else {
    results = [...entries];
  }

  // 2. Tool filter
  if (toolFilters.length > 0) {
    results = results.filter((e) => e.tools.some((t) => toolFilters.includes(t)));
  }

  // 3. Source filter
  if (sourceFilters.length > 0) {
    results = results.filter((e) => sourceFilters.includes(e.sourceId));
  }

  // 4. Type filter
  if (typeFilters.length > 0) {
    results = results.filter((e) => {
      if (!e.componentCounts) return false;
      return typeFilters.some((type) => (e.componentCounts![type] ?? 0) > 0);
    });
  }

  // 5. Sort (relevance order is preserved from fuse.js results)
  if (sortBy === 'name') {
    results.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === 'updated') {
    results.sort((a, b) => {
      if (!a.lastUpdated && !b.lastUpdated) return 0;
      if (!a.lastUpdated) return 1;
      if (!b.lastUpdated) return -1;
      return b.lastUpdated.localeCompare(a.lastUpdated);
    });
  } else if (sortBy === 'popularity') {
    results.sort((a, b) => {
      if (a.starCount !== undefined && b.starCount === undefined) return -1;
      if (a.starCount === undefined && b.starCount !== undefined) return 1;
      if (a.starCount === undefined && b.starCount === undefined)
        return a.name.localeCompare(b.name);
      if (b.starCount! !== a.starCount!) return b.starCount! - a.starCount!;
      return a.name.localeCompare(b.name);
    });
  }
  // 'relevance' — already in fuse.js score order

  return results;
}

/** Count entries by tool (for filter pill counts) */
export function useBrowseToolCounts(): Map<ToolId, number> {
  const entries = useBrowseStore((s) => s.entries);
  const counts = new Map<ToolId, number>();
  for (const entry of entries) {
    for (const tool of entry.tools) {
      counts.set(tool, (counts.get(tool) ?? 0) + 1);
    }
  }
  return counts;
}

/** Count entries by component type (for filter pill counts) */
export function useBrowseTypeCounts(): Map<ComponentType, number> {
  const entries = useBrowseStore((s) => s.entries);
  const counts = new Map<ComponentType, number>();
  for (const entry of entries) {
    if (entry.componentCounts) {
      for (const [type, count] of Object.entries(entry.componentCounts)) {
        counts.set(type as ComponentType, (counts.get(type as ComponentType) ?? 0) + (count ?? 0));
      }
    }
  }
  return counts;
}

/** Count entries by sourceId (for filter pill counts) */
export function useBrowseSourceCounts(): Map<string, number> {
  const entries = useBrowseStore((s) => s.entries);
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.sourceId, (counts.get(entry.sourceId) ?? 0) + 1);
  }
  return counts;
}
