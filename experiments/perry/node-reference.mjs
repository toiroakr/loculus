import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const path = 'experiments/perry/results.json';
const report = JSON.parse(readFileSync(path, 'utf8'));
assert.equal(report.completed, true);
const records = stdout => stdout.trim().split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
const execute = (command, args) => {
  const start = performance.now();
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  return { rows: records(result.stdout), wallMs: performance.now() - start };
};
const summarize = samples => {
  const sorted = samples.slice().sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], min: sorted[0], max: sorted.at(-1), samples };
};
for (const [name, entry] of Object.entries(report.cases)) {
  const mjs = `experiments/perry/generated/${name}.mjs`;
  assert.deepEqual(readFileSync(mjs), readFileSync(`experiments/perry/generated/${name}.ts`));
  assert.deepEqual(execute(process.execPath, [mjs, 'verify']).rows, entry.probes);
  const expectedOnce = execute(process.execPath, [mjs, 'once']).rows;
  const candidates = [{ key: 'node', command: process.execPath, prefix: [mjs] }];
  for (const key of ['native', 'direct']) {
    if (entry[key].status === 'verified') candidates.push({ key, command: resolve(`experiments/perry/generated/${name}${key === 'direct' ? '-direct' : ''}`), prefix: [] });
  }
  const cold = Object.fromEntries(candidates.map(c => [c.key, []]));
  for (let i = 0; i < report.policy.coldProcesses; i++) {
    for (const c of candidates.slice(i % candidates.length).concat(candidates.slice(0, i % candidates.length))) {
      const result = execute(c.command, [...c.prefix, 'once']);
      assert.deepEqual(result.rows, expectedOnce);
      cold[c.key].push(result.wallMs);
    }
  }
  for (const c of candidates) entry[c.key].coldMs = summarize(cold[c.key]);
  for (const dataset of ['valid', 'invalid']) {
    const runs = [];
    const durations = [];
    for (let i = 0; i < report.policy.freshProcesses; i++) {
      const rows = execute(process.execPath, [mjs, dataset]).rows;
      assert.deepEqual(rows.filter(row => row.kind === 'probe'), entry.probes);
      const samples = rows.filter(row => row.kind === 'bench');
      assert.equal(samples.length, report.policy.rounds);
      const count = dataset === 'valid' ? Object.keys(entry.probes[0].value).length : entry.probes[1].issueCount;
      for (const sample of samples) assert.equal(sample.sink, (10000 + (sample.round + 1) * sample.iterations) * count);
      runs.push(samples);
      durations.push(...samples.map(sample => sample.elapsedMs * 1e6 / sample.iterations));
    }
    entry.node[dataset] = { ...summarize(durations), runs };
  }
  console.log(`Node .mjs reference and interleaved cold start refreshed: ${name}`);
}
report.policy.nodeReference = 'identical-byte prebuilt .mjs copy; no runtime TypeScript stripping';
report.policy.nodeAndColdRefreshedAt = new Date().toISOString();
writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
