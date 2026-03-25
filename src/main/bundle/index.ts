export { serializeBundle, deserializeBundle, createBundle, FORMAT_VERSION } from './serializer';
export { detectConflicts } from './conflict-detector';
export { buildBundle } from './export-builder';
export { computeDiff } from './diff-engine';
export type { DiffEntry, DiffResult, DiffCategory } from './diff-engine';
