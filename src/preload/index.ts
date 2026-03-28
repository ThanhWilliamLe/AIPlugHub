/**
 * Preload script — expose PlugHubAPI to renderer via contextBridge.
 * Unwraps IpcResult: ok → return data, error → throw IpcError.
 * Source: 6C-build-plan/m4-session-brief.md §2
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { IpcResult } from '@shared/types';

/**
 * Unwrap IpcResult — the single error handling convention for all IPC calls.
 * On ok: return data. On error: throw a structured IpcError object.
 */
function unwrap<T>(result: IpcResult<T>): T {
  if (result.ok) return result.data;
  throw result.error;
}

contextBridge.exposeInMainWorld('aiplughub', {
  // ─── Tool Management ────────────────────────────────────────────
  tools: {
    async detect() {
      const result = await ipcRenderer.invoke('tools:detect');
      return unwrap(result);
    },

    async scan(instanceId: string) {
      const result = await ipcRenderer.invoke('tools:scan', instanceId);
      return unwrap(result);
    },

    async scanAll() {
      const result = await ipcRenderer.invoke('tools:scanAll');
      return unwrap(result);
    },
  },

  // ─── Component Operations ───────────────────────────────────────
  components: {
    async install(portable: unknown, target: unknown) {
      const result = await ipcRenderer.invoke('components:install', portable, target);
      return unwrap(result);
    },

    async uninstall(id: unknown) {
      const result = await ipcRenderer.invoke('components:uninstall', id);
      return unwrap(result);
    },

    async enable(id: unknown) {
      const result = await ipcRenderer.invoke('components:enable', id);
      return unwrap(result);
    },

    async disable(id: unknown) {
      const result = await ipcRenderer.invoke('components:disable', id);
      return unwrap(result);
    },
  },

  // ─── System ─────────────────────────────────────────────────────
  system: {
    async openFileDialog(options: unknown) {
      const result = await ipcRenderer.invoke('system:openFileDialog', options);
      return unwrap(result);
    },

    async showInExplorer(path: string) {
      const result = await ipcRenderer.invoke('system:showInExplorer', path);
      return unwrap(result);
    },

    async openUrl(url: string) {
      const result = await ipcRenderer.invoke('system:openUrl', url);
      return unwrap(result);
    },

    async getAppVersion() {
      const result = await ipcRenderer.invoke('system:getAppVersion');
      return unwrap(result);
    },

    onFileDrop(callback: (filePath: string) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, filePath: string): void =>
        callback(filePath);
      ipcRenderer.on('system:fileDrop', handler);
      return () => ipcRenderer.removeListener('system:fileDrop', handler);
    },

    /** Get native file path from a DOM File object (for drag-and-drop with sandbox) */
    getPathForFile(file: File): string {
      return webUtils.getPathForFile(file);
    },
  },

  // ─── Bundle Operations ─────────────────────────────────────────
  bundles: {
    async exportBundle(componentIds: unknown[], options: unknown) {
      const result = await ipcRenderer.invoke('bundles:export', componentIds, options);
      return unwrap(result);
    },

    async parseFile(filePath: string) {
      const result = await ipcRenderer.invoke('bundles:parse', filePath);
      return unwrap(result);
    },

    async detectConflicts(bundle: unknown) {
      const result = await ipcRenderer.invoke('bundles:detectConflicts', bundle);
      return unwrap(result);
    },

    async importBundle(components: unknown[], resolutions: unknown[], plugins?: unknown[]) {
      const result = await ipcRenderer.invoke('bundles:import', components, resolutions, plugins);
      return unwrap(result);
    },

    async saveBundle(json: string, defaultName: string) {
      const result = await ipcRenderer.invoke('bundles:save', json, defaultName);
      return unwrap(result);
    },
  },

  // ─── Browse (Marketplace) ──────────────────────────────────────
  browse: {
    async getEntries() {
      const result = await ipcRenderer.invoke('browse:getEntries');
      return unwrap(result);
    },

    async getDetail(ref: unknown) {
      const result = await ipcRenderer.invoke('browse:getDetail', ref);
      return unwrap(result);
    },

    async install(ref: unknown, target: unknown) {
      const result = await ipcRenderer.invoke('browse:install', ref, target);
      return unwrap(result);
    },

    async refreshSources() {
      const result = await ipcRenderer.invoke('browse:refreshSources');
      return unwrap(result);
    },

    async backfillInstalledFrom(): Promise<number> {
      const result = await ipcRenderer.invoke('browse:backfillInstalledFrom');
      return unwrap(result);
    },

    async getSuggestedSources() {
      const result = await ipcRenderer.invoke('browse:getSuggestedSources');
      return unwrap(result);
    },
  },

  // ─── Settings (Sources) ──────────────────────────────────────────
  settings: {
    async getSources() {
      const result = await ipcRenderer.invoke('settings:getSources');
      return unwrap(result);
    },

    async addSource(config: unknown) {
      const result = await ipcRenderer.invoke('settings:addSource', config);
      return unwrap(result);
    },

    async removeSource(sourceId: string) {
      const result = await ipcRenderer.invoke('settings:removeSource', sourceId);
      return unwrap(result);
    },
  },

  // ─── Preferences ─────────────────────────────────────────────────
  preferences: {
    async get() {
      const result = await ipcRenderer.invoke('preferences:get');
      return unwrap(result);
    },

    async set(prefs: unknown) {
      const result = await ipcRenderer.invoke('preferences:set', prefs);
      return unwrap(result);
    },
  },

  // ─── Project Folders (USR-03) ──────────────────────────────────
  projects: {
    async list() {
      const result = await ipcRenderer.invoke('projects:list');
      return unwrap(result);
    },

    async add(path: string) {
      const result = await ipcRenderer.invoke('projects:add', path);
      return unwrap(result);
    },

    async remove(path: string) {
      const result = await ipcRenderer.invoke('projects:remove', path);
      return unwrap(result);
    },

    async scan(path: string) {
      const result = await ipcRenderer.invoke('projects:scan', path);
      return unwrap(result);
    },

    async openFolderDialog() {
      const result = await ipcRenderer.invoke('projects:openFolderDialog');
      return unwrap(result);
    },
  },

  // ─── Secrets ─────────────────────────────────────────────────────
  secrets: {
    async hasGithubToken() {
      const result = await ipcRenderer.invoke('secrets:hasGithubToken');
      return unwrap(result);
    },

    async setGithubToken(token: string) {
      const result = await ipcRenderer.invoke('secrets:setGithubToken', token);
      return unwrap(result);
    },

    async clearGithubToken() {
      const result = await ipcRenderer.invoke('secrets:clearGithubToken');
      return unwrap(result);
    },
  },

  // ─── Plugins (Native Plugin System) ────────────────────────────
  plugins: {
    async list() {
      const result = await ipcRenderer.invoke('plugins:list');
      return unwrap(result);
    },

    async toggle(pluginKey: string, enabled: boolean) {
      const result = await ipcRenderer.invoke('plugins:toggle', pluginKey, enabled);
      return unwrap(result);
    },

    async uninstall(pluginKey: string) {
      const result = await ipcRenderer.invoke('plugins:uninstall', pluginKey);
      return unwrap(result);
    },
  },

  // ─── Updates (USR-06) ──────────────────────────────────────────
  updates: {
    async check() {
      const result = await ipcRenderer.invoke('updates:check');
      return unwrap(result);
    },

    async getAvailable() {
      const result = await ipcRenderer.invoke('updates:getAvailable');
      return unwrap(result);
    },

    async apply(pluginKey: string) {
      const result = await ipcRenderer.invoke('updates:apply', pluginKey);
      return unwrap(result);
    },

    async applyAll(pluginKeys: string[]) {
      const result = await ipcRenderer.invoke('updates:applyAll', pluginKeys);
      return unwrap(result);
    },

    onAvailable(callback: (result: unknown) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data);
      ipcRenderer.on('updates:available', handler);
      return () => ipcRenderer.removeListener('updates:available', handler);
    },
  },

  // ─── Backups (FEAT-02) ────────────────────────────────────────────
  backups: {
    async list(instanceId: string) {
      const result = await ipcRenderer.invoke('backups:list', instanceId);
      return unwrap(result);
    },
    async create(instanceId: string, options?: unknown) {
      const result = await ipcRenderer.invoke('backups:create', instanceId, options);
      return unwrap(result);
    },
    async restore(instanceId: string, backupPath: string) {
      const result = await ipcRenderer.invoke('backups:restore', instanceId, backupPath);
      return unwrap(result);
    },
    async delete(instanceId: string, backupPath: string) {
      const result = await ipcRenderer.invoke('backups:delete', instanceId, backupPath);
      return unwrap(result);
    },
  },

  // ─── Progress Subscriptions ─────────────────────────────────────
  progress: {
    onScanProgress(callback: (event: unknown) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data);
      ipcRenderer.on('progress:scan', handler);
      return () => ipcRenderer.removeListener('progress:scan', handler);
    },

    onImportProgress(callback: (event: unknown) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data);
      ipcRenderer.on('progress:import', handler);
      return () => ipcRenderer.removeListener('progress:import', handler);
    },
  },
});
