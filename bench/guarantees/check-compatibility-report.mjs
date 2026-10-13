import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';

const file = 'docs/compatibility.html';
const browser = await chromium.launch({channel: 'chrome', headless: true});
const widths = [390, 1280];
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of widths) {
    await page.setViewportSize({width, height: 900});
    await page.goto(pathToFileURL(resolve(file)).href);
    assert.equal(await page.locator('.decision').count(), 14);
    assert.equal(await page.locator('.fixture').count(), 98);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: `bench/guarantees/generated/compatibility-${width}.png`});
    await page.locator('.fixture').first().locator('summary').first().click();
    assert.equal(await page.locator('.fixture').first().locator('.codes section').count(), 3);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('.fixture').first().scrollIntoViewIfNeeded();
    await page.screenshot({path: `bench/guarantees/generated/compatibility-code-${width}.png`});
  }
  assert.deepEqual(errors, []);
  writeFileSync('bench/guarantees/compatibility-verification.json', JSON.stringify({completed: true, scope: 'Browser rendering and code-example layout only; runtime, type and integration checks are separate commands.', widths, decisions: 14, profiles: 96, htmlHash: createHash('sha256').update(readFileSync(file)).digest('hex')}, null, 2) + '\n');
} finally {await browser.close();}
console.log('Verified mobile/desktop layout and three-library code examples');
