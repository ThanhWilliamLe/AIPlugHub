/**
 * Compare store — state management for bundle comparison tool.
 */

import { create } from 'zustand';
import type { Bundle, PortableComponent, ComponentType } from '@shared/types';

// ─── Diff Types (client-side) ───────────────────────────────────────

export type DiffCategory = 'added' | 'removed' | 'changed' | 'unchanged';

export type DiffEntry = {
  type: ComponentType;
  name: string;
  category: DiffCategory;
  leftVersion?: string;
  rightVersion?: string;
  changeDetails?: string;
};

export type DiffResult = {
  entries: DiffEntry[];
  summary: { added: number; removed: number; changed: number; unchanged: number };
};

export type CompareMode = 'bundle-vs-bundle' | 'bundle-vs-setup';

export type CompareTarget =
  | { scope: 'user'; toolId: string }
  | { scope: 'project'; projectPath: string };

export type CompareStoreState = {
  active: boolean;
  mode: CompareMode | null;
  leftLabel: string;
  rightLabel: string;
  diffResult: DiffResult | null;
  loading: boolean;
  error: string | null;

  // Actions
  startCompare: () => void;
  setMode: (mode: CompareMode | null) => void;
  compareBundles: (leftPath: string, rightPath: string) => Promise<void>;
  compareWithSetup: (bundlePath: string, target: CompareTarget) => Promise<void>;
  close: () => void;
};

/** Compute a diff between two arrays of PortableComponents */
function computeDiff(left: PortableComponent[], right: PortableComponent[]): DiffResult {
  const entries: DiffEntry[] = [];
  const summary = { added: 0, removed: 0, changed: 0, unchanged: 0 };

  // Build a map of right-side components keyed by (type, name)
  const rightMap = new Map<string, PortableComponent>();
  for (const c of right) {
    rightMap.set(`${c.type}::${c.name}`, c);
  }

  // Track which right-side items have been matched
  const matched = new Set<string>();

  // Process left-side components
  for (const lc of left) {
    const key = `${lc.type}::${lc.name}`;
    const rc = rightMap.get(key);
    if (!rc) {
      // In left but not in right = removed (from right's perspective) = "only in left"
      entries.push({
        type: lc.type,
        name: lc.name,
        category: 'removed',
        leftVersion: lc.version,
      });
      summary.removed++;
    } else {
      matched.add(key);
      // Compare version and content
      const versionDiff = lc.version !== rc.version;
      let contentDiff = false;
      try {
        contentDiff = JSON.stringify(lc.core) !== JSON.stringify(rc.core);
      } catch {
        contentDiff = true;
      }

      if (versionDiff || contentDiff) {
        const details: string[] = [];
        if (versionDiff) details.push(`version: ${lc.version ?? '?'} -> ${rc.version ?? '?'}`);
        if (contentDiff) details.push('configuration differs');
        entries.push({
          type: lc.type,
          name: lc.name,
          category: 'changed',
          leftVersion: lc.version,
          rightVersion: rc.version,
          changeDetails: details.join('; '),
        });
        summary.changed++;
      } else {
        entries.push({
          type: lc.type,
          name: lc.name,
          category: 'unchanged',
          leftVersion: lc.version,
          rightVersion: rc.version,
        });
        summary.unchanged++;
      }
    }
  }

  // Components only in right = added
  for (const rc of right) {
    const key = `${rc.type}::${rc.name}`;
    if (!matched.has(key)) {
      entries.push({
        type: rc.type,
        name: rc.name,
        category: 'added',
        rightVersion: rc.version,
      });
      summary.added++;
    }
  }

  // Sort: added first, then removed, changed, unchanged
  const order: Record<DiffCategory, number> = { added: 0, removed: 1, changed: 2, unchanged: 3 };
  entries.sort((a, b) => order[a.category] - order[b.category] || a.name.localeCompare(b.name));

  return { entries, summary };
}

/** Flatten a bundle's components (including plugin sub-components) */
function flattenBundle(bundle: Bundle): PortableComponent[] {
  return [...bundle.components, ...bundle.plugins.flatMap((p) => p.components)];
}

export const useCompareStore = create<CompareStoreState>((set) => ({
  active: false,
  mode: null,
  leftLabel: '',
  rightLabel: '',
  diffResult: null,
  loading: false,
  error: null,

  startCompare: () =>
    set({
      active: true,
      mode: null,
      leftLabel: '',
      rightLabel: '',
      diffResult: null,
      loading: false,
      error: null,
    }),

  setMode: (mode) => set({ mode }),

  compareBundles: async (leftPath, rightPath) => {
    set({ loading: true, error: null, diffResult: null });
    try {
      const [leftBundle, rightBundle] = await Promise.all([
        window.aiplughub.bundles.parseFile(leftPath),
        window.aiplughub.bundles.parseFile(rightPath),
      ]);
      const leftComponents = flattenBundle(leftBundle);
      const rightComponents = flattenBundle(rightBundle);
      const diff = computeDiff(leftComponents, rightComponents);

      const leftName = leftBundle.name ?? leftPath.split(/[/\\]/).pop() ?? 'Left';
      const rightName = rightBundle.name ?? rightPath.split(/[/\\]/).pop() ?? 'Right';

      set({
        diffResult: diff,
        leftLabel: leftName,
        rightLabel: rightName,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  compareWithSetup: async (bundlePath, target) => {
    set({ loading: true, error: null, diffResult: null });
    try {
      const bundle = await window.aiplughub.bundles.parseFile(bundlePath);
      const bundleComponents = flattenBundle(bundle);

      // Get current setup components via scan
      const allComponents = await window.aiplughub.tools.scanAll();

      // Filter to match the target scope
      let setupComponents: PortableComponent[];
      if (target.scope === 'user') {
        setupComponents = allComponents
          .filter((c) => c.id.tool === target.toolId && c.id.scope === 'user')
          .map((c) => ({
            type: c.id.type,
            name: c.id.name,
            version: c.version,
            core: c.core,
          }));
      } else {
        setupComponents = allComponents
          .filter((c) => c.id.scope === 'project' && c.projectPath === target.projectPath)
          .map((c) => ({
            type: c.id.type,
            name: c.id.name,
            version: c.version,
            core: c.core,
          }));
      }

      const diff = computeDiff(bundleComponents, setupComponents);

      const bundleName = bundle.name ?? bundlePath.split(/[/\\]/).pop() ?? 'Bundle';

      set({
        diffResult: diff,
        leftLabel: bundleName,
        rightLabel: target.scope === 'user' ? `My ${target.toolId} setup` : 'My project setup',
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  close: () =>
    set({
      active: false,
      mode: null,
      leftLabel: '',
      rightLabel: '',
      diffResult: null,
      loading: false,
      error: null,
    }),
}));
