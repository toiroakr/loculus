import { rolldown } from 'rolldown';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const site = new URL('./site/', import.meta.url);
const output = new URL('./generated/pr-preview/', import.meta.url);
await mkdir(output, { recursive: true });
const icon = 'data:image/svg+xml;base64,' + (await readFile(new URL('assets/mark.svg', site))).toString('base64');
const escapeAttribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const inlineIcon = html => html.replaceAll('href="assets/mark.svg"', `href="${icon}"`).replaceAll('src="assets/mark.svg"', `src="${icon}"`);

const compatibility = inlineIcon(await readFile(new URL('compatibility.html', site), 'utf8'));
const backUrl = process.env.PREVIEW_BACK_URL;
await writeFile(new URL('compatibility.html', output), backUrl
  ? compatibility.replace('href="./">← Loculus documentation', `href="${escapeAttribute(backUrl)}" target="_blank" rel="noopener noreferrer">← Pull request preview links`)
  : compatibility.replace('href="./"', 'href="index.html"'));
await writeFile(new URL('rhf.html', output), inlineIcon(await readFile(new URL('rhf.html', site), 'utf8')));

const bundle = await rolldown({ input: fileURLToPath(new URL('assets/app.js', site)), platform: 'browser' });
let javascript;
try {
  const generated = await bundle.generate({ format: 'iife', minify: true });
  if (generated.output.length !== 1) throw new Error('Preview must contain a single JavaScript bundle');
  javascript = generated.output[0].code.replaceAll('</script', '<\\/script');
} finally { await bundle.close(); }
const css = (await readFile(new URL('assets/style.css', site), 'utf8')).replaceAll('</style', '<\\/style');
let homepage = inlineIcon(await readFile(new URL('index.html', site), 'utf8'))
  .replace('<link rel="stylesheet" href="assets/style.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="assets/app.js"></script>', '')
  .replace('</body>', () => `<script>${javascript}</script></body>`);
for (const [file, url] of [
  ['compatibility.html', process.env.COMPATIBILITY_PREVIEW_URL],
  ['rhf.html', process.env.FORM_PREVIEW_URL],
]) {
  if (url) homepage = homepage.replaceAll(`href="${file}"`, `href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer"`);
}
await writeFile(new URL('index.html', output), homepage);
console.log('Built standalone HTML previews for the site, compatibility report, and form.');
