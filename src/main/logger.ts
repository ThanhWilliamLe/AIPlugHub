/**
 * Logger — structured logging to file.
 * Implementation: electron-log with console fallback for tests.
 * Source: 4B-architecture/system-design.md §1.8
 */

export interface Logger {
  info(module: string, message: string, data?: unknown): void;
  warn(module: string, message: string, data?: unknown): void;
  error(module: string, message: string, error?: Error, data?: unknown): void;
}

/**
 * Resolve electron-log at module load time.
 * Returns null when electron-log is unavailable (e.g., mocked in tests).
 */
function resolveElectronLog(): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const imported = require('electron-log');
    return imported?.default ?? imported;
  } catch {
    return null;
  }
}

/** @internal Exposed for testing — allows tests to override the backend. */
export let _electronLog: unknown = resolveElectronLog();

/** @internal Reset the backend (used by tests to force console fallback). */
export function _setElectronLog(backend: unknown): void {
  _electronLog = backend;
}

function format(module: string, message: string): string {
  return `[${module}] ${message}`;
}

/**
 * Create a Logger backed by electron-log (production) or console (tests).
 * electron-log writes to <appData>/aiplughub/logs/, rotated by date.
 */
export function createLogger(): Logger {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log: any = _electronLog;

  if (log) {
    return {
      info(module, message, data) {
        log.info(format(module, message), data !== undefined ? data : '');
      },
      warn(module, message, data) {
        log.warn(format(module, message), data !== undefined ? data : '');
      },
      error(module, message, error, data) {
        log.error(format(module, message), error ?? '', data !== undefined ? data : '');
      },
    };
  }

  // Console fallback for test environments
  return {
    info(module, message, data) {
      if (data !== undefined) console.log(format(module, message), data);
      else console.log(format(module, message));
    },
    warn(module, message, data) {
      if (data !== undefined) console.warn(format(module, message), data);
      else console.warn(format(module, message));
    },
    error(module, message, error, data) {
      if (error && data !== undefined) console.error(format(module, message), error, data);
      else if (error) console.error(format(module, message), error);
      else if (data !== undefined) console.error(format(module, message), data);
      else console.error(format(module, message));
    },
  };
}
