/**
 * Bundle Serializer — reads/writes the .aibundle JSON format.
 * Validates bundle structure on deserialization.
 */

import type {
  Bundle,
  BundleTarget,
  PortableComponent,
  PortablePlugin,
  ComponentType,
} from '@shared/types';
import { AppError } from '@shared/types';
import { ALL_COMPONENT_TYPES } from '@shared/constants';

const FORMAT_VERSION = '2.0';

/** Serialize a bundle to JSON string */
export function serializeBundle(bundle: Bundle): string {
  return JSON.stringify(bundle, null, 2);
}

/** Deserialize a JSON string to a Bundle with validation */
export function deserializeBundle(json: string): Bundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new AppError('BUNDLE_INVALID', 'Bundle file is not valid JSON', false);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new AppError('BUNDLE_INVALID', 'Bundle must be a JSON object', false);
  }

  const obj = parsed as Record<string, unknown>;

  // Required fields
  if (typeof obj.formatVersion !== 'string') {
    throw new AppError('BUNDLE_INVALID', 'Missing required field: formatVersion', false);
  }

  // Version compatibility — v2.0 clean break
  const [major] = obj.formatVersion.split('.');
  if (major === '1') {
    throw new AppError(
      'BUNDLE_VERSION',
      `This bundle uses format v${obj.formatVersion}, which is no longer supported. Re-export it using AI Plug Hub v1.9 or later to create a compatible bundle.`,
      false,
    );
  }
  const [supportedMajor] = FORMAT_VERSION.split('.');
  if (major !== supportedMajor) {
    throw new AppError(
      'BUNDLE_VERSION',
      `Unsupported bundle format version ${obj.formatVersion}. This app supports ${FORMAT_VERSION}.`,
      false,
    );
  }

  // Validate target (scoped bundle)
  if (!obj.target || typeof obj.target !== 'object') {
    throw new AppError('BUNDLE_INVALID', 'Missing required field: target', false);
  }
  validateBundleTarget(obj.target as Record<string, unknown>);

  if (!obj.exportedFrom || typeof obj.exportedFrom !== 'object') {
    throw new AppError('BUNDLE_INVALID', 'Missing required field: exportedFrom', false);
  }

  const exportedFrom = obj.exportedFrom as Record<string, unknown>;
  if (typeof exportedFrom.date !== 'string') {
    throw new AppError('BUNDLE_INVALID', 'exportedFrom must have a date string', false);
  }

  // Validate components and plugins arrays
  const components = Array.isArray(obj.components) ? obj.components : [];
  const plugins = Array.isArray(obj.plugins) ? obj.plugins : [];

  // Validate each component has required fields
  for (const c of components) {
    validatePortableComponent(c as Record<string, unknown>);
  }

  for (const p of plugins) {
    const plugin = p as Record<string, unknown>;
    // v1.7.0+: plugins use pluginKey + pluginName; legacy bundles used name
    if (typeof plugin.pluginKey !== 'string' && typeof plugin.name !== 'string') {
      throw new AppError('BUNDLE_INVALID', 'Plugin must have a pluginKey or name', false);
    }
    if (Array.isArray(plugin.components)) {
      for (const c of plugin.components) {
        validatePortableComponent(c as Record<string, unknown>);
      }
    }
  }

  // Check single-container constraint: same (type, name) should not appear in
  // both plugins[].components and top-level components
  const seen = new Set<string>();
  for (const c of components as PortableComponent[]) {
    seen.add(`${c.type}:${c.name}`);
  }
  for (const p of plugins as PortablePlugin[]) {
    for (const c of p.components) {
      const key = `${c.type}:${c.name}`;
      if (seen.has(key)) {
        throw new AppError(
          'BUNDLE_INVALID',
          `Duplicate component ${c.name} (${c.type}) found in both plugins and top-level components`,
          false,
        );
      }
      seen.add(key);
    }
  }

  return parsed as Bundle;
}

export function validatePortableComponent(c: Record<string, unknown>): void {
  if (typeof c.type !== 'string' || !ALL_COMPONENT_TYPES.includes(c.type as ComponentType)) {
    throw new AppError('BUNDLE_INVALID', `Invalid component type: ${String(c.type)}`, false);
  }
  if (typeof c.name !== 'string') {
    throw new AppError('BUNDLE_INVALID', 'Component must have a name', false);
  }
  if (!c.core || typeof c.core !== 'object') {
    throw new AppError('BUNDLE_INVALID', `Component ${c.name} must have a core schema`, false);
  }
  // Reject prototype pollution vectors
  const FORBIDDEN_NAMES = ['__proto__', 'constructor', 'prototype'];
  if (FORBIDDEN_NAMES.includes(c.name as string)) {
    throw new AppError('BUNDLE_INVALID', `Forbidden component name: ${c.name}`, false);
  }
  // Reject path traversal vectors.
  // Note: "/" is allowed because plugin-scoped names use it as a separator
  // (e.g., "code-review@marketplace/code-review"). The import handler strips
  // the prefix before writing to disk.
  const name = c.name as string;
  if (name.includes('..') || name.includes('\\') || name.includes('\0')) {
    throw new AppError(
      'BUNDLE_INVALID',
      `Component name contains path traversal characters: ${name}`,
      false,
    );
  }
}

/** Validate bundle target shape */
function validateBundleTarget(t: Record<string, unknown>): void {
  if (t.scope === 'user') {
    if (typeof t.toolId !== 'string') {
      throw new AppError('BUNDLE_INVALID', 'User-scope target must have a toolId string', false);
    }
  } else if (t.scope === 'project') {
    if (typeof t.projectName !== 'string') {
      throw new AppError(
        'BUNDLE_INVALID',
        'Project-scope target must have a projectName string',
        false,
      );
    }
    if (!Array.isArray(t.tools) || !t.tools.every((tool: unknown) => typeof tool === 'string')) {
      throw new AppError(
        'BUNDLE_INVALID',
        'Project-scope target must have a tools array of strings',
        false,
      );
    }
  } else {
    throw new AppError(
      'BUNDLE_INVALID',
      `Invalid target scope: ${String(t.scope)}. Must be "user" or "project".`,
      false,
    );
  }
}

/** Create a new empty bundle with metadata */
export function createBundle(
  name: string,
  target: BundleTarget,
  appVersion: string,
  description?: string,
): Bundle {
  return {
    formatVersion: FORMAT_VERSION,
    name,
    description,
    target,
    exportedFrom: {
      date: new Date().toISOString(),
      appVersion,
    },
    recommendedSources: [],
    plugins: [],
    components: [],
  };
}

export { FORMAT_VERSION };
