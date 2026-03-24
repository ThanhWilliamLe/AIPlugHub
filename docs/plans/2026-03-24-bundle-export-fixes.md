# Bundle Export Fixes — Marketplace URLs, .claude/ Scanning, Strip Paths

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 gaps in the .aibundle export: add marketplace repo URLs for re-download, scan `.claude/` subdirectory so 40 plugins stop exporting as "unknown", and strip local install paths from the bundle.

**Architecture:** The plugin is the atomic install unit — sub-components are informational only. The bundle is a reference manifest (not a self-contained archive). The importer uses marketplace repo URLs to re-download plugins.

**Tech Stack:** TypeScript, Vitest, Electron IPC

---

### Task 1: Add `marketplaceSource` to `PortablePlugin` type

**Files:**
- Modify: `7A-app/src/shared/types/bundles.ts:50-58`

- [ ] **Step 1: Add marketplaceSource field to PortablePlugin**

```typescript
export type PortablePlugin = {
  pluginKey: string;
  pluginName: string;
  marketplace: string;
  version?: string;
  enabled: boolean;
  author?: { name: string; email?: string; url?: string };
  /** Marketplace source URL — used by importer to re-download the plugin */
  marketplaceSource?: { sourceId: string; url: string };
  components: PortableComponent[];
};
```

- [ ] **Step 2: Verify types compile**

Run: `cd 7A-app && npx tsc --noEmit`
Expected: no new errors (field is optional, so existing code is unaffected)

- [ ] **Step 3: Commit**

```bash
git add 7A-app/src/shared/types/bundles.ts
git commit -m "feat(types): add marketplaceSource to PortablePlugin for re-download URLs"
```

---

### Task 2: Pass marketplace sources into `buildBundle` and populate `marketplaceSource`

**Files:**
- Modify: `7A-app/src/main/bundle/export-builder.ts:109-164` (buildBundle)
- Modify: `7A-app/src/main/ipc/handlers.ts:424-454` (bundles:export handler)
- Test: `7A-app/src/main/__tests__/export-builder.test.ts`

**Key assumption:** The `marketplace` field on plugin extensions (e.g., `'claude-code-workflows'`) matches the `sourceId` from `MarketplaceSourceConfig`. This is true by construction — both are derived from the `name@marketplace` key format in `installed_plugins.json` and the marketplace source registry. Verified in the existing adapter test (line 1163: `marketplace: 'claude-code-workflows'`) and IPC handler (line 841: `marketplace.getSources()` returns configs keyed by the same `sourceId`).

- [ ] **Step 1: Write failing test — marketplace source on plugin**

In `export-builder.test.ts`, add to the "plugin grouping (R1)" describe block:

```typescript
it('populates marketplaceSource on plugin from marketplace sources map', () => {
  const components = [makePluginComponent(pluginSkillId)];
  const marketplaceSources = new Map([
    ['workflows', { sourceId: 'workflows', url: 'https://github.com/wshobson/agents' }],
  ]);
  const bundle = buildBundle([pluginSkillId], components, {}, marketplaceSources);

  expect(bundle.plugins[0].marketplaceSource).toEqual({
    sourceId: 'workflows',
    url: 'https://github.com/wshobson/agents',
  });
});

it('omits marketplaceSource when marketplace not in sources map', () => {
  const components = [makePluginComponent(pluginSkillId)];
  const bundle = buildBundle([pluginSkillId], components, {});

  expect(bundle.plugins[0].marketplaceSource).toBeUndefined();
});

it('omits marketplaceSource when plugin has empty marketplace string', () => {
  const emptyMktId: ComponentId = {
    tool: 'claude-code',
    type: 'skill',
    name: 'local-plugin/my-skill',
    scope: 'plugin',
  };
  const comp = makeComponent({
    id: emptyMktId,
    extensions: {
      pluginKey: 'local-plugin',
      pluginName: 'local-plugin',
      marketplace: '',
      pluginVersion: '1.0.0',
      pluginEnabled: true,
    },
    core: { description: 'test', content: '# test' },
  });
  const marketplaceSources = new Map([
    ['', { sourceId: '', url: 'https://should-not-match.com' }],
  ]);
  const bundle = buildBundle([emptyMktId], [comp], {}, marketplaceSources);
  expect(bundle.plugins[0].marketplaceSource).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 7A-app && npx vitest run src/main/__tests__/export-builder.test.ts`
Expected: FAIL — `buildBundle` doesn't accept 4th argument yet

- [ ] **Step 3: Add optional `marketplaceSources` parameter to `buildBundle`**

In `export-builder.ts`, change the signature and add lookup logic:

```typescript
export function buildBundle(
  selectedIds: ComponentId[],
  allComponents: Component[],
  options: ExportOptions,
  marketplaceSources?: Map<string, { sourceId: string; url: string }>,
): Bundle {
```

Then **replace the entire plugin mapping block** (lines 154-164) with this:

```typescript
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
```

This is a full replacement of the existing block, not an additive patch. The only structural change is extracting `marketplace` to a local const and adding the `marketplaceSource` lookup after building the plugin object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd 7A-app && npx vitest run src/main/__tests__/export-builder.test.ts`
Expected: ALL PASS (existing tests still pass because new param is optional)

- [ ] **Step 5: Wire marketplace sources in IPC handler**

In `handlers.ts` bundles:export handler (line ~446), fetch sources and pass to buildBundle:

```typescript
  // Fetch marketplace source URLs for bundle portability
  let marketplaceSources: Map<string, { sourceId: string; url: string }> | undefined;
  try {
    const sources = await marketplace.getSources();
    marketplaceSources = new Map(
      sources.map((s) => [s.sourceId, { sourceId: s.sourceId, url: s.url }]),
    );
  } catch {
    // Non-fatal — bundle works without source URLs, just less portable
  }

  const bundle = buildBundle(componentIds, allComponents, exportOptions, marketplaceSources);
```

- [ ] **Step 6: Run full test suite**

Run: `cd 7A-app && npx vitest run`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add 7A-app/src/main/bundle/export-builder.ts 7A-app/src/main/ipc/handlers.ts 7A-app/src/main/__tests__/export-builder.test.ts
git commit -m "feat(export): populate marketplace source URLs on plugins for portable re-download"
```

---

### Task 3: Scan `.claude/` subdirectory for plugin sub-components

**Files:**
- Modify: `7A-app/src/main/adapters/claude-code-adapter.ts:514-516, 559, 592`
- Test: `7A-app/src/main/__tests__/claude-code-adapter.test.ts`

- [ ] **Step 1: Write failing test — skills in `.claude/` subdirectory**

In `claude-code-adapter.test.ts`, inside the `ClaudeCodeAdapter.scanPlugins` describe block (which uses the shared `beforeEach`/`afterEach` that creates and cleans a fresh `rootPath` per test), add:

```typescript
it('discovers sub-components in .claude/ subdirectory', async () => {
  const pluginsDir = join(rootPath, 'plugins');
  await mkdir(pluginsDir, { recursive: true });

  // Plugin with .claude/skills/ instead of skills/
  const installDir = join(pluginsDir, 'cache', 'impeccable@impeccable');
  await mkdir(join(installDir, '.claude', 'skills', 'polish'), { recursive: true });
  await writeFile(
    join(installDir, '.claude', 'skills', 'polish', 'SKILL.md'),
    '---\nname: polish\ndescription: Final polish pass\n---\nPolish the UI',
  );

  await mkdir(join(installDir, '.claude', 'commands'), { recursive: true });
  await writeFile(
    join(installDir, '.claude', 'commands', 'audit.md'),
    '---\nname: audit\ndescription: Run audit\n---\nAudit everything',
  );

  await mkdir(join(installDir, '.claude', 'agents'), { recursive: true });
  await writeFile(
    join(installDir, '.claude', 'agents', 'reviewer.md'),
    '---\nname: reviewer\ndescription: Review agent\n---\nYou review code.',
  );

  await writeFile(
    join(pluginsDir, 'installed_plugins.json'),
    JSON.stringify({
      plugins: {
        'impeccable@impeccable': [
          {
            scope: 'user',
            installPath: installDir,
            version: '1.5.1',
            installedAt: '2026-01-01T00:00:00Z',
            lastUpdated: '2026-01-01T00:00:00Z',
          },
        ],
      },
    }),
  );

  const components = await adapter.scan();
  const impeccable = components.filter(
    (c) => c.id.scope === 'plugin' && c.id.name.startsWith('impeccable@impeccable/'),
  );

  expect(impeccable.length).toBe(3);
  const types = impeccable.map((c) => c.id.type).sort();
  expect(types).toEqual(['agent', 'command', 'skill']);

  // Should NOT produce an "unknown" placeholder
  const placeholder = components.find(
    (c) => c.id.name === 'impeccable@impeccable' && c.id.type === 'unknown',
  );
  expect(placeholder).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 7A-app && npx vitest run src/main/__tests__/claude-code-adapter.test.ts -t "discovers sub-components in .claude/ subdirectory"`
Expected: FAIL — finds 0 components, gets "unknown" placeholder instead

- [ ] **Step 3: Add `.claude/` fallback to scanPluginSubComponents**

In `claude-code-adapter.ts`, at the top of `scanPluginSubComponents` (after line 504), add a helper to resolve paths with fallback:

```typescript
    // Resolve component subdirectory — check installPath first, then .claude/ subdirectory
    async function resolveSubdir(subdir: string): Promise<string | null> {
      const direct = join(installPath, subdir);
      if (await isDir(direct).catch(() => false)) return direct;
      const dotClaude = join(installPath, '.claude', subdir);
      if (await isDir(dotClaude).catch(() => false)) return dotClaude;
      return null;
    }
```

Then replace the 3 hardcoded paths:

Line 515: `const skillsPath = join(installPath, 'skills');`
→ `const skillsPath = await resolveSubdir('skills');`

Line 559: `const commandsPath = join(installPath, 'commands');`
→ `const commandsPath = await resolveSubdir('commands');`

Line 592: `const agentsPath = join(installPath, 'agents');`
→ `const agentsPath = await resolveSubdir('agents');`

And update each scan block to skip when `null`:

```typescript
    // Scan skills subdirectory
    const skillsPath = await resolveSubdir('skills');
    if (skillsPath) {
      try {
        const entries = await configIO.listDir(skillsPath);
        // ... rest of existing logic unchanged, just remove the old try/catch wrapper
```

Same pattern for commands and agents blocks. **Important:** preserve the existing glob filter arguments:
- Commands uses `configIO.listDir(commandsPath, '*.md')` — keep the `'*.md'` filter
- Agents uses `configIO.listDir(agentsPath, '*.md')` — keep the `'*.md'` filter
- Skills uses `configIO.listDir(skillsPath)` — no filter (scans directories, not files)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd 7A-app && npx vitest run src/main/__tests__/claude-code-adapter.test.ts`
Expected: ALL PASS including new test

- [ ] **Step 5: Write test — direct path takes priority over `.claude/`**

```typescript
it('prefers direct skills/ over .claude/skills/ when both exist', async () => {
  const pluginsDir = join(rootPath, 'plugins');
  await mkdir(pluginsDir, { recursive: true });

  const installDir = join(pluginsDir, 'cache', 'dual-plugin@mp');

  // Both direct and .claude/ have skills
  await mkdir(join(installDir, 'skills', 'direct-skill'), { recursive: true });
  await writeFile(
    join(installDir, 'skills', 'direct-skill', 'SKILL.md'),
    '---\nname: direct-skill\ndescription: From direct\n---\nDirect',
  );
  await mkdir(join(installDir, '.claude', 'skills', 'dotclaude-skill'), { recursive: true });
  await writeFile(
    join(installDir, '.claude', 'skills', 'dotclaude-skill', 'SKILL.md'),
    '---\nname: dotclaude-skill\ndescription: From .claude\n---\nDotClaude',
  );

  await writeFile(
    join(pluginsDir, 'installed_plugins.json'),
    JSON.stringify({
      plugins: {
        'dual-plugin@mp': [
          {
            scope: 'user',
            installPath: installDir,
            version: '1.0.0',
            installedAt: '2026-01-01T00:00:00Z',
            lastUpdated: '2026-01-01T00:00:00Z',
          },
        ],
      },
    }),
  );

  const components = await adapter.scan();
  const skills = components.filter(
    (c) => c.id.scope === 'plugin' && c.id.type === 'skill' && c.id.name.startsWith('dual-plugin@mp/'),
  );

  // Direct path wins — only sees 'direct-skill', not 'dotclaude-skill'
  expect(skills).toHaveLength(1);
  expect(skills[0].id.name).toBe('dual-plugin@mp/direct-skill');
});
```

- [ ] **Step 6: Run all adapter tests**

Run: `cd 7A-app && npx vitest run src/main/__tests__/claude-code-adapter.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add 7A-app/src/main/adapters/claude-code-adapter.ts 7A-app/src/main/__tests__/claude-code-adapter.test.ts
git commit -m "feat(scanner): scan .claude/ subdirectory for plugin skills/commands/agents"
```

---

### Task 4: Strip install paths from unknown placeholder core

**Files:**
- Modify: `7A-app/src/main/adapters/claude-code-adapter.ts:817-819`
- Test: `7A-app/src/main/__tests__/claude-code-adapter.test.ts`

- [ ] **Step 1: Write failing test — placeholder should not contain rawConfig**

In `claude-code-adapter.test.ts`, add after the existing placeholder test:

```typescript
it('placeholder core does not contain install path or rawConfig', async () => {
  const pluginsDir = join(rootPath, 'plugins');
  await mkdir(pluginsDir, { recursive: true });

  const emptyInstall = join(pluginsDir, 'cache', 'bare-plugin@mp');
  await mkdir(emptyInstall, { recursive: true });

  await writeFile(
    join(pluginsDir, 'installed_plugins.json'),
    JSON.stringify({
      plugins: {
        'bare-plugin@mp': [
          {
            scope: 'user',
            installPath: emptyInstall,
            version: '0.1.0',
            installedAt: '2026-01-01T00:00:00Z',
            lastUpdated: '2026-01-01T00:00:00Z',
          },
        ],
      },
    }),
  );

  const components = await adapter.scan();
  const placeholder = components.find(
    (c) => c.id.name === 'bare-plugin@mp' && c.id.type === 'unknown',
  );
  expect(placeholder).toBeDefined();

  // Core should NOT contain rawConfig (which has installPath)
  const core = placeholder!.core as Record<string, unknown>;
  expect(core.rawConfig).toBeUndefined();
  expect(core.rawTypeName).toBe('plugin');
  expect(JSON.stringify(core)).not.toContain('installPath');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 7A-app && npx vitest run src/main/__tests__/claude-code-adapter.test.ts -t "placeholder core does not contain install path"`
Expected: FAIL — `rawConfig` is present with `installPath`

- [ ] **Step 3: Remove rawConfig from placeholder core**

In `claude-code-adapter.ts` line 819, change:

```typescript
              core: { rawConfig: entry, rawTypeName: 'plugin' },
```

to:

```typescript
              core: { rawTypeName: 'plugin' },
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd 7A-app && npx vitest run src/main/__tests__/claude-code-adapter.test.ts`
Expected: ALL PASS

Note: The existing test at line 1169 ("creates placeholder for plugin with no sub-components") checks that the placeholder exists with `type === 'unknown'` and `version === '0.1.0'` but does NOT assert on `rawConfig`, so it should still pass.

- [ ] **Step 5: Commit**

```bash
git add 7A-app/src/main/adapters/claude-code-adapter.ts 7A-app/src/main/__tests__/claude-code-adapter.test.ts
git commit -m "fix(scanner): strip install paths from plugin placeholder — no local paths in bundles"
```

---

### Task 5: Full regression and manual verification

- [ ] **Step 1: Run full test suite**

Run: `cd 7A-app && npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Build the app**

Run: `cd 7A-app && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Manual smoke test**

Launch the app, export a bundle, and verify:
1. Plugins have `marketplaceSource` with repo URLs
2. Plugins that were "unknown" (impeccable, everything-claude-code) now show sub-components
3. No `installPath` or `rawConfig` appears anywhere in the bundle JSON

- [ ] **Step 4: Final commit with all changes**

If any fixups were needed, commit them:

```bash
git commit -m "chore: bundle export fixes — marketplace URLs, .claude/ scanning, strip paths"
```
