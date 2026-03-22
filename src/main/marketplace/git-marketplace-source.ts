/**
 * Git Marketplace source adapter.
 * Fetches .claude-plugin/marketplace.json from GitHub repos via raw content API.
 * Source: 5A-specs/browse-tab-spec.md §1 (Git Marketplace source)
 */

import type {
  MarketplaceEntry,
  MarketplaceDetail,
  GitMarketplaceManifest,
  GitMarketplacePlugin,
  PortableComponent,
} from '@shared/types';
import type { MarketplaceSource, FetchOptions } from './marketplace-source';
import {
  MAX_MANIFEST_SIZE,
  MAX_ENTRIES_PER_MANIFEST,
  SOURCE_FETCH_TIMEOUT_MS,
  sanitizeEntryFields,
} from './marketplace-source';

export type GitMarketplaceOptions = {
  sourceId: string;
  displayName: string;
  url: string; // e.g., "https://github.com/anthropics/claude-code-plugins"
  githubToken?: string;
};

/** Parse a GitHub repo URL into owner/repo */
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

/** Validate a GitHub owner/repo string (no path traversal) */
const SAFE_REPO_RE = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
function validateRepo(repo: string): boolean {
  return SAFE_REPO_RE.test(repo) && !repo.includes('..');
}

/** Validate a relative path segment (no traversal, no absolute) */
function isSafePath(segment: string): boolean {
  return !segment.includes('..') && !segment.startsWith('/') && !segment.startsWith('\\');
}

/** Build a GitHub raw content URL */
function rawUrl(owner: string, repo: string, path: string, branch = 'main'): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

export class GitMarketplaceSource implements MarketplaceSource {
  readonly sourceId: string;
  readonly sourceType = 'git-marketplace' as const;
  readonly displayName: string;
  readonly url: string;
  lastEtag?: string;

  private owner: string;
  private repo: string;
  private githubToken?: string;

  constructor(options: GitMarketplaceOptions) {
    this.sourceId = options.sourceId;
    this.displayName = options.displayName;
    this.url = options.url;
    this.githubToken = options.githubToken;

    const parsed = parseGitHubUrl(options.url);
    if (!parsed) throw new Error(`Invalid GitHub URL: ${options.url}`);
    this.owner = parsed.owner;
    this.repo = parsed.repo;
  }

  async fetch(options?: FetchOptions): Promise<MarketplaceEntry[]> {
    const manifestUrl = rawUrl(this.owner, this.repo, '.claude-plugin/marketplace.json');
    const headers: Record<string, string> = {};
    if (this.githubToken) headers['Authorization'] = `Bearer ${this.githubToken}`;
    if (options?.etag) headers['If-None-Match'] = options.etag;

    const response = await fetch(manifestUrl, {
      headers,
      signal: options?.signal ?? AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
    });

    if (response.status === 304) return []; // Not modified — caller uses cache
    if (!response.ok) {
      throw new Error(
        `Failed to fetch marketplace manifest: ${response.status} ${response.statusText}`,
      );
    }

    // Size check
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_MANIFEST_SIZE) {
      throw new Error(`Marketplace manifest too large (>${MAX_MANIFEST_SIZE / 1024 / 1024}MB)`);
    }

    const text = await response.text();
    if (text.length > MAX_MANIFEST_SIZE) {
      throw new Error(`Marketplace manifest too large (>${MAX_MANIFEST_SIZE / 1024 / 1024}MB)`);
    }

    const manifest = JSON.parse(text) as GitMarketplaceManifest;
    const plugins = manifest.plugins ?? [];

    if (plugins.length > MAX_ENTRIES_PER_MANIFEST) {
      throw new Error(`Too many entries in manifest (>${MAX_ENTRIES_PER_MANIFEST})`);
    }

    // Capture ETag for conditional requests
    this.lastEtag = response.headers.get('etag') ?? undefined;

    return plugins.map((plugin) => this.toEntry(plugin));
  }

  async getDetail(ref: string): Promise<MarketplaceDetail> {
    // ref is the plugin name — find its source path from the manifest
    const manifestUrl = rawUrl(this.owner, this.repo, '.claude-plugin/marketplace.json');
    const headers: Record<string, string> = {};
    if (this.githubToken) headers['Authorization'] = `Bearer ${this.githubToken}`;

    const response = await fetch(manifestUrl, {
      headers,
      signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch manifest for detail: ${response.status}`);
    }

    const manifest = JSON.parse(await response.text()) as GitMarketplaceManifest;
    const plugin = manifest.plugins.find((p) => p.name === ref);
    if (!plugin) throw new Error(`Plugin "${ref}" not found in marketplace`);

    const entry = this.toEntry(plugin);
    const components = await this.fetchPluginComponents(plugin, manifest.metadata?.pluginRoot);

    return {
      entry,
      components,
      repository: this.resolvePluginUrl(plugin),
      installSource: { type: 'marketplace', marketplace: this.sourceId, ref },
    };
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private toEntry(plugin: GitMarketplacePlugin): MarketplaceEntry {
    const entry: MarketplaceEntry = {
      name: plugin.name,
      sourceId: this.sourceId,
      ref: plugin.name,
      description: plugin.description ?? '',
      author: plugin.author,
      version: plugin.version,
      keywords: plugin.keywords,
      tools: ['claude-code'], // Git marketplace is Claude Code native
      category: plugin.category,
      githubRepo:
        typeof plugin.source === 'object' &&
        plugin.source.source === 'github' &&
        validateRepo(plugin.source.repo)
          ? plugin.source.repo
          : undefined,
    };
    sanitizeEntryFields(entry);
    return entry;
  }

  /** Attempt to fetch plugin.json for richer detail */
  private async fetchPluginComponents(
    plugin: GitMarketplacePlugin,
    pluginRoot?: string,
  ): Promise<PortableComponent[]> {
    try {
      const pluginJsonUrl = this.resolvePluginJsonUrl(plugin, pluginRoot);
      if (!pluginJsonUrl) return [];

      const headers: Record<string, string> = {};
      if (this.githubToken) headers['Authorization'] = `Bearer ${this.githubToken}`;

      const response = await fetch(pluginJsonUrl, {
        headers,
        signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) return [];

      const pluginJson = (await response.json()) as { components?: unknown };
      // plugin.json may contain a components array or individual fields
      if (Array.isArray(pluginJson.components)) {
        return pluginJson.components as PortableComponent[];
      }
      return [];
    } catch {
      return []; // Detail not available is not an error
    }
  }

  private resolvePluginJsonUrl(plugin: GitMarketplacePlugin, pluginRoot?: string): string | null {
    if (typeof plugin.source === 'string') {
      // Validate path segments to prevent traversal
      const root = pluginRoot ?? '.';
      if (!isSafePath(root) || !isSafePath(plugin.source)) return null;
      const path = `${root}/${plugin.source}/plugin.json`.replace(/^\.\//, '');
      return rawUrl(this.owner, this.repo, path);
    }
    if (typeof plugin.source === 'object' && plugin.source.source === 'github') {
      // Validate repo format to prevent SSRF
      if (!validateRepo(plugin.source.repo)) return null;
      const parsed = parseGitHubUrl(`https://github.com/${plugin.source.repo}`);
      if (!parsed) return null;
      return rawUrl(parsed.owner, parsed.repo, 'plugin.json');
    }
    return null;
  }

  private resolvePluginUrl(plugin: GitMarketplacePlugin): string | undefined {
    if (typeof plugin.source === 'object' && plugin.source.source === 'github') {
      if (!validateRepo(plugin.source.repo)) return undefined;
      return `https://github.com/${plugin.source.repo}`;
    }
    if (typeof plugin.source === 'string' && isSafePath(plugin.source)) {
      return `${this.url}/tree/main/${plugin.source}`;
    }
    return undefined;
  }
}
