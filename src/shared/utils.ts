/**
 * Shared utility functions used across main, renderer, and preload.
 */

import type { ComponentId, PortableComponent } from './types';

/** Deep equality check for plain objects, arrays, and primitives */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (typeof a === 'object') {
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    // Filter out undefined values — JSON.stringify drops them, so
    // {description: undefined, content: "x"} should equal {content: "x"}
    const keysA = Object.keys(objA).filter((k) => objA[k] !== undefined);
    const keysB = Object.keys(objB).filter((k) => objB[k] !== undefined);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(
      (key) => Object.prototype.hasOwnProperty.call(objB, key) && deepEqual(objA[key], objB[key]),
    );
  }

  return false;
}

/** Compare two ComponentIds for equality */
export function componentIdEquals(a: ComponentId, b: ComponentId): boolean {
  return (
    a.tool === b.tool &&
    a.type === b.type &&
    a.name === b.name &&
    a.scope === b.scope &&
    a.projectPath === b.projectPath
  );
}

/** Serialize a ComponentId to a stable string key (for Maps/Sets) */
export function componentIdKey(id: ComponentId): string {
  const base = `${id.tool}:${id.type}:${id.name}:${id.scope}`;
  return id.projectPath ? `${base}:${id.projectPath}` : base;
}

/**
 * Compute a deterministic SHA-256 content hash for a PortableComponent.
 * Used for update detection when version fields are absent (USR-06).
 * Sorts keys and strips undefined values for stability.
 *
 * Note: This function is only called in the main process (Node.js).
 * The renderer never needs to compute content hashes.
 */
/** Recursively sort object keys and strip undefined values for deterministic serialization */
function deepSortKeys(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(deepSortKeys);
  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) {
        sorted[key] = deepSortKeys(v);
      }
    }
    return sorted;
  }
  return value;
}

export function componentContentHash(component: PortableComponent): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('node:crypto') as typeof import('node:crypto');
  const normalized = deepSortKeys(component);
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

/**
 * Check if an env var key name indicates a sensitive value.
 * Used by both export-builder (to strip secrets) and ExportWizard (to show count).
 */
export function isSensitiveEnvKey(key: string): boolean {
  return /api.?key|secret|token|password|credential|passphrase|private.?key|auth|bearer/i.test(key);
}

/**
 * Check if a value looks like a known secret prefix.
 * Defense-in-depth: catches secrets even when the key name is generic.
 */
export function isSensitiveEnvValue(value: string): boolean {
  return /^(sk-|ghp_|ghs_|github_pat_|xoxb-|xoxp-|AIza|AKIA|eyJ|whsec_|sk_live_|pk_live_|rk_live_)/i.test(
    value,
  );
}
