import { rolldown } from 'rolldown';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = root + 'docs/site/';
await mkdir(output + 'assets', { recursive: true });
const bundle = await rolldown({ input: root + 'dist/index.js', platform: 'browser', treeshake: true });
try {
  await bundle.write({ dir: output + 'assets', entryFileNames: 'validator.js', format: 'esm', minify: true });
} finally { await bundle.close(); }
await copyFile(root + 'README.md', output + 'README.md');
await writeFile(output + 'compatibility.html', (await readFile(root + 'docs/compatibility.html', 'utf8')).replace('</head>', '<link rel="icon" href="assets/mark.svg"></head>'));
await writeFile(output + 'rhf.html', (await readFile(root + 'examples/react-hook-form/generated/index.html', 'utf8')).replace('</head>', '<link rel="icon" href="assets/mark.svg"></head>'));
const files = ['src/index.ts', 'src/rolldown.ts', 'dist/index.js'];
const sourceHashes = {};
for (const file of files) sourceHashes[file] = createHash('sha256').update(await readFile(root + file)).digest('hex');
const bunAudit = JSON.parse(await readFile(root + 'bench/guarantees/compatibility-audit-bun.json', 'utf8'));
const audit = JSON.parse(await readFile(root + 'bench/guarantees/compatibility-audit.json', 'utf8'));
for (const file of files) if (sourceHashes[file] !== audit.sourceHashes[file]) throw new Error('Compatibility evidence is stale: ' + file);
if (!audit.completed || !bunAudit.completed || audit.unmatched.length || bunAudit.unmatched.length || audit.profiles !== bunAudit.profiles || audit.cells !== bunAudit.cells) throw new Error('Incomplete compatibility evidence');
for (const file of files) if (sourceHashes[file] !== bunAudit.sourceHashes[file]) throw new Error('Bun compatibility evidence is stale: ' + file);
await writeFile(output + 'evidence.json', JSON.stringify({ evaluatedOn: '2026-10-13', packageVersion: '0.1.0', sourceHashes, compatibility: { profiles: audit.profiles, cellsPerRuntime: audit.cells, versions: audit.versions, runtimes: [audit.runtime, bunAudit.runtime], acceptanceAndOutputMatch: 'at least one explicitly configured/composed peer', completeInputCoverage: false }, performance: { currentContractRemeasured: false } }, null, 2) + '\n');
console.log('Built documentation homepage with current runtime and matching compatibility evidence.');
