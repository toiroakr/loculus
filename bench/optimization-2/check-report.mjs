import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(pathToFileURL(resolve('docs/performance-tuning.html')).href);
  assert.equal(await page.locator('#speed tbody tr').count(), 138);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.selectOption('#runtime', 'bun');
  await page.selectOption('#scope', 'compile');
  await page.selectOption('#mode', 'invalid');
  assert.equal(await page.locator('#speed tbody tr:visible').count(), 5);
  await page.locator('details summary').first().click();
  assert.equal(await page.locator('details').first().locator('pre code').count(), 3);
  await page.screenshot({ path: 'bench/optimization-2/generated/report-mobile.png' });
  console.log('Mobile report layout, filters and all-library code expansion verified.');
} finally { await browser.close(); }
