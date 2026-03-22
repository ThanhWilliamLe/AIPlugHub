/**
 * Export Builder — orchestrates bundle creation.
 * Reads components from store, strips secrets, generates warnings.
 */

import type {
  Component,
  ComponentId,
  PortableComponent,
  Bundle,
  ExportOptions,
  ToolId,
  ConfigRequirement,
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

  return portable;
}

/**
 * Build a complete bundle from selected components.
 */
export function buildBundle(
  selectedIds: ComponentId[],
  allComponents: Component[],
  options: ExportOptions,
): Bundle {
  const selected = allComponents.filter((c) =>
    selectedIds.some((id) => componentIdEquals(c.id, id)),
  );

  // Collect tools involved
  const toolSet = new Set<ToolId>();
  for (const c of selected) {
    toolSet.add(c.id.tool);
  }

  const bundleName = options.name || `my-setup-${new Date().toISOString().slice(0, 10)}`;

  const bundle = createBundle(bundleName, Array.from(toolSet), options.description);

  // Convert each component to portable form
  bundle.components = selected.map(toPortable);

  // Warn if some selected components were not found (stale selection)
  if (selected.length < selectedIds.length) {
    const missing = selectedIds.length - selected.length;
    if (!bundle.description) {
      bundle.description = `Note: ${missing} selected component(s) were not found during export.`;
    }
  }

  return bundle;
}
