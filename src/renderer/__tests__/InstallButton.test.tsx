import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstallButton } from '../components/browse/InstallButton';
import { useBrowseStore } from '@renderer/stores/browse-store';
import { useToolStore } from '@renderer/stores/tool-store';
import type { MarketplaceRef, BrowseInstallTarget } from '@shared/types';

const REF: MarketplaceRef = { sourceId: 'claude-official', ref: 'sqlite-mcp' };
const OTHER_REF: MarketplaceRef = { sourceId: 'claude-official', ref: 'other-plugin' };

const CLAUDE_CODE_TOOL = {
  toolId: 'claude-code' as const,
  instanceId: 'cc-1',
  path: '/home/.claude',
  detected: true,
};

const CLAUDE_DESKTOP_TOOL = {
  toolId: 'claude-desktop' as const,
  instanceId: 'cd-1',
  path: '/home/.claudedesktop',
  detected: true,
};

function resetStores() {
  useBrowseStore.setState({
    entries: [],
    searchQuery: '',
    toolFilters: [],
    typeFilters: [],
    sortBy: 'name',
    isLoading: false,
    error: null,
    isOffline: false,
    cacheDate: null,
    selectedRef: null,
    detail: null,
    detailLoading: false,
    detailError: null,
    installingRef: null,
    installError: null,
    lastInstalledRef: null,
  });
  useToolStore.setState({
    tools: [],
    components: [],
    loading: false,
    scanning: false,
    error: null,
  });
}

beforeEach(() => {
  resetStores();
  vi.clearAllMocks();
});

describe('InstallButton', () => {
  describe('already installed state', () => {
    it('shows disabled "Installed" button when isInstalled is true', () => {
      render(<InstallButton ref_={REF} compatibleTools={['claude-code']} isInstalled={true} />);
      const btn = screen.getByRole('button', { name: /installed/i });
      expect(btn).toBeInTheDocument();
      expect(btn).toBeDisabled();
    });

    it('shows installed version when installedVersion is provided', () => {
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code']}
          isInstalled={true}
          installedVersion="1.2.3"
        />,
      );
      expect(screen.getByText('Installed (v1.2.3)')).toBeInTheDocument();
    });
  });

  describe('installing state', () => {
    it('shows "Installing..." when this ref is being installed', () => {
      useBrowseStore.setState({ installingRef: REF });
      render(<InstallButton ref_={REF} compatibleTools={['claude-code']} isInstalled={false} />);
      expect(screen.getByText('Installing...')).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('shows normal install button when a different ref is being installed', () => {
      useBrowseStore.setState({ installingRef: OTHER_REF });
      useToolStore.setState({ tools: [CLAUDE_CODE_TOOL] });
      render(<InstallButton ref_={REF} compatibleTools={['claude-code']} isInstalled={false} />);
      expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
    });
  });

  describe('just installed state', () => {
    it('shows "View in My Setup" link after successful install', () => {
      useBrowseStore.setState({ lastInstalledRef: REF, installError: null });
      render(<InstallButton ref_={REF} compatibleTools={['claude-code']} isInstalled={false} />);
      expect(screen.getByText(/View in My Setup/)).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows "Failed — Retry" button when install failed', () => {
      useBrowseStore.setState({
        lastInstalledRef: REF,
        installError: 'Install failed',
      });
      render(<InstallButton ref_={REF} compatibleTools={['claude-code']} isInstalled={false} />);
      expect(screen.getByText('Failed — Retry')).toBeInTheDocument();
    });
  });

  describe('install location selector', () => {
    it('shows simple Install button when single compatible tool (no dropdown)', async () => {
      useToolStore.setState({ tools: [CLAUDE_CODE_TOOL] });
      render(<InstallButton ref_={REF} compatibleTools={['claude-code']} isInstalled={false} />);
      await waitFor(() => {
        expect(screen.getByText('Install')).toBeInTheDocument();
      });
      // No dropdown caret when single tool
      expect(screen.queryByLabelText('Change install location')).not.toBeInTheDocument();
    });

    it('installs using selected target when Install button is clicked', async () => {
      useToolStore.setState({ tools: [CLAUDE_CODE_TOOL] });
      const installFn = vi.fn();
      useBrowseStore.setState({ install: installFn });
      render(<InstallButton ref_={REF} compatibleTools={['claude-code']} isInstalled={false} />);
      await waitFor(() => {
        expect(screen.getByText('Install')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Install'));
      expect(installFn).toHaveBeenCalledWith(REF, {
        instanceId: 'cc-1',
        scope: 'user',
      });
    });

    it('shows multiple tools in location dropdown', async () => {
      useToolStore.setState({ tools: [CLAUDE_CODE_TOOL, CLAUDE_DESKTOP_TOOL] });
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code', 'claude-desktop']}
          isInstalled={false}
        />,
      );
      await waitFor(() => {
        expect(screen.getByLabelText('Change install location')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByLabelText('Change install location'));
      expect(screen.getByText('Claude Code')).toBeInTheDocument();
      expect(screen.getByText('Claude Desktop')).toBeInTheDocument();
    });

    it('closes dropdown after selecting a location', async () => {
      useToolStore.setState({ tools: [CLAUDE_CODE_TOOL, CLAUDE_DESKTOP_TOOL] });
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code', 'claude-desktop']}
          isInstalled={false}
        />,
      );
      await waitFor(() => {
        expect(screen.getByLabelText('Change install location')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByLabelText('Change install location'));
      fireEvent.click(screen.getByText('Claude Code'));
      // Dropdown should close — "Install location" header gone
      expect(screen.queryByText('Install location')).not.toBeInTheDocument();
    });

    it('closes dropdown on outside click', async () => {
      useToolStore.setState({ tools: [CLAUDE_CODE_TOOL, CLAUDE_DESKTOP_TOOL] });
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code', 'claude-desktop']}
          isInstalled={false}
        />,
      );
      await waitFor(() => {
        expect(screen.getByLabelText('Change install location')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByLabelText('Change install location'));
      expect(screen.getByText('Install location')).toBeInTheDocument();
      fireEvent.mouseDown(document.body);
      expect(screen.queryByText('Install location')).not.toBeInTheDocument();
    });
  });

  describe('no compatible tools', () => {
    it('shows disabled "No compatible tools" button when no detected tools match', () => {
      useToolStore.setState({ tools: [] });
      render(<InstallButton ref_={REF} compatibleTools={['claude-code']} isInstalled={false} />);
      const btn = screen.getByText('No compatible tools');
      expect(btn).toBeInTheDocument();
      expect(btn.closest('button')).toBeDisabled();
    });
  });
});
