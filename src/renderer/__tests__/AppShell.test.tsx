import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { AppShell } from '../components/layout/AppShell';
import { useUiStore } from '@renderer/stores/ui-store';

beforeEach(() => {
  useUiStore.setState({
    activeTab: 'my-setup',
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

  it('renders three tabs: My Setup, Browse, Transfer', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    expect(screen.getByRole('tab', { name: 'My Setup' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Browse' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Transfer' })).toBeInTheDocument();
  });

  it('marks the active tab with aria-selected=true', () => {
    useUiStore.setState({ activeTab: 'my-setup' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const mySetupTab = screen.getByRole('tab', { name: 'My Setup' });
    expect(mySetupTab).toHaveAttribute('aria-selected', 'true');
  });

  it('marks inactive tabs with aria-selected=false', () => {
    useUiStore.setState({ activeTab: 'my-setup' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const browseTab = screen.getByRole('tab', { name: 'Browse' });
    expect(browseTab).toHaveAttribute('aria-selected', 'false');
  });

  it('switches to Browse tab when Browse is clicked', () => {
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

  it('navigates to next tab with ArrowRight key', () => {
    useUiStore.setState({ activeTab: 'my-setup' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const mySetupTab = screen.getByRole('tab', { name: 'My Setup' });
    fireEvent.keyDown(mySetupTab, { key: 'ArrowRight' });
    expect(useUiStore.getState().activeTab).toBe('browse');
  });

  it('navigates to previous tab with ArrowLeft key', () => {
    useUiStore.setState({ activeTab: 'browse' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const browseTab = screen.getByRole('tab', { name: 'Browse' });
    fireEvent.keyDown(browseTab, { key: 'ArrowLeft' });
    expect(useUiStore.getState().activeTab).toBe('my-setup');
  });

  it('wraps from last tab to first with ArrowRight', () => {
    useUiStore.setState({ activeTab: 'transfer' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const transferTab = screen.getByRole('tab', { name: 'Transfer' });
    fireEvent.keyDown(transferTab, { key: 'ArrowRight' });
    expect(useUiStore.getState().activeTab).toBe('my-setup');
  });

  it('wraps from first tab to last with ArrowLeft', () => {
    useUiStore.setState({ activeTab: 'my-setup' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const mySetupTab = screen.getByRole('tab', { name: 'My Setup' });
    fireEvent.keyDown(mySetupTab, { key: 'ArrowLeft' });
    expect(useUiStore.getState().activeTab).toBe('transfer');
  });

  it('navigates to first tab with Home key', () => {
    useUiStore.setState({ activeTab: 'transfer' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const transferTab = screen.getByRole('tab', { name: 'Transfer' });
    fireEvent.keyDown(transferTab, { key: 'Home' });
    expect(useUiStore.getState().activeTab).toBe('my-setup');
  });

  it('navigates to last tab with End key', () => {
    useUiStore.setState({ activeTab: 'my-setup' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const mySetupTab = screen.getByRole('tab', { name: 'My Setup' });
    fireEvent.keyDown(mySetupTab, { key: 'End' });
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

  // --- Global keyboard shortcuts ---

  it('Ctrl+1 switches to My Setup tab', () => {
    useUiStore.setState({ activeTab: 'browse' });
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    fireEvent.keyDown(document, { key: '1', ctrlKey: true });
    expect(useUiStore.getState().activeTab).toBe('my-setup');
  });

  it('Ctrl+2 switches to Browse tab', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    fireEvent.keyDown(document, { key: '2', ctrlKey: true });
    expect(useUiStore.getState().activeTab).toBe('browse');
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
    expect(useUiStore.getState().activeTab).toBe('my-setup');
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
});
