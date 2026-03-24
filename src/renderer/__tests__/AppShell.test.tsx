import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppShell } from '../components/layout/AppShell';
import { useUiStore } from '@renderer/stores/ui-store';

beforeEach(() => {
  useUiStore.setState({
    activeTab: 'browse',
    showSettings: false,
  });
});

describe('AppShell', () => {
  it('renders the AI Plug Hub title in the header', () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    expect(screen.getByText('AI Plug Hub')).toBeInTheDocument();
  });

  it('renders children in the main content area', () => {
    render(
      <AppShell>
        <div>Test content</div>
      </AppShell>,
    );
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders three tabs in discovery-first order: Browse, My Setup, Transfer', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveTextContent('Browse');
    expect(tabs[1]).toHaveTextContent('My Setup');
    expect(tabs[2]).toHaveTextContent('Transfer');
  });

  it('marks the active tab with aria-selected=true', () => {
    useUiStore.setState({ activeTab: 'browse' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const browseTab = screen.getByRole('tab', { name: 'Browse' });
    expect(browseTab).toHaveAttribute('aria-selected', 'true');
  });

  it('marks inactive tabs with aria-selected=false', () => {
    useUiStore.setState({ activeTab: 'browse' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const mySetupTab = screen.getByRole('tab', { name: 'My Setup' });
    expect(mySetupTab).toHaveAttribute('aria-selected', 'false');
  });

  it('switches to Browse tab when Browse is clicked', () => {
    useUiStore.setState({ activeTab: 'my-setup' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Browse' }));
    expect(useUiStore.getState().activeTab).toBe('browse');
  });

  it('switches to Transfer tab when Transfer is clicked', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Transfer' }));
    expect(useUiStore.getState().activeTab).toBe('transfer');
  });

  it('switches to My Setup tab when My Setup is clicked', () => {
    useUiStore.setState({ activeTab: 'browse' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'My Setup' }));
    expect(useUiStore.getState().activeTab).toBe('my-setup');
  });

  it('renders Settings gear button in the header', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    expect(screen.getByLabelText('Settings')).toBeInTheDocument();
  });

  it('opens settings when gear button is clicked', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    fireEvent.click(screen.getByLabelText('Settings'));
    expect(useUiStore.getState().showSettings).toBe(true);
  });

  it('renders tab panel with correct id based on active tab', () => {
    useUiStore.setState({ activeTab: 'browse' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const tabPanel = screen.getByRole('tabpanel');
    expect(tabPanel).toHaveAttribute('id', 'tabpanel-browse');
  });

  // --- Arrow key navigation (new tab order: browse, my-setup, transfer) ---

  it('navigates to next tab with ArrowRight key (browse → my-setup)', () => {
    useUiStore.setState({ activeTab: 'browse' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const browseTab = screen.getByRole('tab', { name: 'Browse' });
    fireEvent.keyDown(browseTab, { key: 'ArrowRight' });
    expect(useUiStore.getState().activeTab).toBe('my-setup');
  });

  it('navigates to previous tab with ArrowLeft key (my-setup → browse)', () => {
    useUiStore.setState({ activeTab: 'my-setup' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const mySetupTab = screen.getByRole('tab', { name: 'My Setup' });
    fireEvent.keyDown(mySetupTab, { key: 'ArrowLeft' });
    expect(useUiStore.getState().activeTab).toBe('browse');
  });

  it('wraps from last tab to first with ArrowRight (transfer → browse)', () => {
    useUiStore.setState({ activeTab: 'transfer' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const transferTab = screen.getByRole('tab', { name: 'Transfer' });
    fireEvent.keyDown(transferTab, { key: 'ArrowRight' });
    expect(useUiStore.getState().activeTab).toBe('browse');
  });

  it('wraps from first tab to last with ArrowLeft (browse → transfer)', () => {
    useUiStore.setState({ activeTab: 'browse' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const browseTab = screen.getByRole('tab', { name: 'Browse' });
    fireEvent.keyDown(browseTab, { key: 'ArrowLeft' });
    expect(useUiStore.getState().activeTab).toBe('transfer');
  });

  it('navigates to first tab with Home key (→ browse)', () => {
    useUiStore.setState({ activeTab: 'transfer' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const transferTab = screen.getByRole('tab', { name: 'Transfer' });
    fireEvent.keyDown(transferTab, { key: 'Home' });
    expect(useUiStore.getState().activeTab).toBe('browse');
  });

  it('navigates to last tab with End key (→ transfer)', () => {
    useUiStore.setState({ activeTab: 'browse' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const browseTab = screen.getByRole('tab', { name: 'Browse' });
    fireEvent.keyDown(browseTab, { key: 'End' });
    expect(useUiStore.getState().activeTab).toBe('transfer');
  });

  it('renders tablist with role="tablist"', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  // --- Global keyboard shortcuts (new order: Ctrl+1=Browse, Ctrl+2=My Setup, Ctrl+3=Transfer) ---

  it('Ctrl+1 switches to Browse tab', () => {
    useUiStore.setState({ activeTab: 'my-setup' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    fireEvent.keyDown(document, { key: '1', ctrlKey: true });
    expect(useUiStore.getState().activeTab).toBe('browse');
  });

  it('Ctrl+2 switches to My Setup tab', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    fireEvent.keyDown(document, { key: '2', ctrlKey: true });
    expect(useUiStore.getState().activeTab).toBe('my-setup');
  });

  it('Ctrl+3 switches to Transfer tab', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    fireEvent.keyDown(document, { key: '3', ctrlKey: true });
    expect(useUiStore.getState().activeTab).toBe('transfer');
  });

  it('Ctrl+, opens Settings', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    fireEvent.keyDown(document, { key: ',', ctrlKey: true });
    expect(useUiStore.getState().showSettings).toBe(true);
  });

  it('Ctrl+K dispatches focus-search event', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    let dispatched = false;
    const listener = () => {
      dispatched = true;
    };
    document.addEventListener('plughub:focus-search', listener);
    try {
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      expect(dispatched).toBe(true);
    } finally {
      document.removeEventListener('plughub:focus-search', listener);
    }
  });

  it('keyboard shortcuts are not intercepted in input fields', () => {
    render(
      <AppShell>
        <div>
          <input data-testid="text-input" />
        </div>
      </AppShell>,
    );
    const input = screen.getByTestId('text-input');
    input.focus();
    fireEvent.keyDown(input, { key: '2', ctrlKey: true });
    // Should remain on browse (default) because inputs block shortcuts
    expect(useUiStore.getState().activeTab).toBe('browse');
  });

  it('Ctrl+K works even in input fields', () => {
    render(
      <AppShell>
        <div>
          <input data-testid="text-input" />
        </div>
      </AppShell>,
    );
    const input = screen.getByTestId('text-input');
    input.focus();
    let dispatched = false;
    const listener = () => {
      dispatched = true;
    };
    document.addEventListener('plughub:focus-search', listener);
    try {
      fireEvent.keyDown(input, { key: 'k', ctrlKey: true });
      expect(dispatched).toBe(true);
    } finally {
      document.removeEventListener('plughub:focus-search', listener);
    }
  });

  // --- Getting Started superscript button (UX-10) ---

  it('renders Getting Started superscript button on Browse tab', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    expect(screen.getByLabelText('Open Getting Started guide')).toBeInTheDocument();
  });

  it('superscript button switches to Browse tab when on another tab', () => {
    useUiStore.setState({ activeTab: 'transfer' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    fireEvent.click(screen.getByLabelText('Open Getting Started guide'));
    expect(useUiStore.getState().activeTab).toBe('browse');
  });

  it('superscript button dispatches expand event (deferred via rAF)', async () => {
    // Mock requestAnimationFrame to run callback synchronously
    const origRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    };

    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    let dispatched = false;
    const listener = () => {
      dispatched = true;
    };
    document.addEventListener('plughub:expand-getting-started', listener);
    try {
      fireEvent.click(screen.getByLabelText('Open Getting Started guide'));
      await waitFor(() => expect(dispatched).toBe(true));
    } finally {
      document.removeEventListener('plughub:expand-getting-started', listener);
      globalThis.requestAnimationFrame = origRaf;
    }
  });

  it('superscript button is visible on all tabs', () => {
    // Check on my-setup tab
    useUiStore.setState({ activeTab: 'my-setup' });
    const { unmount } = render(
      <AppShell>
        <div />
      </AppShell>,
    );
    expect(screen.getByLabelText('Open Getting Started guide')).toBeInTheDocument();
    unmount();

    // Check on transfer tab
    useUiStore.setState({ activeTab: 'transfer' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    expect(screen.getByLabelText('Open Getting Started guide')).toBeInTheDocument();
  });

  it('default active tab is browse (discovery-first UX-08)', () => {
    // Reset to default state
    useUiStore.setState({ activeTab: 'browse' });
    expect(useUiStore.getState().activeTab).toBe('browse');
  });
});
