/**
 * Backup & Restore types — FEAT-02.
 * Source: 5A-specs/backup-restore-spec.md §1a
 */

/** Manifest stored as .aiplughub-backup.json inside each backup directory */
export type BackupManifest = {
  version: 1;
  toolId: string;
  instanceId: string;
  configPath: string;
  createdAt: string;
  label?: string;
  fileCount: number;
  totalBytes: number;
  skipCaches: boolean;
  appVersion: string;
  auto?: boolean;
  files: string[];
  skippedFiles?: string[];
};

/** Summary sent to renderer (omits large arrays for IPC efficiency) */
export type BackupSummary = Omit<BackupManifest, 'files' | 'skippedFiles'> & {
  backupPath: string;
};

/** Options for creating a backup */
export type BackupCreateOptions = {
  label?: string;
  skipCaches?: boolean;
  auto?: boolean;
};

/** Result of a restore operation */
export type RestoreResult = {
  autoBackupPath: string;
  autoBackupManifest: BackupSummary;
};
