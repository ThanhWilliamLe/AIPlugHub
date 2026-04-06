/**
 * AppError — structured error with taxonomy codes.
 * Source: 4B-architecture/system-design.md §6
 *
 * All modules throw AppError (not plain Error) so the IPC layer
 * can reliably map to IpcError without parsing raw message strings.
 */

export type ErrorCode =
  | 'CONFIG_LOCKED'
  | 'CONFIG_CORRUPTED'
  | 'CONFIG_PERMISSION'
  | 'ADAPTER_UNSUPPORTED'
  | 'TOOL_NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'BUNDLE_INVALID'
  | 'BUNDLE_VERSION'
  | 'INSTALL_PARTIAL'
  | 'COMPONENT_NOT_FOUND'
  | 'MIGRATION_FAILED'
  | 'SECRET_STORE_UNAVAILABLE'
  | 'FILE_TOO_LARGE'
  | 'NOT_LOADED'
  | 'SOURCE_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INSTALL_FAILED'
  | 'UNINSTALL_FAILED'
  | 'INTERNAL_ERROR'
  | 'BACKUP_DISK_FULL'
  | 'BACKUP_PERMISSION_DENIED'
  | 'BACKUP_CONFIG_NOT_FOUND'
  | 'BACKUP_IN_PROGRESS'
  | 'RESTORE_FAILED'
  | 'RESTORE_ROLLBACK_FAILED'
  | 'BACKUP_NOT_FOUND'
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'LIMIT_EXCEEDED'
  | 'UPDATE_FAILED'
  | 'CLI_EXEC_FAILED';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly recoverable: boolean = false,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
