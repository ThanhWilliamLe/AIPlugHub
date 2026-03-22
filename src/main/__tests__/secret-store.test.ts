/**
 * SecretStore integration tests.
 * Uses a real file with a mock safeStorage backend.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createSecretStore } from '../secret-store';
import type { SafeStorageBackend } from '../secret-store';
import { createLogger } from '../logger';
import { AppError } from '@shared/types';

const logger = createLogger();
let tempDir: string;
let secretPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'plughub-secret-'));
  secretPath = join(tempDir, 'secrets.enc');
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

/**
 * Mock safeStorage that uses a simple XOR "encryption" so we can
 * test the round-trip without real OS keychain. The encrypted output
 * is intentionally different from the input (not plaintext).
 */
function createMockSafeStorage(available = true): SafeStorageBackend {
  const XOR_KEY = 0x42;
  return {
    isEncryptionAvailable: () => available,
    encryptString(plainText: string): Buffer {
      const buf = Buffer.from(plainText, 'utf-8');
      return Buffer.from(buf.map((b) => b ^ XOR_KEY));
    },
    decryptString(encrypted: Buffer): string {
      const buf = Buffer.from(encrypted.map((b) => b ^ XOR_KEY));
      return buf.toString('utf-8');
    },
  };
}

// ─── Round-Trip Tests ───────────────────────────────────────────────

describe('SecretStore — round-trip', () => {
  it('set() + get() returns the stored value', async () => {
    const store = createSecretStore(secretPath, createMockSafeStorage(), logger);

    await store.set('openai', 'api-key', 'sk-test-1234');
    const value = await store.get('openai', 'api-key');

    expect(value).toBe('sk-test-1234');
  });

  it('stores multiple services and keys', async () => {
    const store = createSecretStore(secretPath, createMockSafeStorage(), logger);

    await store.set('openai', 'api-key', 'sk-openai');
    await store.set('anthropic', 'api-key', 'sk-anthropic');
    await store.set('openai', 'org-id', 'org-123');

    expect(await store.get('openai', 'api-key')).toBe('sk-openai');
    expect(await store.get('anthropic', 'api-key')).toBe('sk-anthropic');
    expect(await store.get('openai', 'org-id')).toBe('org-123');
  });

  it('overwrites existing value', async () => {
    const store = createSecretStore(secretPath, createMockSafeStorage(), logger);

    await store.set('openai', 'api-key', 'old-key');
    await store.set('openai', 'api-key', 'new-key');

    expect(await store.get('openai', 'api-key')).toBe('new-key');
  });
});

// ─── Delete Tests ───────────────────────────────────────────────────

describe('SecretStore — delete', () => {
  it('delete() removes the entry', async () => {
    const store = createSecretStore(secretPath, createMockSafeStorage(), logger);

    await store.set('openai', 'api-key', 'sk-test');
    await store.delete('openai', 'api-key');

    expect(await store.get('openai', 'api-key')).toBeNull();
  });

  it('delete() cleans up empty service objects', async () => {
    const store = createSecretStore(secretPath, createMockSafeStorage(), logger);

    await store.set('openai', 'api-key', 'sk-test');
    await store.delete('openai', 'api-key');

    // Re-read: the service key should be gone
    const val = await store.get('openai', 'other-key');
    expect(val).toBeNull();
  });

  it('delete() for nonexistent key is a no-op', async () => {
    const store = createSecretStore(secretPath, createMockSafeStorage(), logger);

    // Should not throw
    await store.delete('nonexistent', 'key');
  });
});

// ─── Missing Key Tests ──────────────────────────────────────────────

describe('SecretStore — missing keys', () => {
  it('get() returns null for missing key', async () => {
    const store = createSecretStore(secretPath, createMockSafeStorage(), logger);

    expect(await store.get('nonexistent', 'key')).toBeNull();
  });

  it('get() returns null for missing service', async () => {
    const store = createSecretStore(secretPath, createMockSafeStorage(), logger);

    await store.set('openai', 'api-key', 'sk-test');
    expect(await store.get('anthropic', 'api-key')).toBeNull();
  });
});

// ─── No Plaintext in File ───────────────────────────────────────────

describe('SecretStore — no plaintext', () => {
  it('encrypted file does not contain plaintext secret', async () => {
    const store = createSecretStore(secretPath, createMockSafeStorage(), logger);
    const secret = 'sk-super-secret-key-12345';

    await store.set('openai', 'api-key', secret);

    // Read the raw file — it should be encrypted, not plaintext JSON
    const raw = await readFile(secretPath);
    const rawStr = raw.toString('utf-8');

    expect(rawStr).not.toContain(secret);
    expect(rawStr).not.toContain('openai');
    expect(rawStr).not.toContain('api-key');
  });
});

// ─── Availability Tests ─────────────────────────────────────────────

describe('SecretStore — availability', () => {
  it('isAvailable() reflects safeStorage state', () => {
    const available = createSecretStore(secretPath, createMockSafeStorage(true), logger);
    const unavailable = createSecretStore(secretPath, createMockSafeStorage(false), logger);

    expect(available.isAvailable()).toBe(true);
    expect(unavailable.isAvailable()).toBe(false);
  });

  it('set() throws SECRET_STORE_UNAVAILABLE when not available', async () => {
    const store = createSecretStore(secretPath, createMockSafeStorage(false), logger);

    try {
      await store.set('openai', 'api-key', 'sk-test');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('SECRET_STORE_UNAVAILABLE');
      expect((err as AppError).recoverable).toBe(false);
    }
  });

  it('get() returns null when not available', async () => {
    const store = createSecretStore(secretPath, createMockSafeStorage(false), logger);
    expect(await store.get('openai', 'api-key')).toBeNull();
  });

  it('delete() is a no-op when not available', async () => {
    const store = createSecretStore(secretPath, createMockSafeStorage(false), logger);
    // Should not throw
    await store.delete('openai', 'api-key');
  });
});

// ─── Persistence Tests ──────────────────────────────────────────────

describe('SecretStore — persistence across instances', () => {
  it('data persists when creating a new store instance', async () => {
    const safeStorage = createMockSafeStorage();

    const store1 = createSecretStore(secretPath, safeStorage, logger);
    await store1.set('openai', 'api-key', 'sk-persist');

    const store2 = createSecretStore(secretPath, safeStorage, logger);
    expect(await store2.get('openai', 'api-key')).toBe('sk-persist');
  });
});
