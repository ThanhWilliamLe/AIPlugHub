/**
 * Tests for ProjectFoldersSection settings component (USR-03).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ProjectFoldersSection } from '../components/settings/ProjectFoldersSection';
import { useToolStore } from '../stores/tool-store';

// Reset store between tests
beforeEach(() => {
  vi.clearAllMocks();
  useToolStore.setState({ components: [], scanning: false });
});

describe('ProjectFoldersSection', () => {
  it('renders empty state when no folders registered', async () => {
    vi.mocked(window.aiplughub.projects.list).mockResolvedValue([]);
    render(<ProjectFoldersSection />);
    await waitFor(() => {
      expect(screen.getByText(/no project folders registered/i)).toBeInTheDocument();
    });
  });

  it('renders registered folders with component counts', async () => {
    vi.mocked(window.aiplughub.projects.list).mockResolvedValue([
      { path: '/work/my-app', name: 'my-app', addedAt: '2026-03-20T00:00:00Z' },
      { path: '/work/other', name: 'other', addedAt: '2026-03-20T00:00:00Z' },
    ]);

    // Set components in tool store with project scope
    useToolStore.setState({
      components: [
        {
          id: { tool: 'claude-code', type: 'mcp-server', name: 'db', scope: 'project' },
          core: { transport: 'stdio', command: 'db' },
          tracking: 'detected',
          projectPath: '/work/my-app',
        },
        {
          id: { tool: 'claude-code', type: 'skill', name: 'deploy', scope: 'project' },
          core: { description: '', content: '' },
          tracking: 'detected',
          projectPath: '/work/my-app',
        },
      ],
    });

    render(<ProjectFoldersSection />);

    await waitFor(() => {
      expect(screen.getByText('my-app')).toBeInTheDocument();
      expect(screen.getByText('other')).toBeInTheDocument();
      expect(screen.getByText('2 plugins found')).toBeInTheDocument();
      expect(screen.getByText('No plugins found')).toBeInTheDocument();
    });
  });

  it('adds a folder via dialog', async () => {
    vi.mocked(window.aiplughub.projects.list).mockResolvedValue([]);
    vi.mocked(window.aiplughub.projects.openFolderDialog).mockResolvedValue('/work/new-project');
    vi.mocked(window.aiplughub.projects.add).mockResolvedValue({
      path: '/work/new-project',
      name: 'new-project',
      addedAt: '2026-03-20T00:00:00Z',
    });

    render(<ProjectFoldersSection />);

    await waitFor(() => {
      expect(screen.getByText(/no project folders registered/i)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add project folder/i }));
    });

    await waitFor(() => {
      expect(window.aiplughub.projects.openFolderDialog).toHaveBeenCalled();
      expect(window.aiplughub.projects.add).toHaveBeenCalledWith('/work/new-project');
      expect(screen.getByText('new-project')).toBeInTheDocument();
    });
  });

  it('does not add when dialog is cancelled', async () => {
    vi.mocked(window.aiplughub.projects.list).mockResolvedValue([]);
    vi.mocked(window.aiplughub.projects.openFolderDialog).mockResolvedValue(null);

    render(<ProjectFoldersSection />);

    await waitFor(() => {
      expect(screen.getByText(/no project folders registered/i)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add project folder/i }));
    });

    expect(window.aiplughub.projects.add).not.toHaveBeenCalled();
  });

  it('removes a folder', async () => {
    vi.mocked(window.aiplughub.projects.list).mockResolvedValue([
      { path: '/work/my-app', name: 'my-app', addedAt: '2026-03-20T00:00:00Z' },
    ]);
    vi.mocked(window.aiplughub.projects.remove).mockResolvedValue(undefined);

    render(<ProjectFoldersSection />);

    await waitFor(() => {
      expect(screen.getByText('my-app')).toBeInTheDocument();
    });

    const removeBtn = screen.getByLabelText('Remove my-app');
    await act(async () => {
      fireEvent.click(removeBtn);
    });

    await waitFor(() => {
      expect(window.aiplughub.projects.remove).toHaveBeenCalledWith('/work/my-app');
    });
  });

  it('shows error on add failure', async () => {
    vi.mocked(window.aiplughub.projects.list).mockResolvedValue([]);
    vi.mocked(window.aiplughub.projects.openFolderDialog).mockResolvedValue('/work/dup');
    vi.mocked(window.aiplughub.projects.add).mockRejectedValue({
      message: 'This folder is already registered.',
    });

    render(<ProjectFoldersSection />);

    await waitFor(() => {
      expect(screen.getByText(/no project folders registered/i)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add project folder/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('This folder is already registered.')).toBeInTheDocument();
    });
  });

  it('shows section header and description', async () => {
    vi.mocked(window.aiplughub.projects.list).mockResolvedValue([]);
    render(<ProjectFoldersSection />);
    expect(screen.getByText('Project Folders')).toBeInTheDocument();
    expect(screen.getByText(/some projects have their own plugins/i)).toBeInTheDocument();
  });
});
