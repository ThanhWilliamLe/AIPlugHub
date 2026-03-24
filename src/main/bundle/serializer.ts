/**
 * Bundle Serializer — reads/writes the .aibundle JSON format.
 * Validates bundle structure on deserialization.
 */

import type { Bundle, PortableComponent, PortablePlugin, ComponentType } from '@shared/types';
import { AppError } from '@shared/types';
import { ALL_COMPONENT_TYPES } from '@shared/constants';

const FORMAT_VERSION = '1.0';

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

  // Version compatibility
  const [major] = obj.formatVersion.split('.');
  const [supportedMajor] = FORMAT_VERSION.split('.');
  if (major !== supportedMajor) {
    throw new AppError(
      'BUNDLE_VERSION',
      `Unsupported bundle format version ${obj.formatVersion}. This app supports ${FORMAT_VERSION}.`,
      false,
    );
  }

  if (!obj.exportedFrom || typeof obj.exportedFrom !== 'object') {
    throw new AppError('BUNDLE_INVALID', 'Missing required field: exportedFrom', false);
  }

  const exportedFrom = obj.exportedFrom as Record<string, unknown>;
  if (!Array.isArray(exportedFrom.tools) || typeof exportedFrom.date !== 'string') {
    throw new AppError(
      'BUNDLE_INVALID',
      'exportedFrom must have tools array and date string',
      false,
    );
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
    if (typeof plugin.name !== 'string') {
      throw new AppError('BUNDLE_INVALID', 'Plugin must have a name', false);
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
    throw new AppError('BUNDLE_INVALID', `Component name contains path traversal characters: ${name}`, false);
  }
}

/** Create a new empty bundle with metadata */
export function createBundle(name: string, tools: string[], description?: string): Bundle {
  return {
    formatVersion: FORMAT_VERSION,
    name,
    description,
    exportedFrom: {
      tools: tools as Bundle['exportedFrom']['tools'],
      date: new Date().toISOString(),
    },
    plugins: [],
    components: [],
  };
}

export { FORMAT_VERSION };
