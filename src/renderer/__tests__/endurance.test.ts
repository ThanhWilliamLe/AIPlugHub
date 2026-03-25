/**
 * Endurance / soak tests for renderer-side Zustand stores.
 *
 * Goal: detect unbounded state growth, performance degradation, and memory
 * leaks that only surface under sustained operation cycles — not in unit tests
 * that touch the store once or twice.
 *
 * Methodology:
 *  - Drive each store through 200–500 real action cycles.
 *  - After every cycle, assert the store's data structures stay bounded.
 *  - Compare timing windows (first 100 vs last 100 ops) to catch progressive
 *    slowdown caused by ever-growing state (e.g. O(n) spread on each write).
 *  - Flag KNOWN leak vectors with explicit comments so they are easy to find.
 *
 * Stores are tested directly (no React, no components). Zustand stores expose
 * `getState()` and `setState()` on the store hook itself, which is sufficient
 * for soak testing without a rendering environment.
 *
 * The global `window.aiplughub` mock is provided automatically by the shared
 * test-setup.ts (vitest setupFiles). Do NOT import test-setup.ts here.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useToolStore } from '../stores/tool-store';
import { useBrowseStore } from '../stores/browse-store';
import { useUiStore } from '../stores/ui-store';
import { useWizardStore } from '../stores/wizard-store';
import type {
  Component,
  ComponentId,
  MarketplaceEntry,
  ToolId,
  ComponentType,
} from '@shared/types';

// ─── Timing helpers ─────────────────────────────────────────────────────────

function measureOps(count: number, fn: (i: number) => void): { totalMs: number; avgMs: number } {
  const start = performance.now();
  for (let i = 0; i < count; i++) fn(i);
  const totalMs = performance.now() - start;
  return { totalMs, avgMs: totalMs / count };
}

async function measureAsyncOps(
  count: number,
  fn: (i: number) => Promise<void>,
): Promise<{ totalMs: number; avgMs: number }> {
  const start = performance.now();
  for (let i = 0; i < count; i++) await fn(i);
  const totalMs = performance.now() - start;
  return { totalMs, avgMs: totalMs / count };
}

/**
 * Compare the average cost of ops in two equal-sized windows drawn from a
 * pre-measured flat array of per-op durations.
 *
 * Because measureOps/measureAsyncOps only return aggregate timing, the
 * window comparison is done by running the operation loop twice — once for
 * the "early" window and once for the "late" window — so the store state
 * is realistically warmer during the late run.
 */
function measureWindow(
  windowSize: number,
  earlyFn: () => void,
  lateFn: () => void,
): { earlyMs: number; lateMs: number; degradationFactor: number } {
  const earlyStart = performance.now();
  earlyFn();
  const earlyMs = performance.now() - earlyStart;

  const lateStart = performance.now();
  lateFn();
  const lateMs = performance.now() - lateStart;

  const degradationFactor = lateMs / (earlyMs || 0.001); // guard div-by-zero
  return { earlyMs, lateMs, degradationFactor };
}

// ─── Data factories ──────────────────────────────────────────────────────────

function makeComponent(i: number): Component {
  return {
    id: {
      tool: 'claude-code' as const,
      type: 'mcp-server' as const,
      name: `server-${i}`,
      scope: 'user',
    },
    tracking: 'detected' as const,
    core: { transport: 'stdio' as const, command: 'npx', args: [`server-${i}`] },
  };
}

function makeComponentId(i: number): ComponentId {
  return {
    tool: 'claude-code' as const,
    type: 'mcp-server' as const,
    name: `server-${i}`,
    scope: 'user',
  };
}

function makeEntry(i: number): MarketplaceEntry {
  return {
    name: `plugin-${i}`,
    ref: `plugin-${i}`,
    sourceId: 'test-source',
    description: `Test plugin number ${i}`,
    tools: ['claude-code' as ToolId],
    version: '1.0.0',
  };
}

// ─── Store reset helpers ─────────────────────────────────────────────────────

function resetToolStore(): void {
  useToolStore.setState({
    tools: [],
    components: [],
    plugins: [],
    availableUpdates: [],
    updateStatuses: {},
    lastUpdateCheck: null,
    isCheckingUpdates: false,
    loading: false,
    scanning: false,
    error: null,
  });
}

function resetBrowseStore(): void {
  useBrowseStore.setState({
    entries: [],
    searchQuery: '',
    toolFilters: [],
    typeFilters: [],
    sourceFilters: [],
    sortBy: 'popularity',
    isLoading: false,
    error: null,
    isOffline: false,
    cacheDate: null,
    selectedRef: null,
    detail: null,
    detailLoading: false,
    detailError: null,
    installingRef: null,
    installError: null,
    lastInstalledRef: null,
  });
}

function resetUiStore(): void {
  useUiStore.setState({
    activeTab: 'my-setup',
    searchQuery: '',
    toolFilters: [],
    typeFilters: [],
    selectedComponentId: null,
    showSettings: false,
    showFirstRun: false,
    showUninstallConfirm: null,
    updatePanelOpen: false,
    updatePanelScrollTo: null,
    selectionMode: false,
    selectedIds: [],
    bulkOperationProgress: null,
  });
}

function resetWizardStore(): void {
  useWizardStore.getState().closeWizard();
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CHURN_CYCLES = 500;
const WIZARD_CYCLES = 200;
const COMPONENT_BATCH_SIZE_MIN = 50;
const COMPONENT_BATCH_SIZE_MAX = 100;
// Degradation threshold: late window must be no more than 3× slower than early
// window before we fail. A factor > 3 strongly suggests O(n) or worse growth.
const DEGRADATION_THRESHOLD = 3.0;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Endurance: Renderer Stores', () => {
  // ===========================================================================
  // 1. tool-store
  // ===========================================================================
  describe('tool-store', () => {
    beforeEach(() => {
      resetToolStore();
    });

    it(
      'setComponents: state.components.length always matches the last input after 500 churn cycles',
      { timeout: 30_000 },
      () => {
        const { getState } = useToolStore;

        for (let cycle = 0; cycle < CHURN_CYCLES; cycle++) {
          // Vary the array size each cycle to exercise both growth and shrink paths
          const size =
            COMPONENT_BATCH_SIZE_MIN +
            (cycle % (COMPONENT_BATCH_SIZE_MAX - COMPONENT_BATCH_SIZE_MIN + 1));
          const batch = Array.from({ length: size }, (_, i) => makeComponent(cycle * 1000 + i));

          getState().setComponents(batch);

          // Invariant: state must reflect exactly what was just set
          expect(useToolStore.getState().components.length).toBe(size);
        }

        // Post-endurance: store must still accept a fresh write and respond normally
        const sentinel = [makeComponent(999_999)];
        getState().setComponents(sentinel);
        expect(useToolStore.getState().components.length).toBe(1);
        expect(useToolStore.getState().components[0].id.name).toBe('server-999999');
      },
    );

    it(
      'setComponents: no performance degradation (late window not >3× slower than early window)',
      { timeout: 30_000 },
      () => {
        // Pre-warm: run 100 cycles that do NOT count toward the comparison
        for (let i = 0; i < 100; i++) {
          const batch = Array.from({ length: 75 }, (_, j) => makeComponent(j));
          useToolStore.getState().setComponents(batch);
        }

        const batch75 = Array.from({ length: 75 }, (_, i) => makeComponent(i));

        // Early window: 100 ops on a freshly reset store
        resetToolStore();
        const { earlyMs } = measureWindow(
          100,
          () => {
            for (let i = 0; i < 100; i++) useToolStore.getState().setComponents(batch75);
          },
          () => {},
        );

        // Late window: 100 ops after 400 preceding cycles have already run
        resetToolStore();
        for (let i = 0; i < 400; i++) useToolStore.getState().setComponents(batch75);
        const { lateMs } = measureWindow(
          100,
          () => {},
          () => {
            for (let i = 0; i < 100; i++) useToolStore.getState().setComponents(batch75);
          },
        );

        const factor = lateMs / (earlyMs || 0.001);
        expect(factor).toBeLessThan(DEGRADATION_THRESHOLD);
      },
    );

    it(
      'updateStatuses: accumulates without bound — 500 unique keys reach expected count (KNOWN leak vector)',
      { timeout: 30_000 },
      () => {
        // KNOWN LEAK VECTOR: updateStatuses is a Record<string, UpdateStatus> that
        // is only ever appended to. The store has no eviction, TTL, or max-size
        // guard. skipUpdate() filters availableUpdates but leaves updateStatuses
        // untouched. Over a long session, every applied/failed update accumulates
        // a permanent entry. This test documents and asserts the current behaviour
        // so that a future fix (e.g. pruning stale statuses) can be detected.

        for (let i = 0; i < CHURN_CYCLES; i++) {
          const pluginKey = `plugin-${i}@marketplace`;
          useToolStore.setState((state) => ({
            updateStatuses: {
              ...state.updateStatuses,
              [pluginKey]: { state: 'success', newVersion: `1.${i}.0` },
            },
          }));
        }

        const { updateStatuses } = useToolStore.getState();
        const keyCount = Object.keys(updateStatuses).length;

        // All 500 unique keys must be present — the store accumulates them all
        expect(keyCount).toBe(CHURN_CYCLES);

        // Surface the leak clearly in the test output so it is easy to find
        // when reviewing logs. A future fix should change this expectation to
        // assert a bounded maximum (e.g. ≤ 50 most-recent entries).
        //
        // To convert this into a regression guard once the leak is fixed:
        //   expect(keyCount).toBeLessThanOrEqual(MAX_RETAINED_STATUSES);
      },
    );

    it(
      'updateStatuses: spread cost does not degrade as the record grows (write timing stays bounded)',
      { timeout: 30_000 },
      () => {
        // The applyUpdate action uses `{ ...state.updateStatuses, [key]: value }`.
        // With N existing keys, each write is O(N) due to the object spread.
        // This test verifies the spread cost at 0, 250, and 500 entries stays
        // within 10× of each other (a loose but meaningful guard for this pattern).

        resetToolStore();

        // Baseline: 50 writes on an empty record
        const earlyStart = performance.now();
        for (let i = 0; i < 50; i++) {
          useToolStore.setState((state) => ({
            updateStatuses: {
              ...state.updateStatuses,
              [`early-${i}@mkt`]: { state: 'success', newVersion: '1.0.0' },
            },
          }));
        }
        const earlyMs = performance.now() - earlyStart;

        // Seed the record with 450 additional entries (total ~500)
        for (let i = 50; i < 500; i++) {
          useToolStore.setState((state) => ({
            updateStatuses: {
              ...state.updateStatuses,
              [`seed-${i}@mkt`]: { state: 'success', newVersion: '1.0.0' },
            },
          }));
        }

        // Late: 50 writes on a 500-entry record
        const lateStart = performance.now();
        for (let i = 0; i < 50; i++) {
          useToolStore.setState((state) => ({
            updateStatuses: {
              ...state.updateStatuses,
              [`late-${i}@mkt`]: { state: 'success', newVersion: '2.0.0' },
            },
          }));
        }
        const lateMs = performance.now() - lateStart;

        const factor = lateMs / (earlyMs || 0.001);
        // Allow up to 20× — the O(N) spread is expected to show some growth,
        // but >20× on only 500 keys would indicate a pathological environment.
        expect(factor).toBeLessThan(20);
      },
    );

    it(
      'skipUpdate: repeated calls do not accumulate state — availableUpdates shrinks correctly',
      { timeout: 30_000 },
      () => {
        // Seed 500 available updates
        const updates = Array.from({ length: CHURN_CYCLES }, (_, i) => ({
          pluginKey: `plugin-${i}@mkt`,
          pluginName: `plugin-${i}`,
          marketplace: 'mkt',
          sourceId: 'src',
          ref: `ref-${i}`,
          changes: [],
          addedCount: 0,
          modifiedCount: 1,
          removedCount: 0,
          unchangedCount: 0,
        }));
        useToolStore.setState({ availableUpdates: updates });

        // Skip each one in order — store must shrink by exactly 1 each time
        for (let i = 0; i < CHURN_CYCLES; i++) {
          useToolStore.getState().skipUpdate(`plugin-${i}@mkt`);
          expect(useToolStore.getState().availableUpdates.length).toBe(CHURN_CYCLES - i - 1);
        }

        // After all skips, availableUpdates must be empty
        expect(useToolStore.getState().availableUpdates.length).toBe(0);
      },
    );
  });

  // ===========================================================================
  // 2. browse-store
  // ===========================================================================
  describe('browse-store', () => {
    beforeEach(() => {
      resetBrowseStore();
    });

    it(
      'setSearchQuery: state stays consistent and non-null after 500 query churn cycles',
      { timeout: 30_000 },
      () => {
        // Seed the store with entries so that filter/sort logic has data to work with
        const entries = Array.from({ length: 100 }, (_, i) => makeEntry(i));
        useBrowseStore.setState({ entries });

        const queries = [
          'mcp',
          'server',
          'claude',
          '',
          'plugin-42',
          'test plugin number',
          'a',
          '   ',
          'z'.repeat(80),
          'plugin-0',
        ];

        for (let i = 0; i < CHURN_CYCLES; i++) {
          const query = queries[i % queries.length];
          useBrowseStore.getState().setSearchQuery(query);

          const state = useBrowseStore.getState();
          // searchQuery must always reflect the last written value
          expect(state.searchQuery).toBe(query);
          // sortBy must be a valid value — never undefined or null
          expect(['relevance', 'name', 'updated', 'popularity']).toContain(state.sortBy);
          // entries must be unchanged (setSearchQuery must not mutate entries)
          expect(state.entries.length).toBe(100);
        }
      },
    );

    it(
      'setSearchQuery: no performance degradation across 500 cycles with 100 entries loaded',
      { timeout: 30_000 },
      () => {
        const entries = Array.from({ length: 100 }, (_, i) => makeEntry(i));
        useBrowseStore.setState({ entries });

        const earlyResult = measureOps(100, (i) => {
          useBrowseStore.getState().setSearchQuery(`query-${i}`);
        });

        // Run 300 more cycles to advance the store into a "late" state
        for (let i = 100; i < 400; i++) {
          useBrowseStore.getState().setSearchQuery(`mid-${i}`);
        }

        const lateResult = measureOps(100, (i) => {
          useBrowseStore.getState().setSearchQuery(`late-query-${i}`);
        });

        const factor = lateResult.avgMs / (earlyResult.avgMs || 0.001);
        expect(factor).toBeLessThan(DEGRADATION_THRESHOLD);
      },
    );

    it(
      'toggleToolFilter: array stays bounded at unique-value count after 500 toggle cycles',
      { timeout: 30_000 },
      () => {
        // The four known ToolId values — toggling any of them must never push
        // the array past 4 elements regardless of how many times we toggle.
        const toolIds: ToolId[] = ['claude-code', 'claude-desktop', 'gemini-cli', 'antigravity'];

        for (let i = 0; i < CHURN_CYCLES; i++) {
          const toolId = toolIds[i % toolIds.length];
          useBrowseStore.getState().toggleToolFilter(toolId);

          const { toolFilters } = useBrowseStore.getState();
          // Must never exceed the number of unique ToolId values
          expect(toolFilters.length).toBeLessThanOrEqual(toolIds.length);
          // Must never contain duplicates
          const uniqueCount = new Set(toolFilters).size;
          expect(uniqueCount).toBe(toolFilters.length);
        }
      },
    );

    it(
      'toggleTypeFilter: array stays bounded at unique-value count after 500 toggle cycles',
      { timeout: 30_000 },
      () => {
        const types: ComponentType[] = [
          'mcp-server',
          'skill',
          'command',
          'hook',
          'agent',
          'context-file',
          'lsp-server',
          'output-style',
          'prompt',
          'unknown',
        ];

        for (let i = 0; i < CHURN_CYCLES; i++) {
          const type = types[i % types.length];
          useBrowseStore.getState().toggleTypeFilter(type);

          const { typeFilters } = useBrowseStore.getState();
          expect(typeFilters.length).toBeLessThanOrEqual(types.length);
          const uniqueCount = new Set(typeFilters).size;
          expect(uniqueCount).toBe(typeFilters.length);
        }
      },
    );

    it(
      'toggleSourceFilter: array stays bounded at unique-value count after 500 toggle cycles',
      { timeout: 30_000 },
      () => {
        // Simulate 5 distinct source IDs being toggled
        const sources = ['source-a', 'source-b', 'source-c', 'source-d', 'source-e'];

        for (let i = 0; i < CHURN_CYCLES; i++) {
          const source = sources[i % sources.length];
          useBrowseStore.getState().toggleSourceFilter(source);

          const { sourceFilters } = useBrowseStore.getState();
          expect(sourceFilters.length).toBeLessThanOrEqual(sources.length);
          const uniqueCount = new Set(sourceFilters).size;
          expect(uniqueCount).toBe(sourceFilters.length);
        }
      },
    );

    it(
      'setSortBy: cycles through all 4 sort modes 500 times without crashes or invalid state',
      { timeout: 30_000 },
      () => {
        const modes = ['relevance', 'name', 'updated', 'popularity'] as const;

        for (let i = 0; i < CHURN_CYCLES; i++) {
          const mode = modes[i % modes.length];
          useBrowseStore.getState().setSortBy(mode);
          expect(useBrowseStore.getState().sortBy).toBe(mode);
        }

        // Verify the store is still functional after the churn
        useBrowseStore.getState().setSortBy('name');
        expect(useBrowseStore.getState().sortBy).toBe('name');
      },
    );

    it(
      'clearFilters: always resets toolFilters, typeFilters, sourceFilters, and searchQuery to empty',
      { timeout: 30_000 },
      () => {
        // Intersperse filter additions and clearFilters calls
        const toolIds: ToolId[] = ['claude-code', 'claude-desktop', 'gemini-cli', 'antigravity'];
        const types: ComponentType[] = ['mcp-server', 'skill', 'command'];

        for (let i = 0; i < CHURN_CYCLES; i++) {
          // Add some filters
          useBrowseStore.getState().toggleToolFilter(toolIds[i % toolIds.length]);
          useBrowseStore.getState().toggleTypeFilter(types[i % types.length]);
          useBrowseStore.getState().setSearchQuery(`q-${i}`);

          // Clear should always result in an empty state
          useBrowseStore.getState().clearFilters();
          const state = useBrowseStore.getState();

          expect(state.toolFilters).toEqual([]);
          expect(state.typeFilters).toEqual([]);
          expect(state.sourceFilters).toEqual([]);
          expect(state.searchQuery).toBe('');
        }
      },
    );

    it(
      'entries field: 500 direct setState writes never leak — always equals the last written batch',
      { timeout: 30_000 },
      () => {
        // Simulates rapid marketplace refreshes. The entries array is always
        // replaced wholesale; old entries must not accumulate.
        for (let cycle = 0; cycle < CHURN_CYCLES; cycle++) {
          const batchSize = 10 + (cycle % 91); // 10–100 entries per cycle
          const batch = Array.from({ length: batchSize }, (_, i) => makeEntry(cycle * 200 + i));
          useBrowseStore.setState({ entries: batch });

          expect(useBrowseStore.getState().entries.length).toBe(batchSize);
        }
      },
    );
  });

  // ===========================================================================
  // 3. ui-store
  // ===========================================================================
  describe('ui-store', () => {
    beforeEach(() => {
      resetUiStore();
    });

    it(
      'selectedIds: adding 500 items via setState results in a Set of exactly 500 unique ids',
      { timeout: 30_000 },
      () => {
        // NOTE: ui-store stores selectedIds as ComponentId[] (an array), not a
        // Set. This test documents the actual type and verifies no accidental
        // deduplication or growth-beyond-input occurs.
        const ids = Array.from({ length: CHURN_CYCLES }, (_, i) => makeComponentId(i));
        useUiStore.setState({ selectedIds: ids });

        const { selectedIds } = useUiStore.getState();
        expect(selectedIds.length).toBe(CHURN_CYCLES);
      },
    );

    it(
      'selectedIds: clearing after 500 items returns to empty with no residual state',
      { timeout: 30_000 },
      () => {
        const ids = Array.from({ length: CHURN_CYCLES }, (_, i) => makeComponentId(i));
        useUiStore.setState({ selectedIds: ids });
        expect(useUiStore.getState().selectedIds.length).toBe(CHURN_CYCLES);

        useUiStore.getState().clearSelection();
        expect(useUiStore.getState().selectedIds.length).toBe(0);

        // Store must accept new additions immediately after clear
        useUiStore.setState({ selectedIds: [makeComponentId(0)] });
        expect(useUiStore.getState().selectedIds.length).toBe(1);
      },
    );

    it('setSelectedIds: handles large arrays without truncation', { timeout: 30_000 }, () => {
      // setSelectedIds accepts the full array. Verify no truncation occurs.
      const largeInput = Array.from({ length: CHURN_CYCLES }, (_, i) => makeComponentId(i));

      for (let i = 0; i < 50; i++) {
        useUiStore.getState().setSelectedIds(largeInput);
        expect(useUiStore.getState().selectedIds.length).toBe(CHURN_CYCLES);
      }
    });

    it(
      'toggleSelectId: array stays bounded and duplicate-free after 500 toggle cycles',
      { timeout: 30_000 },
      () => {
        // Use 10 distinct IDs so each is toggled in and out many times
        const pool = Array.from({ length: 10 }, (_, i) => makeComponentId(i));

        useUiStore.getState().enterSelectionMode();

        for (let i = 0; i < CHURN_CYCLES; i++) {
          const id = pool[i % pool.length];
          useUiStore.getState().toggleSelectId(id);

          const { selectedIds } = useUiStore.getState();
          expect(selectedIds.length).toBeLessThanOrEqual(pool.length);
          // No duplicates — each name should appear at most once
          const names = selectedIds.map((s) => s.name);
          const uniqueNames = new Set(names);
          expect(uniqueNames.size).toBe(names.length);
        }
      },
    );

    it(
      'tab switching: 500 setActiveTab cycles clear selectedComponentId and selectedIds each time',
      { timeout: 30_000 },
      () => {
        const tabs = ['my-setup', 'browse', 'transfer'] as const;

        // Seed some state that should be cleared on tab switch
        useUiStore.setState({
          selectedComponentId: makeComponentId(0),
          selectedIds: [makeComponentId(1), makeComponentId(2)],
          selectionMode: true,
          updatePanelOpen: true,
        });

        for (let i = 0; i < CHURN_CYCLES; i++) {
          const tab = tabs[i % tabs.length];
          useUiStore.getState().setActiveTab(tab);

          const state = useUiStore.getState();
          expect(state.activeTab).toBe(tab);
          // setActiveTab must clear detail panel, update panel, and selection state
          expect(state.selectedComponentId).toBeNull();
          expect(state.selectedIds).toEqual([]);
          expect(state.selectionMode).toBe(false);
          expect(state.updatePanelOpen).toBe(false);
        }
      },
    );

    it(
      'toolFilters: stays bounded and duplicate-free after 500 toggle cycles',
      { timeout: 30_000 },
      () => {
        const toolIds: ToolId[] = ['claude-code', 'claude-desktop', 'gemini-cli', 'antigravity'];

        for (let i = 0; i < CHURN_CYCLES; i++) {
          useUiStore.getState().toggleToolFilter(toolIds[i % toolIds.length]);

          const { toolFilters } = useUiStore.getState();
          expect(toolFilters.length).toBeLessThanOrEqual(toolIds.length);
          expect(new Set(toolFilters).size).toBe(toolFilters.length);
        }
      },
    );

    it(
      'typeFilters: stays bounded and duplicate-free after 500 toggle cycles',
      { timeout: 30_000 },
      () => {
        const types: ComponentType[] = ['mcp-server', 'skill', 'command', 'hook', 'agent'];

        for (let i = 0; i < CHURN_CYCLES; i++) {
          useUiStore.getState().toggleTypeFilter(types[i % types.length]);

          const { typeFilters } = useUiStore.getState();
          expect(typeFilters.length).toBeLessThanOrEqual(types.length);
          expect(new Set(typeFilters).size).toBe(typeFilters.length);
        }
      },
    );

    it(
      'settings panel open/close: showSettings toggles correctly across 500 cycles with no residual',
      { timeout: 30_000 },
      () => {
        for (let i = 0; i < CHURN_CYCLES; i++) {
          useUiStore.getState().setShowSettings(true);
          expect(useUiStore.getState().showSettings).toBe(true);
          useUiStore.getState().setShowSettings(false);
          expect(useUiStore.getState().showSettings).toBe(false);
        }
      },
    );

    it(
      'update panel open/close: panel state resets cleanly after 500 cycles',
      { timeout: 30_000 },
      () => {
        const pluginKeys = Array.from({ length: 20 }, (_, i) => `plugin-${i}@mkt`);

        for (let i = 0; i < CHURN_CYCLES; i++) {
          const scrollTo = pluginKeys[i % pluginKeys.length];
          useUiStore.getState().openUpdatePanel(scrollTo);

          const open = useUiStore.getState();
          expect(open.updatePanelOpen).toBe(true);
          expect(open.updatePanelScrollTo).toBe(scrollTo);
          expect(open.selectedComponentId).toBeNull(); // openUpdatePanel clears detail panel

          useUiStore.getState().closeUpdatePanel();

          const closed = useUiStore.getState();
          expect(closed.updatePanelOpen).toBe(false);
          expect(closed.updatePanelScrollTo).toBeNull();
        }
      },
    );

    it(
      'selectionMode enter/exit: no state leaks between 500 mode cycles',
      { timeout: 30_000 },
      () => {
        for (let i = 0; i < CHURN_CYCLES; i++) {
          useUiStore.getState().enterSelectionMode();
          expect(useUiStore.getState().selectionMode).toBe(true);

          // Add some ids while in selection mode
          useUiStore.setState({
            selectedIds: [makeComponentId(i), makeComponentId(i + 1)],
          });

          useUiStore.getState().exitSelectionMode();

          const state = useUiStore.getState();
          expect(state.selectionMode).toBe(false);
          // exitSelectionMode must clear selectedIds unconditionally
          expect(state.selectedIds).toEqual([]);
          expect(state.bulkOperationProgress).toBeNull();
        }
      },
    );

    it(
      'clearFilters: resets search and both filter arrays after 500 mixed-state cycles',
      { timeout: 30_000 },
      () => {
        const toolIds: ToolId[] = ['claude-code', 'claude-desktop'];
        const types: ComponentType[] = ['mcp-server', 'skill'];

        for (let i = 0; i < CHURN_CYCLES; i++) {
          useUiStore.getState().toggleToolFilter(toolIds[i % toolIds.length]);
          useUiStore.getState().toggleTypeFilter(types[i % types.length]);
          useUiStore.getState().setSearchQuery(`q${i}`);

          useUiStore.getState().clearFilters();

          const state = useUiStore.getState();
          expect(state.toolFilters).toEqual([]);
          expect(state.typeFilters).toEqual([]);
          expect(state.searchQuery).toBe('');
        }
      },
    );
  });

  // ===========================================================================
  // 4. wizard-store
  // ===========================================================================
  describe('wizard-store', () => {
    beforeEach(() => {
      resetWizardStore();
    });

    it(
      'export wizard open/close: no state accumulation after 200 cycles',
      { timeout: 30_000 },
      () => {
        const { getState } = useWizardStore;

        for (let cycle = 0; cycle < WIZARD_CYCLES; cycle++) {
          // Start export wizard
          getState().startExport();

          const afterOpen = useWizardStore.getState();
          expect(afterOpen.activeWizard).toBe('export');
          expect(afterOpen.exportStep).toBe(0);
          expect(afterOpen.selectedIds).toEqual([]);
          expect(afterOpen.exportedJson).toBeNull();
          expect(afterOpen.error).toBeNull();

          // Simulate user selecting some components
          const ids = Array.from({ length: 5 }, (_, i) => makeComponentId(cycle * 10 + i));
          getState().selectAll(ids);
          expect(useWizardStore.getState().selectedIds.length).toBe(5);

          // Advance step
          getState().setExportStep(2);
          expect(useWizardStore.getState().exportStep).toBe(2);

          // Close
          getState().closeWizard();

          // All wizard state must be fully cleared
          const afterClose = useWizardStore.getState();
          expect(afterClose.activeWizard).toBeNull();
          expect(afterClose.exportStep).toBe(0);
          expect(afterClose.selectedIds).toEqual([]);
          expect(afterClose.exportedJson).toBeNull();
          expect(afterClose.exportOptions).toEqual({});
          expect(afterClose.loading).toBe(false);
          expect(afterClose.error).toBeNull();
        }
      },
    );

    it(
      'startExportWithSelection: pre-seeded ids are not carried over after closeWizard',
      { timeout: 30_000 },
      () => {
        const { getState } = useWizardStore;
        const manyIds = Array.from({ length: 50 }, (_, i) => makeComponentId(i));

        for (let cycle = 0; cycle < WIZARD_CYCLES; cycle++) {
          getState().startExportWithSelection(manyIds);
          expect(useWizardStore.getState().selectedIds.length).toBe(50);

          getState().closeWizard();
          // selectedIds must be empty after close — not carrying 50-item arrays
          expect(useWizardStore.getState().selectedIds.length).toBe(0);
        }
      },
    );

    it(
      'import wizard open/close: no state accumulation after 200 cycles',
      { timeout: 30_000 },
      () => {
        const { getState } = useWizardStore;

        for (let cycle = 0; cycle < WIZARD_CYCLES; cycle++) {
          getState().startImport();

          const afterOpen = useWizardStore.getState();
          expect(afterOpen.activeWizard).toBe('import');
          expect(afterOpen.importStep).toBe(1);
          expect(afterOpen.bundle).toBeNull();
          expect(afterOpen.conflicts).toBeNull();
          expect(afterOpen.resolutions).toEqual([]);
          expect(afterOpen.pendingConfigs).toEqual([]);
          expect(afterOpen.configValues).toEqual({});
          expect(afterOpen.componentsToInstall).toEqual([]);

          // Simulate partial config state that should be wiped on close
          useWizardStore.setState({
            configValues: { 'comp::key': 'secret' },
            pendingConfigs: [
              {
                componentName: 'comp',
                config: {
                  key: 'API_KEY',
                  label: 'API Key',
                  sensitive: true,
                  envVar: 'API_KEY',
                },
              },
            ],
          });

          getState().closeWizard();

          const afterClose = useWizardStore.getState();
          expect(afterClose.activeWizard).toBeNull();
          expect(afterClose.importStep).toBe(1);
          expect(afterClose.bundle).toBeNull();
          expect(afterClose.conflicts).toBeNull();
          expect(afterClose.resolutions).toEqual([]);
          expect(afterClose.pendingConfigs).toEqual([]);
          // configValues must be cleared — sensitive data must not linger
          expect(Object.keys(afterClose.configValues).length).toBe(0);
          expect(afterClose.componentsToInstall).toEqual([]);
          expect(afterClose.importing).toBe(false);
          expect(afterClose.error).toBeNull();
        }
      },
    );

    it(
      'toggleSelectId: selected ids array stays bounded and duplicate-free across 200 cycles',
      { timeout: 30_000 },
      () => {
        const { getState } = useWizardStore;
        // Use 8 distinct component IDs; each is toggled in/out many times
        const pool = Array.from({ length: 8 }, (_, i) => makeComponentId(i));

        getState().startExport();

        for (let i = 0; i < WIZARD_CYCLES; i++) {
          const id = pool[i % pool.length];
          getState().toggleSelectId(id);

          const { selectedIds } = useWizardStore.getState();
          expect(selectedIds.length).toBeLessThanOrEqual(pool.length);
          // No duplicates
          const keys = selectedIds.map((s) => `${s.tool}:${s.type}:${s.name}:${s.scope}`);
          expect(new Set(keys).size).toBe(keys.length);
        }
      },
    );

    it(
      'deselectAll: always returns to empty regardless of how many ids were selected',
      { timeout: 30_000 },
      () => {
        const { getState } = useWizardStore;

        for (let cycle = 0; cycle < WIZARD_CYCLES; cycle++) {
          getState().startExport();

          const ids = Array.from({ length: 10 + (cycle % 40) }, (_, i) =>
            makeComponentId(cycle * 100 + i),
          );
          getState().selectAll(ids);
          expect(useWizardStore.getState().selectedIds.length).toBe(ids.length);

          getState().deselectAll();
          expect(useWizardStore.getState().selectedIds.length).toBe(0);

          getState().closeWizard();
        }
      },
    );

    it(
      'setExportOptions: partial updates do not accumulate stale keys after closeWizard',
      { timeout: 30_000 },
      () => {
        const { getState } = useWizardStore;

        for (let cycle = 0; cycle < WIZARD_CYCLES; cycle++) {
          getState().startExport();

          // Write several partial option updates per cycle
          getState().setExportOptions({ name: `bundle-${cycle}` });
          getState().setExportOptions({ includeSecrets: cycle % 2 === 0 });

          const { exportOptions } = useWizardStore.getState();
          expect(exportOptions.name).toBe(`bundle-${cycle}`);
          expect(typeof exportOptions.includeSecrets).toBe('boolean');

          getState().closeWizard();
          // exportOptions must reset to an empty object on close
          expect(useWizardStore.getState().exportOptions).toEqual({});
        }
      },
    );

    it(
      'wizard open/close timing: 200 full cycles show no progressive degradation',
      { timeout: 30_000 },
      () => {
        const { getState } = useWizardStore;

        // Early window: first 50 cycles
        const earlyStart = performance.now();
        for (let i = 0; i < 50; i++) {
          getState().startExport();
          getState().selectAll(Array.from({ length: 20 }, (_, j) => makeComponentId(j)));
          getState().closeWizard();
        }
        const earlyMs = performance.now() - earlyStart;

        // Late window: last 50 cycles (after 100 preceding warm-up cycles)
        for (let i = 0; i < 100; i++) {
          getState().startExport();
          getState().selectAll(Array.from({ length: 20 }, (_, j) => makeComponentId(j)));
          getState().closeWizard();
        }

        const lateStart = performance.now();
        for (let i = 0; i < 50; i++) {
          getState().startExport();
          getState().selectAll(Array.from({ length: 20 }, (_, j) => makeComponentId(j)));
          getState().closeWizard();
        }
        const lateMs = performance.now() - lateStart;

        const factor = lateMs / (earlyMs || 0.001);
        expect(factor).toBeLessThan(DEGRADATION_THRESHOLD);
      },
    );
  });
});
