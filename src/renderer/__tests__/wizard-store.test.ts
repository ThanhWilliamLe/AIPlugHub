import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWizardStore, buildDefaultFilename } from '../stores/wizard-store';
import type {
  ComponentId,
  ConflictManifest,
  ConflictResolution,
  PortableComponent,
} from '@shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeId(overrides: Partial<ComponentId> = {}): ComponentId {
  return {
    tool: 'claude-code',
    type: 'mcp-server',
    name: 'test-server',
    scope: 'user',
    ...overrides,
  };
}

function makePortable(overrides: Partial<PortableComponent> = {}): PortableComponent {
  return {
    type: 'mcp-server',
    name: 'test-server',
    core: { transport: 'stdio' as const, command: 'test-cmd' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  useWizardStore.getState().closeWizard();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// startExport
// ---------------------------------------------------------------------------

describe('startExport', () => {
  it('sets activeWizard to export', () => {
    useWizardStore.getState().startExport();
    expect(useWizardStore.getState().activeWizard).toBe('export');
  });

  it('resets exportStep to 1', () => {
    useWizardStore.setState({ exportStep: 3 });
    useWizardStore.getState().startExport();
    expect(useWizardStore.getState().exportStep).toBe(1);
  });

  it('clears selectedIds', () => {
    useWizardStore.setState({ selectedIds: [makeId()] });
    useWizardStore.getState().startExport();
    expect(useWizardStore.getState().selectedIds).toEqual([]);
  });

  it('clears exportOptions', () => {
    useWizardStore.setState({ exportOptions: { name: 'old' } });
    useWizardStore.getState().startExport();
    expect(useWizardStore.getState().exportOptions).toEqual({});
  });

  it('clears exportedJson', () => {
    useWizardStore.setState({ exportedJson: '{"some":"json"}' });
    useWizardStore.getState().startExport();
    expect(useWizardStore.getState().exportedJson).toBeNull();
  });

  it('clears error', () => {
    useWizardStore.setState({ error: 'old error' });
    useWizardStore.getState().startExport();
    expect(useWizardStore.getState().error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// toggleSelectId
// ---------------------------------------------------------------------------

describe('toggleSelectId', () => {
  it('adds an id when not present', () => {
    const id = makeId();
    useWizardStore.getState().toggleSelectId(id);
    expect(useWizardStore.getState().selectedIds).toEqual([id]);
  });

  it('removes an id when already present', () => {
    const id = makeId();
    useWizardStore.setState({ selectedIds: [id] });
    useWizardStore.getState().toggleSelectId(id);
    expect(useWizardStore.getState().selectedIds).toEqual([]);
  });

  it('matches by composite key (tool:type:name:scope)', () => {
    const id1 = makeId({ name: 'alpha' });
    const id2 = makeId({ name: 'alpha' }); // same key, different object
    useWizardStore.setState({ selectedIds: [id1] });
    useWizardStore.getState().toggleSelectId(id2);
    // Should remove because composite keys match
    expect(useWizardStore.getState().selectedIds).toEqual([]);
  });

  it('does not remove a different id with overlapping fields', () => {
    const id1 = makeId({ name: 'alpha' });
    const id2 = makeId({ name: 'beta' });
    useWizardStore.setState({ selectedIds: [id1] });
    useWizardStore.getState().toggleSelectId(id2);
    expect(useWizardStore.getState().selectedIds).toHaveLength(2);
  });

  it('accumulates multiple distinct ids', () => {
    const ids = [
      makeId({ name: 'a' }),
      makeId({ name: 'b' }),
      makeId({ name: 'c' }),
    ];
    for (const id of ids) {
      useWizardStore.getState().toggleSelectId(id);
    }
    expect(useWizardStore.getState().selectedIds).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// selectAll / deselectAll
// ---------------------------------------------------------------------------

describe('selectAll / deselectAll', () => {
  it('selectAll replaces selectedIds', () => {
    const ids = [makeId({ name: 'a' }), makeId({ name: 'b' })];
    useWizardStore.getState().selectAll(ids);
    expect(useWizardStore.getState().selectedIds).toEqual(ids);
  });

  it('selectAll overwrites previous selection', () => {
    useWizardStore.setState({ selectedIds: [makeId({ name: 'old' })] });
    const ids = [makeId({ name: 'new' })];
    useWizardStore.getState().selectAll(ids);
    expect(useWizardStore.getState().selectedIds).toEqual(ids);
  });

  it('deselectAll clears selectedIds', () => {
    useWizardStore.setState({ selectedIds: [makeId()] });
    useWizardStore.getState().deselectAll();
    expect(useWizardStore.getState().selectedIds).toEqual([]);
  });

  it('deselectAll is safe when already empty', () => {
    useWizardStore.getState().deselectAll();
    expect(useWizardStore.getState().selectedIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// startImport
// ---------------------------------------------------------------------------

describe('startImport', () => {
  it('sets activeWizard to import', () => {
    useWizardStore.getState().startImport();
    expect(useWizardStore.getState().activeWizard).toBe('import');
  });

  it('resets importStep to 1', () => {
    useWizardStore.setState({ importStep: 2 });
    useWizardStore.getState().startImport();
    expect(useWizardStore.getState().importStep).toBe(1);
  });

  it('clears bundle and conflicts', () => {
    useWizardStore.setState({
      bundle: { formatVersion: '1.0', exportedFrom: { tools: [], date: '' }, plugins: [], components: [] },
      conflicts: { newComponents: [], conflicts: [], incompatible: [] },
    });
    useWizardStore.getState().startImport();
    expect(useWizardStore.getState().bundle).toBeNull();
    expect(useWizardStore.getState().conflicts).toBeNull();
  });

  it('clears resolutions and importResult', () => {
    useWizardStore.setState({
      resolutions: [{ componentKey: { type: 'mcp-server', name: 'x' }, action: 'skip' }],
      importResult: { installed: [], skipped: [], failed: [] },
    });
    useWizardStore.getState().startImport();
    expect(useWizardStore.getState().resolutions).toEqual([]);
    expect(useWizardStore.getState().importResult).toBeNull();
  });

  it('resets config prompt state', () => {
    useWizardStore.setState({
      pendingConfigs: [{ componentName: 'test', config: { key: 'k' } }],
      configValues: { 'test::k': 'v' },
      componentsToInstall: [makePortable()],
      showingConfigPrompts: true,
    });
    useWizardStore.getState().startImport();
    expect(useWizardStore.getState().pendingConfigs).toEqual([]);
    expect(useWizardStore.getState().configValues).toEqual({});
    expect(useWizardStore.getState().componentsToInstall).toEqual([]);
    expect(useWizardStore.getState().showingConfigPrompts).toBe(false);
  });

  it('clears error', () => {
    useWizardStore.setState({ error: 'stale error' });
    useWizardStore.getState().startImport();
    expect(useWizardStore.getState().error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setResolution
// ---------------------------------------------------------------------------

describe('setResolution', () => {
  it('adds a new resolution', () => {
    const res: ConflictResolution = {
      componentKey: { type: 'mcp-server', name: 'test-server' },
      action: 'install',
    };
    useWizardStore.getState().setResolution(res);
    expect(useWizardStore.getState().resolutions).toEqual([res]);
  });

  it('replaces an existing resolution with same key', () => {
    const initial: ConflictResolution = {
      componentKey: { type: 'mcp-server', name: 'test-server' },
      action: 'install',
    };
    useWizardStore.setState({ resolutions: [initial] });

    const updated: ConflictResolution = {
      componentKey: { type: 'mcp-server', name: 'test-server' },
      action: 'skip',
    };
    useWizardStore.getState().setResolution(updated);

    const { resolutions } = useWizardStore.getState();
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0].action).toBe('skip');
  });

  it('preserves resolutions for other components', () => {
    const r1: ConflictResolution = {
      componentKey: { type: 'mcp-server', name: 'server-a' },
      action: 'install',
    };
    const r2: ConflictResolution = {
      componentKey: { type: 'skill', name: 'skill-b' },
      action: 'skip',
    };
    useWizardStore.setState({ resolutions: [r1, r2] });

    const r1Updated: ConflictResolution = {
      componentKey: { type: 'mcp-server', name: 'server-a' },
      action: 'skip',
    };
    useWizardStore.getState().setResolution(r1Updated);

    const { resolutions } = useWizardStore.getState();
    expect(resolutions).toHaveLength(2);
    expect(resolutions.find((r) => r.componentKey.name === 'server-a')?.action).toBe('skip');
    expect(resolutions.find((r) => r.componentKey.name === 'skill-b')?.action).toBe('skip');
  });
});

// ---------------------------------------------------------------------------
// setAlwaysOverride
// ---------------------------------------------------------------------------

describe('setAlwaysOverride', () => {
  const conflictManifest: ConflictManifest = {
    newComponents: [],
    conflicts: [
      {
        incoming: makePortable({ name: 'changed-server' }),
        existing: {
          id: makeId({ name: 'changed-server' }),
          enabled: true,
          tracking: 'detected',
          core: { transport: 'stdio' as const, command: 'old-cmd' },
        },
        conflictType: 'content',
      },
      {
        incoming: makePortable({ name: 'identical-server' }),
        existing: {
          id: makeId({ name: 'identical-server' }),
          enabled: true,
          tracking: 'detected',
          core: { transport: 'stdio' as const, command: 'test-cmd' },
        },
        conflictType: 'identical',
      },
    ],
    incompatible: [],
  };

  const initialResolutions: ConflictResolution[] = [
    { componentKey: { type: 'mcp-server', name: 'changed-server' }, action: 'skip' },
    { componentKey: { type: 'mcp-server', name: 'identical-server' }, action: 'skip' },
  ];

  it('sets non-identical conflicts to install when true', () => {
    useWizardStore.setState({
      conflicts: conflictManifest,
      resolutions: initialResolutions,
    });
    useWizardStore.getState().setAlwaysOverride(true);

    const { resolutions } = useWizardStore.getState();
    const changedRes = resolutions.find((r) => r.componentKey.name === 'changed-server');
    expect(changedRes?.action).toBe('install');
  });

  it('preserves skip for identical conflicts when true', () => {
    useWizardStore.setState({
      conflicts: conflictManifest,
      resolutions: initialResolutions,
    });
    useWizardStore.getState().setAlwaysOverride(true);

    const { resolutions } = useWizardStore.getState();
    const identicalRes = resolutions.find((r) => r.componentKey.name === 'identical-server');
    expect(identicalRes?.action).toBe('skip');
  });

  it('sets the alwaysOverride flag to true', () => {
    useWizardStore.setState({
      conflicts: conflictManifest,
      resolutions: initialResolutions,
    });
    useWizardStore.getState().setAlwaysOverride(true);
    expect(useWizardStore.getState().alwaysOverride).toBe(true);
  });

  it('only toggles the flag when set to false', () => {
    useWizardStore.setState({
      conflicts: conflictManifest,
      resolutions: [
        { componentKey: { type: 'mcp-server', name: 'changed-server' }, action: 'install' },
        { componentKey: { type: 'mcp-server', name: 'identical-server' }, action: 'skip' },
      ],
      alwaysOverride: true,
    });
    useWizardStore.getState().setAlwaysOverride(false);

    expect(useWizardStore.getState().alwaysOverride).toBe(false);
    // Resolutions remain unchanged
    const { resolutions } = useWizardStore.getState();
    expect(resolutions.find((r) => r.componentKey.name === 'changed-server')?.action).toBe('install');
  });
});

// ---------------------------------------------------------------------------
// closeWizard
// ---------------------------------------------------------------------------

describe('closeWizard', () => {
  it('resets activeWizard to null', () => {
    useWizardStore.setState({ activeWizard: 'export' });
    useWizardStore.getState().closeWizard();
    expect(useWizardStore.getState().activeWizard).toBeNull();
  });

  it('resets all export state', () => {
    useWizardStore.setState({
      exportStep: 3,
      selectedIds: [makeId()],
      exportOptions: { name: 'my-bundle' },
      exportedJson: '{}',
    });
    useWizardStore.getState().closeWizard();
    const state = useWizardStore.getState();
    expect(state.exportStep).toBe(1);
    expect(state.selectedIds).toEqual([]);
    expect(state.exportOptions).toEqual({});
    expect(state.exportedJson).toBeNull();
  });

  it('resets all import state', () => {
    useWizardStore.setState({
      importStep: 2,
      bundle: { formatVersion: '1.0', exportedFrom: { tools: [], date: '' }, plugins: [], components: [] },
      conflicts: { newComponents: [], conflicts: [], incompatible: [] },
      resolutions: [{ componentKey: { type: 'mcp-server', name: 'x' }, action: 'install' }],
      alwaysOverride: true,
      importResult: { installed: [], skipped: [], failed: [] },
      importing: true,
    });
    useWizardStore.getState().closeWizard();
    const state = useWizardStore.getState();
    expect(state.importStep).toBe(1);
    expect(state.bundle).toBeNull();
    expect(state.conflicts).toBeNull();
    expect(state.resolutions).toEqual([]);
    expect(state.alwaysOverride).toBe(false);
    expect(state.importResult).toBeNull();
    expect(state.importing).toBe(false);
  });

  it('resets config prompt state', () => {
    useWizardStore.setState({
      pendingConfigs: [{ componentName: 'srv', config: { key: 'API_KEY' } }],
      configValues: { 'srv::API_KEY': 'secret' },
      componentsToInstall: [makePortable()],
      showingConfigPrompts: true,
    });
    useWizardStore.getState().closeWizard();
    const state = useWizardStore.getState();
    expect(state.pendingConfigs).toEqual([]);
    expect(state.configValues).toEqual({});
    expect(state.componentsToInstall).toEqual([]);
    expect(state.showingConfigPrompts).toBe(false);
  });

  it('resets loading and error', () => {
    useWizardStore.setState({ loading: true, error: 'something broke' });
    useWizardStore.getState().closeWizard();
    expect(useWizardStore.getState().loading).toBe(false);
    expect(useWizardStore.getState().error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setConfigValue
// ---------------------------------------------------------------------------

describe('setConfigValue', () => {
  it('stores a key-value pair', () => {
    useWizardStore.getState().setConfigValue('server::API_KEY', 'my-secret');
    expect(useWizardStore.getState().configValues).toEqual({ 'server::API_KEY': 'my-secret' });
  });

  it('overwrites existing value for same key', () => {
    useWizardStore.getState().setConfigValue('server::API_KEY', 'old');
    useWizardStore.getState().setConfigValue('server::API_KEY', 'new');
    expect(useWizardStore.getState().configValues['server::API_KEY']).toBe('new');
  });

  it('preserves other config values', () => {
    useWizardStore.getState().setConfigValue('a::KEY1', 'val1');
    useWizardStore.getState().setConfigValue('b::KEY2', 'val2');
    const { configValues } = useWizardStore.getState();
    expect(configValues['a::KEY1']).toBe('val1');
    expect(configValues['b::KEY2']).toBe('val2');
  });
});

// ---------------------------------------------------------------------------
// executeImport -- with no configs
// ---------------------------------------------------------------------------

describe('executeImport -- with no configs', () => {
  const newComponent = makePortable({ name: 'new-server' });
  const conflictManifest: ConflictManifest = {
    newComponents: [newComponent],
    conflicts: [],
    incompatible: [],
  };
  const bundle = {
    formatVersion: '1.0',
    exportedFrom: { tools: [] as string[], date: '2026-01-01' },
    plugins: [],
    components: [newComponent],
  };

  it('calls importBundle directly when no required configs', async () => {
    useWizardStore.setState({
      activeWizard: 'import',
      bundle,
      conflicts: conflictManifest,
      resolutions: [],
    });

    await useWizardStore.getState().executeImport();

    expect(window.aiplughub.bundles.importBundle).toHaveBeenCalledWith(
      [newComponent],
      [],
    );
  });

  it('sets importing to true during import, false after', async () => {
    useWizardStore.setState({
      activeWizard: 'import',
      bundle,
      conflicts: conflictManifest,
      resolutions: [],
    });

    await useWizardStore.getState().executeImport();

    expect(useWizardStore.getState().importing).toBe(false);
    expect(useWizardStore.getState().importStep).toBe(2);
  });

  it('stores importResult on success', async () => {
    const mockResult = { installed: [], skipped: [], failed: [] };
    vi.mocked(window.aiplughub.bundles.importBundle).mockResolvedValueOnce(mockResult);

    useWizardStore.setState({
      activeWizard: 'import',
      bundle,
      conflicts: conflictManifest,
      resolutions: [],
    });

    await useWizardStore.getState().executeImport();

    expect(useWizardStore.getState().importResult).toEqual(mockResult);
  });

  it('sets error on failure', async () => {
    vi.mocked(window.aiplughub.bundles.importBundle).mockRejectedValueOnce(
      new Error('install failed'),
    );

    useWizardStore.setState({
      activeWizard: 'import',
      bundle,
      conflicts: conflictManifest,
      resolutions: [],
    });

    await useWizardStore.getState().executeImport();

    expect(useWizardStore.getState().error).toBe('install failed');
    expect(useWizardStore.getState().importing).toBe(false);
  });

  it('does nothing when bundle is null', async () => {
    useWizardStore.setState({ bundle: null, conflicts: null });
    await useWizardStore.getState().executeImport();
    expect(window.aiplughub.bundles.importBundle).not.toHaveBeenCalled();
  });

  it('passes skip resolutions to importBundle', async () => {
    const conflictComp = makePortable({ name: 'conflict-server' });
    const manifest: ConflictManifest = {
      newComponents: [newComponent],
      conflicts: [
        {
          incoming: conflictComp,
          existing: {
            id: makeId({ name: 'conflict-server' }),
            enabled: true,
            tracking: 'detected',
            core: { transport: 'stdio' as const, command: 'old' },
          },
          conflictType: 'content',
        },
      ],
      incompatible: [],
    };
    const skipRes: ConflictResolution = {
      componentKey: { type: 'mcp-server', name: 'conflict-server' },
      action: 'skip',
    };

    useWizardStore.setState({
      activeWizard: 'import',
      bundle,
      conflicts: manifest,
      resolutions: [skipRes],
    });

    await useWizardStore.getState().executeImport();

    // Only newComponent is installed (conflict-server is skipped via resolution)
    expect(window.aiplughub.bundles.importBundle).toHaveBeenCalledWith(
      [newComponent],
      [skipRes],
    );
  });
});

// ---------------------------------------------------------------------------
// executeImport -- with pending configs
// ---------------------------------------------------------------------------

describe('executeImport -- with pending configs', () => {
  const componentWithConfig = makePortable({
    name: 'api-server',
    requiredConfig: [
      { key: 'API_KEY', sensitive: true, envVar: 'API_KEY' },
    ],
  });

  const conflictManifest: ConflictManifest = {
    newComponents: [componentWithConfig],
    conflicts: [],
    incompatible: [],
  };

  const bundle = {
    formatVersion: '1.0',
    exportedFrom: { tools: [] as string[], date: '2026-01-01' },
    plugins: [],
    components: [componentWithConfig],
  };

  it('sets showingConfigPrompts to true when configs are required', async () => {
    useWizardStore.setState({
      activeWizard: 'import',
      bundle,
      conflicts: conflictManifest,
      resolutions: [],
    });

    await useWizardStore.getState().executeImport();

    expect(useWizardStore.getState().showingConfigPrompts).toBe(true);
  });

  it('does not call importBundle when configs are pending', async () => {
    useWizardStore.setState({
      activeWizard: 'import',
      bundle,
      conflicts: conflictManifest,
      resolutions: [],
    });

    await useWizardStore.getState().executeImport();

    expect(window.aiplughub.bundles.importBundle).not.toHaveBeenCalled();
  });

  it('populates pendingConfigs with sensitive config entries', async () => {
    useWizardStore.setState({
      activeWizard: 'import',
      bundle,
      conflicts: conflictManifest,
      resolutions: [],
    });

    await useWizardStore.getState().executeImport();

    const { pendingConfigs } = useWizardStore.getState();
    expect(pendingConfigs).toHaveLength(1);
    expect(pendingConfigs[0].componentName).toBe('api-server');
    expect(pendingConfigs[0].config.key).toBe('API_KEY');
  });

  it('stores componentsToInstall for later use by confirmConfigs', async () => {
    useWizardStore.setState({
      activeWizard: 'import',
      bundle,
      conflicts: conflictManifest,
      resolutions: [],
    });

    await useWizardStore.getState().executeImport();

    expect(useWizardStore.getState().componentsToInstall).toEqual([componentWithConfig]);
  });

  it('advances importStep to 2', async () => {
    useWizardStore.setState({
      activeWizard: 'import',
      bundle,
      conflicts: conflictManifest,
      resolutions: [],
    });

    await useWizardStore.getState().executeImport();

    expect(useWizardStore.getState().importStep).toBe(2);
  });

  it('resets configValues for fresh input', async () => {
    useWizardStore.setState({
      activeWizard: 'import',
      bundle,
      conflicts: conflictManifest,
      resolutions: [],
      configValues: { 'old::KEY': 'stale' },
    });

    await useWizardStore.getState().executeImport();

    expect(useWizardStore.getState().configValues).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// confirmConfigs
// ---------------------------------------------------------------------------

describe('confirmConfigs', () => {
  const componentWithConfig = makePortable({
    name: 'api-server',
    core: { transport: 'stdio' as const, command: 'api-cmd' },
    requiredConfig: [
      { key: 'API_KEY', sensitive: true, envVar: 'API_KEY' },
    ],
  });

  it('patches components with configValues and calls importBundle', async () => {
    useWizardStore.setState({
      activeWizard: 'import',
      componentsToInstall: [componentWithConfig],
      configValues: { 'api-server::API_KEY': 'secret-123' },
      resolutions: [],
      showingConfigPrompts: true,
    });

    await useWizardStore.getState().confirmConfigs();

    expect(window.aiplughub.bundles.importBundle).toHaveBeenCalledTimes(1);

    const calledComponents = vi.mocked(window.aiplughub.bundles.importBundle).mock.calls[0][0];
    expect(calledComponents).toHaveLength(1);
    // The patched component should have the env var injected into core.env
    const patched = calledComponents[0] as PortableComponent & { core: { env?: Record<string, string> } };
    expect(patched.core.env).toEqual({ API_KEY: 'secret-123' });
  });

  it('sets importing to false and stores result after install', async () => {
    const mockResult = { installed: [], skipped: [], failed: [] };
    vi.mocked(window.aiplughub.bundles.importBundle).mockResolvedValueOnce(mockResult);

    useWizardStore.setState({
      activeWizard: 'import',
      componentsToInstall: [componentWithConfig],
      configValues: { 'api-server::API_KEY': 'val' },
      resolutions: [],
      showingConfigPrompts: true,
    });

    await useWizardStore.getState().confirmConfigs();

    expect(useWizardStore.getState().importing).toBe(false);
    expect(useWizardStore.getState().importResult).toEqual(mockResult);
    expect(useWizardStore.getState().showingConfigPrompts).toBe(false);
  });

  it('sets error on failure', async () => {
    vi.mocked(window.aiplughub.bundles.importBundle).mockRejectedValueOnce(
      new Error('config install failed'),
    );

    useWizardStore.setState({
      activeWizard: 'import',
      componentsToInstall: [componentWithConfig],
      configValues: { 'api-server::API_KEY': 'val' },
      resolutions: [],
      showingConfigPrompts: true,
    });

    await useWizardStore.getState().confirmConfigs();

    expect(useWizardStore.getState().error).toBe('config install failed');
    expect(useWizardStore.getState().importing).toBe(false);
  });

  it('does not mutate components without sensitive configs', async () => {
    const plainComponent = makePortable({ name: 'plain', core: { transport: 'stdio' as const, command: 'x' } });

    useWizardStore.setState({
      activeWizard: 'import',
      componentsToInstall: [plainComponent],
      configValues: {},
      resolutions: [],
      showingConfigPrompts: true,
    });

    await useWizardStore.getState().confirmConfigs();

    const calledComponents = vi.mocked(window.aiplughub.bundles.importBundle).mock.calls[0][0];
    const result = calledComponents[0] as PortableComponent & { core: { env?: Record<string, string> } };
    expect(result.core.env).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildDefaultFilename
// ---------------------------------------------------------------------------

describe('buildDefaultFilename', () => {
  it('uses singular "plugin" when count is 1', () => {
    const ids = [makeId({ tool: 'claude-code' })];
    const result = buildDefaultFilename(ids);
    expect(result).toMatch(/^plughub-1-plugin-claude-code-\d{4}-\d{2}-\d{2}$/);
  });

  it('uses plural "plugins" when count > 1', () => {
    const ids = [
      makeId({ tool: 'claude-code', name: 'a' }),
      makeId({ tool: 'claude-code', name: 'b' }),
      makeId({ tool: 'claude-code', name: 'c' }),
    ];
    const result = buildDefaultFilename(ids);
    expect(result).toMatch(/^plughub-3-plugins-claude-code-\d{4}-\d{2}-\d{2}$/);
  });

  it('includes multiple tool names sorted alphabetically', () => {
    const ids = [
      makeId({ tool: 'gemini-cli', name: 'a' }),
      makeId({ tool: 'claude-code', name: 'b' }),
      makeId({ tool: 'claude-desktop', name: 'c' }),
    ];
    const result = buildDefaultFilename(ids);
    expect(result).toMatch(
      /^plughub-3-plugins-claude-code-claude-desktop-gemini-cli-\d{4}-\d{2}-\d{2}$/,
    );
  });

  it('deduplicates tool names', () => {
    const ids = [
      makeId({ tool: 'claude-code', name: 'a' }),
      makeId({ tool: 'claude-code', name: 'b' }),
    ];
    const result = buildDefaultFilename(ids);
    expect(result).toMatch(/^plughub-2-plugins-claude-code-\d{4}-\d{2}-\d{2}$/);
  });

  it('includes today\'s date in YYYY-MM-DD format', () => {
    const ids = [makeId({ tool: 'claude-code' })];
    const result = buildDefaultFilename(ids);
    const today = new Date().toISOString().slice(0, 10);
    expect(result).toContain(today);
  });

  it('produces correct format for 12 plugins across one tool', () => {
    const ids = Array.from({ length: 12 }, (_, i) =>
      makeId({ tool: 'claude-code', name: `item-${i}` }),
    );
    const result = buildDefaultFilename(ids);
    const today = new Date().toISOString().slice(0, 10);
    expect(result).toBe(`plughub-12-plugins-claude-code-${today}`);
  });

  it('produces correct format for 5 plugins across two tools', () => {
    const ids = [
      makeId({ tool: 'claude-code', name: 'a' }),
      makeId({ tool: 'claude-code', name: 'b' }),
      makeId({ tool: 'claude-code', name: 'c' }),
      makeId({ tool: 'claude-desktop', name: 'd' }),
      makeId({ tool: 'claude-desktop', name: 'e' }),
    ];
    const result = buildDefaultFilename(ids);
    const today = new Date().toISOString().slice(0, 10);
    expect(result).toBe(`plughub-5-plugins-claude-code-claude-desktop-${today}`);
  });
});
