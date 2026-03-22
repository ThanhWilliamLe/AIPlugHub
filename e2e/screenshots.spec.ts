/**
 * Screenshot capture script for marketing materials.
 * Captures key app views and saves to 6A-marketing/screenshots/
 */

import { test, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { resolve } from 'path';

const MAIN = resolve(__dirname, '../out/main/index.js');
const SCREENSHOTS_DIR = resolve(__dirname, '../../6A-marketing/screenshots');

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [MAIN],
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  // Wait for boot sequence to complete
  await page.waitForTimeout(3000);
});

test.afterAll(async () => {
  await app.close();
});

test('capture my-setup-tab', async () => {
  // Click My Setup tab if not already there
  const mySetupTab = page.getByRole('tab', { name: /my setup/i });
  if (await mySetupTab.isVisible()) {
    await mySetupTab.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({
    path: resolve(SCREENSHOTS_DIR, 'my-setup-tab.png'),
    fullPage: false,
  });
});

test('capture detail-panel', async () => {
  // Click the first component card (role="button") to open detail panel
  const card = page.locator('div[role="button"]').first();
  if (await card.isVisible()) {
    await card.click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, 'detail-panel.png'),
      fullPage: false,
    });
    // Close detail panel
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
});

test('capture browse-tab', async () => {
  const browseTab = page.getByRole('tab', { name: /browse/i });
  if (await browseTab.isVisible()) {
    await browseTab.click();
    await page.waitForTimeout(5000); // Allow marketplace to fully load
    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, 'browse-tab.png'),
      fullPage: false,
    });
  }
});

test('capture transfer-tab', async () => {
  const transferTab = page.getByRole('tab', { name: /transfer/i });
  if (await transferTab.isVisible()) {
    await transferTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: resolve(SCREENSHOTS_DIR, 'transfer-tab.png'),
      fullPage: false,
    });
  }
});

test('capture settings', async () => {
  // Click settings gear
  const settingsBtn = page.locator('[data-testid="settings-button"]');
  if (!(await settingsBtn.isVisible())) {
    // Try aria label
    const gearBtn = page.getByRole('button', { name: /settings/i });
    if (await gearBtn.isVisible()) {
      await gearBtn.click();
    }
  } else {
    await settingsBtn.click();
  }
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(SCREENSHOTS_DIR, 'settings.png'),
    fullPage: false,
  });
  // Close settings
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
});
