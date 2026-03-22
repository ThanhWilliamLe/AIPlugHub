/**
 * Progress event types for long-running IPC operations.
 * Source: 4B-architecture/system-design.md §2 Progress Subscription Pattern
 */

import type { ToolId } from './tools';

export type ScanProgressEvent = {
  instanceId: string;
  toolId: ToolId;
  status: 'scanning' | 'complete' | 'error';
  componentCount?: number;
  error?: string;
};

export type ImportProgressEvent = {
  current: number;
  total: number;
  componentName: string;
  status: 'installing' | 'complete' | 'error';
};
