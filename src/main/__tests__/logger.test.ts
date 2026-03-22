import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, _setElectronLog } from '../logger';

beforeEach(() => {
  // Force console fallback by clearing the electron-log backend
  _setElectronLog(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Logger (console fallback)', () => {
  // LOG-01: info formats [Module] message
  it('LOG-01: info formats [Module] message', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger();
    logger.info('PluginLoader', 'loaded 3 plugins');
    expect(spy).toHaveBeenCalledWith('[PluginLoader] loaded 3 plugins');
  });

  // LOG-02: info with data includes data in output
  it('LOG-02: info with data includes data in output', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger();
    const data = { count: 3, names: ['a', 'b', 'c'] };
    logger.info('PluginLoader', 'loaded plugins', data);
    expect(spy).toHaveBeenCalledWith('[PluginLoader] loaded plugins', data);
  });

  // LOG-03: info without data does not append undefined
  it('LOG-03: info without data does not append undefined', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger();
    logger.info('ConfigIO', 'file read');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('[ConfigIO] file read');
    // Verify only one argument was passed (no trailing undefined)
    expect(spy.mock.calls[0]).toHaveLength(1);
  });

  // LOG-04: warn formats correctly with data
  it('LOG-04: warn formats correctly with data', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = createLogger();
    const data = { path: '/tmp/config.json' };
    logger.warn('ConfigIO', 'file not found, using defaults', data);
    expect(spy).toHaveBeenCalledWith(
      '[ConfigIO] file not found, using defaults',
      data,
    );
  });

  // LOG-05: warn without data does not append undefined
  it('LOG-05: warn without data does not append undefined', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = createLogger();
    logger.warn('ConfigIO', 'deprecation notice');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('[ConfigIO] deprecation notice');
    expect(spy.mock.calls[0]).toHaveLength(1);
  });

  // LOG-06: error with Error object and data includes both
  it('LOG-06: error with Error object and data includes both', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createLogger();
    const err = new Error('disk full');
    const data = { path: '/tmp/out.json' };
    logger.error('ConfigIO', 'write failed', err, data);
    expect(spy).toHaveBeenCalledWith('[ConfigIO] write failed', err, data);
  });

  // LOG-07: error without Error but with data includes data (the fix!)
  it('LOG-07: error without Error but with data includes data', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createLogger();
    const data = { attempted: 'install', plugin: 'mcp-search' };
    logger.error('PluginManager', 'operation failed', undefined, data);
    expect(spy).toHaveBeenCalledWith('[PluginManager] operation failed', data);
    // Should have exactly 2 args: formatted message + data
    expect(spy.mock.calls[0]).toHaveLength(2);
  });

  // LOG-08: error without Error and without data works
  it('LOG-08: error without Error and without data works', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createLogger();
    logger.error('Main', 'unexpected shutdown');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('[Main] unexpected shutdown');
    expect(spy.mock.calls[0]).toHaveLength(1);
  });

  // LOG-09: createLogger returns a Logger with all 3 methods
  it('LOG-09: createLogger returns a Logger with all 3 methods', () => {
    const logger = createLogger();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });
});

describe('Logger (electron-log backend)', () => {
  function createMockBackend() {
    return {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  }

  it('info delegates to electron-log with formatted message', () => {
    const mock = createMockBackend();
    _setElectronLog(mock);
    const logger = createLogger();
    logger.info('Loader', 'ready');
    expect(mock.info).toHaveBeenCalledWith('[Loader] ready', '');
  });

  it('info passes data to electron-log', () => {
    const mock = createMockBackend();
    _setElectronLog(mock);
    const logger = createLogger();
    logger.info('Loader', 'ready', { count: 5 });
    expect(mock.info).toHaveBeenCalledWith('[Loader] ready', { count: 5 });
  });

  it('warn delegates to electron-log with formatted message', () => {
    const mock = createMockBackend();
    _setElectronLog(mock);
    const logger = createLogger();
    logger.warn('Config', 'deprecated');
    expect(mock.warn).toHaveBeenCalledWith('[Config] deprecated', '');
  });

  it('warn passes data to electron-log', () => {
    const mock = createMockBackend();
    _setElectronLog(mock);
    const logger = createLogger();
    logger.warn('Config', 'deprecated', { key: 'old' });
    expect(mock.warn).toHaveBeenCalledWith('[Config] deprecated', { key: 'old' });
  });

  it('error delegates to electron-log with error and data', () => {
    const mock = createMockBackend();
    _setElectronLog(mock);
    const logger = createLogger();
    const err = new Error('fail');
    logger.error('IO', 'crash', err, { path: '/x' });
    expect(mock.error).toHaveBeenCalledWith('[IO] crash', err, { path: '/x' });
  });

  it('error with no error and no data passes empty strings', () => {
    const mock = createMockBackend();
    _setElectronLog(mock);
    const logger = createLogger();
    logger.error('IO', 'crash');
    expect(mock.error).toHaveBeenCalledWith('[IO] crash', '', '');
  });
});
