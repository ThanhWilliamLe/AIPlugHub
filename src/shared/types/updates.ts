/**
 * Update mechanism types — USR-06.
 * Source: 5A-specs/update-mechanism-spec.md §1c
 */

import type { ComponentType } from './components';

/** Change type for a single component within a plugin update */
export type ComponentChangeType = 'added' | 'modified' | 'removed' | 'unchanged';

/** Describes what changed in a single component */
export type ComponentChange = {
  name: string;
  type: ComponentType;
  changeType: ComponentChangeType;
  /** Field-level diffs for modified components */
  fieldDiffs?: FieldDiff[];
  /** True if the change is content-only (hash differs but no field-level diff available) */
  hashOnly?: boolean;
};

/** A single field-level diff */
export type FieldDiff = {
  field: string;
  oldValue?: string;
  newValue?: string;
};

/** An available update for a single plugin */
export type PluginUpdate = {
  pluginKey: string;
  pluginName: string;
  marketplace: string;
  sourceId: string;
  ref: string;
  currentVersion?: string;
  availableVersion?: string;
  changes: ComponentChange[];
  addedCount: number;
  modifiedCount: number;
  removedCount: number;
  unchangedCount: number;
};

/** Result of checking for updates */
export type UpdateCheckResult = {
  checkedAt: string;
  updates: PluginUpdate[];
  errors: UpdateCheckError[];
};

/** Error checking a specific source */
export type UpdateCheckError = {
  sourceId: string;
  message: string;
};

/** Status of an in-progress update */
export type UpdateStatus =
  | { state: 'pending' }
  | { state: 'updating'; currentComponent?: string }
  | { state: 'success'; newVersion?: string }
  | { state: 'failed'; error: string };
