/**
 * Backup store — Zustand state for the Backups tab in Settings.
 * Source: 5A-specs/backup-restore-spec.md §5
 */
import { create } from 'zustand';
import type { BackupSummary, RestoreResult } from '@shared/types';

export type BackupStoreState = {
  backups: Record<string, BackupSummary[]>;
  creating: string | null;
  restoring: string | null;
  error: string | null;

  loadBackups: (instanceId: string) => Promise<void>;
  loadAllBackups: (instanceIds: string[]) => Promise<void>;
  createBackup: (
    instanceId: string,
    label?: string,
    skipCaches?: boolean,
  ) => Promise<BackupSummary>;
  restoreBackup: (instanceId: string, backupPath: string) => Promise<RestoreResult>;
  deleteBackup: (instanceId: string, backupPath: string) => Promise<void>;
  clearError: () => void;
};

export const useBackupStore = create<BackupStoreState>((set, get) => ({
  backups: {},
  creating: null,
  restoring: null,
  error: null,

  async loadBackups(instanceId) {
    try {
      const entries = await window.aiplughub.backups.list(instanceId);
      set((s) => ({ backups: { ...s.backups, [instanceId]: entries } }));
    } catch (err) {
      set({ error: (err as { message?: string }).message ?? 'Failed to load backups' });
    }
  },

  async loadAllBackups(instanceIds) {
    await Promise.all(instanceIds.map((id) => get().loadBackups(id)));
  },

  async createBackup(instanceId, label, skipCaches) {
    set({ creating: instanceId, error: null });
    try {
      const result = await window.aiplughub.backups.create(instanceId, { label, skipCaches });
      await get().loadBackups(instanceId);
      return result;
    } catch (err) {
      set({ error: (err as { message?: string }).message ?? 'Backup failed' });
      throw err;
    } finally {
      set({ creating: null });
    }
  },

  async restoreBackup(instanceId, backupPath) {
    set({ restoring: instanceId, error: null });
    try {
      const result = await window.aiplughub.backups.restore(instanceId, backupPath);
      await get().loadBackups(instanceId);
      return result;
    } catch (err) {
      set({ error: (err as { message?: string }).message ?? 'Restore failed' });
      throw err;
    } finally {
      set({ restoring: null });
    }
  },

  async deleteBackup(instanceId, backupPath) {
    // Optimistic: remove from local state
    set((s) => ({
      backups: {
        ...s.backups,
        [instanceId]: (s.backups[instanceId] ?? []).filter((b) => b.backupPath !== backupPath),
      },
    }));
    try {
      await window.aiplughub.backups.delete(instanceId, backupPath);
    } catch (err) {
      // Revert: reload from server
      await get().loadBackups(instanceId);
      set({ error: (err as { message?: string }).message ?? 'Delete failed' });
    }
  },

  clearError() {
    set({ error: null });
  },
}));
