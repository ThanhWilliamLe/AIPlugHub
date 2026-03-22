import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BackupsTab } from '../components/settings/BackupsTab';
import { BackupToolCard } from '../components/settings/BackupToolCard';
import { BackupEntryRow } from '../components/settings/BackupEntryRow';
import { BackupCreateForm } from '../components/settings/BackupCreateForm';
import { RestoreDialog } from '../components/settings/RestoreDialog';
import { DeleteBackupDialog } from '../components/settings/DeleteBackupDialog';
import { useToolStore } from '@renderer/stores/tool-store';
import { useBackupStore } from '@renderer/stores/backup-store';
import type { BackupSummary, ToolDetectionResult } from '@shared/types';

// ─── Fixtures ────────────────────────────────────────────────────────

const TOOL_CC: ToolDetectionResult = {
  toolId: 'claude-code',
  instanceId: 'cc-default',
  path: '/home/user/.claude',
  detected: true,
  version: '1.0',
};

const TOOL_GC: ToolDetectionResult = {
  toolId: 'gemini-cli',
  instanceId: 'gc-default',
  path: '/home/user/.gemini',
  detected: true,
};

const BACKUP_A: BackupSummary = {
  version: 1,
  toolId: 'claude-code',
  instanceId: 'cc-default',
  configPath: '/home/user/.claude',
  createdAt: '2026-03-23T14:50:00Z',
  label: 'Before upgrade',
  fileCount: 247,
  totalBytes: 1_258_291, // ~1.2 MB
  skipCaches: false,
  appVersion: '1.0.0',
  backupPath: '/tmp/backups/cc-1',
};

const BACKUP_B: BackupSummary = {
  version: 1,
  toolId: 'claude-code',
  instanceId: 'cc-default',
  configPath: '/home/user/.claude',
  createdAt: '2026-03-22T10:00:00Z',
  fileCount: 50,
  totalBytes: 512_000,
  skipCaches: true,
  appVersion: '1.0.0',
  auto: true,
  backupPath: '/tmp/backups/cc-2',
};

beforeEach(() => {
  useToolStore.setState({ tools: [] });
  useBackupStore.setState({ backups: {}, creating: null, restoring: null, error: null });
  vi.clearAllMocks();
});

// ─── BackupEntryRow ──────────────────────────────────────────────────

describe('BackupEntryRow', () => {
  it('renders label, date, file count and size', () => {
    render(<BackupEntryRow entry={BACKUP_A} />);
    expect(screen.getByText('Before upgrade')).toBeInTheDocument();
    // Date formatted via Intl — check key parts
    expect(screen.getByText(/Mar/)).toBeInTheDocument();
    expect(screen.getByText(/247 files/)).toBeInTheDocument();
    expect(screen.getByText(/1\.2 MB/)).toBeInTheDocument();
  });

  it('shows italic "no label" when label is missing', () => {
    const noLabelEntry = { ...BACKUP_A, label: undefined };
    render(<BackupEntryRow entry={noLabelEntry} />);
    const noLabel = screen.getByText('no label');
    expect(noLabel).toBeInTheDocument();
    expect(noLabel.classList.contains('italic')).toBe(true);
  });

  it('shows "auto" badge for auto backups', () => {
    render(<BackupEntryRow entry={BACKUP_B} />);
    expect(screen.getByText('auto')).toBeInTheDocument();
  });

  it('shows "caches skipped" when skipCaches is true', () => {
    render(<BackupEntryRow entry={BACKUP_B} />);
    expect(screen.getByText(/caches skipped/)).toBeInTheDocument();
  });

  it('does not show "caches skipped" when skipCaches is false', () => {
    render(<BackupEntryRow entry={BACKUP_A} />);
    expect(screen.queryByText(/caches skipped/)).not.toBeInTheDocument();
  });

  it('has Restore and Delete buttons', () => {
    render(<BackupEntryRow entry={BACKUP_A} />);
    expect(screen.getByText('Restore')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });
});

// ─── BackupToolCard ──────────────────────────────────────────────────

describe('BackupToolCard', () => {
  it('shows tool name, emoji, path, and Backup Now button', () => {
    render(<BackupToolCard instanceId="cc-default" tool={TOOL_CC} />);
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('/home/user/.claude')).toBeInTheDocument();
    expect(screen.getByText('Backup Now')).toBeInTheDocument();
  });

  it('shows "No backups yet" when there are no backups', () => {
    render(<BackupToolCard instanceId="cc-default" tool={TOOL_CC} />);
    expect(screen.getByText('No backups yet')).toBeInTheDocument();
  });

  it('renders backup entries when backups exist', () => {
    useBackupStore.setState({
      backups: { 'cc-default': [BACKUP_A, BACKUP_B] },
    });
    render(<BackupToolCard instanceId="cc-default" tool={TOOL_CC} />);
    expect(screen.getByText('Before upgrade')).toBeInTheDocument();
    expect(screen.queryByText('No backups yet')).not.toBeInTheDocument();
  });

  it('disables Backup Now when creating matches instanceId', () => {
    useBackupStore.setState({ creating: 'cc-default' });
    render(<BackupToolCard instanceId="cc-default" tool={TOOL_CC} />);
    const btn = screen.getByText('Creating...');
    expect(btn).toBeDisabled();
  });

  it('Backup Now shows create form on click', () => {
    render(<BackupToolCard instanceId="cc-default" tool={TOOL_CC} />);
    fireEvent.click(screen.getByText('Backup Now'));
    expect(screen.getByPlaceholderText('e.g., before-superpowers-update')).toBeInTheDocument();
    // Backup Now button should be hidden while form is shown
    expect(screen.queryByText('Backup Now')).not.toBeInTheDocument();
  });
});

// ─── BackupsTab ──────────────────────────────────────────────────────

describe('BackupsTab', () => {
  it('renders tool cards for detected tools', () => {
    useToolStore.setState({ tools: [TOOL_CC, TOOL_GC] });
    render(<BackupsTab />);
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('Gemini CLI')).toBeInTheDocument();
  });

  it('does not render cards for non-detected tools', () => {
    const undetected = { ...TOOL_CC, detected: false };
    useToolStore.setState({ tools: [undetected] });
    render(<BackupsTab />);
    expect(screen.queryByText('Claude Code')).not.toBeInTheDocument();
  });

  it('shows total summary line', () => {
    useToolStore.setState({ tools: [TOOL_CC] });
    useBackupStore.setState({
      backups: { 'cc-default': [BACKUP_A, BACKUP_B] },
    });
    render(<BackupsTab />);
    const summary = screen.getByTestId('backup-summary');
    expect(summary.textContent).toMatch(/2 backups/);
    expect(summary.textContent).toMatch(/1 tool/);
  });

  it('shows "Only detected tools are shown." footer', () => {
    useToolStore.setState({ tools: [TOOL_CC] });
    render(<BackupsTab />);
    expect(screen.getByText('Only detected tools are shown.')).toBeInTheDocument();
  });

  it('calls loadAllBackups on mount with detected tool instanceIds', () => {
    const listMock = vi.mocked(window.aiplughub.backups.list);
    useToolStore.setState({ tools: [TOOL_CC, TOOL_GC] });
    render(<BackupsTab />);
    // loadAllBackups calls loadBackups for each id, which calls backups.list
    expect(listMock).toHaveBeenCalledWith('cc-default');
    expect(listMock).toHaveBeenCalledWith('gc-default');
  });
});

// ─── BackupCreateForm ───────────────────────────────────────────────

describe('BackupCreateForm', () => {
  const defaultProps = {
    instanceId: 'cc-default',
    toolId: 'claude-code',
    onCancel: vi.fn(),
    onComplete: vi.fn(),
  };

  beforeEach(() => {
    defaultProps.onCancel = vi.fn();
    defaultProps.onComplete = vi.fn();
  });

  it('form appears when Backup Now is clicked', () => {
    render(<BackupToolCard instanceId="cc-default" tool={TOOL_CC} />);
    expect(screen.queryByText('Label (optional)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Backup Now'));
    expect(screen.getByText('Label (optional)')).toBeInTheDocument();
  });

  it('label input accepts text', () => {
    render(<BackupCreateForm {...defaultProps} />);
    const input = screen.getByPlaceholderText('e.g., before-superpowers-update');
    fireEvent.change(input, { target: { value: 'my-label' } });
    expect(input).toHaveValue('my-label');
  });

  it('skip caches checkbox toggles', () => {
    render(<BackupCreateForm {...defaultProps} />);
    const checkbox = screen.getByLabelText('Skip caches and temporary files');
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('info button toggles info popover with pattern text', () => {
    render(<BackupCreateForm {...defaultProps} />);
    // Info button should be present for claude-code (has cache patterns)
    const infoBtn = screen.getByLabelText('Toggle cache pattern info');
    // Popover not visible initially
    expect(screen.queryByText('agent-cache/**')).not.toBeInTheDocument();
    // Click to show
    fireEvent.click(infoBtn);
    expect(screen.getByText('agent-cache/**')).toBeInTheDocument();
    expect(screen.getByText('Session cache, regenerates automatically')).toBeInTheDocument();
    expect(screen.getByText(/All excluded items regenerate automatically/)).toBeInTheDocument();
    // Click again to hide
    fireEvent.click(infoBtn);
    expect(screen.queryByText('agent-cache/**')).not.toBeInTheDocument();
  });

  it('secrets warning is always visible', () => {
    render(<BackupCreateForm {...defaultProps} />);
    expect(screen.getByText(/This backup may contain API keys and secrets/)).toBeInTheDocument();
  });

  it('cancel hides the form', () => {
    render(<BackupToolCard instanceId="cc-default" tool={TOOL_CC} />);
    fireEvent.click(screen.getByText('Backup Now'));
    expect(screen.getByText('Label (optional)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Label (optional)')).not.toBeInTheDocument();
    // Backup Now button reappears
    expect(screen.getByText('Backup Now')).toBeInTheDocument();
  });

  it('create button calls store action with correct args', async () => {
    const createMock = vi.mocked(window.aiplughub.backups.create);
    const summary: BackupSummary = {
      ...BACKUP_A,
      label: 'test-label',
    };
    createMock.mockResolvedValueOnce(summary);

    render(<BackupCreateForm {...defaultProps} />);

    // Fill in the label
    const input = screen.getByPlaceholderText('e.g., before-superpowers-update');
    fireEvent.change(input, { target: { value: 'test-label' } });

    // Enable skip caches
    fireEvent.click(screen.getByLabelText('Skip caches and temporary files'));

    // Submit
    await act(async () => {
      fireEvent.click(screen.getByText('Create Backup'));
    });

    expect(createMock).toHaveBeenCalledWith('cc-default', {
      label: 'test-label',
      skipCaches: true,
    });
  });

  it('form shows creating state while in progress', async () => {
    // Create a promise that won't resolve immediately
    let resolveCreate!: (value: BackupSummary) => void;
    const createPromise = new Promise<BackupSummary>((resolve) => {
      resolveCreate = resolve;
    });
    const createMock = vi.mocked(window.aiplughub.backups.create);
    createMock.mockReturnValueOnce(createPromise);

    render(<BackupCreateForm {...defaultProps} />);

    // Submit
    await act(async () => {
      fireEvent.click(screen.getByText('Create Backup'));
    });

    // Should show creating state
    expect(screen.getByText('Creating backup...')).toBeInTheDocument();
    // Form fields should not be visible
    expect(screen.queryByText('Label (optional)')).not.toBeInTheDocument();

    // Resolve the promise to clean up
    await act(async () => {
      resolveCreate(BACKUP_A);
    });
  });
});

// ─── RestoreDialog ──────────────────────────────────────────────────

describe('RestoreDialog', () => {
  it('shows confirmation with backup info when rendered', () => {
    render(<RestoreDialog entry={BACKUP_A} onClose={vi.fn()} />);
    expect(screen.getByText('Restore backup?')).toBeInTheDocument();
    expect(screen.getByText('Before upgrade')).toBeInTheDocument();
    expect(screen.getByText(/247 files/)).toBeInTheDocument();
    expect(screen.getByText(/\/home\/user\/\.claude/)).toBeInTheDocument();
  });

  it('shows green reassurance text', () => {
    render(<RestoreDialog entry={BACKUP_A} onClose={vi.fn()} />);
    expect(screen.getByText(/automatically backed up before restoring/)).toBeInTheDocument();
  });

  it('restore confirm button has olive styling', () => {
    render(<RestoreDialog entry={BACKUP_A} onClose={vi.fn()} />);
    const btn = screen.getByTestId('restore-confirm-btn');
    expect(btn.className).toContain('bg-accent-olive');
  });

  it('cancel closes the dialog', () => {
    const onClose = vi.fn();
    render(<RestoreDialog entry={BACKUP_A} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('confirm calls restoreBackup and shows success state', async () => {
    const restoreMock = vi.mocked(window.aiplughub.backups.restore);
    restoreMock.mockResolvedValueOnce({
      autoBackupPath: '/tmp/auto-backup-123',
      autoBackupManifest: { ...BACKUP_A, backupPath: '/tmp/auto-backup-123', auto: true },
    });

    const onClose = vi.fn();
    render(<RestoreDialog entry={BACKUP_A} onClose={onClose} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('restore-confirm-btn'));
    });

    expect(restoreMock).toHaveBeenCalledWith('cc-default', '/tmp/backups/cc-1');
    expect(screen.getByText('Restored successfully')).toBeInTheDocument();
    expect(screen.getByText(/auto-backup-123/)).toBeInTheDocument();
    expect(screen.getByText(/rescan is recommended/)).toBeInTheDocument();
  });

  it('shows error state when restore fails', async () => {
    const restoreMock = vi.mocked(window.aiplughub.backups.restore);
    restoreMock.mockRejectedValueOnce(new Error('RESTORE_FAILED: disk full'));

    render(<RestoreDialog entry={BACKUP_A} onClose={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('restore-confirm-btn'));
    });

    expect(screen.getByText('Restore failed')).toBeInTheDocument();
    expect(screen.getByText(/RESTORE_FAILED/)).toBeInTheDocument();
    expect(screen.getByText(/rolled back to its previous state/)).toBeInTheDocument();
  });
});

// ─── DeleteBackupDialog ─────────────────────────────────────────────

describe('DeleteBackupDialog', () => {
  it('shows confirmation when rendered', () => {
    render(<DeleteBackupDialog entry={BACKUP_A} onClose={vi.fn()} />);
    expect(screen.getByText('Delete backup?')).toBeInTheDocument();
    expect(screen.getByText(/Before upgrade/)).toBeInTheDocument();
  });

  it('shows "cannot be undone" warning', () => {
    render(<DeleteBackupDialog entry={BACKUP_A} onClose={vi.fn()} />);
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
  });

  it('cancel closes the dialog', () => {
    const onClose = vi.fn();
    render(<DeleteBackupDialog entry={BACKUP_A} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('confirm calls deleteBackup and closes', async () => {
    const deleteMock = vi.mocked(window.aiplughub.backups.delete);
    deleteMock.mockResolvedValueOnce(undefined);

    const onClose = vi.fn();
    render(<DeleteBackupDialog entry={BACKUP_A} onClose={onClose} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-confirm-btn'));
    });

    // deleteBackup in the store calls window.aiplughub.backups.delete
    // but it also does optimistic removal first, so we check the IPC mock
    expect(deleteMock).toHaveBeenCalledWith('cc-default', '/tmp/backups/cc-1');
    expect(onClose).toHaveBeenCalled();
  });
});
