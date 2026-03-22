import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

/**
 * Mock the AiPlugHubAPI for renderer tests.
 * Individual tests can override specific methods via vi.mocked().
 */
const mockAiPlugHubAPI = {
  tools: {
    detect: vi.fn().mockResolvedValue([]),
    scan: vi.fn().mockResolvedValue([]),
    scanAll: vi.fn().mockResolvedValue([]),
  },
  components: {
    install: vi.fn().mockResolvedValue({}),
    uninstall: vi.fn().mockResolvedValue(undefined),
    enable: vi.fn().mockResolvedValue(undefined),
    disable: vi.fn().mockResolvedValue(undefined),
  },
  bundles: {
    exportBundle: vi.fn().mockResolvedValue('{}'),
    parseFile: vi.fn().mockResolvedValue({
      formatVersion: '1.0',
      exportedFrom: { tools: [], date: '' },
      plugins: [],
      components: [],
    }),
    detectConflicts: vi
      .fn()
      .mockResolvedValue({ newComponents: [], conflicts: [], incompatible: [] }),
    importBundle: vi.fn().mockResolvedValue({ installed: [], skipped: [], failed: [] }),
    saveBundle: vi.fn().mockResolvedValue('/tmp/test.aibundle'),
  },
  browse: {
    getEntries: vi.fn().mockResolvedValue([]),
    getDetail: vi.fn().mockResolvedValue({
      entry: { name: '', sourceId: '', ref: '', description: '', tools: [] },
      components: [],
      installSource: { type: 'marketplace', marketplace: '', ref: '' },
    }),
    install: vi.fn().mockResolvedValue({}),
    refreshSources: vi.fn().mockResolvedValue(undefined),
    backfillInstalledFrom: vi.fn().mockResolvedValue(0),
  },
  settings: {
    getSources: vi.fn().mockResolvedValue([]),
    addSource: vi.fn().mockResolvedValue({}),
    updateSource: vi.fn().mockResolvedValue({}),
    removeSource: vi.fn().mockResolvedValue(undefined),
  },
  preferences: {
    get: vi.fn().mockResolvedValue({ rescanOnLaunch: true, setupComplete: false }),
    set: vi.fn().mockResolvedValue({ rescanOnLaunch: true, setupComplete: false }),
  },
  plugins: {
    list: vi.fn().mockResolvedValue([]),
    toggle: vi.fn().mockResolvedValue(undefined),
    uninstall: vi.fn().mockResolvedValue(undefined),
  },
  projects: {
    list: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue({ path: '/tmp/test', name: 'test', addedAt: '' }),
    remove: vi.fn().mockResolvedValue(undefined),
    scan: vi.fn().mockResolvedValue([]),
    openFolderDialog: vi.fn().mockResolvedValue(null),
  },
  updates: {
    check: vi.fn().mockResolvedValue({ checkedAt: '', updates: [], errors: [] }),
    getAvailable: vi.fn().mockResolvedValue(null),
    apply: vi.fn().mockResolvedValue({ pluginKey: '', newVersion: '' }),
    applyAll: vi.fn().mockResolvedValue({ results: [] }),
    onAvailable: vi.fn().mockReturnValue(() => {}),
  },
  secrets: {
    hasGithubToken: vi.fn().mockResolvedValue(false),
    setGithubToken: vi.fn().mockResolvedValue(undefined),
    clearGithubToken: vi.fn().mockResolvedValue(undefined),
  },
  system: {
    openFileDialog: vi.fn().mockResolvedValue(null),
    showInExplorer: vi.fn().mockResolvedValue(undefined),
    getAppVersion: vi.fn().mockResolvedValue('0.1.0'),
    onFileDrop: vi.fn().mockReturnValue(() => {}),
    getPathForFile: vi.fn().mockReturnValue('/tmp/test.aibundle'),
  },
  backups: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({
      version: 1,
      toolId: 'claude-code',
      instanceId: 'claude-code-default',
      configPath: '/home/user/.claude',
      createdAt: '',
      fileCount: 0,
      totalBytes: 0,
      skipCaches: false,
      appVersion: '1.0.0',
      backupPath: '/tmp/backup',
    }),
    restore: vi.fn().mockResolvedValue({
      autoBackupPath: '/tmp/auto-backup',
      autoBackupManifest: {
        backupPath: '/tmp/auto-backup',
        version: 1,
        toolId: 'claude-code',
        instanceId: 'claude-code-default',
        configPath: '/home/user/.claude',
        createdAt: '',
        fileCount: 0,
        totalBytes: 0,
        skipCaches: false,
        appVersion: '1.0.0',
      },
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  progress: {
    onScanProgress: vi.fn().mockReturnValue(() => {}),
    onImportProgress: vi.fn().mockReturnValue(() => {}),
  },
};

Object.defineProperty(window, 'aiplughub', {
  value: mockAiPlugHubAPI,
  writable: true,
});
