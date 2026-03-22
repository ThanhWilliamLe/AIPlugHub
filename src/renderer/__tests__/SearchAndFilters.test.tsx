import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchBar } from '../components/my-setup/SearchBar';
import { FilterPills } from '../components/my-setup/FilterPills';
import { useUiStore } from '@renderer/stores/ui-store';
import { useToolStore } from '@renderer/stores/tool-store';
import type { Component } from '@shared/types';

const mockComponents: Component[] = [
  {
    id: { tool: 'claude-code', type: 'skill', name: 'tdd', scope: 'user' },
    enabled: true,
    tracking: 'detected',
    core: { description: 'TDD', content: '# TDD' },
  },
  {
    id: { tool: 'claude-code', type: 'mcp-server', name: 'sqlite', scope: 'user' },
    enabled: undefined,
    tracking: 'detected',
    core: { transport: 'stdio' as const, command: 'sqlite-mcp' },
  },
  {
    id: { tool: 'claude-desktop', type: 'mcp-server', name: 'filesystem', scope: 'user' },
    enabled: undefined,
    tracking: 'detected',
    core: { transport: 'stdio' as const, command: 'fs-mcp' },
  },
];

beforeEach(() => {
  useUiStore.setState({
    searchQuery: '',
    toolFilters: [],
    typeFilters: [],
  });
  useToolStore.setState({
    tools: [
      { toolId: 'claude-code', instanceId: 'cc', path: '/test', detected: true },
      { toolId: 'claude-desktop', instanceId: 'cd', path: '/test2', detected: true },
    ],
    components: mockComponents,
  });
});

describe('SearchBar', () => {
  it('renders search input', () => {
    render(<SearchBar />);
    expect(screen.getByPlaceholderText(/Search plugins.*Ctrl\+K/)).toBeInTheDocument();
  });

  it('updates search query on input', async () => {
    vi.useFakeTimers();
    render(<SearchBar />);
    const input = screen.getByPlaceholderText(/Search plugins.*Ctrl\+K/);
    fireEvent.change(input, { target: { value: 'sqlite' } });
    // SearchBar debounces store updates
    vi.advanceTimersByTime(300);
    expect(useUiStore.getState().searchQuery).toBe('sqlite');
    vi.useRealTimers();
  });
});

describe('FilterPills', () => {
  it('renders tool filter pills', () => {
    render(<FilterPills />);
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('Claude Desktop')).toBeInTheDocument();
  });

  it('renders type filter pills for active types', () => {
    render(<FilterPills />);
    expect(screen.getByText('Skill')).toBeInTheDocument();
    expect(screen.getByText('MCP Server')).toBeInTheDocument();
  });

  it('toggles tool filter on click', () => {
    render(<FilterPills />);
    // Find the Claude Code button (it contains the tool name text)
    const buttons = screen.getAllByRole('button');
    const ccButton = buttons.find((b) => b.textContent?.includes('Claude Code'));
    expect(ccButton).toBeDefined();
    fireEvent.click(ccButton!);
    expect(useUiStore.getState().toolFilters).toContain('claude-code');
  });

  it('shows Clear button when filters are active', () => {
    useUiStore.setState({ toolFilters: ['claude-code'] });
    render(<FilterPills />);
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });
});
