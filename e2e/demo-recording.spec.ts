/**
 * Demo recording v3 — tighter story, no dead frames.
 * Sequence: My Setup (overview) → Scroll to show Gemini+Antigravity → Browse → Detail panel → Selection mode → Settings
 */

import { test, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { resolve } from 'path';

const MAIN = resolve(__dirname, '../out/main/index.js');
const FRAMES_DIR = resolve(__dirname, '../../6A-marketing/screenshots/demo-frames');

let app: ElectronApplication;
let page: Page;
let frameIndex = 0;

async function captureFrame(label: string) {
  await page.screenshot({
    path: resolve(FRAMES_DIR, `${String(frameIndex).padStart(3, '0')}-${label}.png`),
    fullPage: false,
  });
  frameIndex++;
}

async function wait(ms: number) {
  await page.waitForTimeout(ms);
}

test('record demo v3', async () => {
  app = await electron.launch({ args: [MAIN] });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await wait(3000);

  // --- 1. My Setup overview (lead with value) ---
  await captureFrame('my-setup-overview');

  // --- 2. Click Gemini CLI + Antigravity filter pills to show cross-tool view ---
  let filtersClicked = false;
  try {
    const geminiPill = page.getByText(/Gemini CLI/i).first();
    await geminiPill.click({ timeout: 2000 });
    await wait(400);
    const antigravityPill = page.getByText(/Antigravity/i).first();
    await antigravityPill.click({ timeout: 2000 });
    await wait(500);
    filtersClicked = true;
    await captureFrame('cross-tool-filtered');
    // Clear: click Clear link or re-click pills
    const clearLink = page.getByText('Clear');
    if (await clearLink.isVisible().catch(() => false)) {
      await clearLink.click();
    } else {
      await geminiPill.click().catch(() => {});
      await wait(100);
      await antigravityPill.click().catch(() => {});
    }
    await wait(300);
  } catch {
    await captureFrame('my-setup-fallback');
  }

  // --- 3. Browse marketplace ---
  const browseTab = page.getByRole('tab', { name: /browse/i });
  if (await browseTab.isVisible()) {
    await browseTab.click();
    await wait(4000);
    await captureFrame('browse-marketplace');
  }

  // --- 4. Click on a plugin to show detail panel ---
  // Click on the first browse result card to open detail
  const browseCard = page.locator('[class*="cursor-pointer"]').first();
  if (await browseCard.isVisible().catch(() => false)) {
    await browseCard.click();
    await wait(800);
    await captureFrame('detail-panel');
    await page.keyboard.press('Escape');
    await wait(300);
  }

  // --- 5. Selection mode with bulk actions ---
  const mySetupTab = page.getByRole('tab', { name: /my setup/i });
  if (await mySetupTab.isVisible()) {
    await mySetupTab.click();
    await wait(500);
    const selectBtn = page.getByRole('button', { name: /select/i });
    if (await selectBtn.isVisible().catch(() => false)) {
      await selectBtn.click();
      await wait(500);
      // Select several plugins
      const checkboxes = page.locator('input[type="checkbox"]');
      const count = await checkboxes.count();
      for (let i = 0; i < Math.min(5, count); i++) {
        const cb = checkboxes.nth(i);
        if (await cb.isVisible().catch(() => false)) {
          await cb.click();
          await wait(100);
        }
      }
      await wait(300);
      await captureFrame('bulk-select-export');
      await page.keyboard.press('Escape');
      await wait(300);
    }
  }

  // --- 6. Settings (tool detection — close the loop) ---
  let settingsClicked = false;
  for (const selector of [
    '[data-testid="settings-button"]',
    'button[aria-label*="settings" i]',
    'button[aria-label*="Settings"]',
  ]) {
    const btn = page.locator(selector);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      settingsClicked = true;
      break;
    }
  }
  if (!settingsClicked) {
    const gearBtn = page.getByRole('button', { name: /settings/i });
    if (await gearBtn.isVisible().catch(() => false)) {
      await gearBtn.click();
      settingsClicked = true;
    }
  }
  if (settingsClicked) {
    await wait(500);
    await captureFrame('settings-detected');
  }

  await app.close();
});
