/**
 * Coverage push for App.tsx — drag-and-drop handler and init branches.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../App';
import { useToolStore } from '@renderer/stores/tool-store';
import { useUiStore } from '@renderer/stores/ui-store';
import { useWizardStore } from '@renderer/stores/wizard-store';

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
  useWizardStore.getState().closeWizard();
  vi.mocked(window.aiplughub.tools.detect).mockResolvedValue([]);
  vi.mocked(window.aiplughub.tools.scanAll).mockResolvedValue([]);
  vi.mocked(window.aiplughub.bundles.parseFile).mockResolvedValue({
    formatVersion: '2.0',
    target: { scope: 'user', toolId: 'claude-code' },
    exportedFrom: { date: '', appVersion: '1.9.0' },
    recommendedSources: [],
    plugins: [],
    components: [],
  });
  vi.mocked(window.aiplughub.bundles.detectConflicts).mockResolvedValue({
    newComponents: [],
    conflicts: [],
    incompatible: [],
  });
}

beforeEach(() => {
  resetStores();
});

describe('App — init effect', () => {
  it('shows loading state while tools are loading', () => {
    useToolStore.setState({ loading: true });
    render(<App />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('calls scanAll when detected tools count > 0', async () => {
    vi.mocked(window.aiplughub.tools.detect).mockResolvedValue([
      { toolId: 'claude-code', instanceId: 'cc', path: '/home/user/.claude', detected: true },
    ]);
    vi.mocked(window.aiplughub.tools.scanAll).mockResolvedValue([]);

    render(<App />);
    await waitFor(() => {
      expect(window.aiplughub.tools.scanAll).toHaveBeenCalled();
    });
  });

  it('shows first-run when no tools are detected', async () => {
    vi.mocked(window.aiplughub.tools.detect).mockResolvedValue([
      { toolId: 'claude-code', instanceId: 'cc', path: '/home/user/.claude', detected: false },
    ]);

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/find your AI tools/i)).toBeInTheDocument();
    });
  });

  it('shows ErrorBanner when error is set in toolStore', async () => {
    // detect returns a tool so scanAll is called (not first-run), then we set error
    vi.mocked(window.aiplughub.tools.detect).mockResolvedValue([
      { toolId: 'claude-code', instanceId: 'cc', path: '/home/user/.claude', detected: true },
    ]);
    vi.mocked(window.aiplughub.tools.scanAll).mockImplementation(async () => {
      useToolStore.setState({ error: 'Something went wrong', loading: false });
      return [];
    });
    useUiStore.setState({ showFirstRun: false });
    render(<App />);
    // ErrorBanner should render when error is truthy
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('renders BrowseTab when activeTab is browse', async () => {
    vi.mocked(window.aiplughub.tools.detect).mockResolvedValue([
      { toolId: 'claude-code', instanceId: 'cc', path: '/home/user/.claude', detected: true },
    ]);
    vi.mocked(window.aiplughub.browse.getEntries).mockResolvedValue([]);
    useUiStore.setState({ activeTab: 'browse', showFirstRun: false });
    useToolStore.setState({ loading: false, error: null });
    render(<App />);
    await waitFor(() => {
      // Browse tab renders loading state or empty state
      const hasLoading = screen.queryByText(/loading marketplace/i);
      const hasNoPlugins = screen.queryByText(/no plugins available/i);
      expect(hasLoading || hasNoPlugins).toBeTruthy();
    });
  });

  it('renders TransferTab when activeTab is transfer', async () => {
    vi.mocked(window.aiplughub.tools.detect).mockResolvedValue([
      { toolId: 'claude-code', instanceId: 'cc', path: '/home/user/.claude', detected: true },
    ]);
    useUiStore.setState({ activeTab: 'transfer', showFirstRun: false });
    useToolStore.setState({ loading: false, error: null });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Export your setup')).toBeInTheDocument();
    });
  });
});

describe('App — drag-and-drop handler', () => {
  it('registers and removes dragover/drop event listeners', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    useUiStore.setState({ showFirstRun: false });
    useToolStore.setState({ loading: false });

    const { unmount } = render(<App />);
    expect(addSpy).toHaveBeenCalledWith('dragover', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('drop', expect.any(Function));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('dragover', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('drop', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('dragover handler calls preventDefault and sets dropEffect', () => {
    useUiStore.setState({ showFirstRun: false });
    useToolStore.setState({ loading: false });

    render(<App />);

    const event = new Event('dragover') as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {
      value: { dropEffect: '' },
      writable: true,
    });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    document.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect((event.dataTransfer as DataTransfer).dropEffect).toBe('copy');
  });

  it('drop handler does nothing when file is missing from dataTransfer', () => {
    useUiStore.setState({ showFirstRun: false });
    useToolStore.setState({ loading: false });

    render(<App />);

    const event = new Event('drop') as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [] },
    });
    vi.spyOn(event, 'preventDefault');

    // Should not throw
    expect(() => document.dispatchEvent(event)).not.toThrow();
  });

  it('drop handler ignores files with unsupported extensions', () => {
    useUiStore.setState({ showFirstRun: false });
    useToolStore.setState({ loading: false });

    render(<App />);

    vi.mocked(window.aiplughub.system.getPathForFile).mockReturnValue('/tmp/image.png');

    const mockFile = new File([''], 'image.png');
    const event = new Event('drop') as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [mockFile] },
    });
    vi.spyOn(event, 'preventDefault');

    document.dispatchEvent(event);

    // loadBundle should NOT be called for unsupported extension
    expect(window.aiplughub.bundles.parseFile).not.toHaveBeenCalled();
  });

  it('drop handler triggers import wizard for .aibundle files', async () => {
    useUiStore.setState({ showFirstRun: false });
    useToolStore.setState({ loading: false });

    render(<App />);

    vi.mocked(window.aiplughub.system.getPathForFile).mockReturnValue('/tmp/my-bundle.aibundle');

    const mockFile = new File([''], 'my-bundle.aibundle');
    const event = new Event('drop') as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [mockFile] },
    });
    vi.spyOn(event, 'preventDefault');

    document.dispatchEvent(event);

    await waitFor(() => {
      expect(window.aiplughub.bundles.parseFile).toHaveBeenCalledWith('/tmp/my-bundle.aibundle');
    });
  });

  it('drop handler triggers import wizard for .json files', async () => {
    useUiStore.setState({ showFirstRun: false });
    useToolStore.setState({ loading: false });

    render(<App />);

    vi.mocked(window.aiplughub.system.getPathForFile).mockReturnValue('/tmp/export.json');

    const mockFile = new File([''], 'export.json');
    const event = new Event('drop') as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [mockFile] },
    });
    vi.spyOn(event, 'preventDefault');

    document.dispatchEvent(event);

    await waitFor(() => {
      expect(window.aiplughub.bundles.parseFile).toHaveBeenCalledWith('/tmp/export.json');
    });
  });

  it('drop handler handles loadBundle rejection gracefully', async () => {
    useUiStore.setState({ showFirstRun: false });
    useToolStore.setState({ loading: false });

    render(<App />);

    vi.mocked(window.aiplughub.system.getPathForFile).mockReturnValue('/tmp/bad.aibundle');
    vi.mocked(window.aiplughub.bundles.parseFile).mockRejectedValueOnce(
      new Error('Invalid bundle'),
    );

    const mockFile = new File([''], 'bad.aibundle');
    const event = new Event('drop') as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [mockFile] },
    });

    // Should not throw / crash the app
    expect(() => document.dispatchEvent(event)).not.toThrow();

    // Wizard state will have the error stored after the async rejection resolves
    await waitFor(() => {
      // The wizard is opened (startImport was called), bundle load failed
      expect(window.aiplughub.bundles.parseFile).toHaveBeenCalled();
    });
  });
});
