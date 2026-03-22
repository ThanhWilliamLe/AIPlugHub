/**
 * E2E tests for AI Plug Hub critical flows.
 *
 * The app reads real filesystem state (user's ~/.claude etc.).
 * All assertions are written to pass whether the user has 0 components
 * or many, and whether tools are detected or not.
 *
 * We do NOT test install/uninstall or export/import — those modify real files.
 */

import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { resolve } from 'path';

const MAIN = resolve(__dirname, '../out/main/index.js');

// ---------------------------------------------------------------------------
// Original smoke test (kept for backwards-compatibility)
// ---------------------------------------------------------------------------

test('app launches and shows title', async () => {
  const app = await electron.launch({
    args: [MAIN],
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  const title = await window.title();
  expect(title).toBe('AI Plug Hub');

  const heading = await window.textContent('h1');
  expect(heading).toBe('AI Plug Hub');

  await app.close();
});

// ---------------------------------------------------------------------------
// Critical flows — shared app instance launched once for the whole suite.
// ---------------------------------------------------------------------------

test.describe('Critical flows', () => {
  let electronApp: ElectronApplication;
  let window: Page;

  test.beforeAll(async () => {
    electronApp = await electron.launch({ args: [MAIN] });
    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Wait until either the AppShell tab bar OR the FirstRunFlow is visible —
    // both mean the app has finished its synchronous render and started async init.
    await Promise.race([
      window.waitForSelector('[role="tablist"]', { timeout: 15_000 }),
      window.waitForSelector('[data-testid="first-run"]', { timeout: 15_000 }).catch(() => null),
    ]);

    // Give async init (detectTools + scanAll) time to settle.
    // We cap at 8s; individual tests will wait for their own conditions.
    await window.waitForTimeout(3_000);
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  // -------------------------------------------------------------------------
  // Flow 1: First launch → tool detection
  // -------------------------------------------------------------------------
  test('flow 1: app shows tab bar with detected tools or first-run flow', async () => {
    // Either we see the tab bar (tools detected) or the first-run flow.
    // Both are valid outcomes depending on the user's machine.
    const tabListVisible = await window.locator('[role="tablist"]').isVisible();
    const bodyText = await window.locator('body').innerText();

    if (tabListVisible) {
      // Tab bar present — tool detection succeeded.
      await expect(window.locator('[role="tablist"]')).toContainText('My Setup');
    } else {
      // First-run flow — no tools detected. Body should still have content.
      expect(bodyText.trim().length).toBeGreaterThan(20);
    }
  });

  // -------------------------------------------------------------------------
  // Flow 2: My Setup shows components or empty state
  // -------------------------------------------------------------------------
  test('flow 2: My Setup tab shows component cards or an empty state message', async () => {
    // If first-run flow is showing, skip — there are no tabs to click.
    const tabListVisible = await window.locator('[role="tablist"]').isVisible();
    if (!tabListVisible) {
      test.skip();
      return;
    }

    // Click My Setup tab (may already be active)
    await window.locator('[role="tab"]', { hasText: 'My Setup' }).click();
    await window.waitForTimeout(500);

    // Acceptable outcomes:
    //   a) At least one ComponentCard ([role="button"] inside a tool section list)
    //   b) An empty-state message (e.g. "No AI tools found", "No components yet")
    //   c) A scanning indicator ("Scanning your tools...")
    const componentCards = window.locator('[role="list"] [role="button"]');
    const emptyStateTitles = window.locator('text=/No AI tools|No components|No matches/');
    const scanningIndicator = window.locator('text=Scanning your tools');

    const cardCount = await componentCards.count();
    const hasEmptyState = await emptyStateTitles.first().isVisible().catch(() => false);
    const isScanning = await scanningIndicator.isVisible().catch(() => false);

    expect(
      cardCount > 0 || hasEmptyState || isScanning,
      'Expected at least one component card, an empty state, or a scanning indicator',
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Flow 3: Search filters components
  // -------------------------------------------------------------------------
  test('flow 3: search input filters the component list', async () => {
    const tabListVisible = await window.locator('[role="tablist"]').isVisible();
    if (!tabListVisible) {
      test.skip();
      return;
    }

    // Navigate to My Setup
    await window.locator('[role="tab"]', { hasText: 'My Setup' }).click();
    await window.waitForTimeout(500);

    // Only proceed if there are components to search through.
    const componentCards = window.locator('[role="list"] [role="button"]');
    const initialCount = await componentCards.count();

    if (initialCount === 0) {
      // No components — search would have nothing to filter. Skip gracefully.
      test.skip();
      return;
    }

    // The SearchBar renders an <input type="search" aria-label="Search components">
    const searchInput = window.locator('[aria-label="Search components"]');
    await expect(searchInput).toBeVisible();

    // Type a query guaranteed to match nothing — we assert result changes.
    // Using a UUID-like string to avoid accidental matches.
    const nonsenseQuery = 'xyzzy-no-match-42';
    await searchInput.fill(nonsenseQuery);

    // Debounce is 200ms — wait enough for it to fire.
    await window.waitForTimeout(500);

    // After filtering: either 0 cards + "No matches" state, or fewer cards.
    const filteredCount = await componentCards.count();
    const noMatchState = window.locator('text=No matches');
    const hasNoMatchState = await noMatchState.isVisible().catch(() => false);

    expect(
      filteredCount < initialCount || hasNoMatchState,
      `Expected fewer cards (${filteredCount} < ${initialCount}) or a "No matches" state`,
    ).toBe(true);

    // Clear the search so later tests aren't affected.
    await searchInput.fill('');
    await window.waitForTimeout(300);
  });

  // -------------------------------------------------------------------------
  // Flow 4: Filter pills work
  // -------------------------------------------------------------------------
  test('flow 4: clicking a filter pill narrows the visible components', async () => {
    const tabListVisible = await window.locator('[role="tablist"]').isVisible();
    if (!tabListVisible) {
      test.skip();
      return;
    }

    await window.locator('[role="tab"]', { hasText: 'My Setup' }).click();
    await window.waitForTimeout(500);

    // FilterPills uses role="group" aria-label="Filters".
    // Buttons inside have aria-pressed attribute.
    const filtersGroup = window.locator('[role="group"][aria-label="Filters"]');
    const filtersVisible = await filtersGroup.isVisible().catch(() => false);

    if (!filtersVisible) {
      // No filter pills rendered (no components / activeTools.length === 0). Skip.
      test.skip();
      return;
    }

    const filterPills = filtersGroup.locator('button[aria-pressed]');
    const pillCount = await filterPills.count();

    if (pillCount === 0) {
      test.skip();
      return;
    }

    // Record component count before filtering
    const beforeCount = await window.locator('[role="list"] [role="button"]').count();

    // Click the first filter pill
    const firstPill = filterPills.first();
    const wasPressed = (await firstPill.getAttribute('aria-pressed')) === 'true';
    await firstPill.click();
    await window.waitForTimeout(400);

    const afterCount = await window.locator('[role="list"] [role="button"]').count();
    const noMatchState = await window.locator('text=No matches').isVisible().catch(() => false);

    if (!wasPressed) {
      // We activated a filter — count should be <= before (never more).
      expect(
        afterCount <= beforeCount || noMatchState,
        `After activating filter: expected afterCount (${afterCount}) <= beforeCount (${beforeCount})`,
      ).toBe(true);
    } else {
      // We deactivated a filter — count should be >= before.
      expect(afterCount).toBeGreaterThanOrEqual(beforeCount);
    }

    // Reset: click the same pill back to its original state.
    await firstPill.click();
    await window.waitForTimeout(400);
  });

  // -------------------------------------------------------------------------
  // Flow 5: Detail panel opens when clicking a component card
  // -------------------------------------------------------------------------
  test('flow 5: clicking a component card opens the detail panel', async () => {
    const tabListVisible = await window.locator('[role="tablist"]').isVisible();
    if (!tabListVisible) {
      test.skip();
      return;
    }

    await window.locator('[role="tab"]', { hasText: 'My Setup' }).click();
    await window.waitForTimeout(500);

    const componentCards = window.locator('[role="list"] [role="button"]');
    const cardCount = await componentCards.count();

    if (cardCount === 0) {
      // No components to click. Skip.
      test.skip();
      return;
    }

    // Click the first component card.
    const firstCard = componentCards.first();
    // Capture card text so we can assert it appears in the panel.
    const cardText = (await firstCard.innerText()).trim();
    await firstCard.click();

    // DetailPanel renders as an <aside role="dialog" aria-modal="true">
    const detailPanel = window.locator('[role="dialog"][aria-modal="true"]');
    await expect(detailPanel).toBeVisible({ timeout: 5_000 });

    // The panel h2 should contain the component's display name.
    // We take the first line of the card text as a proxy for the name.
    const componentName = cardText.split('\n')[0].trim();
    if (componentName.length > 0) {
      await expect(detailPanel.locator('h2')).toContainText(componentName, { timeout: 3_000 });
    }

    // Close the panel by pressing Escape so it doesn't interfere with later tests.
    await window.keyboard.press('Escape');
    await expect(detailPanel).not.toBeVisible({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // Flow 6: Browse tab loads
  // -------------------------------------------------------------------------
  test('flow 6: Browse tab renders marketplace content, loading state, or error state', async () => {
    const tabListVisible = await window.locator('[role="tablist"]').isVisible();
    if (!tabListVisible) {
      test.skip();
      return;
    }

    await window.locator('[role="tab"]', { hasText: 'Browse' }).click();

    // The Browse tab can show any of these valid states:
    //   a) "Loading marketplace..." (isLoading, entries.length === 0)
    //   b) BrowseResultCard entries — sort <select> is present in the toolbar
    //   c) "Couldn't reach marketplace sources" (error, entries.length === 0)
    //   d) "No plugins available" (success but empty)
    //   e) Partial-failure banner + results (error + entries.length > 0)
    //
    // Poll for any of them for up to 15 seconds.
    const indicators = [
      window.locator('text=Loading marketplace'),
      window.locator('text=Couldn\'t reach marketplace'),
      window.locator('text=No plugins available'),
      window.locator('text=No plugins match'),
      window.locator('text=Offline'),
      window.locator('[aria-label="Sort by"]'),
      // Also match if any browse result cards or search bar rendered
      window.locator('input[type="search"]'),
    ];

    let found = false;
    const deadline = Date.now() + 15_000;
    while (!found && Date.now() < deadline) {
      for (const loc of indicators) {
        if (await loc.isVisible().catch(() => false)) {
          found = true;
          break;
        }
      }
      if (!found) await window.waitForTimeout(300);
    }

    expect(found, 'Expected Browse tab to show loading, results, or an empty/error state').toBe(true);

    // Verify body has meaningful content regardless of outcome.
    const bodyText = await window.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(30);
  });

  // -------------------------------------------------------------------------
  // Flow 7: Settings overlay
  // -------------------------------------------------------------------------
  test('flow 7: settings overlay opens via gear icon and closes via Escape', async () => {
    const tabListVisible = await window.locator('[role="tablist"]').isVisible();
    if (!tabListVisible) {
      test.skip();
      return;
    }

    // Go back to My Setup to ensure the AppShell gear is visible.
    await window.locator('[role="tab"]', { hasText: 'My Setup' }).click();
    await window.waitForTimeout(300);

    const gearButton = window.locator('[aria-label="Settings"]');
    await expect(gearButton).toBeVisible({ timeout: 5_000 });

    // Open settings
    await gearButton.click();

    // SettingsOverlay renders an h1 with text "Settings"
    const settingsHeading = window.locator('h1', { hasText: 'Settings' });
    await expect(settingsHeading).toBeVisible({ timeout: 5_000 });

    // Close with Escape
    await window.keyboard.press('Escape');
    await expect(settingsHeading).not.toBeVisible({ timeout: 5_000 });
  });
});
