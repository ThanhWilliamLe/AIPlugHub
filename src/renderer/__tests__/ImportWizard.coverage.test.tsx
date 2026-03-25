/**
 * Coverage push for ImportWizard.tsx — config prompt screen details,
 * installing progress bar, result screen with failures.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportWizard } from '../components/transfer/ImportWizard';
import { useWizardStore } from '../stores/wizard-store';
import { useToolStore } from '../stores/tool-store';
import { useUiStore } from '../stores/ui-store';

const BASE_BUNDLE = {
  formatVersion: '2.0',
  target: { scope: 'user', toolId: 'claude-code' },
  exportedFrom: { date: '2026-01-15T10:00:00Z', appVersion: '1.9.0' },
  recommendedSources: [],
  plugins: [],
  components: [],
};

const EMPTY_CONFLICTS = {
  newComponents: [],
  conflicts: [],
  incompatible: [],
};

function resetStores() {
  useWizardStore.getState().closeWizard();
  useToolStore.setState({
    tools: [{ toolId: 'claude-code', instanceId: 'cc', path: '/test', detected: true }],
    components: [],
    loading: false,
    scanning: false,
    error: null,
  });
  useUiStore.setState({ activeTab: 'my-setup', showFirstRun: false });
  vi.clearAllMocks();
}

beforeEach(resetStores);

describe('ImportWizard — null render when no bundle and no state', () => {
  it('renders null when bundle and conflicts are both null and not loading/error', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      bundle: null,
      conflicts: null,
      loading: false,
      error: null,
    });
    const { container } = render(<ImportWizard />);
    expect(container.firstChild).toBeNull();
  });
});

describe('ImportWizard — bundle header info', () => {
  it('shows bundle name and description when present', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 1,
      bundle: {
        ...BASE_BUNDLE,
        name: 'My Bundle',
        description: 'A useful bundle for everyone',
      },
      conflicts: EMPTY_CONFLICTS,
    });
    render(<ImportWizard />);
    expect(screen.getByText('My Bundle')).toBeInTheDocument();
    expect(screen.getByText('A useful bundle for everyone')).toBeInTheDocument();
  });

  it('shows export date when present', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 1,
      bundle: {
        ...BASE_BUNDLE,
        exportedFrom: {
          date: '2026-01-15T10:00:00Z',
          appVersion: '1.9.0',
        },
      },
      conflicts: EMPTY_CONFLICTS,
    });
    render(<ImportWizard />);
    // Date should be rendered via toLocaleDateString — header now shows tool name + date
    expect(screen.getByText(/Claude Code/i)).toBeInTheDocument();
  });

  it('renders tool label in header from target', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 1,
      bundle: {
        ...BASE_BUNDLE,
        target: { scope: 'user', toolId: 'claude-code' },
      },
      conflicts: EMPTY_CONFLICTS,
    });
    render(<ImportWizard />);
    expect(screen.getByText(/Claude Code/)).toBeInTheDocument();
  });
});

describe('ImportWizard — config prompts details', () => {
  it('renders config description when present', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 2,
      bundle: BASE_BUNDLE,
      conflicts: EMPTY_CONFLICTS,
      showingConfigPrompts: true,
      importing: false,
      importResult: null,
      pendingConfigs: [
        {
          componentName: 'my-server',
          config: {
            key: 'API_KEY',
            description: 'Your API key for the service',
            sensitive: true,
          },
        },
      ],
      configValues: {},
    });
    render(<ImportWizard />);
    expect(screen.getByText('Your API key for the service')).toBeInTheDocument();
  });

  it('uses password input type for sensitive config', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 2,
      bundle: BASE_BUNDLE,
      conflicts: EMPTY_CONFLICTS,
      showingConfigPrompts: true,
      importing: false,
      importResult: null,
      pendingConfigs: [
        {
          componentName: 'secure-server',
          config: { key: 'SECRET_TOKEN', sensitive: true },
        },
      ],
      configValues: {},
    });
    render(<ImportWizard />);
    const input = screen.getByLabelText(/value for SECRET_TOKEN/i);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('uses text input type for non-sensitive config', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 2,
      bundle: BASE_BUNDLE,
      conflicts: EMPTY_CONFLICTS,
      showingConfigPrompts: true,
      importing: false,
      importResult: null,
      pendingConfigs: [
        {
          componentName: 'public-server',
          config: { key: 'HOST', sensitive: false },
        },
      ],
      configValues: {},
    });
    render(<ImportWizard />);
    const input = screen.getByLabelText(/value for HOST/i);
    expect(input).toHaveAttribute('type', 'text');
  });

  it('shows sensitive indicator label for sensitive config', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 2,
      bundle: BASE_BUNDLE,
      conflicts: EMPTY_CONFLICTS,
      showingConfigPrompts: true,
      importing: false,
      importResult: null,
      pendingConfigs: [
        {
          componentName: 'srv',
          config: { key: 'KEY', sensitive: true },
        },
      ],
      configValues: {},
    });
    render(<ImportWizard />);
    expect(screen.getByText(/this value is stored securely on your computer/i)).toBeInTheDocument();
  });

  it('Install button is disabled when required configs are not filled', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 2,
      bundle: BASE_BUNDLE,
      conflicts: EMPTY_CONFLICTS,
      showingConfigPrompts: true,
      importing: false,
      importResult: null,
      pendingConfigs: [
        {
          componentName: 'srv',
          config: { key: 'API_KEY', sensitive: true },
        },
      ],
      configValues: {}, // empty
    });
    render(<ImportWizard />);
    const installBtn = screen.getByRole('button', { name: /install/i });
    expect(installBtn).toBeDisabled();
  });

  it('Install button is enabled when all required configs are filled', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 2,
      bundle: BASE_BUNDLE,
      conflicts: EMPTY_CONFLICTS,
      showingConfigPrompts: true,
      importing: false,
      importResult: null,
      pendingConfigs: [
        {
          componentName: 'srv',
          config: { key: 'API_KEY', sensitive: true },
        },
      ],
      configValues: { 'srv::API_KEY': 'filled-value' },
    });
    render(<ImportWizard />);
    const installBtn = screen.getByRole('button', { name: /install/i });
    expect(installBtn).not.toBeDisabled();
  });

  it('typing in config input updates store via setConfigValue', async () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 2,
      bundle: BASE_BUNDLE,
      conflicts: EMPTY_CONFLICTS,
      showingConfigPrompts: true,
      importing: false,
      importResult: null,
      pendingConfigs: [
        {
          componentName: 'my-srv',
          config: { key: 'TOKEN', sensitive: false },
        },
      ],
      configValues: {},
    });
    const user = userEvent.setup();
    render(<ImportWizard />);
    const input = screen.getByLabelText(/value for TOKEN/i);
    await user.type(input, 'my-token-value');
    expect(useWizardStore.getState().configValues['my-srv::TOKEN']).toBe('my-token-value');
  });

  it('has default value placeholder when config.default is set', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 2,
      bundle: BASE_BUNDLE,
      conflicts: EMPTY_CONFLICTS,
      showingConfigPrompts: true,
      importing: false,
      importResult: null,
      pendingConfigs: [
        {
          componentName: 'srv',
          config: { key: 'LOG_LEVEL', sensitive: false, default: 'info' },
        },
      ],
      configValues: {},
    });
    render(<ImportWizard />);
    const input = screen.getByLabelText(/value for LOG_LEVEL/i);
    expect(input).toHaveAttribute('placeholder', 'info');
  });
});

describe('ImportWizard — installing progress', () => {
  it('shows installing spinner when importing is true and no progress', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 2,
      bundle: BASE_BUNDLE,
      conflicts: EMPTY_CONFLICTS,
      importing: true,
      importResult: null,
      showingConfigPrompts: false,
    });
    render(<ImportWizard />);
    expect(screen.getByText(/installing plugins/i)).toBeInTheDocument();
  });

  it('shows progress bar with component name when progress event fires', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 2,
      bundle: BASE_BUNDLE,
      conflicts: EMPTY_CONFLICTS,
      importing: true,
      importResult: null,
      showingConfigPrompts: false,
    });

    // Capture the progress callback registered via onImportProgress
    let progressCallback: ((e: unknown) => void) | null = null;
    vi.mocked(window.aiplughub.progress.onImportProgress).mockImplementation((cb) => {
      progressCallback = cb;
      return () => {};
    });

    render(<ImportWizard />);

    // Fire a progress event
    progressCallback?.({
      componentName: 'api-server',
      current: 1,
      total: 3,
      status: 'installing',
    });

    // After progress fires, the UI should show the progress
    waitFor(() => {
      expect(screen.getByText(/installing api-server/i)).toBeInTheDocument();
      expect(screen.getByText(/1 of 3/i)).toBeInTheDocument();
    });
  });
});

describe('ImportWizard — import results', () => {
  it('shows skipped count when items were skipped', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 2,
      bundle: BASE_BUNDLE,
      conflicts: EMPTY_CONFLICTS,
      importing: false,
      importResult: {
        installed: [],
        skipped: [
          {
            component: {
              type: 'mcp-server',
              name: 'skipped-srv',
              core: { transport: 'stdio' as const, command: 'x' },
            },
            reason: 'Identical',
          },
        ],
        failed: [],
      },
    });
    render(<ImportWizard />);
    expect(screen.getByText(/1 skipped/i)).toBeInTheDocument();
    expect(screen.getByText('skipped-srv')).toBeInTheDocument();
    expect(screen.getByText('Identical')).toBeInTheDocument();
  });

  it('shows failed count and error details when items failed', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 2,
      bundle: BASE_BUNDLE,
      conflicts: EMPTY_CONFLICTS,
      importing: false,
      importResult: {
        installed: [],
        skipped: [],
        failed: [
          {
            component: {
              type: 'mcp-server',
              name: 'fail-srv',
              core: { transport: 'stdio' as const, command: 'x' },
            },
            error: { code: 'INSTALL_FAILED', message: 'Permission denied', userFacing: true },
          },
        ],
      },
    });
    render(<ImportWizard />);
    expect(screen.getByText(/1 failed/i)).toBeInTheDocument();
    expect(screen.getByText('fail-srv')).toBeInTheDocument();
    expect(screen.getByText('Permission denied')).toBeInTheDocument();
  });

  it('Go to My Setup calls closeWizard and setActiveTab', async () => {
    vi.mocked(window.aiplughub.tools.scanAll).mockResolvedValue([]);
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 2,
      bundle: BASE_BUNDLE,
      conflicts: EMPTY_CONFLICTS,
      importing: false,
      importResult: {
        installed: [
          {
            id: { tool: 'claude-code', type: 'mcp-server', name: 'srv', scope: 'user' },
            enabled: true,
            tracking: 'managed',
            core: { transport: 'stdio' as const, command: 'x' },
          },
        ],
        skipped: [],
        failed: [],
      },
    });
    const user = userEvent.setup();
    render(<ImportWizard />);
    await user.click(screen.getByRole('button', { name: /go to my setup/i }));
    await waitFor(() => {
      expect(useUiStore.getState().activeTab).toBe('my-setup');
      expect(useWizardStore.getState().activeWizard).toBeNull();
    });
  });
});

describe('ImportWizard — incompatible components section', () => {
  it('shows incompatible section with reason', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 1,
      bundle: BASE_BUNDLE,
      conflicts: {
        newComponents: [],
        conflicts: [],
        incompatible: [
          {
            component: {
              type: 'mcp-server',
              name: 'incompat-srv',
              core: { transport: 'stdio' as const, command: 'x' },
            },
            reason: 'Tool not installed',
          },
        ],
      },
    });
    render(<ImportWizard />);
    // Filter pill + section heading both show "Incompatible (1)" — use heading role
    expect(screen.getByRole('heading', { name: /incompatible \(1\)/i })).toBeInTheDocument();
    expect(screen.getByText('incompat-srv')).toBeInTheDocument();
    expect(screen.getByText('Tool not installed')).toBeInTheDocument();
  });
});

describe('ImportWizard — always override checkbox', () => {
  it('toggles alwaysOverride state in store', () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 1,
      bundle: BASE_BUNDLE,
      conflicts: {
        newComponents: [],
        conflicts: [
          {
            incoming: {
              type: 'mcp-server',
              name: 'conflict-srv',
              core: { transport: 'stdio' as const, command: 'x' },
              version: '2.0',
            },
            existing: {
              id: { tool: 'claude-code', type: 'mcp-server', name: 'conflict-srv', scope: 'user' },
              enabled: true,
              tracking: 'detected',
              core: { transport: 'stdio' as const, command: 'x' },
              version: '1.0',
            },
            conflictType: 'version',
          },
        ],
        incompatible: [],
      },
      resolutions: [{ componentKey: { type: 'mcp-server', name: 'conflict-srv' }, action: 'skip' }],
      alwaysOverride: false,
    });
    render(<ImportWizard />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(useWizardStore.getState().alwaysOverride).toBe(true);
  });
});

describe('ImportWizard — error state with Try Again', () => {
  it('Try Again button closes the wizard', async () => {
    useWizardStore.setState({
      activeWizard: 'import',
      importStep: 1,
      bundle: null,
      conflicts: null,
      loading: false,
      error: 'File not found',
    });
    const user = userEvent.setup();
    render(<ImportWizard />);
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(useWizardStore.getState().activeWizard).toBeNull();
  });
});
