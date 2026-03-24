/**
 * Main process entry point — boot sequence.
 * Source: 4B-architecture/system-design.md §4, 6C-build-plan/m4-session-brief.md §5
 *
 * Boot order:
 * 1. Single-instance lock
 * 2. Load DataStore (migrate if needed)
 * 3. Create AdapterRegistry, register adapters
 * 4. Register IPC handlers
 * 5. Create BrowserWindow (hidden), apply CSP
 * 6. Auto-detect + scan (if first run or preference enabled)
 * 7. Show window
 */

import { app, BrowserWindow, dialog, ipcMain, session, shell, safeStorage } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import { createLogger } from './logger';
import { createConfigIO } from './config-io';
import { createDataStore } from './data-store';
import { createSecretStore } from './secret-store';
import { createAdapterRegistry } from './adapters/adapter-registry';
import { createClaudeCodeAdapter } from './adapters/claude-code-adapter';
import {
  createClaudeDesktopAdapter,
  resolveDefaultDesktopConfigDir,
} from './adapters/claude-desktop-adapter';
import {
  createGeminiCliAdapter,
  resolveDefaultGeminiConfigDir,
} from './adapters/gemini-cli-adapter';
import {
  createAntigravityAdapter,
  resolveDefaultAntigravityConfigDir,
} from './adapters/antigravity-adapter';
import { registerIpcHandlers } from './ipc';
import { MarketplaceClient } from './marketplace/marketplace-client';
import { BackupManager } from './backup';
import { activateWriteGuard } from './write-guard';
import type { ScanProgressEvent } from '@shared/types';

const logger = createLogger();
const MODULE = 'Boot';

// ─── Helpers ────────────────────────────────────────────────────────

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['https:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function getDataDir(): string {
  return join(app.getPath('userData'), 'aiplughub');
}

// ─── Window Management ──────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function createWindow(): BrowserWindow {
  // Resolve icon path — in dev it's in build/, in production it's in resources/
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../build/icon.png');

  const win = new BrowserWindow({
    width: 1024,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'AI Plug Hub',
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.js'),
    },
  });

  // Prevent navigation away from the app — open safe URLs in system browser
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl) {
      try {
        if (new URL(url).origin === new URL(devUrl).origin) return;
      } catch {
        /* fall through to preventDefault */
      }
    }
    event.preventDefault();
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url);
    }
  });

  // Prevent popup windows — open safe URLs in system browser
  win.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) {
      shell.openExternal(details.url);
    }
    return { action: 'deny' };
  });

  return win;
}

function loadRenderer(win: BrowserWindow): void {
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// ─── CSP ────────────────────────────────────────────────────────────

function applyCSP(): void {
  const isDev = !!process.env['ELECTRON_RENDERER_URL'];
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          isDev
            ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self' https://raw.githubusercontent.com https://api.github.com; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self' https://raw.githubusercontent.com https://api.github.com; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        ],
      },
    });
  });
}

// ─── Boot Sequence ──────────────────────────────────────────────────

async function boot(): Promise<void> {
  // Activate write guard for fixture-mode live testing (blocks writes outside fixture dir)
  const writeGuardDir = process.env.AIPLUGHUB_WRITE_GUARD;
  if (writeGuardDir) {
    activateWriteGuard(writeGuardDir);
    logger.info(MODULE, `Write guard active — writes restricted to: ${writeGuardDir}`);
  }

  logger.info(MODULE, 'Starting boot sequence');
  const dataDir = getDataDir();

  // 2. Load DataStore
  const configIO = createConfigIO(logger);
  const dataStore = createDataStore(join(dataDir, 'data.json'), configIO, logger);

  try {
    await dataStore.load();
    logger.info(MODULE, 'DataStore loaded');
  } catch (err) {
    logger.error(MODULE, 'DataStore load failed — resetting to defaults', err as Error);
    await dataStore.reset();
  }

  // 3. Create AdapterRegistry, register adapters
  const registry = createAdapterRegistry();

  try {
    const ccRootPath = join(homedir(), '.claude');
    const ccAdapter = createClaudeCodeAdapter(ccRootPath, 'claude-code-default', configIO, logger);
    registry.register(ccAdapter);
    logger.info(MODULE, `Registered adapter: ${ccAdapter.instanceId}`);
  } catch (err) {
    logger.error(MODULE, 'Failed to register ClaudeCodeAdapter', err as Error);
  }

  try {
    const cdRootPath = resolveDefaultDesktopConfigDir();
    const cdAdapter = createClaudeDesktopAdapter(
      cdRootPath,
      'claude-desktop-default',
      configIO,
      logger,
    );
    registry.register(cdAdapter);
    logger.info(MODULE, `Registered adapter: ${cdAdapter.instanceId}`);
  } catch (err) {
    logger.error(MODULE, 'Failed to register ClaudeDesktopAdapter', err as Error);
  }

  try {
    const gcRootPath = resolveDefaultGeminiConfigDir();
    const gcAdapter = createGeminiCliAdapter(gcRootPath, 'gemini-cli-default', configIO, logger);
    registry.register(gcAdapter);
    logger.info(MODULE, `Registered adapter: ${gcAdapter.instanceId}`);
  } catch (err) {
    logger.error(MODULE, 'Failed to register GeminiCliAdapter', err as Error);
  }

  try {
    const agRootPath = resolveDefaultAntigravityConfigDir();
    const agAdapter = createAntigravityAdapter(agRootPath, 'antigravity-default', configIO, logger);
    registry.register(agAdapter);
    logger.info(MODULE, `Registered adapter: ${agAdapter.instanceId}`);
  } catch (err) {
    logger.error(MODULE, 'Failed to register AntigravityAdapter', err as Error);
  }

  // 3b. Create SecretStore
  const secretStore = createSecretStore(join(dataDir, 'secrets.enc'), safeStorage, logger);
  logger.info(MODULE, `SecretStore available: ${secretStore.isAvailable()}`);

  // 3c. Create MarketplaceClient
  const marketplace = new MarketplaceClient({
    cachePath: join(dataDir, 'cache'),
    dataStore,
    secretStore,
    registry,
    logger,
    claudeRootPath: join(homedir(), '.claude'),
  });

  // 3d. Create BackupManager
  const backupManager = new BackupManager(registry, app.getVersion());

  // 4. Register IPC handlers
  const handlerDeps = {
    ipcMain,
    registry,
    dataStore,
    secretStore,
    marketplace,
    backupManager,
    logger,
    dialog,
    shell,
    getMainWindow,
    getAppVersion: () => app.getVersion(),
  };
  registerIpcHandlers(handlerDeps);
  logger.info(MODULE, 'IPC handlers registered');

  // 5. Create BrowserWindow (hidden), apply CSP, deny permissions
  applyCSP();
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => {
    callback(false);
  });

  mainWindow = createWindow();

  // Register ready-to-show BEFORE starting scan, so the window shows
  // even if the renderer finishes loading during a long scan.
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    logger.info(MODULE, 'Window shown');
  });

  loadRenderer(mainWindow);
  logger.info(MODULE, 'Window created (hidden), renderer loading');

  // 6. Auto-detect + scan (if first run or preference enabled)
  const preferences = await dataStore.getPreferences();
  const isFirstRun = !preferences.setupComplete;

  if (isFirstRun || preferences.rescanOnLaunch) {
    logger.info(
      MODULE,
      `Auto-scan: firstRun=${isFirstRun}, rescanOnLaunch=${preferences.rescanOnLaunch}`,
    );

    // Batch all DataStore writes during scan — one disk write at the end instead of per-component
    await dataStore.batch(async () => {
      try {
        const detectionResults = await registry.detectAll();
        logger.info(MODULE, `Detected ${detectionResults.length} tool instance(s)`);

        // Reconcile detected tools with DataStore
        for (const result of detectionResults) {
          if (result.detected) {
            await dataStore.setToolInstance({
              instanceId: result.instanceId,
              toolId: result.toolId,
              path: result.path,
              name: result.instanceId, // Will be formatted by UI
              isDefault: true,
            });
          }
        }

        // Scan all adapters with progress events
        for (const adapter of registry.getAllAdapters()) {
          const progressBase: ScanProgressEvent = {
            instanceId: adapter.instanceId,
            toolId: adapter.toolId,
            status: 'scanning',
          };
          mainWindow?.webContents.send('progress:scan', progressBase);

          try {
            const components = await adapter.scan();
            logger.info(MODULE, `Scanned ${adapter.instanceId}: ${components.length} component(s)`);

            mainWindow?.webContents.send('progress:scan', {
              ...progressBase,
              status: 'complete',
              componentCount: components.length,
            } satisfies ScanProgressEvent);

            // Reconcile: filesystem scan is authoritative (system-design.md §4)
            // 1. Add new components found on disk as 'detected'
            // 2. Remove stale DataStore entries no longer on disk
            const storedComponents = await dataStore.getComponents();
            for (const comp of components) {
              const existing = storedComponents.find(
                (c) =>
                  c.id.tool === comp.id.tool &&
                  c.id.type === comp.id.type &&
                  c.id.name === comp.id.name &&
                  c.id.scope === comp.id.scope,
              );
              if (!existing) {
                await dataStore.setComponentMeta(comp.id, { tracking: 'detected' });
              }
            }

            // Remove stale entries for this adapter's tool that weren't in scan results
            const scannedKeys = new Set(
              components.map((c) => `${c.id.tool}:${c.id.type}:${c.id.name}:${c.id.scope}`),
            );
            for (const stored of storedComponents) {
              if (stored.id.tool !== adapter.toolId) continue;
              const key = `${stored.id.tool}:${stored.id.type}:${stored.id.name}:${stored.id.scope}`;
              if (!scannedKeys.has(key)) {
                logger.info(MODULE, `Removing stale component: ${key}`);
                await dataStore.removeComponentMeta(stored.id);
              }
            }
          } catch (err) {
            logger.error(MODULE, `Scan failed for ${adapter.instanceId}`, err as Error);
            mainWindow?.webContents.send('progress:scan', {
              ...progressBase,
              status: 'error',
              error: err instanceof Error ? err.message : String(err),
            } satisfies ScanProgressEvent);
          }
        }
      } catch (err) {
        logger.error(MODULE, 'Auto-detect/scan failed', err as Error);
      }

      // Mark setup as complete so subsequent launches respect rescanOnLaunch preference
      if (isFirstRun) {
        await dataStore.setPreferences({ setupComplete: true });
        logger.info(MODULE, 'First run complete, setupComplete set to true');
      }
    });
  }

  // 7. Backfill update tracking for pre-USR-06 installs — non-blocking
  marketplace
    .backfillInstalledFrom()
    .then((count) => {
      if (count > 0) {
        logger.info(MODULE, `Backfilled update tracking for ${count} component(s)`);
      }
    })
    .catch((err) => {
      logger.warn(MODULE, 'Backfill failed (silent)', err as Error);
    });

  // 8. Auto-check for updates (USR-06) — non-blocking, after scan completes
  if (preferences.autoCheckUpdates) {
    logger.info(MODULE, 'Auto-checking for plugin updates');
    marketplace
      .checkForUpdates()
      .then((result) => {
        if (result.updates.length > 0) {
          logger.info(MODULE, `Found ${result.updates.length} plugin update(s)`);
          mainWindow?.webContents.send('updates:available', result);
        }
      })
      .catch((err) => {
        logger.warn(MODULE, 'Auto-update check failed (silent)', err as Error);
      });
  }

  logger.info(MODULE, 'Boot sequence complete');
}

// ─── Application Lifecycle ──────────────────────────────────────────

// 1. Single-instance lock
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await boot();
    } catch (err) {
      logger.error(MODULE, 'Fatal boot error', err as Error);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        boot().catch((err) => logger.error(MODULE, 'Fatal boot error on activate', err as Error));
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
