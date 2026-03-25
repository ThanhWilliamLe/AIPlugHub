/**
 * Remote fetcher for suggested sources manifest (DATA-01).
 * Fetches from GitHub, caches for 24h, falls back to hardcoded data.
 * Source: 5A-specs/getting-started-spec.md §DATA-01
 */

import type { SuggestedSourcesManifest } from '@shared/types';
import { SUGGESTED_SOURCES_MANIFEST } from '@shared/constants';
import { net } from 'electron';
import type { Logger } from '../logger';

/** Remote manifest URL — raw.githubusercontent.com with 5min server cache */
const REMOTE_URL =
  'https://raw.githubusercontent.com/ThanhWilliamLe/AIPlugHub/main/data/suggested-sources.json';

/** 24h client-side cache TTL */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CachedManifest = {
  data: SuggestedSourcesManifest;
  fetchedAt: number;
};

let cached: CachedManifest | null = null;

/**
 * Fetch the suggested sources manifest.
 * Returns remote data if available, otherwise the hardcoded fallback.
 * Caches for 24h — subsequent calls within the TTL return the cache.
 */
export async function fetchSuggestedSources(
  logger: Logger,
): Promise<SuggestedSourcesManifest> {
  // Return cache if fresh
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const json = await fetchJson(REMOTE_URL);
    const manifest = parseAndValidate(json);

    // Only accept if version >= hardcoded version (prevent downgrade)
    if (manifest.version >= SUGGESTED_SOURCES_MANIFEST.version) {
      cached = { data: manifest, fetchedAt: Date.now() };
      logger.info('SuggestedSources', `Fetched remote manifest v${manifest.version} (${manifest.sources.length} sources, ${manifest.featured.length} featured)`);
      return manifest;
    }

    logger.warn('SuggestedSources', `Remote version ${manifest.version} < hardcoded ${SUGGESTED_SOURCES_MANIFEST.version}, using hardcoded`);
  } catch (err) {
    logger.warn(
      'SuggestedSources',
      `Remote fetch failed, using hardcoded fallback: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Fallback to hardcoded
  cached = { data: SUGGESTED_SOURCES_MANIFEST, fetchedAt: Date.now() };
  return SUGGESTED_SOURCES_MANIFEST;
}

/** Invalidate the cache (e.g., for testing or manual refresh) */
export function invalidateSuggestedSourcesCache(): void {
  cached = null;
}

// ─── Internal ──────────────────────────────────────────────────────

function fetchJson(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    let body = '';

    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      response.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      response.on('end', () => resolve(body));
      response.on('error', reject);
    });

    request.on('error', reject);

    // 10s timeout
    setTimeout(() => {
      request.abort();
      reject(new Error('Request timed out'));
    }, 10_000);

    request.end();
  });
}

function parseAndValidate(json: string): SuggestedSourcesManifest {
  const data = JSON.parse(json);

  if (typeof data.version !== 'number') throw new Error('Missing version');
  if (!Array.isArray(data.sources)) throw new Error('Missing sources array');
  if (!Array.isArray(data.featured)) throw new Error('Missing featured array');

  // Basic field validation on sources
  for (const s of data.sources) {
    if (!s.sourceId || !s.url || !s.displayName) {
      throw new Error(`Invalid source: ${JSON.stringify(s)}`);
    }
  }

  return data as SuggestedSourcesManifest;
}
