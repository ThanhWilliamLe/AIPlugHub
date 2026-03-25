/**
 * Coverage push for TransferTab.tsx — import file picker path where
 * filePath is returned (loads the bundle) vs null (closes wizard).
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransferTab } from '../components/transfer/TransferTab';
import { useWizardStore } from '../stores/wizard-store';
import { useToolStore } from '../stores/tool-store';

beforeEach(() => {
  useWizardStore.getState().closeWizard();
  useToolStore.setState({
    tools: [{ toolId: 'claude-code', instanceId: 'cc', path: '/test', detected: true }],
    components: [],
    loading: false,
    scanning: false,
    error: null,
  });
  vi.clearAllMocks();
});

describe('TransferTab — import file picker', () => {
  it('loads bundle when openFileDialog returns a file path', async () => {
    vi.mocked(window.aiplughub.system.openFileDialog).mockResolvedValue('/tmp/my.aibundle');
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

    const user = userEvent.setup();
    render(<TransferTab />);
    await user.click(screen.getByRole('button', { name: /import/i }));

    // After dialog returns path, loadBundle should be called
    await vi.waitFor(() => {
      expect(window.aiplughub.bundles.parseFile).toHaveBeenCalledWith('/tmp/my.aibundle');
    });
  });

  it('closes wizard when openFileDialog returns null (user cancels)', async () => {
    vi.mocked(window.aiplughub.system.openFileDialog).mockResolvedValue(null);

    const user = userEvent.setup();
    render(<TransferTab />);
    await user.click(screen.getByRole('button', { name: /import/i }));

    // Wizard should be closed since no file was picked
    await vi.waitFor(() => {
      expect(useWizardStore.getState().activeWizard).toBeNull();
    });
    expect(window.aiplughub.bundles.parseFile).not.toHaveBeenCalled();
  });

  it('closes wizard when openFileDialog throws', async () => {
    vi.mocked(window.aiplughub.system.openFileDialog).mockRejectedValue(new Error('Dialog error'));

    const user = userEvent.setup();
    render(<TransferTab />);
    await user.click(screen.getByRole('button', { name: /import/i }));

    await vi.waitFor(() => {
      expect(useWizardStore.getState().activeWizard).toBeNull();
    });
  });
});
