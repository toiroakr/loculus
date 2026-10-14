import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, rmSync, unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collect} from '../bench/ci/collect.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'loculus-shards-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const write = (name, value) => writeFileSync(join(dir, name), JSON.stringify(value));
  const read = name => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  const libraries = ['loculus', 'generated', 'zod', 'valibot'];
  write('prepared.json', {
    completed: false, fingerprint: 'fixture', environment: {node: 'v24', bun: '1.4.3', platform: 'linux', arch: 'x64'},
    protocol: {processes: 5, rounds: 2, modes: ['valid']},
    cases: [{id: 'scalar-string-basic', group: 'scalars', bundle: Object.fromEntries(libraries.map(library => [library, {bytes: 100, gzipBytes: 50}])), runtime: {node: Object.fromEntries(libraries.map(library => [library, {}])), bun: Object.fromEntries(libraries.map(library => [library, {}]))}}],
    types: Object.fromEntries(['loculus', 'zod', 'valibot'].map(library => [library, [{wallMs: 10, checkSeconds: 0.01, instantiations: 100, memoryKiB: 1000}]])),
  });
  for (const runtime of ['node', 'bun']) for (let pass = 0; pass < 5; pass++) write(`${runtime}-${pass}.json`, {
    fingerprint: 'fixture', pass,
    environment: {runtime, version: runtime === 'node' ? 'v24' : '1.4.3', platform: 'linux', arch: 'x64', cpu: `cpu-${pass}`},
    measurements: Object.fromEntries(libraries.map(library => [`scalar-string-basic/${library}`, {valid: {median: [9, 1, 3, 2, 100][pass], samples: [1, 2]}}])),
  });
  return {dir, read, write};
}

test('all ten shards retain five samples per runtime and use the process median', t => {
  const {dir, read} = fixture(t);
  const report = collect(dir);
  assert.equal(report.completed, true);
  for (const runtime of ['node', 'bun']) {
    assert.deepEqual(report.cases[0].runtime[runtime].loculus.valid.map(sample => sample.median), [9, 1, 3, 2, 100]);
    assert.deepEqual(report.workers[runtime].map(worker => worker.cpu), ['cpu-0', 'cpu-1', 'cpu-2', 'cpu-3', 'cpu-4']);
    assert.ok(Math.abs(read(`metrics-${runtime}.json`).metrics[0].value - 3) < 1e-10);
  }
  assert.ok(readFileSync(join(dir, 'summary.md'), 'utf8').includes('| scalar-string-basic | valid | 3.0 | 3.0 | 3.0 | 3.0 |'));
  assert.deepEqual(collect(dir), report);
});

test('a missing shard prevents publication', t => {
  const {dir} = fixture(t);
  unlinkSync(join(dir, 'bun-4.json'));
  assert.throws(() => collect(dir), /ENOENT/);
  assert.throws(() => readFileSync(join(dir, 'results.json')), /ENOENT/);
});

for (const [name, change] of [
  ['fingerprint', shard => {shard.fingerprint = 'other';}],
  ['pass', shard => {shard.pass = 3;}],
  ['runtime', shard => {shard.environment.runtime = 'bun';}],
  ['version', shard => {shard.environment.version = 'v25';}],
  ['platform', shard => {shard.environment.platform = 'darwin';}],
  ['architecture', shard => {shard.environment.arch = 'arm64';}],
  ['missing measurement', shard => {delete shard.measurements['scalar-string-basic/loculus'];}],
  ['invalid latency', shard => {shard.measurements['scalar-string-basic/loculus'].valid.median = null;}],
  ['incomplete rounds', shard => {shard.measurements['scalar-string-basic/loculus'].valid.samples.pop();}],
]) test(`reject ${name} before publishing`, t => {
  const {dir, read, write} = fixture(t);
  const shard = read('node-0.json');
  change(shard);
  write('node-0.json', shard);
  assert.throws(() => collect(dir));
  assert.throws(() => readFileSync(join(dir, 'results.json')), /ENOENT/);
});
