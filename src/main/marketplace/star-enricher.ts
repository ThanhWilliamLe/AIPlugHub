/**
 * Enriches MarketplaceEntry objects with GitHub star counts.
 * Fetches from GitHub API with concurrency control and per-source caching.
 */

import type { MarketplaceEntry } from '@shared/types';
import type { MarketplaceCache } from './cache';

const MAX_STAR_ENRICHMENT = 200;
const MAX_CONCURRENT = 5;
const FETCH_TIMEOUT_MS = 10_000;
export const STAR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class StarEnricher {
  private rateLimited = false;

  constructor(
    private cache: MarketplaceCache,
    private githubToken: string | null,
  ) {}

  async enrich(entries: MarketplaceEntry[]): Promise<MarketplaceEntry[]> {
    const bySource = new Map<string, MarketplaceEntry[]>();
    for (const entry of entries) {
      const list = bySource.get(entry.sourceId) ?? [];
      list.push(entry);
      bySource.set(entry.sourceId, list);
    }

    const enriched = entries.map((e) => ({ ...e }));
    this.rateLimited = false;

    for (const [sourceId, sourceEntries] of bySource) {
      const cached = await this.cache.getStarCache(sourceId);
      const isFresh =
        cached != null &&
        Date.now() - new Date(cached.fetchedAt).getTime() < STAR_CACHE_TTL_MS;

      // Apply cached stars
      if (cached) {
        for (const entry of sourceEntries) {
          if (entry.name in cached.stars) {
            const idx = entries.indexOf(entry);
            if (idx >= 0) enriched[idx].starCount = cached.stars[entry.name];
          }
        }
      }

      // Fetch fresh if stale
      if (!isFresh && !this.rateLimited) {
        const fetchable = sourceEntries
          .filter((e) => e.githubRepo)
          .slice(0, MAX_STAR_ENRICHMENT);

        if (fetchable.length > 0) {
          const freshStars = await this.fetchStarCounts(fetchable);
          const allStars: Record<string, number> = { ...(cached?.stars ?? {}) };
          for (const [name, count] of freshStars) {
            allStars[name] = count;
          }

          await this.cache.setStarCache(sourceId, {
            fetchedAt: new Date().toISOString(),
            stars: allStars,
          });

          for (const entry of sourceEntries) {
            if (entry.name in allStars) {
              const idx = entries.indexOf(entry);
              if (idx >= 0) enriched[idx].starCount = allStars[entry.name];
            }
          }
        }
      }
    }

    return enriched;
  }

  async invalidateStarCache(): Promise<void> {
    await this.cache.invalidateStarCache();
  }

  private async fetchStarCounts(
    entries: MarketplaceEntry[],
  ): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    const queue = entries.slice(0, MAX_STAR_ENRICHMENT);
    const executing: Promise<void>[] = [];

    for (const entry of queue) {
      if (this.rateLimited || !entry.githubRepo) continue;

      const p = this.fetchOne(entry).then((count) => {
        if (count !== undefined) results.set(entry.name, count);
        executing.splice(executing.indexOf(p), 1);
      });
      executing.push(p);

      if (executing.length >= MAX_CONCURRENT) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);

    return results;
  }

  private async fetchOne(entry: MarketplaceEntry): Promise<number | undefined> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'AiPlugHub',
    };
    if (this.githubToken) {
      headers['Authorization'] = `Bearer ${this.githubToken}`;
    }

    try {
      const response = await fetch(
        `https://api.github.com/repos/${entry.githubRepo}`,
        { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
      );

      if (response.status === 403) {
        this.rateLimited = true;
        return undefined;
      }
      if (!response.ok) return undefined;

      const data = await response.json();
      const count = data?.stargazers_count;
      return typeof count === 'number' && count >= 0 ? count : undefined;
    } catch {
      return undefined;
    }
  }
}
