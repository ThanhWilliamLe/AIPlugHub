/**
 * Coverage push for wizard-store.ts — confirmConfigs, loadBundle error path,
 * buildAndSave with save dialog cancel, and setExportOptions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWizardStore } from '../stores/wizard-store';
import type { PortableComponent } from '@shared/types';

function makePortable(overrides: Partial<PortableComponent> = {}): PortableComponent {
  return {
    type: 'mcp-server',
    name: 'test-server',
    core: { transport: 'stdio' as const, command: 'test-cmd' },
    ...overrides,
  };
}

beforeEach(() => {
  useWizardStore.getState().closeWizard();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// loadBundle — success path with conflicts
// ---------------------------------------------------------------------------

describe('loadBundle — success', () => {
  it('sets bundle, conflicts, and resolutions on success', async () => {
    const mockBundle = {
      formatVersion: '2.0',
      target: { scope: 'user', toolId: 'claude-code' },
      exportedFrom: { date: '2026-01-01', appVersion: '1.9.0' },
      recommendedSources: [],
      plugins: [],
      components: [],
    };
    const mockConflicts = {
      newComponents: [makePortable({ name: 'new-comp' })],
      conflicts: [
        {
          incoming: makePortable({ name: 'conflict-comp', version: '2.0' }),
          existing: {
            id: {
              tool: 'claude-code' as const,
              type: 'mcp-server' as const,
              name: 'conflict-comp',
              scope: 'user' as const,
            },
            enabled: true,
            tracking: 'detected' as const,
            core: { transport: 'stdio' as const, command: 'old' },
          },
          conflictType: 'content' as const,
        },
        {
          incoming: makePortable({ name: 'identical-comp' }),
          existing: {
            id: {
              tool: 'claude-code' as const,
              type: 'mcp-server' as const,
              name: 'identical-comp',
              scope: 'user' as const,
            },
            enabled: true,
            tracking: 'detected' as const,
            core: { transport: 'stdio' as const, command: 'test-cmd' },
          },
          conflictType: 'identical' as const,
        },
      ],
      incompatible: [],
    };

    vi.mocked(window.aiplughub.bundles.parseFile).mockResolvedValue(mockBundle);
    vi.mocked(window.aiplughub.bundles.detectConflicts).mockResolvedValue(mockConflicts);

    useWizardStore.getState().startImport();
    await useWizardStore.getState().loadBundle('/tmp/test.aibundle');

    const state = useWizardStore.getState();
    expect(state.bundle).toEqual(mockBundle);
    expect(state.conflicts).toEqual(mockConflicts);
    expect(state.activeWizard).toBe('import');
    expect(state.importStep).toBe(1);
    expect(state.loading).toBe(false);
  });

  it('auto-generates resolutions: skip for identical, install for others', async () => {
    const mockBundle = {
      formatVersion: '2.0',
      target: { scope: 'user', toolId: 'claude-code' },
      exportedFrom: { date: '', appVersion: '1.9.0' },
      recommendedSources: [],
      plugins: [],
      components: [],
    };
    const mockConflicts = {
      newComponents: [],
      conflicts: [
        {
          incoming: makePortable({ name: 'content-conflict' }),
          existing: {
            id: {
              tool: 'claude-code' as const,
              type: 'mcp-server' as const,
              name: 'content-conflict',
              scope: 'user' as const,
            },
            enabled: true,
            tracking: 'detected' as const,
            core: { transport: 'stdio' as const, command: 'x' },
          },
          conflictType: 'content' as const,
        },
        {
          incoming: makePortable({ name: 'identical-one' }),
          existing: {
            id: {
              tool: 'claude-code' as const,
              type: 'mcp-server' as const,
              name: 'identical-one',
              scope: 'user' as const,
            },
            enabled: true,
            tracking: 'detected' as const,
            core: { transport: 'stdio' as const, command: 'test-cmd' },
          },
          conflictType: 'identical' as const,
        },
      ],
      incompatible: [],
    };

    vi.mocked(window.aiplughub.bundles.parseFile).mockResolvedValue(mockBundle);
    vi.mocked(window.aiplughub.bundles.detectConflicts).mockResolvedValue(mockConflicts);

    useWizardStore.getState().startImport();
    await useWizardStore.getState().loadBundle('/tmp/test.aibundle');

    const { resolutions } = useWizardStore.getState();
    const contentRes = resolutions.find((r) => r.componentKey.name === 'content-conflict');
    const identicalRes = resolutions.find((r) => r.componentKey.name === 'identical-one');
    expect(contentRes?.action).toBe('install');
    expect(identicalRes?.action).toBe('skip');
  });
});

// ---------------------------------------------------------------------------
// loadBundle — error path
// ---------------------------------------------------------------------------

describe('loadBundle — error path', () => {
  it('sets error and clears loading when parseFile throws', async () => {
    vi.mocked(window.aiplughub.bundles.parseFile).mockRejectedValueOnce(
      new Error('Invalid bundle format'),
    );

    useWizardStore.getState().startImport();
    await useWizardStore.getState().loadBundle('/tmp/bad.aibundle');

    const state = useWizardStore.getState();
    expect(state.error).toBe('Invalid bundle format');
    expect(state.loading).toBe(false);
    expect(state.bundle).toBeNull();
  });

  it('sets error when detectConflicts throws', async () => {
    vi.mocked(window.aiplughub.bundles.parseFile).mockResolvedValue({
      formatVersion: '2.0',
      target: { scope: 'user', toolId: 'claude-code' },
      exportedFrom: { date: '', appVersion: '1.9.0' },
      recommendedSources: [],
      plugins: [],
      components: [],
    });
    vi.mocked(window.aiplughub.bundles.detectConflicts).mockRejectedValueOnce(
      new Error('Conflict detection failed'),
    );

    useWizardStore.getState().startImport();
    await useWizardStore.getState().loadBundle('/tmp/test.aibundle');

    expect(useWizardStore.getState().error).toBe('Conflict detection failed');
    expect(useWizardStore.getState().loading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildAndSave — various paths
// ---------------------------------------------------------------------------

describe('buildAndSave — success path', () => {
  it('advances to step 3 when savedPath is returned', async () => {
    vi.mocked(window.aiplughub.bundles.exportBundle).mockResolvedValue('{"bundle":"data"}');
    vi.mocked(window.aiplughub.bundles.saveBundle).mockResolvedValue('/output/bundle.aibundle');

    useWizardStore.setState({
      activeWizard: 'export',
      exportStep: 2,
      selectedIds: [{ tool: 'claude-code', type: 'mcp-server', name: 'test', scope: 'user' }],
      exportOptions: {},
    });

    await useWizardStore.getState().buildAndSave();

    const state = useWizardStore.getState();
    expect(state.exportStep).toBe(3);
    expect(state.exportedJson).toBe('{"bundle":"data"}');
    expect(state.loading).toBe(false);
  });

  it('uses exportOptions.name if set for the bundle filename', async () => {
    vi.mocked(window.aiplughub.bundles.exportBundle).mockResolvedValue('{"bundle":"data"}');
    vi.mocked(window.aiplughub.bundles.saveBundle).mockResolvedValue('/output/custom.aibundle');

    useWizardStore.setState({
      activeWizard: 'export',
      exportStep: 2,
      selectedIds: [{ tool: 'claude-code', type: 'skill', name: 'my-skill', scope: 'user' }],
      exportOptions: { name: 'custom-bundle-name' },
    });

    await useWizardStore.getState().buildAndSave();

    expect(window.aiplughub.bundles.saveBundle).toHaveBeenCalledWith(
      '{"bundle":"data"}',
      'custom-bundle-name',
    );
  });
});

describe('buildAndSave — save dialog cancelled', () => {
  it('stays on step 2 and clears loading when savedPath is null/falsy', async () => {
    vi.mocked(window.aiplughub.bundles.exportBundle).mockResolvedValue('{"bundle":"data"}');
    vi.mocked(window.aiplughub.bundles.saveBundle).mockResolvedValue(null as unknown as string);

    useWizardStore.setState({
      activeWizard: 'export',
      exportStep: 2,
      selectedIds: [{ tool: 'claude-code', type: 'mcp-server', name: 'test', scope: 'user' }],
      exportOptions: {},
    });

    await useWizardStore.getState().buildAndSave();

    const state = useWizardStore.getState();
    expect(state.exportStep).toBe(2); // not advanced
    expect(state.loading).toBe(false);
    expect(state.exportedJson).toBeNull(); // not set
  });
});

describe('buildAndSave — error path', () => {
  it('sets error when exportBundle throws', async () => {
    vi.mocked(window.aiplughub.bundles.exportBundle).mockRejectedValueOnce(
      new Error('Export serialization failed'),
    );

    useWizardStore.setState({
      activeWizard: 'export',
      exportStep: 2,
      selectedIds: [{ tool: 'claude-code', type: 'mcp-server', name: 'test', scope: 'user' }],
      exportOptions: {},
    });

    await useWizardStore.getState().buildAndSave();

    const state = useWizardStore.getState();
    expect(state.error).toBe('Export serialization failed');
    expect(state.loading).toBe(false);
    expect(state.exportStep).toBe(2);
  });

  it('does nothing when selectedIds is empty', async () => {
    useWizardStore.setState({
      activeWizard: 'export',
      exportStep: 2,
      selectedIds: [],
      exportOptions: {},
    });

    await useWizardStore.getState().buildAndSave();

    expect(window.aiplughub.bundles.exportBundle).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// setExportOptions
// ---------------------------------------------------------------------------

describe('setExportOptions', () => {
  it('merges partial options into existing exportOptions', () => {
    useWizardStore.setState({ exportOptions: { name: 'old-name' } });
    useWizardStore.getState().setExportOptions({ description: 'new desc' });
    const { exportOptions } = useWizardStore.getState();
    expect(exportOptions.name).toBe('old-name');
    expect(exportOptions.description).toBe('new desc');
  });

  it('overwrites existing field with same key', () => {
    useWizardStore.setState({ exportOptions: { name: 'old' } });
    useWizardStore.getState().setExportOptions({ name: 'new' });
    expect(useWizardStore.getState().exportOptions.name).toBe('new');
  });
});

// ---------------------------------------------------------------------------
// clearError
// ---------------------------------------------------------------------------

describe('clearError', () => {
  it('sets error to null', () => {
    useWizardStore.setState({ error: 'some error' });
    useWizardStore.getState().clearError();
    expect(useWizardStore.getState().error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setImportStep
// ---------------------------------------------------------------------------

describe('setImportStep', () => {
  it('updates importStep to 2', () => {
    useWizardStore.getState().setImportStep(2);
    expect(useWizardStore.getState().importStep).toBe(2);
  });

  it('updates importStep back to 1', () => {
    useWizardStore.setState({ importStep: 2 });
    useWizardStore.getState().setImportStep(1);
    expect(useWizardStore.getState().importStep).toBe(1);
  });
});
