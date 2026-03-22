/**
 * Backup constants — FEAT-02.
 * Source: 5A-specs/backup-restore-spec.md §7
 */

export type CachePatternEntry = {
  pattern: string;
  description: string;
};

export const CACHE_PATTERNS: Record<string, CachePatternEntry[]> = {
  'claude-code': [
    { pattern: 'agent-cache/**', description: 'Session cache, regenerates automatically' },
    { pattern: 'statsig/**', description: 'Feature flag cache' },
    { pattern: 'sessions/**', description: 'Conversation session logs' },
    { pattern: '*.log', description: 'Log files' },
  ],
  'claude-desktop': [
    { pattern: 'Cache/**', description: 'Browser cache' },
    { pattern: 'GPUCache/**', description: 'GPU shader cache' },
    { pattern: 'logs/**', description: 'Application logs' },
  ],
};

export const BACKUP_MANIFEST_FILENAME = '.aiplughub-backup.json';
export const MAX_BACKUP_LABEL_LENGTH = 100;
export const MAX_SANITIZED_LABEL_LENGTH = 50;
export const BACKUP_SUFFIX = '.bak';
export const AUTO_BACKUP_LABEL = 'pre-restore-auto';
