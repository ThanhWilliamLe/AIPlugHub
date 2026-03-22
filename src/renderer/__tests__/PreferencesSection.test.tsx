import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PreferencesSection } from '../components/settings/PreferencesSection';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(window.aiplughub.preferences.get).mockResolvedValue({
    rescanOnLaunch: true,
    setupComplete: false,
  });
  vi.mocked(window.aiplughub.secrets.hasGithubToken).mockResolvedValue(false);
  vi.mocked(window.aiplughub.system.getAppVersion).mockResolvedValue('0.1.0');
});

describe('PreferencesSection', () => {
  it('shows loading state before preferences are fetched', () => {
    // Make the promise never resolve during this assertion
    vi.mocked(window.aiplughub.preferences.get).mockImplementation(
      () => new Promise(() => {}),
    );
    render(<PreferencesSection />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders "Rescan on launch" toggle after load', async () => {
    render(<PreferencesSection />);
    await waitFor(() => {
      expect(screen.getByText('Rescan on launch')).toBeInTheDocument();
    });
  });

  it('toggle reflects rescanOnLaunch=true state', async () => {
    render(<PreferencesSection />);
    await waitFor(() => {
      const toggle = screen.getByRole('switch', { name: 'Rescan on launch' });
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('toggle reflects rescanOnLaunch=false state', async () => {
    vi.mocked(window.aiplughub.preferences.get).mockResolvedValue({
      rescanOnLaunch: false,
      setupComplete: false,
    });
    render(<PreferencesSection />);
    await waitFor(() => {
      const toggle = screen.getByRole('switch', { name: 'Rescan on launch' });
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('calls preferences.set when toggle is clicked', async () => {
    vi.mocked(window.aiplughub.preferences.set).mockResolvedValue({
      rescanOnLaunch: false,
      setupComplete: false,
    });
    render(<PreferencesSection />);
    await waitFor(() => screen.getByRole('switch', { name: 'Rescan on launch' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Rescan on launch' }));
    await waitFor(() => {
      expect(window.aiplughub.preferences.set).toHaveBeenCalledWith({ rescanOnLaunch: false });
    });
  });

  it('updates toggle state after successful toggle', async () => {
    vi.mocked(window.aiplughub.preferences.set).mockResolvedValue({
      rescanOnLaunch: false,
      setupComplete: false,
    });
    render(<PreferencesSection />);
    await waitFor(() => screen.getByRole('switch', { name: 'Rescan on launch' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Rescan on launch' }));
    await waitFor(() => {
      const toggle = screen.getByRole('switch', { name: 'Rescan on launch' });
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('shows error when toggle fails', async () => {
    vi.mocked(window.aiplughub.preferences.set).mockRejectedValue(new Error('Toggle failed'));
    render(<PreferencesSection />);
    await waitFor(() => screen.getByRole('switch', { name: 'Rescan on launch' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Rescan on launch' }));
    await waitFor(() => {
      expect(screen.getByText('Toggle failed')).toBeInTheDocument();
    });
  });

  describe('GitHub token — not configured', () => {
    it('shows token input when no token is configured', async () => {
      vi.mocked(window.aiplughub.secrets.hasGithubToken).mockResolvedValue(false);
      render(<PreferencesSection />);
      await waitFor(() => {
        expect(screen.getByLabelText('GitHub token')).toBeInTheDocument();
      });
    });

    it('Save button is disabled when token input is empty', async () => {
      render(<PreferencesSection />);
      await waitFor(() => screen.getByLabelText('GitHub token'));
      const saveBtn = screen.getByRole('button', { name: /save/i });
      expect(saveBtn).toBeDisabled();
    });

    it('saves token when Save button is clicked', async () => {
      vi.mocked(window.aiplughub.secrets.setGithubToken).mockResolvedValue(undefined);
      render(<PreferencesSection />);
      await waitFor(() => screen.getByLabelText('GitHub token'));
      await userEvent.type(screen.getByLabelText('GitHub token'), 'ghp_mytoken123');
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() => {
        expect(window.aiplughub.secrets.setGithubToken).toHaveBeenCalledWith('ghp_mytoken123');
      });
    });

    it('shows "Configured" badge after saving a token', async () => {
      vi.mocked(window.aiplughub.secrets.setGithubToken).mockResolvedValue(undefined);
      render(<PreferencesSection />);
      await waitFor(() => screen.getByLabelText('GitHub token'));
      await userEvent.type(screen.getByLabelText('GitHub token'), 'ghp_mytoken123');
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() => {
        expect(screen.getByText(/Configured/)).toBeInTheDocument();
      });
    });

    it('shows error when setGithubToken fails', async () => {
      vi.mocked(window.aiplughub.secrets.setGithubToken).mockRejectedValue(
        new Error('Keychain error'),
      );
      render(<PreferencesSection />);
      await waitFor(() => screen.getByLabelText('GitHub token'));
      await userEvent.type(screen.getByLabelText('GitHub token'), 'ghp_bad');
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() => {
        expect(screen.getByText('Keychain error')).toBeInTheDocument();
      });
    });
  });

  describe('GitHub token — configured', () => {
    it('shows "Configured" badge when token exists', async () => {
      vi.mocked(window.aiplughub.secrets.hasGithubToken).mockResolvedValue(true);
      render(<PreferencesSection />);
      await waitFor(() => {
        expect(screen.getByText(/Configured/)).toBeInTheDocument();
      });
    });

    it('shows "Clear token" button when token exists', async () => {
      vi.mocked(window.aiplughub.secrets.hasGithubToken).mockResolvedValue(true);
      render(<PreferencesSection />);
      await waitFor(() => {
        expect(screen.getByText('Clear token')).toBeInTheDocument();
      });
    });

    it('does not show token input when token exists', async () => {
      vi.mocked(window.aiplughub.secrets.hasGithubToken).mockResolvedValue(true);
      render(<PreferencesSection />);
      await waitFor(() => screen.getByText('Clear token'));
      expect(screen.queryByLabelText('GitHub token')).not.toBeInTheDocument();
    });

    it('calls clearGithubToken when Clear token is clicked', async () => {
      vi.mocked(window.aiplughub.secrets.hasGithubToken).mockResolvedValue(true);
      vi.mocked(window.aiplughub.secrets.clearGithubToken).mockResolvedValue(undefined);
      render(<PreferencesSection />);
      await waitFor(() => screen.getByText('Clear token'));
      fireEvent.click(screen.getByText('Clear token'));
      await waitFor(() => {
        expect(window.aiplughub.secrets.clearGithubToken).toHaveBeenCalled();
      });
    });

    it('removes "Configured" badge after clearing token', async () => {
      vi.mocked(window.aiplughub.secrets.hasGithubToken).mockResolvedValue(true);
      vi.mocked(window.aiplughub.secrets.clearGithubToken).mockResolvedValue(undefined);
      render(<PreferencesSection />);
      await waitFor(() => screen.getByText('Clear token'));
      fireEvent.click(screen.getByText('Clear token'));
      await waitFor(() => {
        expect(screen.queryByText(/Configured/)).not.toBeInTheDocument();
      });
    });

    it('shows error when clearGithubToken fails', async () => {
      vi.mocked(window.aiplughub.secrets.hasGithubToken).mockResolvedValue(true);
      vi.mocked(window.aiplughub.secrets.clearGithubToken).mockRejectedValue(
        new Error('Clear failed'),
      );
      render(<PreferencesSection />);
      await waitFor(() => screen.getByText('Clear token'));
      fireEvent.click(screen.getByText('Clear token'));
      await waitFor(() => {
        expect(screen.getByText('Clear failed')).toBeInTheDocument();
      });
    });
  });

  describe('error state', () => {
    it('shows load error when preferences.get fails', async () => {
      vi.mocked(window.aiplughub.preferences.get).mockRejectedValue(
        new Error('Failed to load preferences'),
      );
      render(<PreferencesSection />);
      await waitFor(() => {
        expect(
          screen.getByText(/Failed to load preferences: Failed to load preferences/),
        ).toBeInTheDocument();
      });
    });
  });

  it('renders app version', async () => {
    render(<PreferencesSection />);
    await waitFor(() => {
      expect(screen.getByText('AI Plug Hub v0.1.0')).toBeInTheDocument();
    });
  });
});
