import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransferTab } from '../components/transfer/TransferTab';
import { ExportWizard } from '../components/transfer/ExportWizard';
import { ImportWizard } from '../components/transfer/ImportWizard';
import { useWizardStore } from '../stores/wizard-store';
import { useToolStore } from '../stores/tool-store';

beforeEach(() => {
  useWizardStore.getState().closeWizard();
  useToolStore.setState({
    tools: [{ toolId: 'claude-code', instanceId: 'cc', path: '/test', detected: true }],
    components: [
      {
        id: { tool: 'claude-code', type: 'mcp-server', name: 'test-server', scope: 'user' },
        enabled: true,
        tracking: 'detected',
        core: { transport: 'stdio', command: 'test' },
      },
    ],
    loading: false,
    scanning: false,
    error: null,
  });
});

// ---------------------------------------------------------------------------
// TransferTab
// ---------------------------------------------------------------------------

describe('TransferTab', () => {
  it('renders both Export and Import cards', () => {
    render(<TransferTab />);
    expect(screen.getByText('Export your setup')).toBeInTheDocument();
    expect(screen.getByText('Import a bundle')).toBeInTheDocument();
  });

  it('clicking Export shows the export wizard', async () => {
    const user = userEvent.setup();
    render(<TransferTab />);
    await user.click(screen.getByRole('button', { name: /export/i }));
    expect(screen.getByRole('dialog', { name: /export bundle/i })).toBeInTheDocument();
  });

  it('clicking Import opens file dialog', async () => {
    const user = userEvent.setup();
    render(<TransferTab />);
    await user.click(screen.getByRole('button', { name: /import/i }));
    expect(window.aiplughub.system.openFileDialog).toHaveBeenCalled();
  });

  it('shows no wizard when activeWizard is null', () => {
    render(<TransferTab />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ExportWizard
// ---------------------------------------------------------------------------

describe('ExportWizard', () => {
  beforeEach(() => {
    useWizardStore.setState({ activeWizard: 'export', exportStep: 1 });
  });

  it('renders step 1 with search input and component list', () => {
    render(<ExportWizard />);
    expect(screen.getByLabelText(/search plugins for export/i)).toBeInTheDocument();
    expect(screen.getByText('test-server')).toBeInTheDocument();
  });

  it('shows "0 of N selected" counter', () => {
    render(<ExportWizard />);
    expect(screen.getByText('0 of 1 plugins selected')).toBeInTheDocument();
  });

  it('Next button is disabled when no components selected', () => {
    render(<ExportWizard />);
    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).toBeDisabled();
  });

  it('deselect all during search only removes visible items (M6)', async () => {
    // Set up two components so search can filter one out
    useToolStore.setState({
      tools: [{ toolId: 'claude-code', instanceId: 'cc', path: '/test', detected: true }],
      components: [
        {
          id: { tool: 'claude-code', type: 'mcp-server', name: 'alpha-server', scope: 'user' },
          enabled: true,
          tracking: 'detected',
          core: { transport: 'stdio', command: 'a' },
        },
        {
          id: { tool: 'claude-code', type: 'mcp-server', name: 'beta-server', scope: 'user' },
          enabled: true,
          tracking: 'detected',
          core: { transport: 'stdio', command: 'b' },
        },
      ],
    });
    // Both selected
    useWizardStore.setState({
      activeWizard: 'export',
      exportStep: 1,
      selectedIds: [
        { tool: 'claude-code', type: 'mcp-server', name: 'alpha-server', scope: 'user' },
        { tool: 'claude-code', type: 'mcp-server', name: 'beta-server', scope: 'user' },
      ],
    });

    const user = userEvent.setup();
    render(<ExportWizard />);

    // Search to show only "alpha"
    const searchInput = screen.getByLabelText(/search plugins for export/i);
    await user.type(searchInput, 'alpha');

    // Click "Deselect all visible" — should only deselect alpha, keep beta
    const deselectBtn = screen.getByText('Deselect all visible');
    await user.click(deselectBtn);

    // beta-server should still be selected in the store
    const { selectedIds } = useWizardStore.getState();
    expect(selectedIds).toHaveLength(1);
    expect(selectedIds[0].name).toBe('beta-server');
  });

  it('renders step 2 review with type summary', () => {
    useWizardStore.setState({
      exportStep: 2,
      selectedIds: [
        { tool: 'claude-code', type: 'mcp-server', name: 'test-server', scope: 'user' },
      ],
    });
    render(<ExportWizard />);
    expect(screen.getByText(/1 plugin.* will be exported/i)).toBeInTheDocument();
    expect(screen.getByText('MCP Server')).toBeInTheDocument();
  });

  it('renders step 3 confirmation', () => {
    useWizardStore.setState({ exportStep: 3 });
    render(<ExportWizard />);
    expect(screen.getByText('Export complete!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ImportWizard
// ---------------------------------------------------------------------------

describe('ImportWizard', () => {
  it('shows loading state when bundle not loaded yet', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 1,
      bundle: null,
      conflicts: null,
      loading: true,
    });
    render(<ImportWizard />);
    expect(screen.getByText(/loading bundle/i)).toBeInTheDocument();
  });

  it('renders new components section when bundle has new items', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 1,
      bundle: {
        formatVersion: '1.0',
        exportedFrom: { tools: ['claude-code'], date: '2026-01-01' },
        plugins: [],
        components: [],
      },
      conflicts: {
        newComponents: [
          { type: 'mcp-server', name: 'new-server', core: { transport: 'stdio', command: 'new' } },
        ],
        conflicts: [],
        incompatible: [],
      },
    });
    render(<ImportWizard />);
    // Filter pill + section header both show "New (1)" — check section heading specifically
    expect(screen.getByRole('heading', { name: /new \(1\)/i })).toBeInTheDocument();
    expect(screen.getByText('new-server')).toBeInTheDocument();
  });

  it('renders conflict section with dropdowns', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 1,
      bundle: {
        formatVersion: '1.0',
        exportedFrom: { tools: ['claude-code'], date: '2026-01-01' },
        plugins: [],
        components: [],
      },
      conflicts: {
        newComponents: [],
        conflicts: [
          {
            incoming: {
              type: 'mcp-server',
              name: 'conflict-server',
              core: { transport: 'stdio', command: 'c' },
              version: '2.0',
            },
            existing: {
              id: {
                tool: 'claude-code',
                type: 'mcp-server',
                name: 'conflict-server',
                scope: 'user',
              },
              enabled: true,
              tracking: 'detected',
              core: { transport: 'stdio', command: 'c' },
              version: '1.0',
            },
            conflictType: 'version',
          },
        ],
        incompatible: [],
      },
      resolutions: [
        {
          componentKey: { type: 'mcp-server', name: 'conflict-server' },
          action: 'install',
        },
      ],
    });
    render(<ImportWizard />);
    // Filter pill + section header both show "Needs review (1)" — check section heading specifically
    expect(screen.getByRole('heading', { name: /needs review \(1\)/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/resolution for conflict-server/i)).toBeInTheDocument();
  });

  it('shows error state when loadBundle fails (H1)', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 1,
      bundle: null,
      conflicts: null,
      loading: false,
      error: 'Invalid bundle format: missing required field "components"',
    });
    render(<ImportWizard />);
    expect(
      screen.getByText(/invalid bundle format/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('shows config prompts when showingConfigPrompts is true', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 2,
      bundle: {
        formatVersion: '1.0',
        exportedFrom: { tools: ['claude-code'], date: '2026-01-01' },
        plugins: [],
        components: [],
      },
      conflicts: {
        newComponents: [],
        conflicts: [],
        incompatible: [],
      },
      showingConfigPrompts: true,
      importing: false,
      importResult: null,
      pendingConfigs: [
        {
          componentName: 'my-server',
          config: {
            key: 'API_KEY',
            description: 'Your API key',
            sensitive: true,
          },
        },
      ],
      configValues: {},
    });
    render(<ImportWizard />);
    expect(
      screen.getByText(/some plugins need settings/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/value for API_KEY/i)).toBeInTheDocument();
  });

  it('shows import results when importResult is set', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 2,
      bundle: {
        formatVersion: '1.0',
        exportedFrom: { tools: ['claude-code'], date: '2026-01-01' },
        plugins: [],
        components: [],
      },
      conflicts: {
        newComponents: [],
        conflicts: [],
        incompatible: [],
      },
      importing: false,
      importResult: {
        installed: [
          {
            id: { tool: 'claude-code', type: 'mcp-server', name: 'installed-srv', scope: 'user' },
            enabled: true,
            tracking: 'detected',
            core: { transport: 'stdio', command: 'x' },
          },
        ],
        skipped: [],
        failed: [],
      },
    });
    render(<ImportWizard />);
    expect(screen.getByText('Import complete')).toBeInTheDocument();
    expect(screen.getByText(/1 installed/i)).toBeInTheDocument();
    expect(screen.getByText('installed-srv')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to my setup/i })).toBeInTheDocument();
  });
});
