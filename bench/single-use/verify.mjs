import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { profiles } from './fixtures.mjs';

const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const sourceHash = hash('src/index.ts');
const manifest = JSON.parse(readFileSync('bench/single-use/generated/manifest.json'));
const results = [];
const observedPeerDifferences = [];
for (const [runtime, bin] of [['node', process.execPath], ['bun', resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun')]]) {
  const execute = (directory, name) => {
    const result = spawnSync(bin, [resolve(directory, name + '.mjs'), 'verify'], { encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  for (const profile of profiles) {
    const expected = execute('bench/single-use/generated/before', profile.id + '-loculus');
    const current = execute('bench/single-use/generated', profile.id + '-loculus');
    assert.deepEqual(current, expected, profile.id + '/' + runtime + '/before-after');
    for (const candidate of manifest.filter(value => value.id === profile.id)) {
      const actual = candidate.library === 'loculus' ? current : execute('bench/single-use/generated', candidate.name);
      assert.deepEqual(actual.good, current.good, candidate.name + '/' + runtime + '/timed-valid-output');
      if (JSON.stringify(actual.bad) !== JSON.stringify(current.bad) || JSON.stringify(actual.probes) !== JSON.stringify(current.probes)) observedPeerDifferences.push({ runtime, id: profile.id, library: candidate.library, timed: false, actual: { bad: actual.bad, probes: actual.probes }, loculus: { bad: current.bad, probes: current.probes } });
      results.push({ runtime, name: candidate.name, timedValidOutputsMatch: true, beforeAfterMatches: candidate.library === 'loculus' });
    }
  }
}
assert.equal(hash('src/index.ts'), sourceHash);
writeFileSync('bench/single-use/semantics-results.json', JSON.stringify({ date: new Date().toISOString(), sourceHash, fixtureHash: hash('bench/single-use/fixtures.json'), referenceHash: hash('bench/cli/cf-reference.json'), results, observedPeerDifferences, completed: true }, null, 2) + '\n');
console.log('Verified 107 schemas on Node/Bun: before/after results and all timed valid outputs match. Untimed peer issue differences recorded.');
