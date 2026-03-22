/**
 * File-based cache for marketplace data.
 * Uses SHA-256 hashed filenames to prevent path traversal.
 * Source: 5A-specs/browse-tab-spec.md §3, §10
 */

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';

export type CacheEntry<T> = {
  data: T;
  fetchedAt: string; // ISO 8601
  etag?: string;
};

export type CacheOptions = {
  basePath: string; // e.g., <appData>/aiplughub/cache
};

/** Hash a string to a safe filename using SHA-256 */
function hashFilename(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export class MarketplaceCache {
  private basePath: string;

  constructor(options: CacheOptions) {
    this.basePath = options.basePath;
  }

  /** Get cached manifest for a source. Returns null if missing or expired. */
  async getManifest<T>(sourceId: string, ttlMs: number): Promise<CacheEntry<T> | null> {
    return this.get<T>(this.manifestPath(sourceId), ttlMs);
  }

  /** Store a manifest cache entry */
  async setManifest<T>(sourceId: string, data: T, etag?: string): Promise<void> {
    await this.set(this.manifestPath(sourceId), data, etag);
  }

  /** Get cached plugin detail. Returns null if missing or expired. */
  async getDetail<T>(
    sourceId: string,
    pluginName: string,
    ttlMs: number,
  ): Promise<CacheEntry<T> | null> {
    return this.get<T>(this.detailPath(sourceId, pluginName), ttlMs);
  }

  /** Store a plugin detail cache entry */
  async setDetail<T>(sourceId: string, pluginName: string, data: T, etag?: string): Promise<void> {
    await this.set(this.detailPath(sourceId, pluginName), data, etag);
  }

  /** Get the cached ETag for a source manifest (for conditional requests) */
  async getManifestEtag(sourceId: string): Promise<string | undefined> {
    try {
      const raw = await fs.readFile(this.manifestPath(sourceId), 'utf-8');
      const entry = JSON.parse(raw) as CacheEntry<unknown>;
      return entry.etag;
    } catch {
      return undefined;
    }
  }

  /** Invalidate all manifest caches */
  async invalidateManifests(): Promise<void> {
    const dir = join(this.basePath, 'marketplace');
    try {
      const files = await fs.readdir(dir);
      await Promise.all(files.map((f) => fs.unlink(join(dir, f)).catch(() => {})));
    } catch {
      // Directory doesn't exist — nothing to invalidate
    }
  }

  /** Invalidate manifest cache for a specific source */
  async invalidateSource(sourceId: string): Promise<void> {
    try {
      await fs.unlink(this.manifestPath(sourceId));
    } catch {
      // File doesn't exist — nothing to invalidate
    }
  }

  /** Get cached star counts for a source */
  async getStarCache(
    sourceId: string,
  ): Promise<{ fetchedAt: string; stars: Record<string, number> } | null> {
    const filePath = join(this.basePath, 'stars', `${hashFilename(sourceId)}.json`);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** Store star counts for a source */
  async setStarCache(
    sourceId: string,
    entry: { fetchedAt: string; stars: Record<string, number> },
  ): Promise<void> {
    const dir = join(this.basePath, 'stars');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      join(dir, `${hashFilename(sourceId)}.json`),
      JSON.stringify(entry, null, 2),
      'utf-8',
    );
  }

  /** Invalidate all star caches */
  async invalidateStarCache(): Promise<void> {
    const dir = join(this.basePath, 'stars');
    try {
      const files = await fs.readdir(dir);
      await Promise.all(files.map((f) => fs.unlink(join(dir, f)).catch(() => {})));
    } catch {
      // Directory doesn't exist
    }
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private manifestPath(sourceId: string): string {
    return join(this.basePath, 'marketplace', `${hashFilename(sourceId)}.json`);
  }

  private detailPath(sourceId: string, pluginName: string): string {
    return join(
      this.basePath,
      'plugins',
      hashFilename(sourceId),
      `${hashFilename(pluginName)}.json`,
    );
  }

  private async get<T>(filePath: string, ttlMs: number): Promise<CacheEntry<T> | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const entry = JSON.parse(raw) as CacheEntry<T>;
      const age = Date.now() - new Date(entry.fetchedAt).getTime();
      if (age > ttlMs) return null;
      return entry;
    } catch {
      return null;
    }
  }

  private async set<T>(filePath: string, data: T, etag?: string): Promise<void> {
    await fs.mkdir(dirname(filePath), { recursive: true });

    const entry: CacheEntry<T> = {
      data,
      fetchedAt: new Date().toISOString(),
      etag,
    };
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
  }
}
