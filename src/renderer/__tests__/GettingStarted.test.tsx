/**
 * Tests for GettingStarted section (UX-09), TypeEducation (UX-11b),
 * SourcePicker (UX-12), and FeaturedPlugins (UX-13).
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GettingStarted, GETTING_STARTED_EXPAND_EVENT } from '../components/browse/GettingStarted';
import { TypeEducation } from '../components/browse/TypeEducation';
import { SourcePicker } from '../components/browse/SourcePicker';
import { FeaturedPlugins } from '../components/browse/FeaturedPlugins';
import { useBrowseStore } from '@renderer/stores/browse-store';
import type { MarketplaceEntry, MarketplaceRef, SuggestedSourcesManifest } from '@shared/types';

// ─── Helpers ────────────────────────────────────────────────────────

const noop = () => {};
const noopRef = (_ref: MarketplaceRef) => {};

/** Test manifest matching the new v2 structure */
const TEST_MANIFEST: SuggestedSourcesManifest = {
  version: 2,
  sources: [
    {
      sourceId: 'test-source',
      url: 'https://github.com/test/test-plugins',
      displayName: 'Test Plugins',
      description: 'Test plugin collection',
      sourceType: 'git-marketplace',
      tools: ['claude-code'],
      defaultChecked: true,
    },
    {
      sourceId: 'test-source-2',
      url: 'https://github.com/test/test-plugins-2',
      displayName: 'Test Plugins 2',
      description: 'Another test collection',
      sourceType: 'git-marketplace',
      tools: ['claude-code'],
      defaultChecked: false,
    },
  ],
  featured: [
    {
      name: 'test-featured-plugin',
      description: 'A featured test plugin',
      sourceId: 'claude-plugins-official',
      ref: 'test-featured-plugin',
      tools: ['claude-code'],
    },
  ],
};

// ─── TypeEducation ──────────────────────────────────────────────────

describe('TypeEducation', () => {
  it('renders expanded by default with type table visible', () => {
    render(<TypeEducation />);
    expect(screen.getByText('What do the different types mean?')).toBeInTheDocument();
    expect(screen.getByText('What it does')).toBeInTheDocument();
    expect(screen.getByText('What to expect')).toBeInTheDocument();
  });

  it('collapses when toggle is clicked', () => {
    render(<TypeEducation />);
    const toggle = screen.getByText('What do the different types mean?');
    fireEvent.click(toggle);
    expect(screen.queryByText('What it does')).not.toBeInTheDocument();
  });

  it('re-expands when toggle is clicked again', () => {
    render(<TypeEducation />);
    const toggle = screen.getByText('What do the different types mean?');
    fireEvent.click(toggle); // collapse
    fireEvent.click(toggle); // re-expand
    expect(screen.getByText('What it does')).toBeInTheDocument();
  });

  it('shows all 7 component types including Plugin', () => {
    render(<TypeEducation />);
    expect(screen.getByText('Plugin')).toBeInTheDocument();
    expect(screen.getByText('Skill')).toBeInTheDocument();
    expect(screen.getByText('Command')).toBeInTheDocument();
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('MCP Server')).toBeInTheDocument();
    expect(screen.getByText('Hook')).toBeInTheDocument();
    expect(screen.getByText('Context File')).toBeInTheDocument();
  });

  it('has proper ARIA attributes — expanded by default', () => {
    render(<TypeEducation />);
    const toggle = screen.getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

// ─── SourcePicker ───────────────────────────────────────────────────

describe('SourcePicker', () => {
  beforeEach(() => {
    vi.mocked(window.aiplughub.settings.getSources).mockResolvedValue([]);
  });

  it('renders suggested sources from manifest', async () => {
    render(<SourcePicker manifest={TEST_MANIFEST} />);
    await waitFor(() => {
      expect(screen.getByText('Test Plugins')).toBeInTheDocument();
    });
  });

  it('shows "All suggested sources" message when all sources already configured', async () => {
    vi.mocked(window.aiplughub.settings.getSources).mockResolvedValue([
      {
        sourceId: 'custom-1',
        sourceType: 'git-marketplace',
        url: 'https://github.com/test/test-plugins',
        displayName: 'Test Plugins',
        isBuiltIn: false,
      },
      {
        sourceId: 'custom-2',
        sourceType: 'git-marketplace',
        url: 'https://github.com/test/test-plugins-2',
        displayName: 'Test Plugins 2',
        isBuiltIn: false,
      },
    ]);
    render(<SourcePicker manifest={TEST_MANIFEST} />);
    await waitFor(() => {
      expect(screen.getByText(/all suggested sources/i)).toBeInTheDocument();
    });
  });

  it('calls addSource when add button is clicked', async () => {
    vi.mocked(window.aiplughub.settings.addSource).mockResolvedValue({
      sourceId: 'custom-123',
      sourceType: 'git-marketplace',
      url: 'https://github.com/test/test-plugins',
      displayName: 'Test Plugins',
      isBuiltIn: false,
    });
    vi.mocked(window.aiplughub.settings.getSources)
      .mockResolvedValueOnce([]) // initial load
      .mockResolvedValueOnce([
        {
          sourceId: 'custom-123',
          sourceType: 'git-marketplace',
          url: 'https://github.com/test/test-plugins',
          displayName: 'Test Plugins',
          isBuiltIn: false,
        },
      ]); // after add

    const onAdded = vi.fn();
    render(<SourcePicker manifest={TEST_MANIFEST} onSourcesAdded={onAdded} />);

    await waitFor(() => {
      expect(screen.getByText('Test Plugins')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add selected/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(vi.mocked(window.aiplughub.settings.addSource)).toHaveBeenCalled();
    });
  });

  it('shows "All suggested sources have been added" when all added', async () => {
    vi.mocked(window.aiplughub.settings.getSources).mockResolvedValue([
      {
        sourceId: 'custom-1',
        sourceType: 'git-marketplace',
        url: 'https://github.com/test/test-plugins',
        displayName: 'Test Plugins',
        isBuiltIn: false,
      },
      {
        sourceId: 'custom-2',
        sourceType: 'git-marketplace',
        url: 'https://github.com/test/test-plugins-2',
        displayName: 'Test Plugins 2',
        isBuiltIn: false,
      },
    ]);
    render(<SourcePicker manifest={TEST_MANIFEST} />);
    await waitFor(() => {
      expect(screen.getByText(/all suggested sources/i)).toBeInTheDocument();
    });
  });
});

// ─── FeaturedPlugins ────────────────────────────────────────────────

describe('FeaturedPlugins', () => {
  beforeEach(() => {
    useBrowseStore.setState({ entries: [], installingRef: null });
  });

  it('renders featured entries from manifest', () => {
    render(<FeaturedPlugins manifest={TEST_MANIFEST} onSelect={noopRef} />);
    expect(screen.getByText('test-featured-plugin')).toBeInTheDocument();
  });

  it('renders "Popular plugins" heading', () => {
    render(<FeaturedPlugins manifest={TEST_MANIFEST} onSelect={noopRef} />);
    expect(screen.getByText('Popular plugins')).toBeInTheDocument();
  });

  it('calls onSelect when card is clicked', () => {
    const onSelect = vi.fn();
    render(<FeaturedPlugins manifest={TEST_MANIFEST} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('test-featured-plugin'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ ref: 'test-featured-plugin' }));
  });

  it('calls onSelect when View button is clicked', () => {
    const onSelect = vi.fn();
    render(<FeaturedPlugins manifest={TEST_MANIFEST} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(onSelect).toHaveBeenCalled();
  });

  it('fills remaining slots with star-sorted browse entries', () => {
    const starredEntries: MarketplaceEntry[] = [
      {
        name: 'star-plugin',
        sourceId: 'test-source',
        ref: 'star-plugin',
        description: 'A starred plugin',
        tools: ['claude-code'],
        starCount: 100,
      },
    ];
    useBrowseStore.setState({ entries: starredEntries });
    render(<FeaturedPlugins manifest={TEST_MANIFEST} onSelect={noopRef} />);
    expect(screen.getByText('star-plugin')).toBeInTheDocument();
    expect(screen.getByText('\u2605 100')).toBeInTheDocument();
  });

  it('deduplicates featured and star-based entries', () => {
    // Same ref as manifest featured entry
    const duplicateEntries: MarketplaceEntry[] = [
      {
        name: 'test-featured-plugin',
        sourceId: 'claude-plugins-official',
        ref: 'test-featured-plugin',
        description: 'Duplicate',
        tools: ['claude-code'],
        starCount: 999,
      },
    ];
    useBrowseStore.setState({ entries: duplicateEntries });
    render(<FeaturedPlugins manifest={TEST_MANIFEST} onSelect={noopRef} />);
    // Should only appear once
    const cards = screen.getAllByText('test-featured-plugin');
    expect(cards).toHaveLength(1);
  });

  it('shows featured entries first, then star-sorted', () => {
    const starredEntries: MarketplaceEntry[] = [
      {
        name: 'alpha-plugin',
        sourceId: 'other',
        ref: 'alpha',
        description: 'Alpha',
        tools: ['claude-code'],
        starCount: 500,
      },
    ];
    useBrowseStore.setState({ entries: starredEntries });
    render(<FeaturedPlugins manifest={TEST_MANIFEST} onSelect={noopRef} />);
    const buttons = screen.getAllByRole('button');
    // First card should be the featured manifest entry
    const firstCard = buttons.find((b) => b.textContent?.includes('test-featured-plugin'));
    expect(firstCard).toBeTruthy();
  });

  it('returns null when no cards available', () => {
    const emptyManifest: SuggestedSourcesManifest = { version: 2, sources: [], featured: [] };
    const { container } = render(<FeaturedPlugins manifest={emptyManifest} onSelect={noopRef} />);
    // With empty manifest and no entries, should render null
    expect(container.innerHTML).toBe('');
  });
});

// ─── GettingStarted container ───────────────────────────────────────

describe('GettingStarted', () => {
  beforeEach(() => {
    useBrowseStore.setState({ entries: [], installingRef: null });
    // Mock getSuggestedSources to return test manifest
    vi.mocked(window.aiplughub.browse.getSuggestedSources).mockResolvedValue(TEST_MANIFEST);
  });

  it('renders nothing by default (not auto-shown)', () => {
    render(<GettingStarted onSelectEntry={noopRef} onSourcesAdded={noop} />);
    expect(screen.queryByRole('region', { name: 'Getting Started' })).not.toBeInTheDocument();
    expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();
  });

  it('opens when expand event is dispatched', async () => {
    render(<GettingStarted onSelectEntry={noopRef} onSourcesAdded={noop} />);
    expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();

    document.dispatchEvent(new CustomEvent(GETTING_STARTED_EXPAND_EVENT));
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Getting Started' })).toBeInTheDocument();
      expect(screen.getByText('Dismiss')).toBeInTheDocument();
    });
  });

  it('dismisses when Dismiss clicked', async () => {
    render(<GettingStarted onSelectEntry={noopRef} onSourcesAdded={noop} />);
    document.dispatchEvent(new CustomEvent(GETTING_STARTED_EXPAND_EVENT));
    await waitFor(() => {
      expect(screen.getByText('Dismiss')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.queryByRole('region', { name: 'Getting Started' })).not.toBeInTheDocument();
  });

  it('contains plugin explainer text when open', async () => {
    render(<GettingStarted onSelectEntry={noopRef} onSourcesAdded={noop} />);
    document.dispatchEvent(new CustomEvent(GETTING_STARTED_EXPAND_EVENT));
    await waitFor(() => {
      expect(screen.getByText(/plugins extend what your ai tools can do/i)).toBeInTheDocument();
    });
  });

  it('contains TypeEducation component when open', async () => {
    render(<GettingStarted onSelectEntry={noopRef} onSourcesAdded={noop} />);
    document.dispatchEvent(new CustomEvent(GETTING_STARTED_EXPAND_EVENT));
    await waitFor(() => {
      expect(screen.getByText('What do the different types mean?')).toBeInTheDocument();
    });
  });

  it('has proper ARIA region when open', async () => {
    render(<GettingStarted onSelectEntry={noopRef} onSourcesAdded={noop} />);
    document.dispatchEvent(new CustomEvent(GETTING_STARTED_EXPAND_EVENT));
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Getting Started' })).toBeInTheDocument();
    });
  });

  it('notifies parent of expanded state via onExpandedChange', async () => {
    const onExpandedChange = vi.fn();
    render(
      <GettingStarted
        onSelectEntry={noopRef}
        onSourcesAdded={noop}
        onExpandedChange={onExpandedChange}
      />,
    );
    document.dispatchEvent(new CustomEvent(GETTING_STARTED_EXPAND_EVENT));
    await waitFor(() => {
      expect(onExpandedChange).toHaveBeenCalledWith(true);
    });
  });
});
