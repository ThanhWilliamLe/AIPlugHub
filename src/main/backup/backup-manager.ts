/**
 * BackupManager -- directory-level backup and restore for tool config dirs.
 * Source: 5A-specs/backup-restore-spec.md section 2
 */

import * as fsPromises from 'fs/promises';
import { mkdir, readdir, readFile, writeFile, rm, access, constants } from 'fs/promises';
import { join, dirname, basename, relative } from 'path';
import { minimatch } from 'minimatch';
import { withAdapterLock } from '../ipc/operation-lock';
import {
  BACKUP_MANIFEST_FILENAME,
  BACKUP_SUFFIX,
  MAX_SANITIZED_LABEL_LENGTH,
  AUTO_BACKUP_LABEL,
} from '@shared/constants';
import type {
  BackupManifest,
  BackupSummary,
  BackupCreateOptions,
  RestoreResult,
} from '@shared/types';
import { AppError } from '@shared/types';
import type { AdapterRegistry } from '../adapters/adapter-registry';
import { createLogger } from '../logger';

const logger = createLogger();
const MODULE = 'BackupManager';

export class BackupManager {
  constructor(
    private registry: AdapterRegistry,
    private appVersion: string,
  ) {}

  // --- Label sanitization ---

  private sanitizeLabel(raw: string): string {
    let label = raw
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
    if (label.length > MAX_SANITIZED_LABEL_LENGTH) {
      label = label.slice(0, MAX_SANITIZED_LABEL_LENGTH);
    }
    return label;
  }

  // --- Backup path generation ---

  private async getBackupPath(configPath: string, label?: string): Promise<string> {
    const parent = dirname(configPath);
    const base = basename(configPath);
    const now = new Date();
    const ts =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      '-' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');

    const sanitized = label ? this.sanitizeLabel(label) : '';
    const labelSeg = sanitized ? `.${sanitized}` : '';

    let candidate = join(parent, `${base}.${ts}${labelSeg}${BACKUP_SUFFIX}`);
    let suffix = 2;
    while (true) {
      try {
        await access(candidate);
        // exists -- try next suffix on the timestamp segment
        candidate = join(parent, `${base}.${ts}-${suffix}${labelSeg}${BACKUP_SUFFIX}`);
        suffix++;
      } catch {
        break; // does not exist -- use this path
      }
    }
    return candidate;
  }

  // --- Recursive copy with exclusions ---

  /**
   * rootSrc: the original config root (for correct relative path matching)
   * src: current source dir (advances during recursion)
   * dest: current dest dir
   */
  private async copyDir(
    rootSrc: string,
    src: string,
    dest: string,
    excludePatterns: string[],
    files: string[],
    skippedFiles: string[],
    totalBytes: { value: number },
  ): Promise<void> {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      // Compute path relative to root for pattern matching
      const relPath = relative(rootSrc, srcPath).replace(/\\/g, '/');

      // Check exclusion patterns
      const shouldExclude = excludePatterns.some((pattern) => {
        if (entry.isDirectory()) {
          return minimatch(relPath, pattern) || minimatch(relPath + '/', pattern);
        }
        return minimatch(relPath, pattern);
      });
      if (shouldExclude) continue;

      // Skip manifest file (relevant when copying from a backup dir)
      if (entry.name === BACKUP_MANIFEST_FILENAME) continue;

      if (entry.isDirectory()) {
        await this.copyDir(
          rootSrc,
          srcPath,
          destPath,
          excludePatterns,
          files,
          skippedFiles,
          totalBytes,
        );
      } else {
        try {
          const content = await readFile(srcPath);
          await writeFile(destPath, content);
          files.push(relPath);
          totalBytes.value += content.length;
        } catch {
          skippedFiles.push(relPath);
          logger.warn(MODULE, `Skipped unreadable file: ${relPath}`);
        }
      }
    }
  }

  // --- Create (public, acquires lock) ---

  async create(instanceId: string, options?: BackupCreateOptions): Promise<BackupSummary> {
    return withAdapterLock(instanceId, () => this._createInternal(instanceId, options));
  }

  // --- Create (internal, no lock -- called from within restore which already holds it) ---

  private async _createInternal(
    instanceId: string,
    options?: BackupCreateOptions,
  ): Promise<BackupSummary> {
    const adapter = this.registry.getAdapter(instanceId);
    const configPath = adapter.resolveConfigDir();

    // Verify config dir exists
    try {
      await access(configPath);
    } catch {
      throw new AppError('BACKUP_CONFIG_NOT_FOUND', `Config directory not found: ${configPath}`);
    }

    // Verify parent is writable
    const parent = dirname(configPath);
    try {
      await access(parent, constants.W_OK);
    } catch {
      throw new AppError('BACKUP_PERMISSION_DENIED', `Cannot write to ${parent}`);
    }

    const backupPath = await this.getBackupPath(configPath, options?.label);
    const excludePatterns = options?.skipCaches ? adapter.getCachePatterns() : [];

    const files: string[] = [];
    const skippedFiles: string[] = [];
    const totalBytes = { value: 0 };

    try {
      await this.copyDir(
        configPath,
        configPath,
        backupPath,
        excludePatterns,
        files,
        skippedFiles,
        totalBytes,
      );
    } catch (err) {
      // Clean up partial backup
      await rm(backupPath, { recursive: true, force: true }).catch(() => {});
      if ((err as NodeJS.ErrnoException).code === 'ENOSPC') {
        throw new AppError('BACKUP_DISK_FULL', 'Not enough disk space to create backup.');
      }
      throw err;
    }

    const manifest: BackupManifest = {
      version: 1,
      toolId: adapter.toolId,
      instanceId,
      configPath,
      createdAt: new Date().toISOString(),
      label: options?.label ? this.sanitizeLabel(options.label) || undefined : undefined,
      fileCount: files.length,
      totalBytes: totalBytes.value,
      skipCaches: options?.skipCaches ?? false,
      appVersion: this.appVersion,
      auto: options?.auto || undefined,
      files,
      skippedFiles: skippedFiles.length > 0 ? skippedFiles : undefined,
    };

    await writeFile(join(backupPath, BACKUP_MANIFEST_FILENAME), JSON.stringify(manifest, null, 2));

    logger.info(MODULE, `Backup created: ${backupPath}`, { instanceId, fileCount: files.length });

    // Return summary (no files/skippedFiles)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { files: _files, skippedFiles: _skipped, ...rest } = manifest;
    return { ...rest, backupPath };
  }

  // --- List ---

  async list(instanceId: string): Promise<BackupSummary[]> {
    const adapter = this.registry.getAdapter(instanceId);
    const configPath = adapter.resolveConfigDir();
    const parent = dirname(configPath);
    const base = basename(configPath);

    let entries: string[];
    try {
      const all = await readdir(parent);
      entries = all.filter(
        (name) => name.startsWith(base + '.') && name.endsWith(BACKUP_SUFFIX) && name !== base,
      );
    } catch {
      return [];
    }

    const summaries: BackupSummary[] = [];

    for (const name of entries) {
      const backupPath = join(parent, name);
      const manifestPath = join(backupPath, BACKUP_MANIFEST_FILENAME);

      try {
        const raw = await readFile(manifestPath, 'utf-8');
        const manifest: BackupManifest = JSON.parse(raw);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { files: _files, skippedFiles: _skipped, ...rest } = manifest;
        summaries.push({ ...rest, backupPath });
      } catch {
        // No manifest -- parse from folder name
        // Format: <base>.<YYYYMMDD-HHmmss>[.<label>].bak
        const withoutBase = name.slice(base.length + 1, -BACKUP_SUFFIX.length);
        const parts = withoutBase.split('.');
        const tsPart = parts[0] ?? '';
        const label = parts.length > 1 ? parts.slice(1).join('.') : undefined;

        // Parse timestamp: YYYYMMDD-HHmmss
        let createdAt = '';
        if (tsPart.length >= 15) {
          const y = tsPart.slice(0, 4),
            mo = tsPart.slice(4, 6),
            d = tsPart.slice(6, 8);
          const h = tsPart.slice(9, 11),
            mi = tsPart.slice(11, 13),
            s = tsPart.slice(13, 15);
          createdAt = `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`;
        }

        summaries.push({
          version: 1,
          toolId: adapter.toolId,
          instanceId,
          configPath,
          createdAt,
          label,
          fileCount: 0,
          totalBytes: 0,
          skipCaches: false,
          appVersion: 'unknown',
          backupPath,
        });
      }
    }

    summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return summaries;
  }

  // --- Restore ---

  async restore(instanceId: string, backupPath: string): Promise<RestoreResult> {
    return withAdapterLock(instanceId, async () => {
      // Verify backup exists
      try {
        await access(backupPath);
      } catch {
        throw new AppError('BACKUP_NOT_FOUND', `Backup not found: ${backupPath}`);
      }

      logger.info(MODULE, `Restore started: ${backupPath}`, { instanceId });

      // Phase 1: Auto-backup current state (no lock -- we already hold it)
      const autoBackup = await this._createInternal(instanceId, {
        label: AUTO_BACKUP_LABEL,
        auto: true,
      });

      const adapter = this.registry.getAdapter(instanceId);
      const configPath = adapter.resolveConfigDir();

      // Phase 2: Replace config with backup
      try {
        // Remove all current contents
        const currentEntries = await readdir(configPath);
        for (const entry of currentEntries) {
          await rm(join(configPath, entry), { recursive: true, force: true });
        }

        // Copy backup contents (excluding manifest)
        const backupEntries = await readdir(backupPath, { withFileTypes: true });
        for (const entry of backupEntries) {
          if (entry.name === BACKUP_MANIFEST_FILENAME) continue;
          const src = join(backupPath, entry.name);
          const dest = join(configPath, entry.name);
          await fsPromises.cp(src, dest, { recursive: true });
        }
      } catch (err) {
        // Rollback: restore from auto-backup
        logger.error(
          MODULE,
          `Restore failed, rolling back: ${(err as Error).message}`,
          err as Error,
          { instanceId },
        );
        try {
          const autoEntries = await readdir(configPath).catch(() => [] as string[]);
          for (const entry of autoEntries) {
            await rm(join(configPath, entry), { recursive: true, force: true });
          }
          const rollbackEntries = await readdir(autoBackup.backupPath, { withFileTypes: true });
          for (const entry of rollbackEntries) {
            if (entry.name === BACKUP_MANIFEST_FILENAME) continue;
            await fsPromises.cp(
              join(autoBackup.backupPath, entry.name),
              join(configPath, entry.name),
              {
                recursive: true,
              },
            );
          }
          throw new AppError(
            'RESTORE_FAILED',
            `Restore failed: ${(err as Error).message}. Your config has been rolled back.`,
            true,
          );
        } catch (rollbackErr) {
          if (rollbackErr instanceof AppError && rollbackErr.code === 'RESTORE_FAILED') {
            throw rollbackErr;
          }
          logger.error(
            MODULE,
            `Rollback failed: ${(rollbackErr as Error).message}`,
            rollbackErr as Error,
            { instanceId },
          );
          throw new AppError(
            'RESTORE_ROLLBACK_FAILED',
            `Restore failed and rollback unsuccessful. Previous config saved at ${autoBackup.backupPath}.`,
            false,
            { autoBackupPath: autoBackup.backupPath },
          );
        }
      }

      logger.info(MODULE, 'Restore completed', { instanceId, backupPath });
      return {
        autoBackupPath: autoBackup.backupPath,
        autoBackupManifest: autoBackup,
      };
    });
  }

  // --- Delete ---

  async delete(instanceId: string, backupPath: string): Promise<void> {
    // Safety: must end with .bak
    if (!backupPath.endsWith(BACKUP_SUFFIX)) {
      throw new AppError('BACKUP_NOT_FOUND', 'Not a backup directory.');
    }

    // Verify backup exists
    try {
      await access(backupPath);
    } catch {
      throw new AppError('BACKUP_NOT_FOUND', `Backup not found: ${backupPath}`);
    }

    // Ownership check
    const manifestPath = join(backupPath, BACKUP_MANIFEST_FILENAME);
    try {
      const raw = await readFile(manifestPath, 'utf-8');
      const manifest: BackupManifest = JSON.parse(raw);
      if (manifest.instanceId !== instanceId) {
        throw new AppError('BACKUP_NOT_FOUND', 'Backup does not belong to this tool instance.');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      // No manifest -- verify path is a sibling of the adapter's config dir
      const adapter = this.registry.getAdapter(instanceId);
      const configPath = adapter.resolveConfigDir();
      const parent = dirname(configPath);
      if (dirname(backupPath) !== parent) {
        throw new AppError('BACKUP_NOT_FOUND', 'Backup does not belong to this tool instance.');
      }
    }

    await rm(backupPath, { recursive: true, force: true });
    logger.info(MODULE, `Backup deleted: ${backupPath}`, { instanceId });
  }
}
