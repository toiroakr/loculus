import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const libraries = ['loculus-compiled', 'zod-compiled'];
const hashes = Object.fromEntries(['src/index.ts', 'dist/index.js', 'bench/lifecycle-worker.mjs', 'bench/lifecycle-fixtures.mjs', 'bench/url-confirmation.mjs'].map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const records = Object.fromEntries(libraries.map(library => [library, { processes: [] }]));
for (let round = 0; round < 10; round++) {
  for (const library of round % 2 ? libraries.toReversed() : libraries) {
    records[library].processes.push(JSON.parse(execFileSync(process.execPath, ['bench/lifecycle-worker.mjs', 'url', library, 'valid', 'repeated'], { encoding: 'utf8' })));
  }
}
function summary(values) {
  const sorted = values.toSorted((a, b) => a - b);
  return { median: (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2, p10: sorted[Math.floor((sorted.length - 1) * .1)], p90: sorted[Math.ceil((sorted.length - 1) * .9)] };
}
for (const record of Object.values(records)) record.summary = Object.fromEntries(['validation', 'withInput'].map(metric => [metric, {
  rounds: summary(record.processes.flatMap(process => process.repeated[metric])),
  processes: summary(record.processes.map(process => summary(process.repeated[metric]).median)),
}]));
for (const [file, hash] of Object.entries(hashes)) if (hash !== createHash('sha256').update(readFileSync(file)).digest('hex')) throw new Error(`Measured file changed: ${file}`);
const report = { date: new Date().toISOString(), node: process.version, protocol: 'Same valid URL fixture and shared normalization as lifecycle; 10 fresh processes per library, alternating order; each process has 10000 warmup and 7 rounds of 50000 operations. Rounds within a process are correlated; both round and process medians are reported.', hashes, libraries: records };
writeFileSync('bench/url-confirmation-results.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(libraries.map(library => [library, records[library].summary])), null, 2));
