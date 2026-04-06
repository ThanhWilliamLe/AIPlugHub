/**
 * Wizard state management — export and import flows.
 */

import { create } from 'zustand';
import type {
  ComponentId,
  Bundle,
  BundleTarget,
  ConflictManifest,
  ConflictResolution,
  ImportResult,
  PortableComponent,
  PortablePlugin,
  ExportOptions,
  ConfigRequirement,
} from '@shared/types';
import { componentIdKey } from '@shared/utils';

export type ExportStep = 0 | 1 | 2 | 3;
export type ImportStep = 1 | 2;

/** Config prompt entry — one per required sensitive config across all components to install */
export type PendingConfig = {
  componentName: string;
  config: ConfigRequirement;
};

export type WizardStoreState = {
  // Active wizard
  activeWizard: 'export' | 'import' | null;

  // Export state
  exportStep: ExportStep;
  exportTarget: BundleTarget | null;
  selectedIds: ComponentId[];
  exportOptions: ExportOptions;
  exportedJson: string | null;
  savedFilePath: string | null;

  // Import state
  importStep: ImportStep;
  bundle: Bundle | null;
  conflicts: ConflictManifest | null;
  resolutions: ConflictResolution[];
  alwaysOverride: boolean;
  importResult: ImportResult | null;
  importing: boolean;
  importProjectPath: string | null;
  acceptedSourceIds: string[];

  // Config prompt state (H1: required config prompts at import time)
  pendingConfigs: PendingConfig[];
  configValues: Record<string, string>; // key: `${componentName}::${configKey}`
  componentsToInstall: PortableComponent[];
  pluginsToInstall: PortablePlugin[];
  showingConfigPrompts: boolean;

  // Loading
  loading: boolean;
  error: string | null;

  // Export actions
  startExport: () => void;
  startExportWithSelection: (ids: ComponentId[]) => void;
  setExportTarget: (target: BundleTarget) => void;
  setExportStep: (step: ExportStep) => void;
  toggleSelectId: (id: ComponentId) => void;
  selectAll: (ids: ComponentId[]) => void;
  deselectAll: () => void;
  setExportOptions: (options: Partial<ExportOptions>) => void;
  buildAndSave: () => Promise<void>;

  // Import actions
  startImport: () => void;
  loadBundle: (filePath: string) => Promise<void>;
  setImportStep: (step: ImportStep) => void;
  setResolution: (resolution: ConflictResolution) => void;
  setAlwaysOverride: (value: boolean) => void;
  setImportProjectPath: (path: string) => void;
  setAcceptedSourceIds: (ids: string[]) => void;
  executeImport: () => Promise<void>;
  setConfigValue: (key: string, value: string) => void;
  confirmConfigs: () => Promise<void>;

  // General
  closeWizard: () => void;
  clearError: () => void;
};

/** Build a descriptive default filename from selected components */
export function buildDefaultFilename(selectedIds: ComponentId[]): string {
  const count = selectedIds.length;
  const date = new Date().toISOString().slice(0, 10);
  const uniqueTools = [...new Set(selectedIds.map((id) => id.tool))].sort();
  const toolSuffix = uniqueTools.join('-');
  const noun = count === 1 ? 'component' : 'components';
  return `plughub-${count}-${noun}-${toolSuffix}-${date}`;
}

/** Collect components to install from conflict manifest + resolutions */
function collectToInstall(
  conflicts: ConflictManifest,
  resolutions: ConflictResolution[],
): PortableComponent[] {
  return [
    ...conflicts.newComponents,
    ...conflicts.conflicts
      .filter((c) => {
        const res = resolutions.find(
          (r) => r.componentKey.type === c.incoming.type && r.componentKey.name === c.incoming.name,
        );
        return res?.action === 'install';
      })
      .map((c) => c.incoming),
  ];
}

/** Patch components with user-provided config values (merge secrets back into core.env) */
function patchWithConfigValues(
  components: PortableComponent[],
  configValues: Record<string, string>,
): PortableComponent[] {
  return components.map((c) => {
    if (!c.requiredConfig?.some((r) => r.sensitive)) return c;
    const patched = structuredClone(c);
    const core = patched.core as Record<string, unknown>;
    const env: Record<string, string> = (core.env as Record<string, string>) ?? {};

    for (const req of c.requiredConfig ?? []) {
      if (req.sensitive && req.envVar) {
        const value = configValues[`${c.name}::${req.key}`];
        if (value) env[req.envVar] = value;
      }
    }

    if (Object.keys(env).length > 0) core.env = env;
    return patched;
  });
}

export const useWizardStore = create<WizardStoreState>((set, get) => {
  /** Shared install logic — sends components + plugins to IPC and updates result state */
  async function doInstall(
    components: PortableComponent[],
    plugins?: PortablePlugin[],
  ): Promise<void> {
    set({ importing: true, error: null, importStep: 2, showingConfigPrompts: false });
    try {
      const skipResolutions = get().resolutions.filter((r) => r.action === 'skip');
      const result = await window.aiplughub.bundles.importBundle(
        components,
        skipResolutions,
        plugins,
      );
      set({ importResult: result, importing: false });
    } catch (err) {
      set({ importing: false, error: (err as Error).message });
    }
  }

  return {
    activeWizard: null,
    exportStep: 0,
    exportTarget: null,
    selectedIds: [],
    exportOptions: {},
    exportedJson: null,
    savedFilePath: null,
    importStep: 1,
    bundle: null,
    conflicts: null,
    resolutions: [],
    alwaysOverride: false,
    importResult: null,
    importing: false,
    importProjectPath: null,
    acceptedSourceIds: [],
    pendingConfigs: [],
    configValues: {},
    componentsToInstall: [],
    pluginsToInstall: [],
    showingConfigPrompts: false,
    loading: false,
    error: null,

    startExport: () =>
      set({
        activeWizard: 'export',
        exportStep: 0,
        exportTarget: null,
        selectedIds: [],
        exportOptions: {},
        exportedJson: null,
        savedFilePath: null,
        error: null,
      }),

    startExportWithSelection: (ids) =>
      set({
        activeWizard: 'export',
        exportStep: 1,
        exportTarget: null,
        selectedIds: ids,
        exportOptions: {},
        exportedJson: null,
        savedFilePath: null,
        error: null,
      }),

    setExportTarget: (target) => set({ exportTarget: target, exportStep: 1, selectedIds: [] }),

    setExportStep: (exportStep) => set({ exportStep }),

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

    selectAll: (ids) => set({ selectedIds: ids }),

    deselectAll: () => set({ selectedIds: [] }),

    setExportOptions: (options) =>
      set((state) => ({ exportOptions: { ...state.exportOptions, ...options } })),

    buildAndSave: async () => {
      const { selectedIds, exportOptions, exportTarget } = get();
      if (selectedIds.length === 0) return;
      // Merge export target into options for IPC
      const mergedOptions = { ...exportOptions, target: exportTarget ?? undefined };

      set({ loading: true, error: null });
      try {
        const json = await window.aiplughub.bundles.exportBundle(selectedIds, mergedOptions);
        const bundleName = exportOptions.name || buildDefaultFilename(selectedIds);
        const savedPath = await window.aiplughub.bundles.saveBundle(json, bundleName);

        if (savedPath) {
          set({ exportedJson: json, savedFilePath: savedPath, exportStep: 3, loading: false });
        } else {
          // User cancelled save dialog
          set({ loading: false });
        }
      } catch (err) {
        set({ loading: false, error: (err as Error).message });
      }
    },

    startImport: () =>
      set({
        activeWizard: 'import',
        importStep: 1,
        bundle: null,
        conflicts: null,
        resolutions: [],
        alwaysOverride: false,
        importResult: null,
        importing: false,
        importProjectPath: null,
        acceptedSourceIds: [],
        pendingConfigs: [],
        configValues: {},
        componentsToInstall: [],
        pluginsToInstall: [],
        showingConfigPrompts: false,
        error: null,
      }),

    loadBundle: async (filePath: string) => {
      set({ loading: true, error: null });
      try {
        const bundle = await window.aiplughub.bundles.parseFile(filePath);
        const conflicts = await window.aiplughub.bundles.detectConflicts(bundle);

        // Auto-generate default resolutions
        const resolutions: ConflictResolution[] = conflicts.conflicts.map((c) => ({
          componentKey: { type: c.incoming.type, name: c.incoming.name },
          action: c.conflictType === 'identical' ? 'skip' : 'install',
        }));

        // Default all recommended sources to accepted (opt-out, not opt-in)
        const defaultAcceptedSourceIds = (bundle.recommendedSources ?? []).map((s) => s.sourceId);

        set({
          bundle,
          conflicts,
          resolutions,
          acceptedSourceIds: defaultAcceptedSourceIds,
          loading: false,
          activeWizard: 'import',
          importStep: 1,
        });
      } catch (err) {
        set({ loading: false, error: (err as Error).message });
      }
    },

    setImportStep: (importStep) => set({ importStep }),

    setResolution: (resolution) =>
      set((state) => {
        const key = `${resolution.componentKey.type}:${resolution.componentKey.name}`;
        const updated = state.resolutions.filter(
          (r) => `${r.componentKey.type}:${r.componentKey.name}` !== key,
        );
        return { resolutions: [...updated, resolution] };
      }),

    // Fix M3: only override non-identical conflicts
    setAlwaysOverride: (alwaysOverride) =>
      set((state) => {
        if (!alwaysOverride) return { alwaysOverride };
        // Build set of identical conflict keys so we don't override them
        const identicalKeys = new Set(
          state.conflicts?.conflicts
            .filter((c) => c.conflictType === 'identical')
            .map((c) => `${c.incoming.type}:${c.incoming.name}`) ?? [],
        );
        const resolutions = state.resolutions.map((r) => {
          const key = `${r.componentKey.type}:${r.componentKey.name}`;
          if (identicalKeys.has(key)) return r; // Preserve skip for identical
          return { ...r, action: 'install' as const };
        });
        return { alwaysOverride, resolutions };
      }),

    setImportProjectPath: (importProjectPath) => set({ importProjectPath }),

    setAcceptedSourceIds: (acceptedSourceIds) => set({ acceptedSourceIds }),

    // Fix H1: check for required configs before installing
    executeImport: async () => {
      const { bundle, conflicts, resolutions } = get();
      if (!bundle || !conflicts) return;

      const toInstall = collectToInstall(conflicts, resolutions);
      // v1.7.0: pass plugins directly from bundle for full structure restoration
      const pluginsForImport = bundle.plugins ?? [];

      // Collect required sensitive configs from components to install
      const pendingConfigs: PendingConfig[] = [];
      for (const comp of toInstall) {
        if (comp.requiredConfig) {
          for (const cfg of comp.requiredConfig) {
            if (cfg.sensitive) {
              pendingConfigs.push({ componentName: comp.name, config: cfg });
            }
          }
        }
      }

      if (pendingConfigs.length > 0) {
        // Show config prompts before installing
        set({
          importStep: 2,
          componentsToInstall: toInstall,
          pluginsToInstall: pluginsForImport,
          pendingConfigs,
          configValues: {},
          showingConfigPrompts: true,
        });
        return;
      }

      // Add accepted recommended sources before installing
      const { acceptedSourceIds, bundle: b } = get();
      if (acceptedSourceIds.length > 0 && b?.recommendedSources) {
        for (const srcId of acceptedSourceIds) {
          const src = b.recommendedSources.find((s) => s.sourceId === srcId);
          if (src) {
            try {
              await window.aiplughub.settings.addSource({
                sourceType: src.sourceType,
                url: src.url,
                displayName: src.displayName,
              });
            } catch {
              // Best-effort — don't block import if source add fails
            }
          }
        }
      }

      // No configs needed — install directly
      await doInstall(toInstall, pluginsForImport);
    },

    setConfigValue: (key, value) =>
      set((state) => ({
        configValues: { ...state.configValues, [key]: value },
      })),

    // Fix H1: patch components with config values, then install
    confirmConfigs: async () => {
      const { componentsToInstall, pluginsToInstall, configValues, acceptedSourceIds, bundle } =
        get();

      // Add accepted recommended sources before installing (same as executeImport no-config path)
      if (acceptedSourceIds.length > 0 && bundle?.recommendedSources) {
        for (const srcId of acceptedSourceIds) {
          const src = bundle.recommendedSources.find((s) => s.sourceId === srcId);
          if (src) {
            try {
              await window.aiplughub.settings.addSource({
                sourceType: src.sourceType,
                url: src.url,
                displayName: src.displayName,
              });
            } catch {
              // Best-effort — don't block import if source add fails
            }
          }
        }
      }

      const patched = patchWithConfigValues(componentsToInstall, configValues);
      await doInstall(patched, pluginsToInstall);
    },

    closeWizard: () =>
      set({
        activeWizard: null,
        exportStep: 0,
        selectedIds: [],
        exportOptions: {},
        exportedJson: null,
        savedFilePath: null,
        importStep: 1,
        bundle: null,
        conflicts: null,
        resolutions: [],
        alwaysOverride: false,
        importResult: null,
        importing: false,
        importProjectPath: null,
        acceptedSourceIds: [],
        pendingConfigs: [],
        configValues: {},
        componentsToInstall: [],
        pluginsToInstall: [],
        showingConfigPrompts: false,
        loading: false,
        error: null,
      }),

    clearError: () => set({ error: null }),
  };
});
