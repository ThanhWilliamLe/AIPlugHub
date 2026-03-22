import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StarEnricher } from '../star-enricher';
import type { MarketplaceEntry } from '@shared/types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockCache = {
  getStarCache: vi.fn(),
  setStarCache: vi.fn(),
  invalidateStarCache: vi.fn(),
};

function makeEntry(name: string, githubRepo?: string, sourceId = 'test-source'): MarketplaceEntry {
  return {
    name,
    sourceId,
    ref: name,
    description: `${name} desc`,
    tools: ['claude-code'],
    githubRepo,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCache.getStarCache.mockResolvedValue(null);
});

describe('StarEnricher', () => {
  it('enriches entries with star counts from GitHub API', async () => {
    const enricher = new StarEnricher(mockCache as any, 'test-token');
    const entries = [makeEntry('plugin-a', 'owner/plugin-a')];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ stargazers_count: 42 }),
    });

    const result = await enricher.enrich(entries);
    expect(result[0].starCount).toBe(42);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/plugin-a',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
  });

  it('skips entries without githubRepo', async () => {
    const enricher = new StarEnricher(mockCache as any, 'test-token');
    const entries = [makeEntry('no-repo')];

    const result = await enricher.enrich(entries);
    expect(result[0].starCount).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses cached star counts when available', async () => {
    mockCache.getStarCache.mockResolvedValueOnce({
      fetchedAt: new Date().toISOString(),
      stars: { 'plugin-a': 100 },
    });
    const enricher = new StarEnricher(mockCache as any, null);
    const entries = [makeEntry('plugin-a', 'owner/plugin-a')];

    const result = await enricher.enrich(entries);
    expect(result[0].starCount).toBe(100);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles API failure gracefully', async () => {
    const enricher = new StarEnricher(mockCache as any, 'test-token');
    const entries = [makeEntry('plugin-a', 'owner/plugin-a')];
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await enricher.enrich(entries);
    expect(result[0].starCount).toBeUndefined();
  });

  it('stops on 403 rate limit', async () => {
    const enricher = new StarEnricher(mockCache as any, null);
    const entries = [makeEntry('a', 'owner/a'), makeEntry('b', 'owner/b')];
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ stargazers_count: 10 }) })
      .mockResolvedValueOnce({ ok: false, status: 403 });

    const result = await enricher.enrich(entries);
    expect(result[0].starCount).toBe(10);
    expect(result[1].starCount).toBeUndefined();
  });

  it('works without token', async () => {
    const enricher = new StarEnricher(mockCache as any, null);
    const entries = [makeEntry('plugin-a', 'owner/plugin-a')];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ stargazers_count: 5 }),
    });

    const result = await enricher.enrich(entries);
    expect(result[0].starCount).toBe(5);
    // Verify no Authorization header
    const callHeaders = mockFetch.mock.calls[0][1].headers;
    expect(callHeaders).not.toHaveProperty('Authorization');
  });

  it('groups cache reads by sourceId', async () => {
    const enricher = new StarEnricher(mockCache as any, 'token');
    const entries = [
      makeEntry('x', 'owner/x', 'src-a'),
      makeEntry('y', 'owner/y', 'src-b'),
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ stargazers_count: 7 }),
    });

    await enricher.enrich(entries);
    expect(mockCache.getStarCache).toHaveBeenCalledWith('src-a');
    expect(mockCache.getStarCache).toHaveBeenCalledWith('src-b');
  });
});
