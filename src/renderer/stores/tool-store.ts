/**
 * Tool + component state management.
 * Bridges the AiPlugHubAPI (IPC) with React via Zustand.
 */

import { create } from 'zustand';
import type {
  ToolDetectionResult,
  Component,
  ComponentId,
  NativePlugin,
  PluginUpdate,
  UpdateStatus,
} from '@shared/types';
import { componentIdEquals } from '@shared/utils';

export { componentIdEquals };

export type ToolStoreState = {
  // Data
  tools: ToolDetectionResult[];
  components: Component[];
  plugins: NativePlugin[];

  // Updates (USR-06)
  availableUpdates: PluginUpdate[];
  updateStatuses: Record<string, UpdateStatus>;
  lastUpdateCheck: string | null;
  isCheckingUpdates: boolean;

  // Status
  loading: boolean;
  scanning: boolean;
  error: string | null;

  // Actions
  detectTools: () => Promise<void>;
  scanAll: () => Promise<void>;
  toggleComponent: (id: ComponentId) => Promise<void>;
  uninstallComponent: (id: ComponentId) => Promise<void>;
  loadPlugins: () => Promise<void>;
  togglePlugin: (pluginKey: string) => Promise<void>;
  uninstallPlugin: (pluginKey: string) => Promise<void>;
  setComponents: (components: Component[]) => void;
  setTools: (tools: ToolDetectionResult[]) => void;
  clearError: () => void;

  // Update actions (USR-06)
  checkForUpdates: () => Promise<void>;
  applyUpdate: (pluginKey: string) => Promise<void>;
  applyAllUpdates: (pluginKeys: string[]) => Promise<void>;
  skipUpdate: (pluginKey: string) => void;
};

export const useToolStore = create<ToolStoreState>((set, get) => ({
  tools: [],
  components: [],
  plugins: [],
  availableUpdates: [],
  updateStatuses: {},
  lastUpdateCheck: null,
  isCheckingUpdates: false,
  loading: false,
  scanning: false,
  error: null,

  setTools: (tools) => set({ tools }),
  setComponents: (components) => set({ components }),
  clearError: () => set({ error: null }),

  detectTools: async () => {
    set({ loading: true, error: null });
    try {
      const tools = await window.aiplughub.tools.detect();
      set({ tools, loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  scanAll: async () => {
    if (get().scanning) return; // Guard against concurrent calls
    set({ scanning: true, error: null });
    try {
      const components = await window.aiplughub.tools.scanAll();
      set({ components, scanning: false });
    } catch (err) {
      set({ scanning: false, error: (err as Error).message });
    }
  },

  toggleComponent: async (id: ComponentId) => {
    const component = get().components.find((c) => componentIdEquals(c.id, id));
    if (!component || component.enabled === undefined) return;

    const wasEnabled = component.enabled;

    // Truly optimistic: update UI before IPC call
    set((state) => ({
      components: state.components.map((c) =>
        componentIdEquals(c.id, id) ? { ...c, enabled: !wasEnabled } : c,
      ),
    }));

    try {
      if (wasEnabled) {
        await window.aiplughub.components.disable(id);
      } else {
        await window.aiplughub.components.enable(id);
      }
    } catch (err) {
      // Rollback on failure — use functional set to avoid stale closure
      set((state) => ({
        components: state.components.map((c) =>
          componentIdEquals(c.id, id) ? { ...c, enabled: wasEnabled } : c,
        ),
        error: (err as Error).message,
      }));
    }
  },

  uninstallComponent: async (id: ComponentId) => {
    try {
      await window.aiplughub.components.uninstall(id);
      // Use functional set to operate on current state (avoids stale closure)
      set((state) => ({
        components: state.components.filter((c) => !componentIdEquals(c.id, id)),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  loadPlugins: async () => {
    try {
      const plugins = await window.aiplughub.plugins.list();
      set({ plugins });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  togglePlugin: async (pluginKey: string) => {
    const plugin = get().plugins.find((p) => p.pluginKey === pluginKey);
    if (!plugin) return;

    const wasEnabled = plugin.enabled;

    // Optimistic update: flip enabled on the matching plugin
    set((state) => ({
      plugins: state.plugins.map((p) =>
        p.pluginKey === pluginKey ? { ...p, enabled: !wasEnabled } : p,
      ),
    }));

    try {
      await window.aiplughub.plugins.toggle(pluginKey, !wasEnabled);
    } catch (err) {
      // Rollback on failure
      set((state) => ({
        plugins: state.plugins.map((p) =>
          p.pluginKey === pluginKey ? { ...p, enabled: wasEnabled } : p,
        ),
        error: (err as Error).message,
      }));
    }
  },

  uninstallPlugin: async (pluginKey: string) => {
    try {
      await window.aiplughub.plugins.uninstall(pluginKey);
      set((state) => ({
        plugins: state.plugins.filter((p) => p.pluginKey !== pluginKey),
        components: state.components.filter((c) => c.extensions?.pluginKey !== pluginKey),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  // --- Update actions (USR-06) ---

  checkForUpdates: async () => {
    set({ isCheckingUpdates: true, error: null });
    try {
      const result = await window.aiplughub.updates.check();
      set({
        availableUpdates: result.updates,
        lastUpdateCheck: result.checkedAt,
        isCheckingUpdates: false,
      });
    } catch (err) {
      set({ isCheckingUpdates: false, error: (err as Error).message });
    }
  },

  applyUpdate: async (pluginKey: string) => {
    set((state) => ({
      updateStatuses: {
        ...state.updateStatuses,
        [pluginKey]: { state: 'updating' },
      },
    }));
    try {
      const result = await window.aiplughub.updates.apply(pluginKey);
      set((state) => ({
        updateStatuses: {
          ...state.updateStatuses,
          [pluginKey]: { state: 'success', newVersion: result.newVersion },
        },
        availableUpdates: state.availableUpdates.filter((u) => u.pluginKey !== pluginKey),
      }));
    } catch (err) {
      set((state) => ({
        updateStatuses: {
          ...state.updateStatuses,
          [pluginKey]: { state: 'failed', error: (err as Error).message },
        },
      }));
    }
  },

  applyAllUpdates: async (pluginKeys: string[]) => {
    for (const pluginKey of pluginKeys) {
      await get().applyUpdate(pluginKey);
    }
  },

  skipUpdate: (pluginKey: string) => {
    set((state) => ({
      availableUpdates: state.availableUpdates.filter((u) => u.pluginKey !== pluginKey),
    }));
  },
}));

// Subscribe to boot auto-check push event (USR-06)
// This runs once when the module is loaded
if (typeof window !== 'undefined' && window.aiplughub?.updates?.onAvailable) {
  const unsubscribe = window.aiplughub.updates.onAvailable((result) => {
    useToolStore.setState({
      availableUpdates: result.updates,
      lastUpdateCheck: result.checkedAt,
    });
  });
  // Store unsubscribe for cleanup (not strictly needed in Electron — process lifetime = window lifetime)
  (useToolStore as unknown as { _unsubOnAvailable?: () => void })._unsubOnAvailable = unsubscribe;
}
