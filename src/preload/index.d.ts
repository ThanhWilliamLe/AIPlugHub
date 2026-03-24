/**
 * AiPlugHubAPI type declarations for the renderer.
 * Matches the API surface exposed by the preload script.
 * Source: 4B-architecture/system-design.md §2 IPC API
 */

import type {
  ToolDetectionResult,
  Component,
  ComponentId,
  PortableComponent,
  InstallTarget,
  ScanProgressEvent,
  ImportProgressEvent,
  Bundle,
  ExportOptions,
  ConflictManifest,
  ImportResult,
  ConflictResolution,
  MarketplaceEntry,
  MarketplaceDetail,
  MarketplaceRef,
  MarketplaceSourceConfig,
  NewSourceConfig,
  BrowseInstallTarget,
  UserPreferences,
  ProjectFolder,
  NativePlugin,
  UpdateCheckResult,
  BackupSummary,
  BackupCreateOptions,
  RestoreResult,
} from '@shared/types';

export type FileDialogOptions = {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
};

export interface AiPlugHubAPI {
  tools: {
    detect(): Promise<ToolDetectionResult[]>;
    scan(instanceId: string): Promise<Component[]>;
    scanAll(): Promise<Component[]>;
  };

  components: {
    install(portable: PortableComponent, target: InstallTarget): Promise<Component>;
    uninstall(id: ComponentId): Promise<void>;
    enable(id: ComponentId): Promise<void>;
    disable(id: ComponentId): Promise<void>;
  };

  bundles: {
    exportBundle(componentIds: ComponentId[], options: ExportOptions): Promise<string>;
    parseFile(filePath: string): Promise<Bundle>;
    detectConflicts(bundle: Bundle): Promise<ConflictManifest>;
    importBundle(
      components: PortableComponent[],
      resolutions: ConflictResolution[],
    ): Promise<ImportResult>;
    saveBundle(json: string, defaultName: string): Promise<string | null>;
  };

  browse: {
    getEntries(): Promise<MarketplaceEntry[]>;
    getDetail(ref: MarketplaceRef): Promise<MarketplaceDetail>;
    install(ref: MarketplaceRef, target: BrowseInstallTarget): Promise<Component>;
    refreshSources(): Promise<void>;
    backfillInstalledFrom(): Promise<number>;
  };

  plugins: {
    list(): Promise<NativePlugin[]>;
    toggle(pluginKey: string, enabled: boolean): Promise<void>;
    uninstall(pluginKey: string): Promise<void>;
  };

  updates: {
    check(): Promise<UpdateCheckResult>;
    getAvailable(): Promise<UpdateCheckResult | null>;
    apply(pluginKey: string): Promise<{ pluginKey: string; newVersion?: string }>;
    applyAll(pluginKeys: string[]): Promise<{
      results: Array<{
        pluginKey: string;
        status: 'success' | 'failed';
        error?: string;
        newVersion?: string;
      }>;
    }>;
    onAvailable(callback: (result: UpdateCheckResult) => void): () => void;
  };

  settings: {
    getSources(): Promise<MarketplaceSourceConfig[]>;
    addSource(config: NewSourceConfig): Promise<MarketplaceSourceConfig>;
    updateSource(
      sourceId: string,
      config: Partial<NewSourceConfig>,
    ): Promise<MarketplaceSourceConfig>;
    removeSource(sourceId: string): Promise<void>;
  };

  projects: {
    list(): Promise<ProjectFolder[]>;
    add(path: string): Promise<ProjectFolder>;
    remove(path: string): Promise<void>;
    scan(path: string): Promise<Component[]>;
    openFolderDialog(): Promise<string | null>;
  };

  preferences: {
    get(): Promise<UserPreferences>;
    set(prefs: Partial<UserPreferences>): Promise<UserPreferences>;
  };

  secrets: {
    hasGithubToken(): Promise<boolean>;
    setGithubToken(token: string): Promise<void>;
    clearGithubToken(): Promise<void>;
  };

  backups: {
    list(instanceId: string): Promise<BackupSummary[]>;
    create(instanceId: string, options?: BackupCreateOptions): Promise<BackupSummary>;
    restore(instanceId: string, backupPath: string): Promise<RestoreResult>;
    delete(instanceId: string, backupPath: string): Promise<void>;
  };

  system: {
    openFileDialog(options: FileDialogOptions): Promise<string | null>;
    showInExplorer(path: string): Promise<void>;
    openUrl(url: string): Promise<void>;
    getAppVersion(): Promise<string>;
    onFileDrop(callback: (filePath: string) => void): () => void;
    getPathForFile(file: File): string;
  };

  progress: {
    onScanProgress(callback: (event: ScanProgressEvent) => void): () => void;
    onImportProgress(callback: (event: ImportProgressEvent) => void): () => void;
  };
}

declare global {
  interface Window {
    aiplughub: AiPlugHubAPI;
  }
}
