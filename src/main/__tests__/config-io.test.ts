import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir, chmod, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createConfigIO, mapFsError } from '../config-io';
import { createLogger } from '../logger';
import { AppError } from '@shared/types';

const logger = createLogger();
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'plughub-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('ConfigIO.readJSON', () => {
  it('reads valid JSON', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'test.json');
    await writeFile(file, '{"key": "value"}');
    const result = await io.readJSON(file);
    expect(result).toEqual({ key: 'value' });
  });

  it('handles UTF-8 BOM', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'bom.json');
    await writeFile(file, '\ufeff{"key": "bom"}');
    const result = await io.readJSON(file);
    expect(result).toEqual({ key: 'bom' });
  });

  it('strips JSONC line comments', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'jsonc.json');
    await writeFile(file, '{\n  // this is a comment\n  "key": "value"\n}');
    const result = await io.readJSON(file);
    expect(result).toEqual({ key: 'value' });
  });

  it('strips JSONC block comments', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'jsonc2.json');
    await writeFile(file, '{\n  /* block */\n  "key": "value"\n}');
    const result = await io.readJSON(file);
    expect(result).toEqual({ key: 'value' });
  });

  it('handles trailing commas (common in Claude Code configs)', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'trailing.json');
    await writeFile(file, '{\n  "a": 1,\n  "b": 2,\n}');
    const result = await io.readJSON(file);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('preserves // inside strings', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'str.json');
    await writeFile(file, '{"url": "https://example.com"}');
    const result = await io.readJSON(file);
    expect(result).toEqual({ url: 'https://example.com' });
  });

  it('throws AppError with CONFIG_CORRUPTED on corrupted JSON', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'bad.json');
    await writeFile(file, '{invalid json!!!');
    try {
      await io.readJSON(file);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.code).toBe('CONFIG_CORRUPTED');
      expect(appErr.recoverable).toBe(true);
      expect(appErr.message).toContain('Failed to parse JSON');
    }
  });

  it('throws on missing file', async () => {
    const io = createConfigIO(logger);
    await expect(io.readJSON(join(tempDir, 'nope.json'))).rejects.toThrow();
  });
});

describe('ConfigIO.readJSON — file size limit', () => {
  it('throws AppError with FILE_TOO_LARGE when file exceeds 10MB', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'huge.json');
    // Create a file just over 10MB: a JSON string with large padding
    const oversized = '{"data":"' + 'x'.repeat(10 * 1024 * 1024 + 100) + '"}';
    await writeFile(file, oversized);
    try {
      await io.readJSON(file);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.code).toBe('FILE_TOO_LARGE');
      expect(appErr.recoverable).toBe(false);
      expect(appErr.message).toContain('File too large');
    }
  });

  it('reads files just under 10MB limit', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'big.json');
    // Create a valid JSON file just under 10MB
    const padding = 'a'.repeat(9 * 1024 * 1024);
    const content = `{"data":"${padding}"}`;
    await writeFile(file, content);
    const result = await io.readJSON(file);
    expect(result).toHaveProperty('data');
  });
});

describe('ConfigIO.readYAMLFrontmatter', () => {
  it('parses YAML frontmatter and body', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'skill.md');
    await writeFile(file, '---\nname: test-skill\ndescription: A skill\n---\n# Content\nBody here');
    const result = await io.readYAMLFrontmatter(file);
    expect(result.frontmatter).toEqual({ name: 'test-skill', description: 'A skill' });
    expect(result.content).toBe('# Content\nBody here');
  });

  it('returns empty frontmatter when none exists', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'no-fm.md');
    await writeFile(file, '# Just markdown\nNo frontmatter');
    const result = await io.readYAMLFrontmatter(file);
    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe('# Just markdown\nNo frontmatter');
  });

  it('handles Windows line endings in frontmatter', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'crlf.md');
    await writeFile(file, '---\r\nname: test\r\n---\r\nBody');
    const result = await io.readYAMLFrontmatter(file);
    expect(result.frontmatter).toEqual({ name: 'test' });
    expect(result.content).toBe('Body');
  });

  it('throws AppError with CONFIG_CORRUPTED on invalid YAML', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'bad-yaml.md');
    await writeFile(file, '---\n: invalid: : yaml: :\n---\nBody');
    try {
      await io.readYAMLFrontmatter(file);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.code).toBe('CONFIG_CORRUPTED');
      expect(appErr.recoverable).toBe(true);
    }
  });
});

describe('ConfigIO.writeJSON', () => {
  it('writes valid JSON with pretty formatting', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'out.json');
    await io.writeJSON(file, { hello: 'world' });
    const content = await readFile(file, 'utf-8');
    expect(JSON.parse(content)).toEqual({ hello: 'world' });
    expect(content).toContain('  '); // indented
  });

  it('creates backup of existing file before write', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'data.json');

    // Create original
    await writeFile(file, '{"v": 1}');

    // Overwrite — should create backup
    await io.writeJSON(file, { v: 2 });

    const backup = await readFile(file + '.backup', 'utf-8');
    expect(JSON.parse(backup)).toEqual({ v: 1 });

    const updated = await readFile(file, 'utf-8');
    expect(JSON.parse(updated)).toEqual({ v: 2 });
  });

  it('does not create backup for new files', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'new.json');
    await io.writeJSON(file, { new: true });

    const content = await readFile(file, 'utf-8');
    expect(JSON.parse(content)).toEqual({ new: true });

    // No backup should exist
    await expect(readFile(file + '.backup', 'utf-8')).rejects.toThrow();
  });

  it('successive writes update the backup', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'multi.json');

    await writeFile(file, '{"v": 1}');
    await io.writeJSON(file, { v: 2 });
    await io.writeJSON(file, { v: 3 });

    // Backup should be v2 (the state before the last write)
    const backup = JSON.parse(await readFile(file + '.backup', 'utf-8'));
    expect(backup).toEqual({ v: 2 });
  });

  it('creates nested directories when parent does not exist (mkdir -p)', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'deep', 'nested', 'dir', 'config.json');
    await io.writeJSON(file, { nested: true });
    const content = await readFile(file, 'utf-8');
    expect(JSON.parse(content)).toEqual({ nested: true });
    // Verify the directory was created
    const dirInfo = await stat(join(tempDir, 'deep', 'nested', 'dir'));
    expect(dirInfo.isDirectory()).toBe(true);
  });
});

describe('ConfigIO.writeFile', () => {
  it('writes string content', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'text.md');
    await io.writeFile(file, '# Hello\nWorld');
    const content = await readFile(file, 'utf-8');
    expect(content).toBe('# Hello\nWorld');
  });

  it('creates backup of existing file', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'text.md');
    await writeFile(file, 'original');
    await io.writeFile(file, 'updated');
    const backup = await readFile(file + '.backup', 'utf-8');
    expect(backup).toBe('original');
  });
});

describe('ConfigIO.exists', () => {
  it('returns true for existing file', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'exists.txt');
    await writeFile(file, 'hi');
    expect(await io.exists(file)).toBe(true);
  });

  it('returns false for missing file', async () => {
    const io = createConfigIO(logger);
    expect(await io.exists(join(tempDir, 'nope.txt'))).toBe(false);
  });

  it('returns false for directories (FIX 3)', async () => {
    const io = createConfigIO(logger);
    const dirPath = join(tempDir, 'some-dir');
    await mkdir(dirPath);
    expect(await io.exists(dirPath)).toBe(false);
  });
});

describe('ConfigIO.listDir', () => {
  it('lists all files in directory', async () => {
    const io = createConfigIO(logger);
    await writeFile(join(tempDir, 'a.json'), '{}');
    await writeFile(join(tempDir, 'b.md'), '');
    const files = await io.listDir(tempDir);
    expect(files).toContain('a.json');
    expect(files).toContain('b.md');
  });

  it('filters by extension pattern', async () => {
    const io = createConfigIO(logger);
    await writeFile(join(tempDir, 'a.json'), '{}');
    await writeFile(join(tempDir, 'b.md'), '');
    await writeFile(join(tempDir, 'c.json'), '{}');
    const files = await io.listDir(tempDir, '*.json');
    expect(files).toEqual(['a.json', 'c.json']);
  });
});

describe('ConfigIO.readTOML', () => {
  it('parses valid TOML file', async () => {
    const io = createConfigIO(logger);
    const tomlFile = join(tempDir, 'test.toml');
    await writeFile(tomlFile, 'description = "Hello"\nprompt = "Do stuff"\n');
    const result = (await io.readTOML(tomlFile)) as Record<string, unknown>;
    expect(result.description).toBe('Hello');
    expect(result.prompt).toBe('Do stuff');
  });

  it('throws ENOENT for missing file', async () => {
    const io = createConfigIO(logger);
    await expect(io.readTOML(join(tempDir, 'nonexistent.toml'))).rejects.toThrow('ENOENT');
  });

  it('throws CONFIG_CORRUPTED for invalid TOML', async () => {
    const io = createConfigIO(logger);
    const badFile = join(tempDir, 'bad.toml');
    await writeFile(badFile, '[invalid\nbroken');
    await expect(io.readTOML(badFile)).rejects.toThrow('Failed to parse TOML');
  });
});

describe('ConfigIO atomic write safety', () => {
  it('no temp files left behind on success', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'clean.json');
    await io.writeJSON(file, { clean: true });
    const files = await io.listDir(tempDir);
    const temps = files.filter((f) => f.startsWith('.plughub-tmp-'));
    expect(temps).toEqual([]);
  });

  it('backup failure aborts write with AppError (cross-platform)', async () => {
    const io = createConfigIO(logger);
    const targetFile = join(tempDir, 'data.json');

    // Create the original file so backup is attempted
    await writeFile(targetFile, '{"v": 1}');

    // Point the backup to a non-existent directory path by using a file path
    // that includes a non-existent parent as the backup target.
    // We achieve this by making the target path such that <path>.backup
    // would require writing to a file whose name collides with an existing directory.
    // Simpler approach: create a DIRECTORY at <path>.backup so copyFile fails.
    const backupPath = targetFile + '.backup';
    await mkdir(backupPath);

    try {
      await io.writeJSON(targetFile, { v: 2 });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.code).toBe('CONFIG_PERMISSION');
      expect(appErr.recoverable).toBe(false);
      expect(appErr.message).toContain('Backup failed');
    }

    // Original should be unchanged
    const content = await readFile(targetFile, 'utf-8');
    expect(JSON.parse(content)).toEqual({ v: 1 });
  });

  it('backup failure aborts write (POSIX permissions)', async () => {
    // Skip on Windows — chmod doesn't reliably block writes
    if (process.platform === 'win32') return;

    const io = createConfigIO(logger);
    const backupDir = join(tempDir, 'locked');
    await mkdir(backupDir);
    const targetFile = join(backupDir, 'data.json');

    // Create original file
    await writeFile(targetFile, '{"v": 1}');
    // Lock directory to prevent backup creation
    await chmod(backupDir, 0o444);

    try {
      await expect(io.writeJSON(targetFile, { v: 2 })).rejects.toThrow();
      // Original should be unchanged
      await chmod(backupDir, 0o755);
      const content = await readFile(targetFile, 'utf-8');
      expect(JSON.parse(content)).toEqual({ v: 1 });
    } finally {
      await chmod(backupDir, 0o755);
    }
  });
});

describe('ConfigIO.hasBackup', () => {
  it('returns true when backup file exists', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'has-backup.json');
    // Write original, then overwrite to create backup
    await writeFile(file, '{"v": 1}');
    await io.writeJSON(file, { v: 2 });
    expect(await io.hasBackup(file)).toBe(true);
  });

  it('returns false when no backup exists', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'no-backup.json');
    await writeFile(file, '{"v": 1}');
    expect(await io.hasBackup(file)).toBe(false);
  });

  it('returns false when backup path is a directory', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'dir-backup.json');
    await writeFile(file, '{"v": 1}');
    // Create a directory at the backup path
    await mkdir(file + '.backup');
    expect(await io.hasBackup(file)).toBe(false);
  });
});

describe('ConfigIO.restoreFromBackup', () => {
  it('restores file from backup (round-trip)', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'restore.json');

    // Write original
    await writeFile(file, '{"v": 1}');

    // Overwrite (creates backup of v1)
    await io.writeJSON(file, { v: 2 });

    // Verify current is v2
    const current = JSON.parse(await readFile(file, 'utf-8'));
    expect(current).toEqual({ v: 2 });

    // Restore from backup
    await io.restoreFromBackup(file);

    // Now the file should be v1 (restored from backup)
    const restored = JSON.parse(await readFile(file, 'utf-8'));
    expect(restored).toEqual({ v: 1 });
  });

  it('throws when no backup exists', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'no-backup-restore.json');
    await writeFile(file, '{"v": 1}');
    await expect(io.restoreFromBackup(file)).rejects.toThrow();
  });

  it('creates a backup of the current file before restoring', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'backup-chain.json');

    // v1 -> write v2 (backup = v1) -> restore (backup becomes v2, file becomes v1)
    await writeFile(file, '{"v": 1}');
    await io.writeJSON(file, { v: 2 });

    // Before restore: file=v2, backup=v1
    expect(JSON.parse(await readFile(file, 'utf-8'))).toEqual({ v: 2 });
    expect(JSON.parse(await readFile(file + '.backup', 'utf-8'))).toEqual({ v: 1 });

    // Restore
    await io.restoreFromBackup(file);

    // After restore: file=v1, backup=v2 (restoreFromBackup backed up v2 before writing v1)
    expect(JSON.parse(await readFile(file, 'utf-8'))).toEqual({ v: 1 });
    expect(JSON.parse(await readFile(file + '.backup', 'utf-8'))).toEqual({ v: 2 });
  });
});

describe('ConfigIO AppError codes', () => {
  it('throws CONFIG_CORRUPTED for malformed JSON', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'corrupt.json');
    await writeFile(file, '{ not valid json!!!');
    try {
      await io.readJSON(file);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_CORRUPTED');
      expect((err as AppError).recoverable).toBe(true);
    }
  });

  it('throws CONFIG_CORRUPTED for malformed YAML frontmatter', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'corrupt.md');
    await writeFile(file, '---\n: : invalid:\n---\nBody');
    try {
      await io.readYAMLFrontmatter(file);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_CORRUPTED');
      expect((err as AppError).recoverable).toBe(true);
    }
  });

  it('throws FILE_TOO_LARGE for oversized files', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'oversized.json');
    const bigContent = 'x'.repeat(10 * 1024 * 1024 + 1);
    await writeFile(file, bigContent);
    try {
      await io.readJSON(file);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('FILE_TOO_LARGE');
      expect((err as AppError).recoverable).toBe(false);
    }
  });

  it('throws CONFIG_PERMISSION for backup failure', async () => {
    const io = createConfigIO(logger);
    const file = join(tempDir, 'perm-test.json');
    await writeFile(file, '{"v": 1}');
    // Create directory at backup path so copyFile fails
    await mkdir(file + '.backup');
    try {
      await io.writeJSON(file, { v: 2 });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_PERMISSION');
      expect((err as AppError).recoverable).toBe(false);
    }
  });
});

describe('ConfigIO.listDir — substring pattern', () => {
  it('filters by substring when pattern does not start with *', async () => {
    const io = createConfigIO(logger);
    await writeFile(join(tempDir, 'config.json'), '{}');
    await writeFile(join(tempDir, 'settings.json'), '{}');
    await writeFile(join(tempDir, 'readme.md'), '');
    const files = await io.listDir(tempDir, 'config');
    expect(files).toEqual(['config.json']);
  });
});

describe('mapFsError — unit tests for error code mapping', () => {
  it('maps EACCES to CONFIG_PERMISSION (recoverable: false)', () => {
    const err = new Error('Permission denied') as NodeJS.ErrnoException;
    err.code = 'EACCES';
    const result = mapFsError(err, '/test/path');
    expect(result).toBeInstanceOf(AppError);
    expect(result.code).toBe('CONFIG_PERMISSION');
    expect(result.recoverable).toBe(false);
    expect(result.message).toContain('Permission denied');
    expect(result.message).toContain('/test/path');
  });

  it('maps EPERM to CONFIG_PERMISSION (recoverable: false)', () => {
    const err = new Error('Operation not permitted') as NodeJS.ErrnoException;
    err.code = 'EPERM';
    const result = mapFsError(err, '/test/path');
    expect(result).toBeInstanceOf(AppError);
    expect(result.code).toBe('CONFIG_PERMISSION');
    expect(result.recoverable).toBe(false);
  });

  it('maps EBUSY to CONFIG_LOCKED (recoverable: true)', () => {
    const err = new Error('Resource busy') as NodeJS.ErrnoException;
    err.code = 'EBUSY';
    const result = mapFsError(err, '/test/path');
    expect(result).toBeInstanceOf(AppError);
    expect(result.code).toBe('CONFIG_LOCKED');
    expect(result.recoverable).toBe(true);
    expect(result.message).toContain('locked by another process');
  });

  it('re-throws unmapped error codes', () => {
    const err = new Error('No space left') as NodeJS.ErrnoException;
    err.code = 'ENOSPC';
    expect(() => mapFsError(err, '/test/path')).toThrow(err);
  });
});

describe('ConfigIO.readRaw — permission errors via filesystem', () => {
  it('throws CONFIG_PERMISSION on EACCES when reading a file (POSIX only)', async () => {
    if (process.platform === 'win32') return;

    const io = createConfigIO(logger);
    const file = join(tempDir, 'no-read.json');
    await writeFile(file, '{"v": 1}');
    await chmod(file, 0o000);

    try {
      await io.readJSON(file);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONFIG_PERMISSION');
      expect((err as AppError).recoverable).toBe(false);
    } finally {
      await chmod(file, 0o644);
    }
  });
});
