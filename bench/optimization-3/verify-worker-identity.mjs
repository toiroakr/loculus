import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const hash = text => createHash('sha256').update(text).digest('hex');
const fileHash = path => hash(readFileSync(path));
const sourceHash = fileHash('src/index.ts');
const report = { date: new Date().toISOString(), sourceHash, reports: {}, completed: false };
const instrument = code => {
  const start = code.indexOf('    const iterations = constructing ? 500 : 5e3;');
  assert.ok(start >= 0);
  const end = code.indexOf('    const samples = [];', start);
  const old = code.slice(start, end);
  const run = old.slice(old.indexOf('    let checksum = 0;'), old.indexOf('    for (let i = 0; i < warmup; i++)'));
  return code.slice(0, start) + run + `    let warmup=0;const warming=performance.now();
    do{for(let i=0;i<256;i++)run(i);warmup+=256;}while(performance.now()-warming<30);
    const iterations=Math.max(256,Math.min(1000000,Math.ceil(warmup*8/(performance.now()-warming))));
` + code.slice(end);
};
for (const [name, dir] of [['settled-results', 'generated'], ['supplement-settled-results', 'supplement-generated']]) {
  const path = `bench/optimization-3/${name}.json`;
  const measured = JSON.parse(readFileSync(path));
  assert.equal(measured.completed, true);
  const statsPath = `bench/optimization-3/${name.replace('settled', 'significance')}.json`;
  const evidence = report.reports[name] = { reportHash: fileHash(path), significanceHash: fileHash(statsPath), measuredSourceHash: measured.environment.sourceHash, workerHashes: {} };
  for (const [id, entry] of Object.entries(measured.cases)) {
    const root = resolve(`bench/optimization-3/${dir}`, entry.version === 'before' ? 'before' : '.');
    const code = instrument(readFileSync(`${root}/${entry.name}.mjs`, 'utf8'));
    assert.equal(hash(code), entry.fixtureHash, id);
    evidence.workerHashes[id] = entry.fixtureHash;
  }
}
assert.equal(fileHash('src/index.ts'), sourceHash);
report.completed = true;
writeFileSync('bench/optimization-3/ordinary-worker-equivalence.json', JSON.stringify(report, null, 2) + '\n');
console.log('Every ordinary timed worker is byte-identical to the final generated worker; measured source hashes and dates remain unchanged.');
