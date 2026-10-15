import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const url = process.env.LOCULUS_DOCS_URL ?? 'http://127.0.0.1:4193';
const dir = new URL('./generated/home-check/', import.meta.url).pathname;
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true });
const findings = [];
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    const response = await page.goto(url);
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => document.getElementById('result-status').textContent === 'VALID');
    const schema = page.locator('#playground-schema');
    assert.equal(await schema.isVisible(), true);
    const contrasts = await page.locator('.schema-side .twinkleplop .tok, .code-panel .twinkleplop .tok').evaluateAll(tokens => {
      const luminance = color => {
        const rgb = color.match(/[\d.]+/g).slice(0, 3).map(value => {
          const channel = Number(value) / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      return tokens.map(token => {
        const foreground = luminance(getComputedStyle(token).color);
        const background = luminance(getComputedStyle(token.closest('.schema-side, .code-panel')).backgroundColor);
        return { text: token.textContent, ratio: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05) };
      });
    });
    for (const { text, ratio } of contrasts) assert.ok(ratio >= 4.5, `Schema token ${JSON.stringify(text)} has insufficient contrast: ${ratio.toFixed(2)}:1`);
    await page.locator('.schema-side').screenshot({ path: dir + width + '-schema.png' });
    const hero = await page.locator('#hero-code').textContent();
    const keyword = page.locator('#hero-code .keyword').first();
    const string = page.locator('#hero-code .string').first();
    assert.notEqual(await keyword.evaluate(el => getComputedStyle(el).color), await string.evaluate(el => getComputedStyle(el).color));
    assert.equal((await schema.textContent()).replace(/\s/g, ''), hero.slice(0, hero.indexOf('\n\nconst params')).replace(/\s/g, ''));
    const result = async () => JSON.parse(await page.locator('#result-output').textContent());
    assert.deepEqual(await result(), { q: 'loculus', page: 2, draft: false, tag: ['docs', 'code'] });
    assert.ok(await page.locator('#result-output .tok').count());
    const unsafe = '<img src=x onerror="alert(1)"> & <script>';
    await page.locator('#query-input').fill(new URLSearchParams({ q: unsafe }).toString());
    assert.equal((await result()).q, unsafe);
    assert.equal(await page.locator('#result-output img, #result-output script, #raw-output img, #raw-output script').count(), 0);
    await page.getByRole('button', { name: 'Defaults', exact: true }).click();
    assert.deepEqual(await result(), { q: 'loculus', page: 1, draft: false });
    for (const [label, path] of [['Empty number', ['page']], ['Unknown key', ['paeg']], ['Repeated number', ['page']]]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      assert.equal(await page.locator('#result-status').textContent(), 'ERROR');
      assert.deepEqual((await result()).issues[0].path, path);
    }
    await page.locator('#query-input').fill('q=%20hello%20&draft=0&tag=docs');
    assert.deepEqual(await result(), { q: 'hello', page: 1, draft: false, tag: ['docs'] });
    await page.locator('#query-input').fill('q=&page=0&draft=yes');
    assert.deepEqual((await result()).issues.map(x => x.path), [['q'], ['page'], ['draft']]);
    await page.getByRole('button', { name: 'Valid', exact: true }).click();
    await page.locator('[data-copy="hero-code"]').click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /import \* as l from 'loculus'/);
    await page.locator('[data-copy="playground-schema"]').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await schema.textContent());
    await page.locator('#playground').scrollIntoViewIfNeeded();
    await page.screenshot({ path: dir + width + '-playground.png' });
    await page.getByRole('navigation').getByRole('link', { name: 'Limits', exact: true }).click();
    assert.equal(new URL(page.url()).hash, '#limits');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, 'Document must fit viewport');
    for (const href of await page.locator('a[href]').evaluateAll(links => links.map(x => x.getAttribute('href')))) {
      if (href.startsWith('#') && href.length > 1) assert.equal(await page.locator(href).count(), 1);
      if (!href.startsWith('#') && !href.startsWith('http')) assert.equal((await context.request.get(new URL(href, url).href)).status(), 200);
    }
    await page.locator('a[href="compatibility.html"]').first().click();
    await page.getByRole('heading', { name: 'Compatibility with Zod and Valibot', exact: true }).waitFor();
    const profile = page.locator('main > details').first();
    await profile.locator('summary').first().click();
    assert.equal(await profile.locator('.codes').isVisible(), true);
    assert.ok(await profile.locator('.codes .function').count());
    await profile.getByText('Node inputs, outputs, and issue paths', { exact: true }).click();
    assert.ok(await profile.locator('details .string').count());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('result-status').textContent === 'VALID');
    await page.locator('a[href="rhf.html"]').click();
    await page.waitForFunction(() => document.querySelector('input') !== null);
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('result-status').textContent === 'VALID');
    await page.screenshot({ path: dir + width + '-top.png' });
    await page.screenshot({ path: dir + width + '-full.png', fullPage: true });
    assert.deepEqual(errors, []);
    findings.push({ width, cases: ['visible matching schema', 'playground schema clipboard', 'valid conversion', 'defaults', 'empty number', 'unknown key', 'repeated scalar', 'trim and scalar wrapping', 'sibling errors', 'clipboard', 'navigation', 'local links', 'compatibility profiles render', 'RHF demo loads', 'no document overflow', 'no browser errors'] });
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(dir + 'verification.json', JSON.stringify({ completed: true, url, findings }, null, 2) + '\n');
console.log('Documentation homepage verified on desktop and mobile, including actual runtime conversion and error cases.');
