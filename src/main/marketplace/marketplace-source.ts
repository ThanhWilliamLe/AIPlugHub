/**
 * Marketplace source adapter interface.
 * Each source type (git-marketplace, url-index) implements this.
 * Source: 5A-specs/browse-tab-spec.md §1
 */

import type { MarketplaceEntry, MarketplaceDetail, MarketplaceSourceType } from '@shared/types';

export interface MarketplaceSource {
  readonly sourceId: string;
  readonly sourceType: MarketplaceSourceType;
  readonly displayName: string;
  readonly url: string;

  /** ETag from the last successful fetch (for conditional requests) */
  lastEtag?: string;

  /** Fetch all plugin entries from this source */
  fetch(options?: FetchOptions): Promise<MarketplaceEntry[]>;

  /** Fetch full detail for a specific plugin */
  getDetail(ref: string): Promise<MarketplaceDetail>;
}

export type FetchOptions = {
  etag?: string; // If-None-Match for conditional requests
  signal?: AbortSignal;
};

export type FetchResult<T> = {
  data: T;
  etag?: string;
  notModified?: boolean;
};

// ─── Field Limits (Spec §10) ─────────────────────────────────────────

/** Enforce field length limits on marketplace entries */
export function sanitizeEntryFields(entry: {
  name: string;
  description: string;
  author?: string;
}): void {
  if (entry.name.length > 100) entry.name = entry.name.slice(0, 100);
  if (entry.description.length > 500) entry.description = entry.description.slice(0, 500);
  if (entry.author && entry.author.length > 100) entry.author = entry.author.slice(0, 100);
}

// ─── Constants ────────────────────────────────────────────────────────

/** Maximum manifest payload size (5 MB) */
export const MAX_MANIFEST_SIZE = 5 * 1024 * 1024;

/** Maximum entries per manifest */
export const MAX_ENTRIES_PER_MANIFEST = 5000;

/** Per-source fetch timeout (30 seconds) */
export const SOURCE_FETCH_TIMEOUT_MS = 30_000;
