/**
 * Write Guard tests — verifies filesystem write protection for fixture-mode testing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  activateWriteGuard,
  assertWriteAllowed,
  isWriteGuardActive,
  _deactivateWriteGuard,
} from '../write-guard';

let fixtureDir: string;

beforeEach(async () => {
  _deactivateWriteGuard();
  fixtureDir = await mkdtemp(join(tmpdir(), 'plughub-guard-'));
});

afterEach(async () => {
  _deactivateWriteGuard();
  await rm(fixtureDir, { recursive: true, force: true });
});

describe('write-guard', () => {
  describe('inactive (production mode)', () => {
    it('is not active by default', () => {
      expect(isWriteGuardActive()).toBe(false);
    });

    it('assertWriteAllowed is a no-op when inactive', () => {
      expect(() => assertWriteAllowed('/some/random/path')).not.toThrow();
      expect(() => assertWriteAllowed('C:\\Users\\real\\.claude\\settings.json')).not.toThrow();
    });
  });

  describe('active (fixture mode)', () => {
    beforeEach(() => {
      activateWriteGuard(fixtureDir);
    });

    it('reports as active', () => {
      expect(isWriteGuardActive()).toBe(true);
    });

    it('allows writes inside the fixture directory', () => {
      expect(() => assertWriteAllowed(join(fixtureDir, 'file.json'))).not.toThrow();
      expect(() => assertWriteAllowed(join(fixtureDir, 'sub', 'deep', 'file.txt'))).not.toThrow();
    });

    it('allows writes to the fixture directory root itself', () => {
      expect(() => assertWriteAllowed(fixtureDir)).not.toThrow();
    });

    it('allows writes inside OS temp directory', () => {
      const tempPath = join(tmpdir(), 'some-other-temp-file.json');
      expect(() => assertWriteAllowed(tempPath)).not.toThrow();
    });

    it('blocks writes outside allowed directories', () => {
      expect(() => assertWriteAllowed('/home/user/.claude/settings.json')).toThrow(
        /WRITE_GUARD/,
      );
    });

    it('blocks writes to Windows-style paths outside allowed dirs', () => {
      expect(() =>
        assertWriteAllowed('C:\\Users\\user\\AppData\\Roaming\\Claude\\config.json'),
      ).toThrow(/WRITE_GUARD/);
    });

    it('error message includes the blocked path and allowed dirs', () => {
      const badPath = '/somewhere/else/file.txt';
      try {
        assertWriteAllowed(badPath);
        expect.fail('should have thrown');
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).toContain('WRITE_GUARD');
        expect(msg).toContain('Blocked write outside fixture directory');
        expect(msg).toContain('Target:');
        expect(msg).toContain('Allowed:');
      }
    });

    it('blocks path traversal attempts that escape allowed dirs', () => {
      // Construct a path that uses .. to escape to a known-outside location
      // (fixtureDir is inside tmpdir, so we need to escape tmpdir entirely)
      const outsidePath = join(tmpdir(), '..', 'write-guard-escape-test', 'settings.json');
      expect(() => assertWriteAllowed(outsidePath)).toThrow(/WRITE_GUARD/);
    });

    it('deactivation makes guard inactive again', () => {
      _deactivateWriteGuard();
      expect(isWriteGuardActive()).toBe(false);
      expect(() => assertWriteAllowed('/any/path')).not.toThrow();
    });
  });
});
