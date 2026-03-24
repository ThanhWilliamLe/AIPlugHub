/**
 * SecretStore — OS keychain integration for sensitive configuration values.
 * Uses Electron's safeStorage to encrypt a JSON key-value file.
 * NEVER degrades to plaintext.
 * Source: 4B-architecture/system-design.md §1.5
 */

import { readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { dirname } from 'path';
import type { Logger } from './logger';
import { AppError } from '@shared/types';
import { assertWriteAllowed } from './write-guard';

export interface SecretStore {
  get(service: string, key: string): Promise<string | null>;
  set(service: string, key: string, value: string): Promise<void>;
  delete(service: string, key: string): Promise<void>;
  isAvailable(): boolean;
}

type SecretData = Record<string, Record<string, string>>;

/**
 * SafeStorage abstraction — allows injection in tests.
 * Production uses Electron's safeStorage module.
 */
export interface SafeStorageBackend {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export function createSecretStore(
  filePath: string,
  safeStorage: SafeStorageBackend,
  logger: Logger,
): SecretStore {
  const MODULE = 'SecretStore';
  let _decryptionFailed = false;

  function available(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  async function readSecrets(): Promise<SecretData> {
    try {
      const encrypted = await readFile(filePath);
      if (encrypted.length === 0) return {};
      const decrypted = safeStorage.decryptString(encrypted);
      return JSON.parse(decrypted) as SecretData;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      // Decryption or parse failure — flag it and backup the corrupted file
      logger.error(MODULE, 'Failed to decrypt/parse secrets file', err as Error);
      _decryptionFailed = true;
      try {
        await copyFile(filePath, `${filePath}.corrupt-${Date.now()}`);
        logger.info(MODULE, 'Backed up corrupted secrets file');
      } catch (backupErr) {
        logger.error(MODULE, 'Failed to backup corrupted secrets file', backupErr as Error);
      }
      return {};
    }
  }

  async function writeSecrets(data: SecretData): Promise<void> {
    assertWriteAllowed(filePath);

    if (_decryptionFailed && Object.keys(data).length === 0) {
      logger.warn(MODULE, 'Writing empty secrets after decryption failure — corrupted file was backed up');
    }

    const json = JSON.stringify(data);
    const encrypted = safeStorage.encryptString(json);

    // Ensure parent directory exists
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, encrypted);

    logger.info(MODULE, 'Secrets file updated', {
      serviceCount: Object.keys(data).length,
    });
  }

  return {
    async get(service, key) {
      if (!available()) return null;

      const data = await readSecrets();
      return data[service]?.[key] ?? null;
    },

    async set(service, key, value) {
      if (!available()) {
        throw new AppError(
          'SECRET_STORE_UNAVAILABLE',
          'Cannot store sensitive values — OS keychain not accessible',
          false,
        );
      }

      const data = await readSecrets();
      if (!data[service]) data[service] = {};
      data[service][key] = value;
      await writeSecrets(data);
    },

    async delete(service, key) {
      if (!available()) return;

      const data = await readSecrets();
      if (data[service]) {
        delete data[service][key];
        // Clean up empty service objects
        if (Object.keys(data[service]).length === 0) {
          delete data[service];
        }
        await writeSecrets(data);
      }
    },

    isAvailable() {
      return available();
    },
  };
}
