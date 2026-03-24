/**
 * Coverage push for ExportWizard.tsx — step 2 secret count, portability warnings,
 * step 2 Save Bundle → step 3, description field, and cancel/buildAndSave.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportWizard } from '../components/transfer/ExportWizard';
import { useWizardStore } from '../stores/wizard-store';
import { useToolStore } from '../stores/tool-store';
import type { Component } from '@shared/types';

const MCP_COMPONENT: Component = {
  id: { tool: 'claude-code', type: 'mcp-server', name: 'my-server', scope: 'user' },
  enabled: true,
  tracking: 'detected',
  core: { transport: 'stdio', command: 'server', env: { API_KEY: 'sk-secret123' } },
};

const HTTP_MCP_COMPONENT: Component = {
  id: { tool: 'claude-code', type: 'mcp-server', name: 'http-server', scope: 'user' },
  enabled: true,
  tracking: 'detected',
  core: { transport: 'http', url: 'https://api.example.com/mcp' },
};

const SKILL_WITH_FILES: Component = {
  id: { tool: 'claude-code', type: 'skill', name: 'fancy-skill', scope: 'user' },
  enabled: true,
  tracking: 'detected',
  core: {
    description: 'Skill with supporting files',
    content: '# Skill',
    supportingFiles: ['helper.sh'],
  },
};

function setupStep2(components: Component[]) {
  useToolStore.setState({
    tools: [{ toolId: 'claude-code', instanceId: 'cc', path: '/test', detected: true }],
    components,
    loading: false,
    scanning: false,
    error: null,
  });
  useWizardStore.setState({
    activeWizard: 'export',
    exportStep: 2,
    selectedIds: components.map((c) => c.id),
  });
}

beforeEach(() => {
  useWizardStore.getState().closeWizard();
  vi.clearAllMocks();
  vi.mocked(window.aiplughub.bundles.exportBundle).mockResolvedValue('{"bundle":"data"}');
  vi.mocked(window.aiplughub.bundles.saveBundle).mockResolvedValue('/tmp/out.aibundle');
});

describe('ExportWizard — step 2 review', () => {
  it('shows secret count warning when env contains sensitive keys', () => {
    setupStep2([MCP_COMPONENT]);
    render(<ExportWizard />);
    expect(screen.getByText(/1 password.*\/API key.*will NOT be included for security/i)).toBeInTheDocument();
  });

  it('does not show secret warning when no sensitive env vars', () => {
    const safeComp: Component = {
      id: { tool: 'claude-code', type: 'mcp-server', name: 'safe-srv', scope: 'user' },
      enabled: true,
      tracking: 'detected',
      core: { transport: 'stdio', command: 'srv', env: { LOG_LEVEL: 'debug' } },
    };
    setupStep2([safeComp]);
    render(<ExportWizard />);
    expect(screen.queryByText(/secret value/i)).not.toBeInTheDocument();
  });

  it('shows portability warning for http/sse MCP servers', () => {
    setupStep2([HTTP_MCP_COMPONENT]);
    render(<ExportWizard />);
    expect(screen.getByText(/1 remote MCP server.*may require manual GUI setup/i)).toBeInTheDocument();
  });

  it('shows portability warning for skills with supporting files', () => {
    setupStep2([SKILL_WITH_FILES]);
    render(<ExportWizard />);
    expect(screen.getByText(/1 skill has supporting scripts/i)).toBeInTheDocument();
  });

  it('shows plural portability warning for multiple remote servers', () => {
    const http2: Component = {
      id: { tool: 'claude-code', type: 'mcp-server', name: 'http-2', scope: 'user' },
      enabled: true,
      tracking: 'detected',
      core: { transport: 'sse', url: 'https://stream.example.com' },
    };
    setupStep2([HTTP_MCP_COMPONENT, http2]);
    render(<ExportWizard />);
    expect(screen.getByText(/2 remote MCP servers/i)).toBeInTheDocument();
  });

  it('shows plural portability warning for multiple skills with files', () => {
    const skillB: Component = {
      ...SKILL_WITH_FILES,
      id: { tool: 'claude-code', type: 'skill', name: 'skill-b', scope: 'user' },
    };
    setupStep2([SKILL_WITH_FILES, skillB]);
    render(<ExportWizard />);
    expect(screen.getByText(/2 skills have supporting scripts/i)).toBeInTheDocument();
  });

  it('shows component type summary', () => {
    setupStep2([MCP_COMPONENT]);
    render(<ExportWizard />);
    expect(screen.getByText('MCP Server')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders description textarea', () => {
    setupStep2([MCP_COMPONENT]);
    render(<ExportWizard />);
    expect(
      screen.getByPlaceholderText(/notes for the bundle recipient/i),
    ).toBeInTheDocument();
  });

  it('typing in description updates export options', async () => {
    setupStep2([MCP_COMPONENT]);
    const user = userEvent.setup();
    render(<ExportWizard />);
    const textarea = screen.getByPlaceholderText(/notes for the bundle recipient/i);
    await user.type(textarea, 'My bundle notes');
    expect(useWizardStore.getState().exportOptions.description).toBe('My bundle notes');
  });

  it('Back button goes to step 1', async () => {
    setupStep2([MCP_COMPONENT]);
    const user = userEvent.setup();
    render(<ExportWizard />);
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(useWizardStore.getState().exportStep).toBe(1);
  });

  it('Save Bundle button triggers buildAndSave and advances to step 3', async () => {
    setupStep2([MCP_COMPONENT]);
    const user = userEvent.setup();
    render(<ExportWizard />);
    await user.click(screen.getByRole('button', { name: /save bundle/i }));
    await waitFor(() => {
      expect(useWizardStore.getState().exportStep).toBe(3);
    });
  });

  it('Save Bundle is disabled while loading', () => {
    setupStep2([MCP_COMPONENT]);
    useWizardStore.setState({ loading: true });
    render(<ExportWizard />);
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });
});

describe('ExportWizard — step 3 done', () => {
  beforeEach(() => {
    useToolStore.setState({
      tools: [{ toolId: 'claude-code', instanceId: 'cc', path: '/test', detected: true }],
      components: [MCP_COMPONENT],
    });
    useWizardStore.setState({
      activeWizard: 'export',
      exportStep: 3,
    });
  });

  it('renders export complete confirmation', () => {
    render(<ExportWizard />);
    expect(screen.getByText('Export complete!')).toBeInTheDocument();
    expect(
      screen.getByText(/your bundle has been saved/i),
    ).toBeInTheDocument();
  });

  it('Done button closes the wizard', async () => {
    const user = userEvent.setup();
    render(<ExportWizard />);
    await user.click(screen.getByRole('button', { name: /done/i }));
    expect(useWizardStore.getState().activeWizard).toBeNull();
  });
});

describe('ExportWizard — buildAndSave cancellation', () => {
  it('stays on step 2 when save dialog is cancelled (savedPath is null)', async () => {
    vi.mocked(window.aiplughub.bundles.saveBundle).mockResolvedValue(null as unknown as string);
    setupStep2([MCP_COMPONENT]);
    const user = userEvent.setup();
    render(<ExportWizard />);
    await user.click(screen.getByRole('button', { name: /save bundle/i }));
    await waitFor(() => {
      // Step should remain 2 since user cancelled
      expect(useWizardStore.getState().exportStep).toBe(2);
      expect(useWizardStore.getState().loading).toBe(false);
    });
  });

  it('shows error message when export fails', async () => {
    vi.mocked(window.aiplughub.bundles.exportBundle).mockRejectedValueOnce(
      new Error('Export failed: disk full'),
    );
    setupStep2([MCP_COMPONENT]);
    const user = userEvent.setup();
    render(<ExportWizard />);
    await user.click(screen.getByRole('button', { name: /save bundle/i }));
    await waitFor(() => {
      expect(screen.getByText('Export failed: disk full')).toBeInTheDocument();
    });
  });
});

describe('ExportWizard — step 1 select all / deselect tool', () => {
  it('select all adds all components to selectedIds', async () => {
    useToolStore.setState({
      tools: [{ toolId: 'claude-code', instanceId: 'cc', path: '/test', detected: true }],
      components: [MCP_COMPONENT, HTTP_MCP_COMPONENT],
    });
    useWizardStore.setState({ activeWizard: 'export', exportStep: 1, selectedIds: [] });

    const user = userEvent.setup();
    render(<ExportWizard />);
    // There are two "Select all" buttons: global (first) and per-tool (last)
    const selectAllButtons = screen.getAllByText('Select all');
    // Click the global one (first)
    await user.click(selectAllButtons[0]);
    expect(useWizardStore.getState().selectedIds).toHaveLength(2);
  });

  it('per-tool select all button selects all components for that tool', async () => {
    useToolStore.setState({
      tools: [{ toolId: 'claude-code', instanceId: 'cc', path: '/test', detected: true }],
      components: [MCP_COMPONENT, HTTP_MCP_COMPONENT],
    });
    useWizardStore.setState({ activeWizard: 'export', exportStep: 1, selectedIds: [] });

    const user = userEvent.setup();
    render(<ExportWizard />);

    // The per-tool "Select all" button (inside the tool group)
    const selectAllButtons = screen.getAllByText('Select all');
    await user.click(selectAllButtons[selectAllButtons.length - 1]); // last one is per-tool
    expect(useWizardStore.getState().selectedIds).toHaveLength(2);
  });

  it('per-tool deselect removes all components for that tool', async () => {
    useToolStore.setState({
      tools: [{ toolId: 'claude-code', instanceId: 'cc', path: '/test', detected: true }],
      components: [MCP_COMPONENT, HTTP_MCP_COMPONENT],
    });
    useWizardStore.setState({
      activeWizard: 'export',
      exportStep: 1,
      selectedIds: [MCP_COMPONENT.id, HTTP_MCP_COMPONENT.id],
    });

    const user = userEvent.setup();
    render(<ExportWizard />);
    await user.click(screen.getByText('Deselect'));
    expect(useWizardStore.getState().selectedIds).toHaveLength(0);
  });
});
