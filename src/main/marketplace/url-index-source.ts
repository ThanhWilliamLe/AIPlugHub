/**
 * URL Index source adapter.
 * Fetches a simple JSON plugin listing from any HTTPS URL.
 * Source: 5A-specs/browse-tab-spec.md §1 (URL Index source)
 */

import type {
  MarketplaceEntry,
  MarketplaceDetail,
  UrlIndexManifest,
  UrlIndexPlugin,
  PortableComponent,
} from '@shared/types';
import type { MarketplaceSource, FetchOptions } from './marketplace-source';
import {
  MAX_MANIFEST_SIZE,
  MAX_ENTRIES_PER_MANIFEST,
  SOURCE_FETCH_TIMEOUT_MS,
  sanitizeEntryFields,
} from './marketplace-source';
import { validatePortableComponent } from '../bundle/serializer';

export type UrlIndexOptions = {
  sourceId: string;
  displayName: string;
  url: string;
};

export class UrlIndexSource implements MarketplaceSource {
  readonly sourceId: string;
  readonly sourceType = 'url-index' as const;
  readonly displayName: string;
  readonly url: string;
  lastEtag?: string;

  constructor(options: UrlIndexOptions) {
    this.sourceId = options.sourceId;
    this.displayName = options.displayName;
    this.url = options.url;
  }

  async fetch(options?: FetchOptions): Promise<MarketplaceEntry[]> {
    const headers: Record<string, string> = {};
    if (options?.etag) headers['If-None-Match'] = options.etag;

    const response = await fetch(this.url, {
      headers,
      signal: options?.signal ?? AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
    });

    if (response.status === 304) return [];
    if (!response.ok) {
      throw new Error(`Failed to fetch URL index: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_MANIFEST_SIZE) {
      throw new Error(`URL index too large (>${MAX_MANIFEST_SIZE / 1024 / 1024}MB)`);
    }

    const text = await response.text();
    if (text.length > MAX_MANIFEST_SIZE) {
      throw new Error(`URL index too large (>${MAX_MANIFEST_SIZE / 1024 / 1024}MB)`);
    }

    const manifest = JSON.parse(text) as UrlIndexManifest;
    const plugins = manifest.plugins ?? [];

    if (plugins.length > MAX_ENTRIES_PER_MANIFEST) {
      throw new Error(`Too many entries in index (>${MAX_ENTRIES_PER_MANIFEST})`);
    }

    this.lastEtag = response.headers.get('etag') ?? undefined;

    return plugins.map((plugin) => this.toEntry(plugin));
  }

  async getDetail(ref: string): Promise<MarketplaceDetail> {
    // Re-fetch the index to find the plugin
    const response = await fetch(this.url, {
      signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch index for detail: ${response.status}`);
    }

    const manifest = JSON.parse(await response.text()) as UrlIndexManifest;
    const plugin = manifest.plugins.find((p) => p.name === ref);
    if (!plugin) throw new Error(`Plugin "${ref}" not found in index`);

    const entry = this.toEntry(plugin);
    const components = await this.fetchPluginDetail(plugin);

    // Only use HTTPS URLs per spec §10
    const safeUrl = plugin.url.startsWith('https://') ? plugin.url : undefined;

    return {
      entry,
      components,
      homepage: safeUrl,
      repository: safeUrl,
      installSource: { type: 'git', url: safeUrl ?? '' },
    };
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private toEntry(plugin: UrlIndexPlugin): MarketplaceEntry {
    const entry: MarketplaceEntry = {
      name: plugin.name,
      sourceId: this.sourceId,
      ref: plugin.name,
      description: plugin.description,
      author: plugin.author,
      version: plugin.version,
      keywords: plugin.keywords,
      lastUpdated: plugin.lastUpdated,
      tools: plugin.tools ?? ['claude-code'],
      componentCounts: plugin.components,
      category: plugin.category,
    };
    sanitizeEntryFields(entry);
    return entry;
  }

  /** Try to fetch additional detail from the plugin's URL */
  private async fetchPluginDetail(plugin: UrlIndexPlugin): Promise<PortableComponent[]> {
    try {
      // Try to fetch plugin.json from the repo
      const parsed = plugin.url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!parsed) return [];

      const pluginJsonUrl = `https://raw.githubusercontent.com/${parsed[1]}/${parsed[2]}/main/plugin.json`;
      const response = await fetch(pluginJsonUrl, {
        signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) return [];

      const data = (await response.json()) as { components?: unknown };
      if (Array.isArray(data.components)) {
        const validated: PortableComponent[] = [];
        for (const comp of data.components) {
          try {
            validatePortableComponent(comp as Record<string, unknown>);
            validated.push(comp as PortableComponent);
          } catch {
            // Skip invalid components from remote sources
            console.warn(`[UrlIndexSource] Skipping invalid component in ${plugin.name}`);
          }
        }
        return validated;
      }
      return [];
    } catch {
      return [];
    }
  }
}
