import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { BrowseFilterPills } from '../components/browse/BrowseFilterPills';
import { useBrowseStore } from '@renderer/stores/browse-store';
import type { MarketplaceEntry } from '@shared/types';

const MOCK_ENTRIES: MarketplaceEntry[] = [
  {
    name: 'sqlite-mcp',
    sourceId: 'src',
    ref: 'sqlite-mcp',
    description: 'SQLite MCP server',
    tools: ['claude-code'],
    componentCounts: { 'mcp-server': 1 },
  },
  {
    name: 'code-review',
    sourceId: 'src',
    ref: 'code-review',
    description: 'Code review skill',
    tools: ['claude-code', 'claude-desktop'],
    componentCounts: { skill: 1 },
  },
  {
    name: 'desktop-postgres',
    sourceId: 'src',
    ref: 'desktop-postgres',
    description: 'Postgres for Desktop',
    tools: ['claude-desktop'],
    componentCounts: { 'mcp-server': 1 },
  },
];

function resetStore() {
  useBrowseStore.setState({
    entries: MOCK_ENTRIES,
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
}

beforeEach(resetStore);

describe('BrowseFilterPills', () => {
  it('renders nothing when there are no entries', () => {
    useBrowseStore.setState({ entries: [] });
    const { container } = render(<BrowseFilterPills />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders tool filter pills for tools present in entries', () => {
    render(<BrowseFilterPills />);
    expect(screen.getByText(/Claude Code/)).toBeInTheDocument();
    expect(screen.getByText(/Claude Desktop/)).toBeInTheDocument();
  });

  it('renders type filter pills for types present in entries', () => {
    render(<BrowseFilterPills />);
    expect(screen.getByText(/MCP Server/)).toBeInTheDocument();
    expect(screen.getByText(/Skill/)).toBeInTheDocument();
  });

  it('shows entry counts in filter pills', () => {
    render(<BrowseFilterPills />);
    // claude-code appears in 2 entries
    const ccButton = screen.getAllByRole('button').find((b) => b.textContent?.includes('Claude Code'));
    expect(ccButton?.textContent).toContain('(2)');
  });

  it('toggles tool filter on click', () => {
    render(<BrowseFilterPills />);
    const ccButton = screen.getAllByRole('button').find((b) => b.textContent?.includes('Claude Code'));
    fireEvent.click(ccButton!);
    expect(useBrowseStore.getState().toolFilters).toContain('claude-code');
  });

  it('marks tool pill as active (aria-pressed=true) when filter is active', () => {
    useBrowseStore.setState({ toolFilters: ['claude-code'] });
    render(<BrowseFilterPills />);
    const ccButton = screen.getAllByRole('button').find((b) => b.textContent?.includes('Claude Code'));
    expect(ccButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks tool pill as inactive (aria-pressed=false) when filter is not active', () => {
    render(<BrowseFilterPills />);
    const ccButton = screen.getAllByRole('button').find((b) => b.textContent?.includes('Claude Code'));
    expect(ccButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles type filter on click', () => {
    render(<BrowseFilterPills />);
    const skillButton = screen.getAllByRole('button').find((b) => b.textContent?.includes('Skill'));
    fireEvent.click(skillButton!);
    expect(useBrowseStore.getState().typeFilters).toContain('skill');
  });

  it('marks type pill as active when type filter is set', () => {
    useBrowseStore.setState({ typeFilters: ['skill'] });
    render(<BrowseFilterPills />);
    const skillButton = screen.getAllByRole('button').find((b) => b.textContent?.includes('Skill'));
    expect(skillButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows "Clear" button when tool filter is active', () => {
    useBrowseStore.setState({ toolFilters: ['claude-code'] });
    render(<BrowseFilterPills />);
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('shows "Clear" button when search query is active', () => {
    useBrowseStore.setState({ searchQuery: 'sqlite' });
    render(<BrowseFilterPills />);
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('does not show "Clear" button when no filters are active', () => {
    render(<BrowseFilterPills />);
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
  });

  it('clears all filters when Clear button is clicked', () => {
    useBrowseStore.setState({
      toolFilters: ['claude-code'],
      typeFilters: ['skill'],
      searchQuery: 'test',
    });
    render(<BrowseFilterPills />);
    fireEvent.click(screen.getByText('Clear'));
    const state = useBrowseStore.getState();
    expect(state.toolFilters).toHaveLength(0);
    expect(state.typeFilters).toHaveLength(0);
    expect(state.searchQuery).toBe('');
  });

  it('renders the filter group with aria-label="Filters"', () => {
    render(<BrowseFilterPills />);
    expect(screen.getByRole('group', { name: 'Filters' })).toBeInTheDocument();
  });
});
