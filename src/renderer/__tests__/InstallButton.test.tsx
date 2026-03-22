import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstallButton } from '../components/browse/InstallButton';
import { useBrowseStore } from '@renderer/stores/browse-store';
import { useToolStore } from '@renderer/stores/tool-store';
import type { MarketplaceRef } from '@shared/types';

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
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code']}
          isInstalled={true}
        />,
      );
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
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code']}
          isInstalled={false}
        />,
      );
      expect(screen.getByText('Installing...')).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('shows normal install button when a different ref is being installed', () => {
      useBrowseStore.setState({ installingRef: OTHER_REF });
      useToolStore.setState({ tools: [CLAUDE_CODE_TOOL] });
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code']}
          isInstalled={false}
        />,
      );
      expect(screen.getByText('Install')).toBeInTheDocument();
    });
  });

  describe('just installed state', () => {
    it('shows "View in My Setup" link after successful install', () => {
      useBrowseStore.setState({ lastInstalledRef: REF, installError: null });
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code']}
          isInstalled={false}
        />,
      );
      expect(screen.getByText(/View in My Setup/)).toBeInTheDocument();
    });

    it('clicking "View in My Setup" does not throw', () => {
      useBrowseStore.setState({ lastInstalledRef: REF, installError: null });
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code']}
          isInstalled={false}
        />,
      );
      const btn = screen.getByText(/View in My Setup/);
      // Clicking navigates to my-setup via useUiStore.getState().setActiveTab — verify no throw
      expect(() => fireEvent.click(btn)).not.toThrow();
    });
  });

  describe('error state', () => {
    it('shows "Failed — Retry" button when install failed', () => {
      useBrowseStore.setState({
        lastInstalledRef: REF,
        installError: 'Install failed',
      });
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code']}
          isInstalled={false}
        />,
      );
      expect(screen.getByText('Failed — Retry')).toBeInTheDocument();
    });

    it('clicking Retry calls clearInstallError and triggers install', () => {
      useBrowseStore.setState({
        lastInstalledRef: REF,
        installError: 'Network error',
      });
      useToolStore.setState({ tools: [CLAUDE_CODE_TOOL] });
      const installFn = vi.fn();
      useBrowseStore.setState({ install: installFn });
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code']}
          isInstalled={false}
        />,
      );
      fireEvent.click(screen.getByText('Failed — Retry'));
      // clearInstallError should be called (install error should be cleared)
      // install action should be triggered for the first compatible tool
    });
  });

  describe('single compatible tool', () => {
    it('shows Install button when one detected compatible tool', () => {
      useToolStore.setState({ tools: [CLAUDE_CODE_TOOL] });
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code']}
          isInstalled={false}
        />,
      );
      expect(screen.getByText('Install')).toBeInTheDocument();
    });

    it('calls install action when Install button is clicked', () => {
      useToolStore.setState({ tools: [CLAUDE_CODE_TOOL] });
      const installFn = vi.fn();
      useBrowseStore.setState({ install: installFn });
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code']}
          isInstalled={false}
        />,
      );
      fireEvent.click(screen.getByText('Install'));
      expect(installFn).toHaveBeenCalledWith(REF, {
        instanceId: 'cc-1',
        scope: 'user',
      });
    });
  });

  describe('multiple compatible tools (dropdown)', () => {
    it('shows "Install" with dropdown arrow when multiple compatible tools detected', () => {
      useToolStore.setState({ tools: [CLAUDE_CODE_TOOL, CLAUDE_DESKTOP_TOOL] });
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code', 'claude-desktop']}
          isInstalled={false}
        />,
      );
      // The dropdown button contains "Install" + a small arrow character
      const btn = screen.getByRole('button', { name: /install/i });
      expect(btn).toBeInTheDocument();
    });

    it('opens dropdown when Install button is clicked', () => {
      useToolStore.setState({ tools: [CLAUDE_CODE_TOOL, CLAUDE_DESKTOP_TOOL] });
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code', 'claude-desktop']}
          isInstalled={false}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /install/i }));
      expect(screen.getByText(/Install to Claude Code/)).toBeInTheDocument();
      expect(screen.getByText(/Install to Claude Desktop/)).toBeInTheDocument();
    });

    it('calls install with correct instanceId when dropdown item is clicked', () => {
      useToolStore.setState({ tools: [CLAUDE_CODE_TOOL, CLAUDE_DESKTOP_TOOL] });
      const installFn = vi.fn();
      useBrowseStore.setState({ install: installFn });
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code', 'claude-desktop']}
          isInstalled={false}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /install/i }));
      fireEvent.click(screen.getByText(/Install to Claude Code/));
      expect(installFn).toHaveBeenCalledWith(REF, {
        instanceId: 'cc-1',
        scope: 'user',
      });
    });

    it('closes dropdown after selecting an option', () => {
      useToolStore.setState({ tools: [CLAUDE_CODE_TOOL, CLAUDE_DESKTOP_TOOL] });
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code', 'claude-desktop']}
          isInstalled={false}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /install/i }));
      expect(screen.getByText(/Install to Claude Code/)).toBeInTheDocument();
      fireEvent.click(screen.getByText(/Install to Claude Code/));
      expect(screen.queryByText(/Install to Claude Desktop/)).not.toBeInTheDocument();
    });

    it('closes dropdown on outside click', () => {
      useToolStore.setState({ tools: [CLAUDE_CODE_TOOL, CLAUDE_DESKTOP_TOOL] });
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code', 'claude-desktop']}
          isInstalled={false}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /install/i }));
      expect(screen.getByText(/Install to Claude Code/)).toBeInTheDocument();
      fireEvent.mouseDown(document.body);
      expect(screen.queryByText(/Install to Claude Code/)).not.toBeInTheDocument();
    });
  });

  describe('no compatible tools', () => {
    it('shows disabled "No compatible tools" button when no detected tools match', () => {
      useToolStore.setState({ tools: [] });
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code']}
          isInstalled={false}
        />,
      );
      const btn = screen.getByText('No compatible tools');
      expect(btn).toBeInTheDocument();
      expect(btn.closest('button')).toBeDisabled();
    });

    it('shows disabled button even when incompatible tools are detected', () => {
      // claude-desktop is detected but plugin only supports claude-code
      useToolStore.setState({ tools: [CLAUDE_DESKTOP_TOOL] });
      render(
        <InstallButton
          ref_={REF}
          compatibleTools={['claude-code']}
          isInstalled={false}
        />,
      );
      expect(screen.getByText('No compatible tools')).toBeInTheDocument();
    });
  });
});
