import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fsMod from 'fs/promises';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access } from 'fs/promises';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { BackupManager } from '../backup/backup-manager';
import { BACKUP_MANIFEST_FILENAME, BACKUP_SUFFIX } from '@shared/constants';
import type { BackupManifest } from '@shared/types';
import { AppError } from '@shared/types';

// --- Mock fs/promises so we can intercept cp in rollback tests ---
// All exports delegate to the real implementation; cp is a vi.fn() that can be
// overridden per-test via mockRejectedValueOnce / mockImplementationOnce.
// vi.mock is hoisted before imports, so fsMod above gets the mocked module.
vi.mock('fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('fs/promises')>();
  return {
    ...real,
    cp: vi.fn(real.cp),
  };
});

// --- Mock withAdapterLock to run fn directly (no real lock needed in tests) ---
vi.mock('../ipc/operation-lock', () => ({
  withAdapterLock: async <T>(_id: string, fn: () => Promise<T>): Promise<T> => fn(),
}));

// --- Helpers ---

function createMockAdapter(configDir: string) {
  return {
    toolId: 'claude-code' as const,
    instanceId: 'claude-code-default',
    rootPath: configDir,
    resolveConfigDir() {
      return configDir;
    },
    getCachePatterns() {
      return ['cache/**', '*.log'];
    },
    // Stubs for remaining ToolAdapter interface
    detect: vi.fn(),
    scan: vi.fn(),
    install: vi.fn(),
    uninstall: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    canToggle: vi.fn(),
    getConfigPath: vi.fn(),
    getSupportedTypes: vi.fn(),
  };
}

function createMockRegistry(adapter: ReturnType<typeof createMockAdapter>) {
  return {
    getAdapter(_id: string) {
      return adapter;
    },
    register: vi.fn(),
    getAllAdapters: vi.fn(),
    detectAll: vi.fn(),
    scanAll: vi.fn(),
  };
}

async function readManifest(backupPath: string): Promise<BackupManifest> {
  const raw = await readFile(join(backupPath, BACKUP_MANIFEST_FILENAME), 'utf-8');
  return JSON.parse(raw);
}

/** Create a standard fixture config dir with test files */
async function createFixtureConfig(configDir: string): Promise<void> {
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, 'settings.json'), '{"key":"value"}');
  await mkdir(join(configDir, 'commands'), { recursive: true });
  await writeFile(join(configDir, 'commands', 'commit.md'), '# Commit');
  await mkdir(join(configDir, 'cache'), { recursive: true });
  await writeFile(join(configDir, 'cache', 'big.dat'), 'cached data');
  await writeFile(join(configDir, 'debug.log'), 'log line');
}

// =============================================================================

describe('BackupManager', () => {
  let tempDir: string;
  let configDir: string;
  let mockAdapter: ReturnType<typeof createMockAdapter>;
  let mockRegistry: ReturnType<typeof createMockRegistry>;
  let manager: BackupManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'aiplughub-backup-test-'));
    configDir = join(tempDir, '.claude');
    await createFixtureConfig(configDir);

    mockAdapter = createMockAdapter(configDir);
    mockRegistry = createMockRegistry(mockAdapter);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    manager = new BackupManager(mockRegistry as any, '1.0.0');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Label sanitization (tested indirectly through create)
  // ---------------------------------------------------------------------------

  describe('label sanitization', () => {
    it('replaces spaces with hyphens', async () => {
      const summary = await manager.create('claude-code-default', {
        label: 'my backup label',
      });
      expect(summary.label).toBe('my-backup-label');
    });

    it('strips special characters', async () => {
      const summary = await manager.create('claude-code-default', {
        label: 'hello@world!#$%',
      });
      expect(summary.label).toBe('helloworld');
    });

    it('truncates to 50 chars', async () => {
      const longLabel = 'a'.repeat(60);
      const summary = await manager.create('claude-code-default', {
        label: longLabel,
      });
      expect(summary.label!.length).toBe(50);
    });

    it('omits label when empty after sanitization', async () => {
      const summary = await manager.create('claude-code-default', {
        label: '@#$!',
      });
      expect(summary.label).toBeUndefined();
    });

    it('collapses consecutive hyphens', async () => {
      const summary = await manager.create('claude-code-default', {
        label: 'foo---bar',
      });
      expect(summary.label).toBe('foo-bar');
    });

    it('trims leading/trailing hyphens', async () => {
      const summary = await manager.create('claude-code-default', {
        label: '-trimmed-',
      });
      expect(summary.label).toBe('trimmed');
    });
  });

  // ---------------------------------------------------------------------------
  // create()
  // ---------------------------------------------------------------------------

  describe('create()', () => {
    it('creates a .bak sibling directory', async () => {
      const summary = await manager.create('claude-code-default');
      expect(summary.backupPath).toContain(BACKUP_SUFFIX);
      expect(dirname(summary.backupPath)).toBe(tempDir);
      // Verify directory exists
      await access(summary.backupPath);
    });

    it('writes a manifest file', async () => {
      const summary = await manager.create('claude-code-default');
      const manifest = await readManifest(summary.backupPath);
      expect(manifest.version).toBe(1);
      expect(manifest.toolId).toBe('claude-code');
      expect(manifest.instanceId).toBe('claude-code-default');
      expect(manifest.configPath).toBe(configDir);
      expect(manifest.appVersion).toBe('1.0.0');
    });

    it('counts files correctly, excluding manifest', async () => {
      const summary = await manager.create('claude-code-default');
      const manifest = await readManifest(summary.backupPath);
      // Fixture has: settings.json, commands/commit.md, cache/big.dat, debug.log = 4 files
      expect(manifest.fileCount).toBe(4);
      expect(manifest.files).toHaveLength(4);
      // Manifest itself should NOT be in the files list
      expect(manifest.files).not.toContain(BACKUP_MANIFEST_FILENAME);
    });

    it('calculates totalBytes', async () => {
      const summary = await manager.create('claude-code-default');
      const manifest = await readManifest(summary.backupPath);
      expect(manifest.totalBytes).toBeGreaterThan(0);
    });

    it('respects skipCaches patterns', async () => {
      const summary = await manager.create('claude-code-default', {
        skipCaches: true,
      });
      const manifest = await readManifest(summary.backupPath);
      // cache/big.dat and debug.log should be excluded
      expect(manifest.files).not.toContain('cache/big.dat');
      expect(manifest.files).not.toContain('debug.log');
      expect(manifest.skipCaches).toBe(true);
      // settings.json and commands/commit.md should remain
      expect(manifest.files).toContain('settings.json');
      expect(manifest.files).toContain('commands/commit.md');
      expect(manifest.fileCount).toBe(2);
    });

    it('sets auto flag when provided', async () => {
      const summary = await manager.create('claude-code-default', { auto: true });
      const manifest = await readManifest(summary.backupPath);
      expect(manifest.auto).toBe(true);
    });

    it('returns BackupSummary without files/skippedFiles', async () => {
      const summary = await manager.create('claude-code-default');
      expect(summary).not.toHaveProperty('files');
      expect(summary).not.toHaveProperty('skippedFiles');
      expect(summary.backupPath).toBeDefined();
      expect(summary.fileCount).toBeGreaterThan(0);
    });

    it('handles unreadable files by adding to skippedFiles', async () => {
      // Create a broken symlink that will fail to read
      const { symlink } = await import('fs/promises');
      const brokenTarget = join(configDir, 'nonexistent-target-xyz');
      const brokenLink = join(configDir, 'broken-link.txt');
      try {
        await symlink(brokenTarget, brokenLink);
      } catch {
        // Symlink creation may require elevated privileges on Windows; skip test
        return;
      }

      const summary = await manager.create('claude-code-default');
      const manifest = await readManifest(summary.backupPath);
      expect(manifest.skippedFiles).toBeDefined();
      expect(manifest.skippedFiles).toContain('broken-link.txt');
      expect(manifest.files).not.toContain('broken-link.txt');
    });

    it('throws BACKUP_CONFIG_NOT_FOUND when config dir missing', async () => {
      await rm(configDir, { recursive: true, force: true });
      await expect(manager.create('claude-code-default')).rejects.toThrow(AppError);
      try {
        await manager.create('claude-code-default');
      } catch (err) {
        expect((err as AppError).code).toBe('BACKUP_CONFIG_NOT_FOUND');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Timestamp collision / dedup
  // ---------------------------------------------------------------------------

  describe('timestamp collision', () => {
    it('appends -2 suffix when path exists', async () => {
      const s1 = await manager.create('claude-code-default');
      // Create second backup immediately (same second)
      const s2 = await manager.create('claude-code-default');
      expect(s2.backupPath).not.toBe(s1.backupPath);
      // Second path should have -2 in the timestamp segment
      expect(s2.backupPath).toMatch(/-2/);
    });
  });

  // ---------------------------------------------------------------------------
  // list()
  // ---------------------------------------------------------------------------

  describe('list()', () => {
    it('finds .bak siblings', async () => {
      await manager.create('claude-code-default', { label: 'first' });
      await manager.create('claude-code-default', { label: 'second' });

      const list = await manager.list('claude-code-default');
      expect(list).toHaveLength(2);
    });

    it('reads manifests and returns BackupSummary (no files/skippedFiles)', async () => {
      await manager.create('claude-code-default');
      const list = await manager.list('claude-code-default');
      expect(list).toHaveLength(1);
      const entry = list[0];
      expect(entry.backupPath).toBeDefined();
      expect(entry.toolId).toBe('claude-code');
      expect(entry).not.toHaveProperty('files');
      expect(entry).not.toHaveProperty('skippedFiles');
    });

    it('handles missing manifests by parsing folder name', async () => {
      // Create a backup directory manually without a manifest
      const fakeName = '.claude.20260101-120000.my-label' + BACKUP_SUFFIX;
      const fakePath = join(tempDir, fakeName);
      await mkdir(fakePath, { recursive: true });

      const list = await manager.list('claude-code-default');
      const entry = list.find((e) => e.backupPath === fakePath);
      expect(entry).toBeDefined();
      expect(entry!.label).toBe('my-label');
      expect(entry!.createdAt).toBe('2026-01-01T12:00:00.000Z');
      expect(entry!.fileCount).toBe(0);
      expect(entry!.appVersion).toBe('unknown');
    });

    it('sorts newest first', async () => {
      await manager.create('claude-code-default', { label: 'older' });
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 50));
      await manager.create('claude-code-default', { label: 'newer' });

      const list = await manager.list('claude-code-default');
      expect(list).toHaveLength(2);
      // newest first
      expect(list[0].createdAt >= list[1].createdAt).toBe(true);
    });

    it('returns empty array when no backups exist', async () => {
      const list = await manager.list('claude-code-default');
      expect(list).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // restore()
  // ---------------------------------------------------------------------------

  describe('restore()', () => {
    it('creates auto-backup first', async () => {
      const backup = await manager.create('claude-code-default');

      // Modify config so we can verify auto-backup captured the modified state
      await writeFile(join(configDir, 'new-file.txt'), 'added after backup');

      const result = await manager.restore('claude-code-default', backup.backupPath);
      expect(result.autoBackupPath).toBeDefined();
      expect(result.autoBackupManifest.auto).toBe(true);
      expect(result.autoBackupManifest.label).toBe('pre-restore-auto');

      // Verify the auto-backup has the new file
      const autoManifest = await readManifest(result.autoBackupPath);
      expect(autoManifest.files).toContain('new-file.txt');
    });

    it('replaces config dir contents with backup', async () => {
      // Create backup of current state
      const backup = await manager.create('claude-code-default');

      // Modify config dir
      await writeFile(join(configDir, 'settings.json'), '{"key":"modified"}');
      await writeFile(join(configDir, 'extra.txt'), 'extra');

      // Restore
      await manager.restore('claude-code-default', backup.backupPath);

      // Verify config matches backup (original state)
      const settings = await readFile(join(configDir, 'settings.json'), 'utf-8');
      expect(settings).toBe('{"key":"value"}');

      // extra.txt should be gone (full replacement)
      await expect(access(join(configDir, 'extra.txt'))).rejects.toThrow();
    });

    it('excludes manifest from restore copy', async () => {
      const backup = await manager.create('claude-code-default');
      await manager.restore('claude-code-default', backup.backupPath);

      // Config dir should NOT have the manifest file
      const entries = await readdir(configDir);
      expect(entries).not.toContain(BACKUP_MANIFEST_FILENAME);
    });

    it('returns RestoreResult with auto backup info', async () => {
      const backup = await manager.create('claude-code-default');
      const result = await manager.restore('claude-code-default', backup.backupPath);
      expect(result).toHaveProperty('autoBackupPath');
      expect(result).toHaveProperty('autoBackupManifest');
      expect(result.autoBackupManifest.instanceId).toBe('claude-code-default');
    });

    it('throws BACKUP_NOT_FOUND when backup path does not exist', async () => {
      const fakePath = join(tempDir, 'nonexistent.bak');
      await expect(manager.restore('claude-code-default', fakePath)).rejects.toThrow(AppError);
      try {
        await manager.restore('claude-code-default', fakePath);
      } catch (err) {
        expect((err as AppError).code).toBe('BACKUP_NOT_FOUND');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // restore() rollback
  // ---------------------------------------------------------------------------

  describe('restore() rollback', () => {
    it('rolls back on copy failure and throws RESTORE_FAILED', async () => {
      // Step 1: Create a backup of the current config
      const backup = await manager.create('claude-code-default');

      // Step 2: Add a marker file to configDir AFTER the backup was taken.
      // The restore() auto-backup (Phase 1) will capture this marker file.
      // When the restore fails and rolls back, the marker file should still be
      // present in configDir (restored from the auto-backup).
      const markerPath = join(configDir, 'rollback-marker.txt');
      await writeFile(markerPath, 'i exist after backup');

      // Step 3: Make cp throw on its first call during Phase 2 (restore copy).
      // Phase 1 (auto-backup) uses copyDir which reads+writes files via readFile/writeFile,
      // NOT cp — so this only affects Phase 2. The rollback in the catch block also
      // calls cp, so we only reject once (letting rollback succeed via the real cp).
      vi.mocked(fsMod.cp).mockRejectedValueOnce(new Error('mock disk error during restore copy'));

      // Step 4: Restore should reject with RESTORE_FAILED
      await expect(manager.restore('claude-code-default', backup.backupPath)).rejects.toMatchObject(
        { code: 'RESTORE_FAILED' },
      );

      // Step 5: The marker file should still exist — rollback restored pre-restore state
      await expect(access(markerPath)).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // delete()
  // ---------------------------------------------------------------------------

  describe('delete()', () => {
    it('removes the backup directory', async () => {
      const backup = await manager.create('claude-code-default');
      await manager.delete('claude-code-default', backup.backupPath);
      await expect(access(backup.backupPath)).rejects.toThrow();
    });

    it('validates .bak suffix', async () => {
      const fakePath = join(tempDir, 'not-a-backup');
      await mkdir(fakePath);
      await expect(manager.delete('claude-code-default', fakePath)).rejects.toThrow(AppError);
      try {
        await manager.delete('claude-code-default', fakePath);
      } catch (err) {
        expect((err as AppError).code).toBe('BACKUP_NOT_FOUND');
      }
    });

    it('validates ownership via manifest instanceId', async () => {
      const backup = await manager.create('claude-code-default');

      // Modify the manifest to belong to a different instance
      const manifestPath = join(backup.backupPath, BACKUP_MANIFEST_FILENAME);
      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
      manifest.instanceId = 'other-instance';
      await writeFile(manifestPath, JSON.stringify(manifest));

      await expect(manager.delete('claude-code-default', backup.backupPath)).rejects.toThrow(
        'Backup does not belong to this tool instance.',
      );
    });

    it('validates sibling path when no manifest', async () => {
      // Create a .bak dir in a completely different location
      const otherTemp = await mkdtemp(join(tmpdir(), 'aiplughub-other-'));
      const otherBackup = join(otherTemp, 'something.bak');
      await mkdir(otherBackup);

      try {
        await expect(manager.delete('claude-code-default', otherBackup)).rejects.toThrow(
          'Backup does not belong to this tool instance.',
        );
      } finally {
        await rm(otherTemp, { recursive: true, force: true });
      }
    });

    it('throws BACKUP_NOT_FOUND when path does not exist', async () => {
      const fakePath = join(tempDir, 'nonexistent.bak');
      try {
        await manager.delete('claude-code-default', fakePath);
      } catch (err) {
        expect((err as AppError).code).toBe('BACKUP_NOT_FOUND');
      }
    });

    it('allows delete of sibling .bak without manifest', async () => {
      // Create a .bak sibling manually (no manifest)
      const bakName = '.claude.20260101-120000.manual' + BACKUP_SUFFIX;
      const bakPath = join(tempDir, bakName);
      await mkdir(bakPath);
      await writeFile(join(bakPath, 'somefile.txt'), 'data');

      await manager.delete('claude-code-default', bakPath);
      await expect(access(bakPath)).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Error codes
  // ---------------------------------------------------------------------------

  describe('error codes', () => {
    it('BACKUP_CONFIG_NOT_FOUND when config dir missing', async () => {
      await rm(configDir, { recursive: true, force: true });
      try {
        await manager.create('claude-code-default');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('BACKUP_CONFIG_NOT_FOUND');
      }
    });

    it('BACKUP_NOT_FOUND when restore target missing', async () => {
      try {
        await manager.restore('claude-code-default', join(tempDir, 'gone.bak'));
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('BACKUP_NOT_FOUND');
      }
    });

    it('BACKUP_NOT_FOUND when delete target not .bak', async () => {
      try {
        await manager.delete('claude-code-default', join(tempDir, 'nope'));
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('BACKUP_NOT_FOUND');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Integration: create -> list -> restore -> verify
  // ---------------------------------------------------------------------------

  describe('integration: create -> list -> restore', () => {
    it('full cycle works end-to-end', async () => {
      // Step 1: Create backup
      const backup = await manager.create('claude-code-default', {
        label: 'before experiment',
      });
      expect(backup.label).toBe('before-experiment');

      // Step 2: Modify config
      await writeFile(join(configDir, 'settings.json'), '{"key":"modified"}');
      await writeFile(join(configDir, 'experiment.txt'), 'experiment data');

      // Step 3: List backups
      const list = await manager.list('claude-code-default');
      expect(list).toHaveLength(1);
      expect(list[0].label).toBe('before-experiment');

      // Step 4: Restore
      await manager.restore('claude-code-default', backup.backupPath);

      // Step 5: Verify config is restored
      const settings = await readFile(join(configDir, 'settings.json'), 'utf-8');
      expect(settings).toBe('{"key":"value"}');
      await expect(access(join(configDir, 'experiment.txt'))).rejects.toThrow();

      // Step 6: Verify auto-backup was created
      const listAfter = await manager.list('claude-code-default');
      // Should have: original backup + auto backup
      expect(listAfter.length).toBeGreaterThanOrEqual(2);
      const autoEntry = listAfter.find((e) => e.auto === true);
      expect(autoEntry).toBeDefined();

      // Step 7: Delete backup
      await manager.delete('claude-code-default', backup.backupPath);
      const listFinal = await manager.list('claude-code-default');
      expect(listFinal.find((e) => e.backupPath === backup.backupPath)).toBeUndefined();
    });
  });
});
