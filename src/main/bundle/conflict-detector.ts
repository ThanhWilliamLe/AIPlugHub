/**
 * Conflict Detector — pure function, no I/O.
 * Compares incoming portable components against existing installed components.
 * Returns a manifest with status for each incoming component.
 */

import type {
  PortableComponent,
  Component,
  ConflictManifest,
  ConflictEntry,
  ConflictType,
  ToolId,
} from '@shared/types';
import { TOOL_COMPONENTS } from '@shared/constants';
import { deepEqual, isSensitiveEnvKey, isSensitiveEnvValue } from '@shared/utils';

/**
 * Detect conflicts between incoming components and existing installation.
 *
 * @param incoming - Components from the bundle
 * @param existing - Currently installed components
 * @param detectedToolIds - Tools detected on this machine
 * @returns ConflictManifest categorizing each incoming component
 */
export function detectConflicts(
  incoming: PortableComponent[],
  existing: Component[],
  detectedToolIds: ToolId[],
): ConflictManifest {
  const newComponents: PortableComponent[] = [];
  const conflicts: ConflictEntry[] = [];
  const incompatible: { component: PortableComponent; reason: string }[] = [];

  for (const inc of incoming) {
    // Check tool compatibility — two-level check:
    // 1. If sourceTools specified, at least one must be detected
    // 2. Otherwise, at least one detected tool must support this component type
    if (inc.sourceTools && inc.sourceTools.length > 0) {
      const installedSourceTools = inc.sourceTools.filter((t) => detectedToolIds.includes(t));
      if (installedSourceTools.length === 0) {
        incompatible.push({
          component: inc,
          reason: `Requires ${inc.sourceTools.join(' or ')} (not installed)`,
        });
        continue;
      }
    } else {
      const compatibleTools = detectedToolIds.filter((toolId) => {
        const supported = TOOL_COMPONENTS[toolId];
        return supported?.includes(inc.type);
      });

      if (compatibleTools.length === 0 && detectedToolIds.length > 0) {
        incompatible.push({
          component: inc,
          reason: `No installed tool supports ${inc.type}`,
        });
        continue;
      }
    }

    // Find matching existing components by (type, name)
    const matches = existing.filter((ex) => ex.id.type === inc.type && ex.id.name === inc.name);

    if (matches.length === 0) {
      // No match — new component
      newComponents.push(inc);
      continue;
    }

    // Determine conflict type for each match
    // Use the first match (most relevant — same-tool preferred)
    const match = matches[0];
    const conflictType = classifyConflict(inc, match);

    conflicts.push({
      incoming: inc,
      existing: match,
      conflictType,
    });
  }

  return { newComponents, conflicts, incompatible };
}

/**
 * Strip sensitive env vars from a core object for comparison purposes.
 * Deep-clones the core and removes env entries that match sensitive key names
 * or sensitive value patterns (same logic as export-builder's toPortable).
 */
function stripSensitiveEnv(core: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(core);
  const env = clone.env as Record<string, string> | undefined;
  if (env && typeof env === 'object') {
    for (const [key, value] of Object.entries(env)) {
      if (isSensitiveEnvKey(key) || (typeof value === 'string' && isSensitiveEnvValue(value))) {
        delete env[key];
      }
    }
  }
  return clone;
}

/**
 * Classify the type of conflict between an incoming and existing component.
 */
function classifyConflict(incoming: PortableComponent, existing: Component): ConflictType {
  // Check version
  const versionsMatch =
    incoming.version === existing.version ||
    (incoming.version === undefined && existing.version === undefined);

  // Check scope
  const scopesMatch =
    incoming.scope === undefined || // no scope preference in bundle
    incoming.scope === existing.id.scope;

  // Check content (key-order-independent deep comparison)
  // Normalize both sides by stripping sensitive env vars so that
  // export-then-reimport doesn't produce false "content differs" conflicts.
  const coreMatch = deepEqual(
    stripSensitiveEnv(incoming.core),
    stripSensitiveEnv(existing.core),
  );

  // Identical: everything matches
  if (versionsMatch && scopesMatch && coreMatch) {
    return 'identical';
  }

  // Scope mismatch
  if (!scopesMatch && versionsMatch && coreMatch) {
    return 'scope-mismatch';
  }

  // Version conflict: different versions
  if (!versionsMatch) {
    return 'version';
  }

  // Content conflict: same version but different content
  return 'content';
}
