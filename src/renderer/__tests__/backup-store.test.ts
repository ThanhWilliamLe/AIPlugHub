import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useBackupStore } from '../stores/backup-store';
import type { BackupSummary } from '@shared/types';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeBackupSummary(overrides: Partial<BackupSummary> = {}): BackupSummary {
  return {
    version: 1,
    toolId: 'claude-code',
    instanceId: 'claude-code-default',
    configPath: '/home/user/.claude',
    createdAt: '2026-03-18T10:00:00Z',
    fileCount: 5,
    totalBytes: 1024,
    skipCaches: false,
    appVersion: '1.0.0',
    backupPath: '/tmp/backups/backup-001',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  useBackupStore.setState({ backups: {}, creating: null, restoring: null, error: null });
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// loadBackups
// ---------------------------------------------------------------------------

describe('loadBackups', () => {
  it('stores result keyed by instanceId', async () => {
    const summaries = [makeBackupSummary(), makeBackupSummary({ backupPath: '/tmp/backups/backup-002' })];
    vi.mocked(window.aiplughub.backups.list).mockResolvedValueOnce(summaries);

    await useBackupStore.getState().loadBackups('claude-code-default');

    expect(useBackupStore.getState().backups['claude-code-default']).toEqual(summaries);
  });

  it('calls list with the correct instanceId', async () => {
    vi.mocked(window.aiplughub.backups.list).mockResolvedValueOnce([]);

    await useBackupStore.getState().loadBackups('gemini-default');

    expect(window.aiplughub.backups.list).toHaveBeenCalledWith('gemini-default');
  });

  it('stores empty array when no backups exist', async () => {
    vi.mocked(window.aiplughub.backups.list).mockResolvedValueOnce([]);

    await useBackupStore.getState().loadBackups('claude-code-default');

    expect(useBackupStore.getState().backups['claude-code-default']).toEqual([]);
  });

  it('preserves other instanceId entries when loading one', async () => {
    const existing = [makeBackupSummary({ instanceId: 'gemini-default', backupPath: '/tmp/g' })];
    useBackupStore.setState({ backups: { 'gemini-default': existing } });
    vi.mocked(window.aiplughub.backups.list).mockResolvedValueOnce([]);

    await useBackupStore.getState().loadBackups('claude-code-default');

    expect(useBackupStore.getState().backups['gemini-default']).toEqual(existing);
  });

  it('sets error on IPC failure', async () => {
    vi.mocked(window.aiplughub.backups.list).mockRejectedValueOnce(new Error('list failed'));

    await useBackupStore.getState().loadBackups('claude-code-default');

    expect(useBackupStore.getState().error).toBe('list failed');
  });

  it('does not update backups on failure', async () => {
    const existing = [makeBackupSummary()];
    useBackupStore.setState({ backups: { 'claude-code-default': existing } });
    vi.mocked(window.aiplughub.backups.list).mockRejectedValueOnce(new Error('fail'));

    await useBackupStore.getState().loadBackups('claude-code-default');

    expect(useBackupStore.getState().backups['claude-code-default']).toEqual(existing);
  });
});

// ---------------------------------------------------------------------------
// loadAllBackups
// ---------------------------------------------------------------------------

describe('loadAllBackups', () => {
  it('loads backups for multiple instanceIds in parallel', async () => {
    const summariesA = [makeBackupSummary({ instanceId: 'claude-code-default' })];
    const summariesB = [makeBackupSummary({ instanceId: 'gemini-default', backupPath: '/tmp/g/b' })];

    vi.mocked(window.aiplughub.backups.list)
      .mockResolvedValueOnce(summariesA)
      .mockResolvedValueOnce(summariesB);

    await useBackupStore.getState().loadAllBackups(['claude-code-default', 'gemini-default']);

    expect(useBackupStore.getState().backups['claude-code-default']).toEqual(summariesA);
    expect(useBackupStore.getState().backups['gemini-default']).toEqual(summariesB);
  });

  it('calls list once per instanceId', async () => {
    vi.mocked(window.aiplughub.backups.list).mockResolvedValue([]);

    await useBackupStore.getState().loadAllBackups(['a', 'b', 'c']);

    expect(window.aiplughub.backups.list).toHaveBeenCalledTimes(3);
  });

  it('is a no-op for empty array', async () => {
    await useBackupStore.getState().loadAllBackups([]);

    expect(window.aiplughub.backups.list).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createBackup
// ---------------------------------------------------------------------------

describe('createBackup', () => {
  it('sets creating to instanceId at start, clears on success', async () => {
    let creatingDuringCall: string | null = null;
    vi.mocked(window.aiplughub.backups.create).mockImplementationOnce(async () => {
      creatingDuringCall = useBackupStore.getState().creating;
      return makeBackupSummary();
    });
    vi.mocked(window.aiplughub.backups.list).mockResolvedValueOnce([]);

    await useBackupStore.getState().createBackup('claude-code-default');

    expect(creatingDuringCall).toBe('claude-code-default');
    expect(useBackupStore.getState().creating).toBeNull();
  });

  it('clears error at start', async () => {
    useBackupStore.setState({ error: 'stale error' });
    vi.mocked(window.aiplughub.backups.create).mockResolvedValueOnce(makeBackupSummary());
    vi.mocked(window.aiplughub.backups.list).mockResolvedValueOnce([]);

    await useBackupStore.getState().createBackup('claude-code-default');

    expect(useBackupStore.getState().error).toBeNull();
  });

  it('calls IPC with instanceId, label, and skipCaches', async () => {
    vi.mocked(window.aiplughub.backups.create).mockResolvedValueOnce(makeBackupSummary());
    vi.mocked(window.aiplughub.backups.list).mockResolvedValueOnce([]);

    await useBackupStore.getState().createBackup('claude-code-default', 'my label', true);

    expect(window.aiplughub.backups.create).toHaveBeenCalledWith('claude-code-default', {
      label: 'my label',
      skipCaches: true,
    });
  });

  it('refreshes list after creating', async () => {
    const summary = makeBackupSummary();
    const refreshed = [summary];
    vi.mocked(window.aiplughub.backups.create).mockResolvedValueOnce(summary);
    vi.mocked(window.aiplughub.backups.list).mockResolvedValueOnce(refreshed);

    await useBackupStore.getState().createBackup('claude-code-default');

    expect(useBackupStore.getState().backups['claude-code-default']).toEqual(refreshed);
  });

  it('returns the backup summary from IPC', async () => {
    const summary = makeBackupSummary({ label: 'test-label' });
    vi.mocked(window.aiplughub.backups.create).mockResolvedValueOnce(summary);
    vi.mocked(window.aiplughub.backups.list).mockResolvedValueOnce([summary]);

    const result = await useBackupStore.getState().createBackup('claude-code-default', 'test-label');

    expect(result).toEqual(summary);
  });

  it('sets error and clears creating on IPC failure', async () => {
    vi.mocked(window.aiplughub.backups.create).mockRejectedValueOnce(new Error('create failed'));

    await useBackupStore.getState().createBackup('claude-code-default').catch(() => {});

    expect(useBackupStore.getState().error).toBe('create failed');
    expect(useBackupStore.getState().creating).toBeNull();
  });

  it('re-throws on IPC failure', async () => {
    vi.mocked(window.aiplughub.backups.create).mockRejectedValueOnce(new Error('create failed'));

    await expect(
      useBackupStore.getState().createBackup('claude-code-default'),
    ).rejects.toThrow('create failed');
  });
});

// ---------------------------------------------------------------------------
// restoreBackup
// ---------------------------------------------------------------------------

describe('restoreBackup', () => {
  it('sets restoring to instanceId at start, clears on success', async () => {
    let restoringDuringCall: string | null = null;
    vi.mocked(window.aiplughub.backups.restore).mockImplementationOnce(async () => {
      restoringDuringCall = useBackupStore.getState().restoring;
      return {
        autoBackupPath: '/tmp/auto',
        autoBackupManifest: makeBackupSummary(),
      };
    });
    vi.mocked(window.aiplughub.backups.list).mockResolvedValueOnce([]);

    await useBackupStore.getState().restoreBackup('claude-code-default', '/tmp/backups/backup-001');

    expect(restoringDuringCall).toBe('claude-code-default');
    expect(useBackupStore.getState().restoring).toBeNull();
  });

  it('clears error at start', async () => {
    useBackupStore.setState({ error: 'stale error' });
    vi.mocked(window.aiplughub.backups.restore).mockResolvedValueOnce({
      autoBackupPath: '/tmp/auto',
      autoBackupManifest: makeBackupSummary(),
    });
    vi.mocked(window.aiplughub.backups.list).mockResolvedValueOnce([]);

    await useBackupStore.getState().restoreBackup('claude-code-default', '/tmp/backups/backup-001');

    expect(useBackupStore.getState().error).toBeNull();
  });

  it('calls IPC with instanceId and backupPath', async () => {
    vi.mocked(window.aiplughub.backups.restore).mockResolvedValueOnce({
      autoBackupPath: '/tmp/auto',
      autoBackupManifest: makeBackupSummary(),
    });
    vi.mocked(window.aiplughub.backups.list).mockResolvedValueOnce([]);

    await useBackupStore.getState().restoreBackup('claude-code-default', '/tmp/backups/backup-001');

    expect(window.aiplughub.backups.restore).toHaveBeenCalledWith(
      'claude-code-default',
      '/tmp/backups/backup-001',
    );
  });

  it('refreshes list after restore', async () => {
    const updated = [makeBackupSummary({ backupPath: '/tmp/auto' })];
    vi.mocked(window.aiplughub.backups.restore).mockResolvedValueOnce({
      autoBackupPath: '/tmp/auto',
      autoBackupManifest: makeBackupSummary(),
    });
    vi.mocked(window.aiplughub.backups.list).mockResolvedValueOnce(updated);

    await useBackupStore.getState().restoreBackup('claude-code-default', '/tmp/backups/backup-001');

    expect(useBackupStore.getState().backups['claude-code-default']).toEqual(updated);
  });

  it('sets error and clears restoring on IPC failure', async () => {
    vi.mocked(window.aiplughub.backups.restore).mockRejectedValueOnce(new Error('restore failed'));

    await useBackupStore.getState().restoreBackup('claude-code-default', '/tmp/backup').catch(() => {});

    expect(useBackupStore.getState().error).toBe('restore failed');
    expect(useBackupStore.getState().restoring).toBeNull();
  });

  it('re-throws on IPC failure', async () => {
    vi.mocked(window.aiplughub.backups.restore).mockRejectedValueOnce(new Error('restore failed'));

    await expect(
      useBackupStore.getState().restoreBackup('claude-code-default', '/tmp/backup'),
    ).rejects.toThrow('restore failed');
  });
});

// ---------------------------------------------------------------------------
// deleteBackup
// ---------------------------------------------------------------------------

describe('deleteBackup', () => {
  it('optimistically removes the entry from local state before IPC resolves', async () => {
    const b1 = makeBackupSummary({ backupPath: '/tmp/backup-001' });
    const b2 = makeBackupSummary({ backupPath: '/tmp/backup-002' });
    useBackupStore.setState({ backups: { 'claude-code-default': [b1, b2] } });

    let stateAfterOptimistic: BackupSummary[] | undefined;
    vi.mocked(window.aiplughub.backups.delete).mockImplementationOnce(async () => {
      stateAfterOptimistic = useBackupStore.getState().backups['claude-code-default'];
    });

    await useBackupStore.getState().deleteBackup('claude-code-default', '/tmp/backup-001');

    expect(stateAfterOptimistic).toHaveLength(1);
    expect(stateAfterOptimistic![0].backupPath).toBe('/tmp/backup-002');
  });

  it('keeps remaining entries after delete', async () => {
    const b1 = makeBackupSummary({ backupPath: '/tmp/backup-001' });
    const b2 = makeBackupSummary({ backupPath: '/tmp/backup-002' });
    useBackupStore.setState({ backups: { 'claude-code-default': [b1, b2] } });
    vi.mocked(window.aiplughub.backups.delete).mockResolvedValueOnce(undefined);

    await useBackupStore.getState().deleteBackup('claude-code-default', '/tmp/backup-001');

    const remaining = useBackupStore.getState().backups['claude-code-default'];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].backupPath).toBe('/tmp/backup-002');
  });

  it('calls IPC with correct instanceId and backupPath', async () => {
    useBackupStore.setState({
      backups: { 'claude-code-default': [makeBackupSummary({ backupPath: '/tmp/backup-001' })] },
    });
    vi.mocked(window.aiplughub.backups.delete).mockResolvedValueOnce(undefined);

    await useBackupStore.getState().deleteBackup('claude-code-default', '/tmp/backup-001');

    expect(window.aiplughub.backups.delete).toHaveBeenCalledWith(
      'claude-code-default',
      '/tmp/backup-001',
    );
  });

  it('reverts optimistic delete by reloading from server on failure', async () => {
    const b1 = makeBackupSummary({ backupPath: '/tmp/backup-001' });
    const b2 = makeBackupSummary({ backupPath: '/tmp/backup-002' });
    useBackupStore.setState({ backups: { 'claude-code-default': [b1, b2] } });
    vi.mocked(window.aiplughub.backups.delete).mockRejectedValueOnce(new Error('delete failed'));
    vi.mocked(window.aiplughub.backups.list).mockResolvedValueOnce([b1, b2]);

    await useBackupStore.getState().deleteBackup('claude-code-default', '/tmp/backup-001');

    expect(useBackupStore.getState().backups['claude-code-default']).toEqual([b1, b2]);
  });

  it('sets error on IPC failure', async () => {
    useBackupStore.setState({
      backups: { 'claude-code-default': [makeBackupSummary({ backupPath: '/tmp/backup-001' })] },
    });
    vi.mocked(window.aiplughub.backups.delete).mockRejectedValueOnce(new Error('delete failed'));
    vi.mocked(window.aiplughub.backups.list).mockResolvedValueOnce([]);

    await useBackupStore.getState().deleteBackup('claude-code-default', '/tmp/backup-001');

    expect(useBackupStore.getState().error).toBe('delete failed');
  });

  it('handles deleting from an instanceId that has no backups in state', async () => {
    vi.mocked(window.aiplughub.backups.delete).mockResolvedValueOnce(undefined);

    // Should not throw
    await expect(
      useBackupStore.getState().deleteBackup('claude-code-default', '/tmp/ghost'),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// clearError
// ---------------------------------------------------------------------------

describe('clearError', () => {
  it('sets error to null', () => {
    useBackupStore.setState({ error: 'some error' });

    useBackupStore.getState().clearError();

    expect(useBackupStore.getState().error).toBeNull();
  });

  it('is a no-op when error is already null', () => {
    useBackupStore.getState().clearError();

    expect(useBackupStore.getState().error).toBeNull();
  });
});
