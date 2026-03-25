/**
 * Export Builder — orchestrates bundle creation.
 * Reads components from store, strips secrets, generates warnings.
 */

import os from 'node:os';
import type {
  Component,
  ComponentId,
  PortableComponent,
  PortablePlugin,
  Bundle,
  BundleTarget,
  RecommendedSource,
  ExportOptions,
  ToolId,
  ConfigRequirement,
  MarketplaceSourceConfig,
} from '@shared/types';
import { componentIdEquals, isSensitiveEnvKey, isSensitiveEnvValue } from '@shared/utils';
import { createBundle } from './serializer';

/**
 * Build a portable component from an installed component.
 * Strips secrets, generates portability warnings and requiredConfig entries.
 */
function toPortable(component: Component): PortableComponent {
  const portable: PortableComponent = {
    type: component.id.type,
    name: component.id.name,
    scope: component.id.scope,
    description: component.description,
    version: component.version,
    sourceTools: [component.id.tool],
    core: component.core,
  };

  // Detect secrets in MCP server env vars
  const requiredConfig: ConfigRequirement[] = [];
  const warnings: string[] = [];

  if (component.id.type === 'mcp-server' && 'env' in component.core) {
    const env = (component.core as { env?: Record<string, string> }).env;
    if (env) {
      // Build a clean env copy with secrets removed
      const cleanEnv: Record<string, string> = {};

      for (const [key, value] of Object.entries(env)) {
        const isSensitive = isSensitiveEnvKey(key) || isSensitiveEnvValue(value);
        if (isSensitive) {
          requiredConfig.push({
            key,
            description: `Environment variable for ${component.id.name}`,
            sensitive: true,
            envVar: key,
          });
          // Secret NOT added to cleanEnv — stripped from bundle
        } else {
          cleanEnv[key] = value;
          requiredConfig.push({
            key,
            description: `Environment variable for ${component.id.name}`,
            sensitive: false,
            default: value,
            envVar: key,
          });
        }
      }

      // Deep copy core then replace env with cleaned version
      const coreCopy = structuredClone(component.core) as Record<string, unknown>;
      coreCopy.env = Object.keys(cleanEnv).length > 0 ? cleanEnv : undefined;
      portable.core = coreCopy as typeof component.core;
    }
  }

  // HTTP/SSE MCP servers have portability warning for Claude Desktop
  if (component.id.type === 'mcp-server') {
    const transport = (component.core as { transport?: string }).transport;
    if (transport === 'http' || transport === 'sse') {
      warnings.push('Remote MCP servers may require manual GUI setup on some tools');
    }
  }

  // Skills with supporting files
  if (component.id.type === 'skill') {
    const supportingFiles = (component.core as { supportingFiles?: string[] }).supportingFiles;
    if (supportingFiles && supportingFiles.length > 0) {
      warnings.push(`${supportingFiles.length} supporting file(s) are not included in the bundle`);
    }
  }

  if (requiredConfig.length > 0) portable.requiredConfig = requiredConfig;
  if (warnings.length > 0) portable.portabilityWarnings = warnings;
  if (component.extensions) portable.toolExtensions = { [component.id.tool]: component.extensions };

  // Carry marketplace source info for import-side awareness
  if (component.installedFrom) {
    portable.marketplaceSource = {
      sourceId: component.installedFrom.sourceId,
      ref: component.installedFrom.ref,
    };
  }

  return portable;
}

/**
 * Build a complete bundle from selected components.
 * Plugin-scope components are grouped into PortablePlugin entries (R1).
 * Non-plugin components go into the flat components array.
 */
export function buildBundle(
  selectedIds: ComponentId[],
  allComponents: Component[],
  options: ExportOptions,
  target: BundleTarget,
  appVersion: string,
  marketplaceSources?: Map<string, { sourceId: string; url: string }>,
  userSources?: MarketplaceSourceConfig[],
): Bundle {
  const selected = allComponents.filter((c) =>
    selectedIds.some((id) => componentIdEquals(c.id, id)),
  );

  const bundleName = options.name || `my-setup-${new Date().toISOString().slice(0, 10)}`;

  const bundle = createBundle(bundleName, target, appVersion, options.description);

  // Set machine hostname
  try {
    bundle.exportedFrom.machine = os.hostname();
  } catch {
    // best-effort
  }

  // Separate plugin-scope components from standalone components
  const pluginComponents: Component[] = [];
  const standaloneComponents: Component[] = [];

  for (const c of selected) {
    const ext = c.extensions as Record<string, unknown> | undefined;
    if (c.id.scope === 'plugin' && ext?.pluginKey) {
      pluginComponents.push(c);
    } else {
      standaloneComponents.push(c);
    }
  }

  // Group plugin components by pluginKey into PortablePlugin entries
  const pluginMap = new Map<string, { components: Component[]; ext: Record<string, unknown> }>();
  for (const c of pluginComponents) {
    const ext = c.extensions as Record<string, unknown>;
    const pluginKey = ext.pluginKey as string;
    let entry = pluginMap.get(pluginKey);
    if (!entry) {
      entry = { components: [], ext };
      pluginMap.set(pluginKey, entry);
    }
    entry.components.push(c);
  }

  bundle.plugins = Array.from(pluginMap.entries()).map(([pluginKey, { components, ext }]) => {
    const marketplace = (ext.marketplace as string) ?? '';
    const plugin: PortablePlugin = {
      pluginKey,
      pluginName: (ext.pluginName as string) ?? pluginKey,
      marketplace,
      version: (ext.pluginVersion as string) ?? undefined,
      enabled: (ext.pluginEnabled as boolean) ?? true,
      components: components.map(toPortable),
    };

    // Attach marketplace source URL for re-download
    if (marketplaceSources && marketplace) {
      const src = marketplaceSources.get(marketplace);
      if (src) {
        plugin.marketplaceSource = { sourceId: src.sourceId, url: src.url };
      }
    }

    return plugin;
  });

  // Standalone (non-plugin) components go flat
  bundle.components = standaloneComponents.map(toPortable);

  // Derive recommended sources from plugins' marketplace source refs (#27)
  if (userSources && userSources.length > 0) {
    const sourceIds = new Set<string>();
    for (const p of bundle.plugins) {
      if (p.marketplaceSource?.sourceId) sourceIds.add(p.marketplaceSource.sourceId);
    }
    for (const c of bundle.components) {
      if (c.marketplaceSource?.sourceId) sourceIds.add(c.marketplaceSource.sourceId);
    }
    const recommended: RecommendedSource[] = [];
    for (const id of sourceIds) {
      const src = userSources.find((s) => s.sourceId === id);
      if (src) {
        recommended.push({
          sourceId: id,
          url: src.url,
          displayName: src.displayName ?? id,
          sourceType: src.sourceType as 'git-marketplace' | 'url-index',
        });
      }
    }
    bundle.recommendedSources = recommended;
  }

  // Warn if some selected components were not found (stale selection)
  if (selected.length < selectedIds.length) {
    const missing = selectedIds.length - selected.length;
    if (!bundle.description) {
      bundle.description = `Note: ${missing} selected component(s) were not found during export.`;
    }
  }

  return bundle;
}
