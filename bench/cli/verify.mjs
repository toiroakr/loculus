import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { profiles } from './fixtures.mjs';

const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const sourceHash = hash('src/index.ts');
const manifest = JSON.parse(readFileSync('bench/cli/generated/manifest.json'));
const results = [];
for (const [runtime, bin] of [['node', process.execPath], ['bun', resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun')]]) {
  const execute = name => {
    const result = spawnSync(bin, [resolve('bench/cli/generated', name + '.mjs'), 'verify'], { encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  for (const profile of profiles) {
    const expected = execute(profile.id + '-loculus');
    assert.deepEqual(expected.good, profile.expectedValid.map(value => ({ ok: true, value })), profile.id + '/independent-output');
    assert.deepEqual(expected.bad, profile.invalid.map(() => ({ ok: false, issueCount: 1, issuePaths: [[profile.badKey]] })), profile.id + '/independent-errors');
    for (const candidate of manifest.filter(value => value.id === profile.id)) {
      assert.deepEqual(execute(candidate.name), expected, candidate.name + '/' + runtime);
      results.push({ runtime, name: candidate.name, outputIssueCountPathsMatch: true });
    }
  }
}
assert.equal(hash('src/index.ts'), sourceHash);
writeFileSync('bench/cli/semantics-results.json', JSON.stringify({ date: new Date().toISOString(), sourceHash, fixturesHash: hash('bench/cli/fixtures.mjs'), referenceHash: hash('bench/cli/cf-reference.json'), results, completed: true }, null, 2) + '\n');
console.log('Verified ' + results.length + ' workers on Node and Bun against matching output, issue counts and paths.');
