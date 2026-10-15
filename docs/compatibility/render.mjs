import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { highlightBlock, syntaxCSS } from '../highlight.mjs';
import { format } from 'prettier';

const read = file => JSON.parse(readFileSync(file, 'utf8'));
const node = read('docs/generated/compatibility/node.json');
const bun = read('docs/generated/compatibility/bun.json');
assert.ok(node.completed && bun.completed);
assert.equal(node.unmatched.length + bun.unmatched.length, 0);
assert.equal(node.profiles, bun.profiles);
assert.equal(node.cells, bun.cells);
assert.deepEqual(node.sourceHashes, bun.sourceHashes);
for (const [file, expected] of Object.entries(node.sourceHashes)) {
  assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), expected);
}
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const code = highlightBlock;
const observations = rows => JSON.stringify(rows.map(({ index, jitless, input, results, matches }) => ({ index, jitless, input, results, matches })), null, 2);
const profiles = [];
for (const id of new Set(node.results.map(row => row.profile))) {
  const rows = node.results.filter(row => row.profile === id);
  const schemas = await Promise.all(rows[0].code.map(source => format(source, {
    parser: 'typescript', printWidth: 36, tabWidth: 2, singleQuote: true,
  })));
  profiles.push(`<details><summary>${escape(id)} · ${rows.length} comparisons per runtime</summary>
<div class="codes">${['Loculus', 'Zod', 'Valibot'].map((name, index) => `<section><h3>${name}</h3>${code(schemas[index])}</section>`).join('')}</div>
<details><summary>Node inputs, outputs, and issue paths</summary>${code(observations(rows), 'json')}</details>
<details><summary>Bun inputs, outputs, and issue paths</summary>${code(observations(bun.results.filter(row => row.profile === id)), 'json')}</details></details>`);
}
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Loculus compatibility</title><link rel="icon" href="assets/mark.svg"><style>
:root{font-family:system-ui,sans-serif;color:#1d302a;background:#f6f5ef;line-height:1.75}*{box-sizing:border-box}body{margin:0}main{max-width:1100px;margin:auto;padding:32px 20px 80px}h1{font-size:clamp(28px,5vw,42px);line-height:1.3}h2{margin-top:36px}a{color:#235e46}details,.summary{background:white;border:1px solid #dbdfd5;border-radius:10px;padding:16px;margin:14px 0;min-width:0}summary{cursor:pointer;font-weight:650;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 ui-monospace,monospace;background:#edf1e8;padding:14px;border-radius:6px}.codes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.codes section{min-width:0}small{color:#65746d}@media(max-width:700px){.codes{grid-template-columns:1fr}main{padding:20px 14px 60px}}
${syntaxCSS}</style></head><body><main>
<a href="./">← Loculus documentation</a><h1>Compatibility with Zod and Valibot</h1>
<p>Generated from the current runtime and shared API fixtures. Zod ${escape(node.versions.zod)} / Valibot ${escape(node.versions.valibot)}.</p>
<div class="summary"><strong>${node.profiles} profiles · ${node.cells} comparisons per runtime · no unmatched acceptance/output cases</strong>
<p>${escape(node.runtime)} / ${escape(bun.runtime)}. Each input runs with Zod JIT enabled and disabled. Loculus acceptance and successful output must match at least one explicitly configured peer for every case.</p></div>
<h2>Scope and limits</h2>
<p>Fixtures compose equivalent numeric and boolean conversions, scalar wrapping, presence, and defaults. These are explicit peer configurations, rather than claims that the libraries have identical defaults.</p>
<p>Issue paths are recorded, but error wording, codes, and union error structures are specific to each library. The audit does not establish equivalence for every possible input or unsupported schema mutation, and it makes no performance claim.</p>
<p>Native comparisons and generated-mode regressions are also covered by <code>test/compatibility.test.ts</code> and <code>test/rolldown.test.ts</code>. The working form has its own desktop and mobile browser tests.</p>
<h2>Schemas and observed results</h2>${profiles.join('\n')}
<h2>Reproduce</h2>${code('pnpm test\npnpm typecheck\npnpm test:rhf\npnpm docs:build', 'bash')}
<p>Raw audit results are generated locally under <code>docs/generated/compatibility/</code>. The build rejects incomplete or stale evidence.</p>
<details><summary>Source hashes</summary>${code(JSON.stringify(node.sourceHashes, null, 2), 'json')}</details>
<p><a href="https://github.com/toiroakr/loculus">Source repository</a> · <a href="https://standardschema.dev/">Standard Schema</a></p>
</main></body></html>`;
mkdirSync('docs/site', { recursive: true });
writeFileSync('docs/site/compatibility.html', html);
console.log(`Rendered ${node.profiles} compatibility profiles from current Node and Bun audits.`);
