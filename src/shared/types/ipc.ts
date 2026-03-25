/**
 * IPC bridge types — error handling, search, import results.
 * Source: 4B-architecture/system-design.md §1.1, §2
 */

import type { ToolId } from './tools';
import type { Component, ComponentType } from './components';
import type { PortableComponent } from './bundles';

// ─── IPC Error Handling ──────────────────────────────────────────────

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };

export type IpcError = {
  code: string;
  message: string;
  details?: unknown;
  recoverable: boolean;
};

// ─── Operation Types ─────────────────────────────────────────────────

export type ExportOptions = {
  name?: string;
  description?: string;
  target?: import('./bundles').BundleTarget;
};

export type SearchFilters = {
  tools?: ToolId[];
  types?: ComponentType[];
};

export type ImportResult = {
  installed: Component[];
  skipped: { component: PortableComponent; reason: string }[];
  failed: { component: PortableComponent; error: IpcError }[];
};

// ─── Conflict Detection ──────────────────────────────────────────────

export type ConflictType = 'identical' | 'version' | 'content' | 'scope-mismatch';

export type ConflictEntry = {
  incoming: PortableComponent;
  existing: Component;
  conflictType: ConflictType;
};

export type ConflictManifest = {
  newComponents: PortableComponent[];
  conflicts: ConflictEntry[];
  incompatible: { component: PortableComponent; reason: string }[];
};

export type ConflictResolution = {
  componentKey: { type: ComponentType; name: string };
  action: 'install' | 'skip';
  targetScope?: string;
};

// ─── User Preferences ────────────────────────────────────────────────

/** A registered project folder for project-scope scanning (USR-03) */
export type ProjectFolder = {
  /** Absolute path to the project root directory */
  path: string;
  /** Display name (last path segment, cached for UI) */
  name: string;
  /** When this folder was added (ISO 8601) */
  addedAt: string;
  /** Whether the folder currently exists on disk (enriched by projects:list) */
  exists?: boolean;
};

export type UserPreferences = {
  rescanOnLaunch: boolean;
  setupComplete: boolean;
  // githubToken is stored in SecretStore, not here — never persist tokens in plaintext
  marketplaceSources?: import('./marketplace').MarketplaceSourceConfig[];
  /** Auto-check for plugin updates on launch (USR-06, default: false) */
  autoCheckUpdates?: boolean;
  /** ISO 8601 timestamp of last update check (USR-06) */
  lastUpdateCheck?: string;
  /** Registered project folders for project-scope scanning (USR-03) */
  projectFolders?: ProjectFolder[];
  /** Last-selected install target in Browse tab (reuses BrowseInstallTarget shape) */
  browseInstallTarget?: import('./marketplace').BrowseInstallTarget;
  /** Whether the user has dismissed the Getting Started section (UX-09) */
  gettingStartedDismissed?: boolean;
  /** Whether the user has opened the Getting Started guide at least once (stops bounce animation) */
  guideViewed?: boolean;
};
