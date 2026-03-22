import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MySetupTab } from '../components/my-setup/MySetupTab';
import { useToolStore } from '@renderer/stores/tool-store';
import { useUiStore } from '@renderer/stores/ui-store';
import type { Component, ToolDetectionResult } from '@shared/types';

const CLAUDE_CODE_TOOL: ToolDetectionResult = {
  toolId: 'claude-code',
  instanceId: 'cc-1',
  path: '/home/.claude',
  detected: true,
};

const MOCK_SKILL: Component = {
  id: { tool: 'claude-code', type: 'skill', name: 'code-review', scope: 'user' },
  enabled: true,
  tracking: 'detected',
  displayName: 'Code Review',
  description: 'Reviews code for quality',
  version: '1.0.0',
  core: { description: 'Reviews code', content: '# Code Review' },
};

const MOCK_MCP: Component = {
  id: { tool: 'claude-code', type: 'mcp-server', name: 'sqlite', scope: 'user' },
  enabled: undefined,
  tracking: 'detected',
  displayName: 'SQLite MCP',
  core: { transport: 'stdio', command: 'sqlite-mcp' },
};

function resetStores() {
  useToolStore.setState({
    tools: [],
    components: [],
    loading: false,
    scanning: false,
    error: null,
  });
  useUiStore.setState({
    activeTab: 'my-setup',
    searchQuery: '',
    toolFilters: [],
    typeFilters: [],
    selectedComponentId: null,
    showSettings: false,
    showFirstRun: false,
    showUninstallConfirm: null,
  });
}

beforeEach(() => {
  resetStores();
  vi.clearAllMocks();
});

describe('MySetupTab', () => {
  describe('empty states', () => {
    it('shows "No AI tools found" when no tools are detected', () => {
      useToolStore.setState({ tools: [], components: [], scanning: false });
      render(<MySetupTab />);
      expect(screen.getByText('No AI tools found')).toBeInTheDocument();
    });

    it('shows "Open Settings" button in no-tools empty state', () => {
      useToolStore.setState({ tools: [], components: [], scanning: false });
      render(<MySetupTab />);
      expect(screen.getByText('Open Settings')).toBeInTheDocument();
    });

    it('"Open Settings" opens settings overlay', () => {
      useToolStore.setState({ tools: [], components: [], scanning: false });
      render(<MySetupTab />);
      fireEvent.click(screen.getByText('Open Settings'));
      expect(useUiStore.getState().showSettings).toBe(true);
    });

    it('shows "No plugins yet" when tools are detected but no components', () => {
      useToolStore.setState({
        tools: [CLAUDE_CODE_TOOL],
        components: [],
        scanning: false,
      });
      render(<MySetupTab />);
      expect(screen.getByText('No plugins yet')).toBeInTheDocument();
    });

    it('shows "Browse plugins" button in no-components empty state', () => {
      useToolStore.setState({
        tools: [CLAUDE_CODE_TOOL],
        components: [],
        scanning: false,
      });
      render(<MySetupTab />);
      expect(screen.getByText('Browse plugins')).toBeInTheDocument();
    });

    it('"Browse plugins" navigates to browse tab', () => {
      useToolStore.setState({
        tools: [CLAUDE_CODE_TOOL],
        components: [],
        scanning: false,
      });
      render(<MySetupTab />);
      fireEvent.click(screen.getByText('Browse plugins'));
      expect(useUiStore.getState().activeTab).toBe('browse');
    });
  });

  describe('scanning state', () => {
    it('shows "Scanning your tools..." when scanning is true', () => {
      useToolStore.setState({
        tools: [CLAUDE_CODE_TOOL],
        components: [MOCK_SKILL],
        scanning: true,
      });
      render(<MySetupTab />);
      expect(screen.getByText('Scanning your tools...')).toBeInTheDocument();
    });

    it('does not show no-tools empty state when scanning', () => {
      useToolStore.setState({ tools: [], components: [], scanning: true });
      render(<MySetupTab />);
      expect(screen.queryByText('No AI tools found')).not.toBeInTheDocument();
    });
  });

  describe('component list', () => {
    it('renders component cards when components exist', () => {
      useToolStore.setState({
        tools: [CLAUDE_CODE_TOOL],
        components: [MOCK_SKILL],
        scanning: false,
      });
      render(<MySetupTab />);
      expect(screen.getByText('Code Review')).toBeInTheDocument();
    });

    it('renders search bar when components exist', () => {
      useToolStore.setState({
        tools: [CLAUDE_CODE_TOOL],
        components: [MOCK_SKILL],
        scanning: false,
      });
      render(<MySetupTab />);
      expect(screen.getByPlaceholderText(/Search plugins.*Ctrl\+K/)).toBeInTheDocument();
    });

    it('opens detail panel when a component card is clicked', async () => {
      useToolStore.setState({
        tools: [CLAUDE_CODE_TOOL],
        components: [MOCK_SKILL],
        scanning: false,
      });
      render(<MySetupTab />);
      fireEvent.click(screen.getByText('Code Review'));
      await waitFor(() => {
        // Detail panel should be visible — it shows the description
        expect(screen.getByText('Reviews code for quality')).toBeInTheDocument();
      });
    });

    it('closes detail panel when same component is clicked again', async () => {
      useToolStore.setState({
        tools: [CLAUDE_CODE_TOOL],
        components: [MOCK_SKILL],
        scanning: false,
      });
      useUiStore.setState({
        selectedComponentId: MOCK_SKILL.id,
      });
      render(<MySetupTab />);
      // There may be multiple "Code Review" elements (card + detail panel)
      // Click on the one in the component card list (role="button" in ToolSection)
      const cardButtons = screen.getAllByRole('button');
      // Find the card-level button for Code Review (the div with role=button)
      const codeReviewCards = screen
        .getAllByText('Code Review')
        .map((el) => el.closest('[role="button"]'))
        .filter(Boolean);
      if (codeReviewCards[0]) {
        fireEvent.click(codeReviewCards[0]!);
      }
      await waitFor(() => {
        expect(useUiStore.getState().selectedComponentId).toBeNull();
      });
    });

    it('shows "No matches" empty state when search has no results', () => {
      useToolStore.setState({
        tools: [CLAUDE_CODE_TOOL],
        components: [MOCK_SKILL],
        scanning: false,
      });
      useUiStore.setState({ searchQuery: 'xyznonexistent' });
      render(<MySetupTab />);
      expect(screen.getByText('No matches')).toBeInTheDocument();
    });
  });

  describe('uninstall dialog', () => {
    it('shows uninstall dialog when showUninstallConfirm is set', () => {
      useToolStore.setState({
        tools: [CLAUDE_CODE_TOOL],
        components: [MOCK_SKILL],
        scanning: false,
      });
      useUiStore.setState({ showUninstallConfirm: MOCK_SKILL.id });
      render(<MySetupTab />);
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByText('Uninstall Code Review?')).toBeInTheDocument();
    });

    it('hides uninstall dialog when Cancel is clicked', async () => {
      useToolStore.setState({
        tools: [CLAUDE_CODE_TOOL],
        components: [MOCK_SKILL],
        scanning: false,
      });
      useUiStore.setState({ showUninstallConfirm: MOCK_SKILL.id });
      render(<MySetupTab />);
      fireEvent.click(screen.getByText('Cancel'));
      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
    });

    it('calls uninstallComponent when Uninstall is confirmed', async () => {
      useToolStore.setState({
        tools: [CLAUDE_CODE_TOOL],
        components: [MOCK_SKILL],
        scanning: false,
      });
      useUiStore.setState({ showUninstallConfirm: MOCK_SKILL.id });
      render(<MySetupTab />);
      fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }));
      await waitFor(() => {
        expect(window.aiplughub.components.uninstall).toHaveBeenCalledWith(MOCK_SKILL.id);
      });
    });
  });

  describe('detail panel interaction', () => {
    it('shows detail panel when selectedComponentId is set in store', () => {
      useToolStore.setState({
        tools: [CLAUDE_CODE_TOOL],
        components: [MOCK_SKILL],
        scanning: false,
      });
      useUiStore.setState({ selectedComponentId: MOCK_SKILL.id });
      render(<MySetupTab />);
      expect(screen.getByText('Reviews code for quality')).toBeInTheDocument();
    });

    it('closes detail panel when close button is clicked', async () => {
      useToolStore.setState({
        tools: [CLAUDE_CODE_TOOL],
        components: [MOCK_SKILL],
        scanning: false,
      });
      useUiStore.setState({ selectedComponentId: MOCK_SKILL.id });
      render(<MySetupTab />);
      fireEvent.click(screen.getByLabelText('Close panel'));
      await waitFor(() => {
        expect(useUiStore.getState().selectedComponentId).toBeNull();
      });
    });
  });
});
