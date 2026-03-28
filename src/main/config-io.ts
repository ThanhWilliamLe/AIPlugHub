/**
 * ConfigIO — centralized file I/O with safety guarantees.
 * All adapters delegate to this instead of raw fs calls.
 * Source: 4B-architecture/system-design.md §1.3
 *
 * Safety:
 * - Backup before write: copies original to <path>.backup
 * - Atomic writes: temp file in same directory, then rename
 * - Backup failure = abort write (never write without backup)
 *
 * Security notes (deferred to adapter/IPC boundary):
 * - Path traversal protection: adapters validate paths against their own rootPath
 * - Symlink detection: adapters check with lstat() before passing to ConfigIO
 * - Write serialization: adapters serialize per-config-file (M4 operation lock)
 */

import {
  readFile,
  writeFile as fsWriteFile,
  copyFile,
  rename,
  stat,
  readdir,
  unlink,
  mkdir,
} from 'fs/promises';
import { dirname, join, extname } from 'path';
import { randomUUID, createHash } from 'crypto';
import * as yaml from 'js-yaml';
import { parse as parseJSONC, type ParseError } from 'jsonc-parser';
import type { Logger } from './logger';
import { AppError } from '@shared/types';
import { assertWriteAllowed } from './write-guard';

export interface ConfigIO {
  readJSON(path: string): Promise<unknown>;
  readYAMLFrontmatter(path: string): Promise<{ frontmatter: unknown; content: string }>;
  readTOML(path: string): Promise<unknown>;

  writeJSON(path: string, data: unknown): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;

  exists(path: string): Promise<boolean>;
  listDir(path: string, pattern?: string): Promise<string[]>;

  hasBackup(path: string): Promise<boolean>;
  restoreFromBackup(path: string): Promise<void>;
}

/** Max config file size: 10 MB (prevents OOM on malicious/corrupted files) */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Strip UTF-8 BOM from the beginning of a string.
 */
function stripBOM(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 12);
}

/**
 * Map filesystem error codes to AppError codes.
 * Exported for unit testing — internal to ConfigIO in practice.
 */
export function mapFsError(err: NodeJS.ErrnoException, path: string): AppError {
  switch (err.code) {
    case 'EACCES':
    case 'EPERM':
      return new AppError('CONFIG_PERMISSION', `Permission denied: ${path}`, false, { path });
    case 'EBUSY':
      return new AppError('CONFIG_LOCKED', `File is locked by another process: ${path}`, true, {
        path,
      });
    default:
      throw err; // Re-throw unmapped errors as-is
  }
}

export function createConfigIO(logger: Logger): ConfigIO {
  const MODULE = 'ConfigIO';

  /**
   * FIX 1: Read file first, THEN check size. Eliminates TOCTOU race
   * where file could grow between stat() and readFile().
   */
  async function readRaw(path: string): Promise<string> {
    let raw: string;
    try {
      raw = await readFile(path, 'utf-8');
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'EACCES' || nodeErr.code === 'EPERM' || nodeErr.code === 'EBUSY') {
        throw mapFsError(nodeErr, path);
      }
      throw err;
    }
    const byteLength = Buffer.byteLength(raw, 'utf-8');
    if (byteLength > MAX_FILE_SIZE) {
      throw new AppError(
        'FILE_TOO_LARGE',
        `File too large (${byteLength} bytes, max ${MAX_FILE_SIZE}): ${path}`,
        false,
        { path, size: byteLength, maxSize: MAX_FILE_SIZE },
      );
    }
    return stripBOM(raw);
  }

  /**
   * FIX 2: copyFile first, then read the backup to compute hash.
   * Ensures hash matches what was actually backed up.
   */
  async function backupAndWriteAtomic(targetPath: string, content: string): Promise<void> {
    assertWriteAllowed(targetPath);
    const backupPath = targetPath + '.backup';
    let previousHash: string | undefined;
    const newHash = contentHash(content);

    try {
      // Copy first, then read the backup to compute hash
      await copyFile(targetPath, backupPath);
      const backedUpContent = await readFile(backupPath, 'utf-8');
      previousHash = contentHash(backedUpContent);

      // Skip write entirely if content is identical (no-op optimization)
      if (previousHash === newHash) {
        // Remove the unnecessary backup copy
        try {
          await unlink(backupPath);
        } catch {
          // Best-effort cleanup
        }
        return;
      }

      logger.info(MODULE, `Backup created: ${backupPath}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist yet — no backup needed
      } else {
        // Backup failure = abort write
        logger.error(MODULE, `Backup failed, aborting write: ${targetPath}`, err as Error);
        throw new AppError(
          'CONFIG_PERMISSION',
          `Backup failed for ${targetPath}: ${(err as Error).message}. Write aborted.`,
          false,
          { path: targetPath },
        );
      }
    }

    // Ensure parent directory exists (first-run safety)
    const dir = dirname(targetPath);
    await mkdir(dir, { recursive: true });

    // Atomic write: temp file in same directory, then rename
    const tempPath = join(dir, `.plughub-tmp-${randomUUID()}`);

    try {
      await fsWriteFile(tempPath, content, 'utf-8');
      await rename(tempPath, targetPath);
      logger.info(MODULE, `Written: ${targetPath}`, {
        previousHash,
        newHash,
      });
    } catch (err) {
      // Clean up temp file on failure
      try {
        await unlink(tempPath);
      } catch {
        // Temp file may not exist
      }
      throw err;
    }
  }

  return {
    async readJSON(path: string): Promise<unknown> {
      const raw = await readRaw(path);
      // Use jsonc-parser: handles comments AND trailing commas (common in Claude Code configs)
      const errors: ParseError[] = [];
      const result = parseJSONC(raw, errors, { allowTrailingComma: true });
      if (errors.length > 0) {
        throw new AppError(
          'CONFIG_CORRUPTED',
          `Failed to parse JSON at ${path}: ${errors.length} parse error(s)`,
          true,
          { path, errorCount: errors.length },
        );
      }
      return result;
    },

    async readYAMLFrontmatter(path: string): Promise<{ frontmatter: unknown; content: string }> {
      const raw = await readRaw(path);

      // YAML frontmatter: starts with ---, ends with ---
      const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
      if (!match) {
        return { frontmatter: {}, content: raw };
      }

      const frontmatterStr = match[1];
      const bodyContent = match[2];

      let frontmatter: unknown;
      try {
        // Use JSON_SCHEMA for safety — restricts to safe JS primitives (no Date, Buffer, etc.)
        frontmatter = yaml.load(frontmatterStr, { schema: yaml.JSON_SCHEMA }) ?? {};
      } catch (err) {
        throw new AppError(
          'CONFIG_CORRUPTED',
          `Failed to parse YAML frontmatter at ${path}: ${(err as Error).message}`,
          true,
          { path },
        );
      }

      return { frontmatter, content: bodyContent };
    },

    async readTOML(path: string): Promise<unknown> {
      const raw = await readRaw(path); // Inherits size limit + error mapping from readRaw
      try {
        const { parse } = await import('smol-toml');
        return parse(raw);
      } catch (err) {
        throw new AppError('CONFIG_CORRUPTED', `Failed to parse TOML: ${path} — ${err}`, true);
      }
    },

    async writeJSON(path: string, data: unknown): Promise<void> {
      const content = JSON.stringify(data, null, 2) + '\n';
      await backupAndWriteAtomic(path, content);
    },

    async writeFile(path: string, content: string): Promise<void> {
      await backupAndWriteAtomic(path, content);
    },

    /**
     * FIX 3: Check isFile() so directories return false.
     */
    async exists(path: string): Promise<boolean> {
      try {
        const info = await stat(path);
        return info.isFile();
      } catch {
        return false;
      }
    },

    async listDir(path: string, pattern?: string): Promise<string[]> {
      const entries = await readdir(path);
      if (!pattern) return entries;

      // Simple glob: *.ext matching
      if (pattern.startsWith('*.')) {
        const ext = pattern.slice(1); // e.g., ".json"
        return entries.filter((e) => extname(e) === ext);
      }

      return entries.filter((e) => e.includes(pattern));
    },

    /**
     * FIX 4: hasBackup — check if <path>.backup exists as a regular file.
     */
    async hasBackup(path: string): Promise<boolean> {
      const backupPath = path + '.backup';
      try {
        const info = await stat(backupPath);
        return info.isFile();
      } catch {
        return false;
      }
    },

    /**
     * FIX 4: restoreFromBackup — copy <path>.backup to <path> safely
     * using backupAndWriteAtomic for atomic write with its own backup.
     */
    async restoreFromBackup(path: string): Promise<void> {
      const backupPath = path + '.backup';
      const backupContent = await readFile(backupPath, 'utf-8');
      logger.info(MODULE, `Restoring from backup: ${backupPath} -> ${path}`);
      await backupAndWriteAtomic(path, backupContent);
    },
  };
}
