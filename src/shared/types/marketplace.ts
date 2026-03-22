/**
 * Marketplace types for the Browse tab.
 * Source: 5A-specs/browse-tab-spec.md §2, §8
 */

import type { ToolId } from './tools';
import type { ComponentType } from './components';
import type { PortableComponent, PluginOrigin } from './bundles';

// ─── Marketplace Source Config ──────────────────────────────────────

export type MarketplaceSourceType = 'git-marketplace' | 'url-index';

export type MarketplaceSourceConfig = {
  sourceId: string;
  sourceType: MarketplaceSourceType;
  url: string;
  displayName: string;
  isBuiltIn: boolean;
  lastFetched?: string; // ISO 8601
};

export type NewSourceConfig = {
  sourceType: MarketplaceSourceType;
  url: string;
  displayName?: string;
};

// ─── Browse Result Types ────────────────────────────────────────────

export type MarketplaceEntry = {
  // Identity
  name: string;
  sourceId: string;
  ref: string; // source-specific reference for fetching detail

  // Display
  displayName?: string;
  description: string;
  author?: string | { name?: string; email?: string; url?: string };
  version?: string;
  lastUpdated?: string; // ISO 8601

  // Filtering
  tools: ToolId[];
  componentCounts?: Partial<Record<ComponentType, number>>;
  keywords?: string[];

  // Curation (USR-09)
  starCount?: number;
  category?: string;
  githubRepo?: string; // "owner/repo" for GitHub-sourced plugins
};

export type MarketplaceDetail = {
  entry: MarketplaceEntry;

  // Extended info
  longDescription?: string;
  homepage?: string;
  repository?: string;
  license?: string;

  // Components
  components: PortableComponent[];

  // Install info
  installSource: PluginOrigin;
};

export type MarketplaceRef = {
  sourceId: string;
  ref: string;
};

// ─── Install Target (reuse from tools.ts but add scope) ────────────

export type BrowseInstallTarget = {
  instanceId: string;
  scope: string;
};

// ─── Marketplace Manifest Formats ───────────────────────────────────

/** Git marketplace manifest (.claude-plugin/marketplace.json) */
export type GitMarketplaceManifest = {
  name: string;
  owner?: { name: string; url?: string };
  metadata?: { pluginRoot?: string };
  plugins: GitMarketplacePlugin[];
};

export type GitMarketplacePlugin = {
  name: string;
  source: string | { source: string; repo: string };
  description?: string;
  keywords?: string[];
  version?: string;
  author?: string | { name?: string; email?: string; url?: string };
  category?: string;
};

/** URL index format */
export type UrlIndexManifest = {
  name: string;
  version?: string;
  plugins: UrlIndexPlugin[];
};

export type UrlIndexPlugin = {
  name: string;
  description: string;
  url: string;
  version?: string;
  components?: Partial<Record<ComponentType, number>>;
  tools?: ToolId[];
  author?: string | { name?: string; email?: string; url?: string };
  keywords?: string[];
  lastUpdated?: string;
  category?: string;
};
