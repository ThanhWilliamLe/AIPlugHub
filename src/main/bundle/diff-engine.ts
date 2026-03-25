import type { PortableComponent, ComponentType } from '@shared/types';

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
  summary: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
  };
};

const CATEGORY_ORDER: Record<DiffCategory, number> = {
  added: 0,
  removed: 1,
  changed: 2,
  unchanged: 3,
};

function makeKey(type: ComponentType, name: string): string {
  return `${type}:${name}`;
}

/**
 * Compute diff between two component lists.
 * Components are matched by (type, name) identity.
 * "left" is typically the older/reference side, "right" is the newer/current side.
 */
export function computeDiff(
  left: PortableComponent[],
  right: PortableComponent[],
): DiffResult {
  const leftMap = new Map<string, PortableComponent>();
  for (const c of left) {
    leftMap.set(makeKey(c.type, c.name), c);
  }

  const rightMap = new Map<string, PortableComponent>();
  for (const c of right) {
    rightMap.set(makeKey(c.type, c.name), c);
  }

  const entries: DiffEntry[] = [];

  // Process left entries: unchanged, changed, or removed
  for (const [key, leftComp] of leftMap) {
    const rightComp = rightMap.get(key);
    if (!rightComp) {
      entries.push({
        type: leftComp.type,
        name: leftComp.name,
        category: 'removed',
        leftVersion: leftComp.version,
      });
    } else {
      const versionDiffers = leftComp.version !== rightComp.version;
      const coreDiffers =
        JSON.stringify(leftComp.core) !== JSON.stringify(rightComp.core);

      if (versionDiffers || coreDiffers) {
        let changeDetails: string;
        if (versionDiffers) {
          changeDetails = `v${leftComp.version ?? '?'} → v${rightComp.version ?? '?'}`;
        } else {
          changeDetails = 'config changed';
        }
        entries.push({
          type: leftComp.type,
          name: leftComp.name,
          category: 'changed',
          leftVersion: leftComp.version,
          rightVersion: rightComp.version,
          changeDetails,
        });
      } else {
        entries.push({
          type: leftComp.type,
          name: leftComp.name,
          category: 'unchanged',
          leftVersion: leftComp.version,
          rightVersion: rightComp.version,
        });
      }
    }
  }

  // Process right entries not in left: added
  for (const [key, rightComp] of rightMap) {
    if (!leftMap.has(key)) {
      entries.push({
        type: rightComp.type,
        name: rightComp.name,
        category: 'added',
        rightVersion: rightComp.version,
      });
    }
  }

  // Sort by category priority
  entries.sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]);

  const summary = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const e of entries) {
    summary[e.category]++;
  }

  return { entries, summary };
}
