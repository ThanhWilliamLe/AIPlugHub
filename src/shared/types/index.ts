export type { ToolId, ToolDetectionResult, ToolInstance, InstallTarget } from './tools';

export type {
  ComponentType,
  ComponentId,
  PortableComponentKey,
  McpServerCore,
  SkillCore,
  CommandCore,
  HookCore,
  AgentCore,
  PromptCore,
  LspServerCore,
  SkeletonCore,
  CoreSchemaMap,
  CoreSchema,
  ClaudeCodeMcpExtensions,
  ClaudeCodeSkillExtensions,
  ClaudeCodeHookExtensions,
  ClaudeCodeAgentExtensions,
  ClaudeDesktopMcpExtensions,
  UserConfigField,
  GeminiCliMcpExtensions,
  ToolExtensionsMap,
  Component,
  ComponentMetadata,
  NativePlugin,
} from './components';

export {
  isMcpServer,
  isSkill,
  isCommand,
  isHook,
  isAgent,
  isPrompt,
  isLspServer,
} from './components';

export type {
  PluginOrigin,
  Plugin,
  ConfigRequirement,
  PortableComponent,
  PortablePlugin,
  Bundle,
} from './bundles';

export type {
  IpcResult,
  IpcError,
  ExportOptions,
  SearchFilters,
  ImportResult,
  ConflictType,
  ConflictEntry,
  ConflictManifest,
  ConflictResolution,
  UserPreferences,
  ProjectFolder,
} from './ipc';

export type { ScanProgressEvent, ImportProgressEvent } from './progress';

export type {
  MarketplaceSourceType,
  MarketplaceSourceConfig,
  NewSourceConfig,
  MarketplaceEntry,
  MarketplaceDetail,
  MarketplaceRef,
  BrowseInstallTarget,
  GitMarketplaceManifest,
  GitMarketplacePlugin,
  UrlIndexManifest,
  UrlIndexPlugin,
  SuggestedSource,
  FeaturedPlugin,
  SuggestedSourcesManifest,
} from './marketplace';

export type {
  ComponentChangeType,
  ComponentChange,
  FieldDiff,
  PluginUpdate,
  UpdateCheckResult,
  UpdateCheckError,
  UpdateStatus,
} from './updates';

export type { ErrorCode } from './errors';
export { AppError } from './errors';

export type { BackupManifest, BackupSummary, BackupCreateOptions, RestoreResult } from './backups';
