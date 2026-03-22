import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketplaceSourcesSection } from '../components/settings/MarketplaceSourcesSection';
import type { MarketplaceSourceConfig } from '@shared/types';

const MOCK_SOURCES: MarketplaceSourceConfig[] = [
  {
    sourceId: 'claude-official',
    sourceType: 'url-index',
    url: 'https://official.example.com/plugins.json',
    displayName: 'Claude Official',
    isBuiltIn: true,
  },
  {
    sourceId: 'custom-1',
    sourceType: 'url-index',
    url: 'https://custom.example.com/index.json',
    displayName: 'My Custom Source',
    isBuiltIn: false,
  },
  {
    sourceId: 'url-only',
    sourceType: 'url-index',
    url: 'https://urlonly.example.com/plugins.json',
    isBuiltIn: false,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(window.aiplughub.settings.getSources).mockResolvedValue([]);
});

describe('MarketplaceSourcesSection', () => {
  it('shows "Loading sources..." initially', () => {
    render(<MarketplaceSourcesSection />);
    expect(screen.getByText('Loading sources...')).toBeInTheDocument();
  });

  it('renders sources after load', async () => {
    vi.mocked(window.aiplughub.settings.getSources).mockResolvedValue(MOCK_SOURCES);
    render(<MarketplaceSourcesSection />);
    await waitFor(() => {
      expect(screen.getByText('Claude Official')).toBeInTheDocument();
      expect(screen.getByText('My Custom Source')).toBeInTheDocument();
    });
  });

  it('shows URL as primary text when source has no displayName', async () => {
    vi.mocked(window.aiplughub.settings.getSources).mockResolvedValue(MOCK_SOURCES);
    render(<MarketplaceSourcesSection />);
    await waitFor(() => {
      expect(screen.getByText('https://urlonly.example.com/plugins.json')).toBeInTheDocument();
    });
  });

  it('shows URL as secondary text when source has a displayName (no duplicate as primary)', async () => {
    vi.mocked(window.aiplughub.settings.getSources).mockResolvedValue(MOCK_SOURCES);
    render(<MarketplaceSourcesSection />);
    await waitFor(() => {
      // displayName "Claude Official" is shown as primary
      expect(screen.getByText('Claude Official')).toBeInTheDocument();
      // URL is shown as secondary monospace text
      expect(screen.getByText('https://official.example.com/plugins.json')).toBeInTheDocument();
      // But the URL should NOT appear as the primary heading too (would be duplicate)
      const urlPrimaryElements = screen.queryAllByText('https://official.example.com/plugins.json');
      // Should only appear once (as secondary)
      expect(urlPrimaryElements).toHaveLength(1);
    });
  });

  it('shows "No marketplace sources configured." when empty', async () => {
    vi.mocked(window.aiplughub.settings.getSources).mockResolvedValue([]);
    render(<MarketplaceSourcesSection />);
    await waitFor(() => {
      expect(screen.getByText('No marketplace sources configured.')).toBeInTheDocument();
    });
  });

  it('built-in sources cannot be removed (no Remove button)', async () => {
    vi.mocked(window.aiplughub.settings.getSources).mockResolvedValue(MOCK_SOURCES);
    render(<MarketplaceSourcesSection />);
    await waitFor(() => {
      expect(screen.getByText('Claude Official')).toBeInTheDocument();
    });
    // Should have Remove for custom-1 and url-only, but NOT for built-in claude-official
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    // 2 non-built-in sources
    expect(removeButtons).toHaveLength(2);
  });

  it('removes a source when Remove button is clicked', async () => {
    vi.mocked(window.aiplughub.settings.getSources).mockResolvedValue(MOCK_SOURCES);
    vi.mocked(window.aiplughub.settings.removeSource).mockResolvedValue(undefined);
    // After removal, return the list without the removed source
    vi.mocked(window.aiplughub.settings.getSources)
      .mockResolvedValueOnce(MOCK_SOURCES)
      .mockResolvedValueOnce([MOCK_SOURCES[0], MOCK_SOURCES[2]]);

    render(<MarketplaceSourcesSection />);
    await waitFor(() => {
      expect(screen.getByText('My Custom Source')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Remove My Custom Source'));
    expect(window.aiplughub.settings.removeSource).toHaveBeenCalledWith('custom-1');
    await waitFor(() => {
      expect(screen.queryByText('My Custom Source')).not.toBeInTheDocument();
    });
  });

  it('shows error message when removal fails', async () => {
    vi.mocked(window.aiplughub.settings.getSources).mockResolvedValue(MOCK_SOURCES);
    vi.mocked(window.aiplughub.settings.removeSource).mockRejectedValue(new Error('Remove failed'));

    render(<MarketplaceSourcesSection />);
    await waitFor(() => {
      expect(screen.getByText('My Custom Source')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Remove My Custom Source'));
    await waitFor(() => {
      expect(screen.getByText('Remove failed')).toBeInTheDocument();
    });
  });

  it('shows "+ Add Source" button after load', async () => {
    render(<MarketplaceSourcesSection />);
    await waitFor(() => {
      expect(screen.getByText('+ Add Source')).toBeInTheDocument();
    });
  });

  it('shows add source form when "+ Add Source" is clicked', async () => {
    render(<MarketplaceSourcesSection />);
    await waitFor(() => screen.getByText('+ Add Source'));
    await userEvent.click(screen.getByText('+ Add Source'));
    expect(screen.getByLabelText('Source URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toBeInTheDocument();
  });

  it('hides add source form when Cancel is clicked', async () => {
    render(<MarketplaceSourcesSection />);
    await waitFor(() => screen.getByText('+ Add Source'));
    await userEvent.click(screen.getByText('+ Add Source'));
    expect(screen.getByLabelText('Source URL')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByLabelText('Source URL')).not.toBeInTheDocument();
  });

  it('Add Source button is disabled when URL is empty', async () => {
    render(<MarketplaceSourcesSection />);
    await waitFor(() => screen.getByText('+ Add Source'));
    await userEvent.click(screen.getByText('+ Add Source'));
    const addBtn = screen.getByRole('button', { name: 'Add Source' });
    expect(addBtn).toBeDisabled();
  });

  it('adds a source when form is filled and submitted', async () => {
    vi.mocked(window.aiplughub.settings.addSource).mockResolvedValue({} as never);
    vi.mocked(window.aiplughub.settings.getSources).mockResolvedValue([]);
    render(<MarketplaceSourcesSection />);
    await waitFor(() => screen.getByText('+ Add Source'));
    await userEvent.click(screen.getByText('+ Add Source'));

    await userEvent.type(
      screen.getByLabelText('Source URL'),
      'https://example.com/plugins.json',
    );
    await userEvent.type(screen.getByLabelText('Display name'), 'My Source');

    await userEvent.click(screen.getByRole('button', { name: 'Add Source' }));

    expect(window.aiplughub.settings.addSource).toHaveBeenCalledWith({
      sourceType: 'url-index',
      url: 'https://example.com/plugins.json',
      displayName: 'My Source',
    });
  });

  it('shows error when addSource fails', async () => {
    vi.mocked(window.aiplughub.settings.addSource).mockRejectedValue(
      new Error('URL already exists'),
    );
    render(<MarketplaceSourcesSection />);
    await waitFor(() => screen.getByText('+ Add Source'));
    await userEvent.click(screen.getByText('+ Add Source'));

    await userEvent.type(
      screen.getByLabelText('Source URL'),
      'https://example.com/plugins.json',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add Source' }));

    await waitFor(() => {
      expect(screen.getByText('URL already exists')).toBeInTheDocument();
    });
  });

  it('shows error when getSources fails on load', async () => {
    vi.mocked(window.aiplughub.settings.getSources).mockRejectedValue(
      new Error('Failed to load'),
    );
    render(<MarketplaceSourcesSection />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load')).toBeInTheDocument();
    });
  });

  it('shows source type label for git repositories', async () => {
    const gitSource: MarketplaceSourceConfig = {
      sourceId: 'git-1',
      sourceType: 'git',
      url: 'https://github.com/example/plugins',
      isBuiltIn: false,
    };
    vi.mocked(window.aiplughub.settings.getSources).mockResolvedValue([gitSource]);
    render(<MarketplaceSourcesSection />);
    await waitFor(() => {
      expect(screen.getByText('Git Repository')).toBeInTheDocument();
    });
  });
});
