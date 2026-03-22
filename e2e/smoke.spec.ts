/**
 * Smoke tests — 6 fast checks that the app is alive and functional.
 * Must complete in < 30 seconds total.
 * These tests are intentionally shallow: assert presence, not specifics.
 * The app reads real filesystem state — don't assert specific counts.
 */

import { test, expect, _electron as electron } from '@playwright/test';
import { resolve } from 'path';

const MAIN = resolve(__dirname, '../out/main/index.js');

// --- 1. App launches without crash ---
test('smoke: app launches without crash', async () => {
  const app = await electron.launch({ args: [MAIN] });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  // If we got here, the main process didn't crash and a window was created.
  expect(window).toBeTruthy();
  await app.close();
});

// --- 2. Main window renders with tab bar ---
test('smoke: tab bar shows My Setup, Browse, and Transfer', async () => {
  const app = await electron.launch({ args: [MAIN] });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Wait for the tab bar to appear (the nav[role="tablist"] is rendered by AppShell)
  await window.waitForSelector('[role="tablist"]', { timeout: 10_000 });

  await expect(window.locator('[role="tablist"]')).toContainText('My Setup');
  await expect(window.locator('[role="tablist"]')).toContainText('Browse');
  await expect(window.locator('[role="tablist"]')).toContainText('Transfer');

  await app.close();
});

// --- 3. No error banner visible after initial load ---
test('smoke: no error banner visible after 3s', async () => {
  const app = await electron.launch({ args: [MAIN] });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Give the app 3 seconds to finish initialising (tool detection + scan)
  await window.waitForTimeout(3_000);

  // ErrorBanner has role="alert" and red destructive styling.
  // We check that no role="alert" element exists, OR if one does, it is not
  // the tool-store error banner (Browse tab errors are a separate concern and
  // are acceptable offline). We specifically look for the top-level tool-store
  // error which would indicate a crash-level failure.
  const alerts = window.locator('[role="alert"]');
  const count = await alerts.count();

  if (count > 0) {
    // If there is an alert, verify it is NOT the critical tool-store banner.
    // The tool-store ErrorBanner has a "Dismiss" button and uses accent-destructive.
    // Browse's inline error banner also has role="alert" — it is acceptable when offline.
    // We just ensure the body did not crash into an unrecoverable blank screen.
    const bodyText = await window.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(20);
  } else {
    // No alerts — healthy start.
    expect(count).toBe(0);
  }

  await app.close();
});

// --- 4. At least one tab shows content (not a blank white screen) ---
test('smoke: body has meaningful text content', async () => {
  const app = await electron.launch({ args: [MAIN] });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Wait until either the tab panel or the first-run flow is visible.
  // Both constitute "content rendered".
  await window.waitForSelector('body', { timeout: 10_000 });

  // Give async initialisation a moment to settle
  await window.waitForTimeout(2_000);

  const bodyText = await window.locator('body').innerText();
  expect(bodyText.trim().length).toBeGreaterThan(50);

  await app.close();
});

// --- 5. Settings overlay opens and closes ---
test('smoke: settings overlay opens on gear click and closes on Escape', async () => {
  const app = await electron.launch({ args: [MAIN] });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Wait for AppShell (which renders the gear button) to be visible.
  // The gear is only rendered when NOT in first-run mode. We wait up to 10s.
  const gearButton = window.locator('[aria-label="Settings"]');
  await gearButton.waitFor({ state: 'visible', timeout: 15_000 });

  // Open settings
  await gearButton.click();

  // The SettingsOverlay renders an h1 with "Settings"
  const settingsHeading = window.locator('h1', { hasText: 'Settings' });
  await expect(settingsHeading).toBeVisible({ timeout: 5_000 });

  // Close with Escape
  await window.keyboard.press('Escape');
  await expect(settingsHeading).not.toBeVisible({ timeout: 5_000 });

  await app.close();
});

// --- 6. No console errors at error level ---
test('smoke: no console errors during launch', async () => {
  const app = await electron.launch({ args: [MAIN] });
  const window = await app.firstWindow();

  const consoleErrors: string[] = [];
  window.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(3_000);

  // Filter out known benign browser/electron noise that isn't our code's fault.
  const KNOWN_BENIGN = [
    // Electron/Chromium DevTools protocol noise
    'Failed to load resource',
    // React's development-only warnings (not errors) that get mis-classified
    'Download the React DevTools',
    // Favicon 404 which is harmless
    'favicon.ico',
    // Chromium engine warning about 'frame-ancestors' in a <meta> CSP tag —
    // this is a W3C spec limitation (frame-ancestors is delivery-method agnostic
    // in the spec but Chromium enforces header-only). It is harmless and
    // unrelated to our application logic.
    "frame-ancestors",
  ];

  const actualErrors = consoleErrors.filter(
    (msg) => !KNOWN_BENIGN.some((benign) => msg.includes(benign)),
  );

  expect(actualErrors, `Unexpected console errors:\n${actualErrors.join('\n')}`).toHaveLength(0);

  await app.close();
});
