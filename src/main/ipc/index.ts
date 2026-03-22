/**
 * IPC module — barrel export.
 */

export { registerIpcHandlers } from './handlers';
export type { HandlerDeps, FileDialogOptions } from './handlers';
export { withAdapterLock } from './operation-lock';
