import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsOverlay } from '../components/settings/SettingsOverlay';
import { ToolDetectionSection } from '../components/settings/ToolDetectionSection';
import { MarketplaceSourcesSection } from '../components/settings/MarketplaceSourcesSection';
import { PreferencesSection } from '../components/settings/PreferencesSection';
import { useUiStore } from '@renderer/stores/ui-store';
import { useToolStore } from '@renderer/stores/tool-store';

beforeEach(() => {
  useUiStore.setState({ showSettings: false });
  useToolStore.setState({ tools: [] });
  vi.clearAllMocks();
});

// ─── SettingsOverlay ────────────────────────────────────────────────

describe('SettingsOverlay', () => {
  it('does not render when showSettings is false', () => {
    render(<SettingsOverlay />);
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('renders "Settings" heading when showSettings is true', () => {
    useUiStore.setState({ showSettings: true });
    render(<SettingsOverlay />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('closes when X button is clicked', async () => {
    useUiStore.setState({ showSettings: true });
    render(<SettingsOverlay />);
    const closeButton = screen.getByLabelText('Close settings');
    await userEvent.click(closeButton);
    expect(useUiStore.getState().showSettings).toBe(false);
  });

  it('closes on Escape key', () => {
    useUiStore.setState({ showSettings: true });
    render(<SettingsOverlay />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useUiStore.getState().showSettings).toBe(false);
  });
});

// ─── ToolDetectionSection ───────────────────────────────────────────

describe('ToolDetectionSection', () => {
  it('renders enabled tool names', async () => {
    render(<ToolDetectionSection />);
    // All tools are undetected by default, so they are collapsed
    const expander = screen.getByText(/other supported tool/);
    await userEvent.click(expander);
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('Claude Desktop')).toBeInTheDocument();
    // Disabled tools should not appear
    expect(screen.queryByText('Gemini CLI')).not.toBeInTheDocument();
    expect(screen.queryByText('Antigravity')).not.toBeInTheDocument();
  });

  it('shows "Detected" for detected tools', async () => {
    useToolStore.setState({
      tools: [
        {
          toolId: 'claude-code',
          instanceId: 'cc-1',
          detected: true,
          path: '/home/.claude',
          version: '1.0',
        },
        { toolId: 'claude-desktop', instanceId: 'cd-1', detected: false },
      ],
    });
    render(<ToolDetectionSection />);
    // The component renders a checkmark followed by "Detected" in a span
    const detectedElements = screen.getAllByText(/Detected/);
    expect(detectedElements).toHaveLength(1);
    // Non-detected tools are collapsed; expand them first
    const expander = screen.getByText(/other supported tool/);
    await userEvent.click(expander);
    expect(screen.getAllByText('Not found').length).toBeGreaterThanOrEqual(1);
  });

  it('clicking Rescan calls detect and scanAll', async () => {
    render(<ToolDetectionSection />);
    const rescanButton = screen.getByText('Rescan');
    await userEvent.click(rescanButton);
    expect(window.aiplughub.tools.detect).toHaveBeenCalled();
    expect(window.aiplughub.tools.scanAll).toHaveBeenCalled();
  });
});

// ─── MarketplaceSourcesSection ──────────────────────────────────────

describe('MarketplaceSourcesSection', () => {
  it('shows "Loading sources..." initially', () => {
    render(<MarketplaceSourcesSection />);
    expect(screen.getByText('Loading sources...')).toBeInTheDocument();
  });

  it('shows "+ Add Source" button', async () => {
    render(<MarketplaceSourcesSection />);
    await waitFor(() => {
      expect(screen.getByText('+ Add Source')).toBeInTheDocument();
    });
  });

  it('clicking "+ Add Source" shows URL input', async () => {
    render(<MarketplaceSourcesSection />);
    await waitFor(() => {
      expect(screen.getByText('+ Add Source')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText('+ Add Source'));
    expect(screen.getByLabelText('Source URL')).toBeInTheDocument();
  });
});

// ─── PreferencesSection ─────────────────────────────────────────────

describe('PreferencesSection', () => {
  it('renders "Rescan on launch" label', async () => {
    render(<PreferencesSection />);
    await waitFor(() => {
      expect(screen.getByText('Rescan on launch')).toBeInTheDocument();
    });
  });

  it('shows toggle in correct state (on by default)', async () => {
    render(<PreferencesSection />);
    await waitFor(() => {
      const toggle = screen.getByRole('switch');
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('shows GitHub Token section', async () => {
    render(<PreferencesSection />);
    await waitFor(() => {
      expect(screen.getByText('GitHub Token')).toBeInTheDocument();
    });
  });

  it('shows app version', async () => {
    render(<PreferencesSection />);
    await waitFor(() => {
      expect(screen.getByText('AI Plug Hub v0.1.0')).toBeInTheDocument();
    });
  });
});
