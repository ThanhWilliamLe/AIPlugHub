/**
 * UI state management — tabs, search, filters, panel, modals.
 */

import { create } from 'zustand';
import type { ToolId, ComponentType, ComponentId } from '@shared/types';
import { componentIdKey } from '@shared/utils';
import { MAX_BULK_SELECTION } from '@shared/constants';

export type Tab = 'my-setup' | 'browse' | 'transfer';

export type BulkOpProgress = {
  action: 'enable' | 'disable' | 'uninstall' | 'update';
  total: number;
  completed: number;
  errors: Array<{ id: ComponentId; error: string }>;
};

export type UiStoreState = {
  // Navigation
  activeTab: Tab;

  // Search & filters
  searchQuery: string;
  toolFilters: ToolId[];
  typeFilters: ComponentType[];

  // Detail panel
  selectedComponentId: ComponentId | null;

  // Modals & overlays
  showSettings: boolean;
  showFirstRun: boolean;
  showUninstallConfirm: ComponentId | null;

  // Update panel (USR-06)
  updatePanelOpen: boolean;
  updatePanelScrollTo: string | null;

  // Actions
  setActiveTab: (tab: Tab) => void;
  setSearchQuery: (query: string) => void;
  toggleToolFilter: (toolId: ToolId) => void;
  toggleTypeFilter: (type: ComponentType) => void;
  clearFilters: () => void;
  selectComponent: (id: ComponentId | null) => void;
  setShowSettings: (show: boolean) => void;
  setShowFirstRun: (show: boolean) => void;
  setShowUninstallConfirm: (id: ComponentId | null) => void;

  // Update panel actions (USR-06)
  openUpdatePanel: (scrollTo?: string) => void;
  closeUpdatePanel: () => void;

  // Bulk selection (USR-07)
  selectionMode: boolean;
  selectedIds: ComponentId[];
  bulkOperationProgress: BulkOpProgress | null;
  enterSelectionMode: () => void;
  exitSelectionMode: () => void;
  toggleSelectId: (id: ComponentId) => void;
  setSelectedIds: (ids: ComponentId[]) => void;
  clearSelection: () => void;
};

export const useUiStore = create<UiStoreState>((set) => ({
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

  setActiveTab: (activeTab) =>
    set({
      activeTab,
      selectedComponentId: null,
      updatePanelOpen: false,
      selectionMode: false,
      selectedIds: [],
    }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),

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

  clearFilters: () => set({ toolFilters: [], typeFilters: [], searchQuery: '' }),

  selectComponent: (selectedComponentId) => set({ selectedComponentId }),

  setShowSettings: (showSettings) => set({ showSettings }),

  setShowFirstRun: (showFirstRun) => set({ showFirstRun }),

  setShowUninstallConfirm: (showUninstallConfirm) => set({ showUninstallConfirm }),

  openUpdatePanel: (scrollTo) =>
    set({
      updatePanelOpen: true,
      updatePanelScrollTo: scrollTo ?? null,
      selectedComponentId: null,
    }),

  closeUpdatePanel: () => set({ updatePanelOpen: false, updatePanelScrollTo: null }),

  enterSelectionMode: () => set({ selectionMode: true, bulkOperationProgress: null }),
  exitSelectionMode: () =>
    set({ selectionMode: false, selectedIds: [], bulkOperationProgress: null }),
  toggleSelectId: (id) =>
    set((state) => {
      const key = componentIdKey(id);
      const exists = state.selectedIds.some((s) => componentIdKey(s) === key);
      return {
        selectedIds: exists
          ? state.selectedIds.filter((s) => componentIdKey(s) !== key)
          : [...state.selectedIds, id],
      };
    }),
  setSelectedIds: (ids) => set({ selectedIds: ids.slice(0, MAX_BULK_SELECTION) }),
  clearSelection: () => set({ selectedIds: [] }),
}));
