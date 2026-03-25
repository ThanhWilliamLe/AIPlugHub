/**
 * Matching logic for detecting whether a browse marketplace entry is already installed.
 * Handles 3 tiers: tracked installs (via AIPlugHub), native plugins (via CLI), standalone components.
 */

import type { Component, MarketplaceEntry } from '@shared/types';

/** Check if any installed component matches this browse entry */
export function isEntryInstalled(components: Component[], entry: MarketplaceEntry): boolean {
  return components.some((c) => matchesEntry(c, entry));
}

/** Find the installed version for a browse entry */
export function findInstalledVersion(
  components: Component[],
  entry: MarketplaceEntry,
): string | undefined {
  return components.find((c) => matchesEntry(c, entry))?.version;
}

function matchesEntry(c: Component, entry: MarketplaceEntry): boolean {
  // 1. Match by installedFrom metadata (components installed via AIPlugHub browse)
  if (c.installedFrom?.sourceId === entry.sourceId && c.installedFrom?.ref === entry.ref) {
    return true;
  }
  // 2. Match native plugins by pluginName (installed via `claude plugins install` directly)
  if (c.id.scope === 'plugin' && c.extensions?.pluginName === entry.name) {
    return true;
  }
  // 3. Fallback: standalone components by name + tool
  if (c.id.name === entry.name && entry.tools.includes(c.id.tool)) {
    return true;
  }
  return false;
}
