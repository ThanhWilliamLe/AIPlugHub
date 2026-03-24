/**
 * Write Guard — runtime safety net for fixture-mode live testing.
 *
 * When activated via AIPLUGHUB_WRITE_GUARD env var, blocks any filesystem
 * write that targets a path outside the allowed directories (fixture dir + OS temp).
 * In production (env var not set), all functions are no-ops with zero overhead.
 *
 * Integration points call assertWriteAllowed(path) before writing.
 * See: config-io.ts, secret-store.ts, backup-manager.ts, cache.ts, handlers.ts
 */

import { resolve, normalize, sep } from 'path';
import { tmpdir } from 'os';

const isWindows = process.platform === 'win32';

/** Normalize a path for comparison (absolute, canonical separators, lowercase on Windows). */
function norm(p: string): string {
  const abs = normalize(resolve(p));
  return isWindows ? abs.toLowerCase() : abs;
}

// ─── Module state ──────────────────────────────────────────────────

let allowedPrefixes: string[] | null = null;

// ─── Public API ────────────────────────────────────────────────────

/**
 * Activate the write guard. All subsequent assertWriteAllowed() calls
 * will block writes outside the given fixture directory and OS temp.
 */
export function activateWriteGuard(fixtureDir: string): void {
  allowedPrefixes = [norm(fixtureDir), norm(tmpdir())];
}

/**
 * Assert that a write to `targetPath` is allowed.
 * - Guard inactive (production): no-op, returns immediately.
 * - Guard active (fixture mode): throws if path is outside allowed dirs.
 */
export function assertWriteAllowed(targetPath: string): void {
  if (!allowedPrefixes) return; // Guard not active — no-op

  const target = norm(targetPath);

  const allowed = allowedPrefixes.some(
    (prefix) => target === prefix || target.startsWith(prefix + sep),
  );

  if (!allowed) {
    throw new Error(
      `WRITE_GUARD: Blocked write outside fixture directory.\n` +
        `  Target:  ${normalize(resolve(targetPath))}\n` +
        `  Allowed: ${allowedPrefixes.join(', ')}`,
    );
  }
}

/** Check whether the write guard is currently active. */
export function isWriteGuardActive(): boolean {
  return allowedPrefixes !== null;
}

/**
 * Deactivate the write guard (for testing only).
 * @internal
 */
export function _deactivateWriteGuard(): void {
  allowedPrefixes = null;
}
