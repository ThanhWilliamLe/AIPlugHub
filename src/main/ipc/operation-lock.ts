/**
 * Operation serialization — prevents concurrent writes to the same config file.
 * Keyed by instanceId: one concurrent write per adapter at a time.
 * Source: 6C-build-plan/m4-session-brief.md §6
 */

const locks = new Map<string, Promise<unknown>>();

/**
 * Serialize async operations per adapter instance.
 * Each call queues behind the previous one for the same key,
 * ensuring writes to a single adapter's config files never overlap.
 *
 * Uses prev.then(run, run) so the next operation runs even if
 * the previous one rejected — no deadlock on error.
 */
export async function withAdapterLock<T>(instanceId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(instanceId) ?? Promise.resolve();

  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const result = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  // Shared executor — runs fn() regardless of whether prev resolved or rejected
  async function run(): Promise<void> {
    try {
      resolve(await fn());
    } catch (err) {
      reject(err);
    }
  }

  const next = prev.then(run, run);
  locks.set(instanceId, next);

  // Clean up the Map entry after the chain settles to prevent memory leak.
  // Only clean if this is still the latest entry (no newer operation queued).
  function cleanup(): void {
    if (locks.get(instanceId) === next) locks.delete(instanceId);
  }
  next.then(cleanup, cleanup);

  return result;
}

/** @internal — exposed for testing only */
export function _resetLocks(): void {
  locks.clear();
}
