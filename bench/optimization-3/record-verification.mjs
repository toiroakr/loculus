import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from './evidence.mjs';

const read = path => JSON.parse(readFileSync(path));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const politty = '/Users/toiroakr/workspace/politty/feat/loculus-adapter';
const previous = read('bench/optimization-2/verification.json');
const sourceHash = hash('src/index.ts');
const distHash = hash('dist/index.js');
const declarationsHash = hash('dist/index.d.ts');
const nodeLog = '/tmp/loculus-opt3-node-tests.log';
const bunLog = '/tmp/loculus-opt3-bun-tests.log';
const rhfLog = '/tmp/loculus-rhf-tests.log';
const polittyLog = '/tmp/politty-loculus-opt3-tests.log';
assert.match(readFileSync(nodeLog, 'utf8'), /pass 57/);
assert.match(readFileSync(nodeLog, 'utf8'), /fail 0/);
assert.match(readFileSync(bunLog, 'utf8'), /57 pass/);
assert.match(readFileSync(bunLog, 'utf8'), /0 fail/);
assert.match(readFileSync(rhfLog, 'utf8'), /12 passed/);
assert.match(readFileSync(polittyLog, 'utf8'), /84 passed/);
assert.equal(hash(`${politty}/packages/loculus/node_modules/loculus/dist/index.js`), distHash);
assert.equal(hash(`${politty}/packages/loculus/node_modules/loculus/dist/index.d.ts`), declarationsHash);
assert.equal(hash('bench/optimization-3/before/index.d.ts'), declarationsHash);
const fixture = read(`${politty}/tests/fixtures/loculus/manifest.json`);
assert.equal(fixture.sourceSha256, sourceHash);
assert.equal(fixture.distSha256, distHash);
assert.equal(fixture.archiveSha256, hash(`${politty}/tests/fixtures/loculus/loculus-0.1.0.tgz`));
const tree = read('bench/coverage/tree-shaking-results.json');
assert.equal(tree.sourceHash, sourceHash);
assert.equal(tree.distHash, distHash);
assert.equal(tree.completed, true);
const calendar = read('bench/optimization-3/calendar-semantics-node.json');
const bunCalendar = read('bench/optimization-3/calendar-semantics-bun.json');
assert.equal(calendar.sourceHash, sourceHash);
assert.equal(bunCalendar.sourceHash, sourceHash);
assert.equal(calendar.matchedExceptPreviouslyThrown, true);
assert.equal(bunCalendar.matchedExceptPreviouslyThrown, true);
assert.equal(calendar.cases, bunCalendar.cases);
assert.equal(calendar.previouslyThrownCount, bunCalendar.previouslyThrownCount);
for (const prefix of ['', 'supplement-', 'mixed-']) for (const name of ['settled-results', 'compiled-settled-results', 'significance-results', 'compiled-significance-results']) performance(prefix + name, sourceHash);
const compilerStatistics = ['', 'supplement-', 'mixed-'].map(prefix => {
  const name = prefix + 'compiled-repeated-significance-results';
  const stats = performance(name, sourceHash);
  assert.deepEqual(stats.policy.modes, ['valid','invalid']);
  assert.ok([...stats.peer, ...stats.changes].every(row => row.mode !== 'construct'));
  const raw = `bench/optimization-3/${prefix}compiled-settled-results.json`;
  assert.equal(stats.policy.rawReportSha256, hash(raw));
  return { report: name + '.json', sha256: hash(`bench/optimization-3/${name}.json`) };
});
for (const prefix of ['supplement', 'mixed']) for (const runtime of ['node', 'bun']) {
  const parity = read(`bench/optimization-3/${prefix}-semantics-${runtime}.json`);
  assert.equal(parity.sourceHash, sourceHash);
  assert.equal(parity.completed, true);
}
const types = read('bench/optimization-3/type-results.json');
assert.equal(types.sourceHash, sourceHash);
assert.equal(types.distHash, declarationsHash);
assert.equal(types.completed, true);
assert.equal(read('bench/optimization-3/bundle-results.json').hashes.after, distHash);
const additionalBundles = read('bench/optimization-3/additional-bundle-results.json');
assert.equal(additionalBundles.sourceHash, sourceHash);
assert.equal(additionalBundles.distHash, distHash);
assert.equal(additionalBundles.completed, true);
const report = {
  completed: true, date: new Date().toISOString(), sourceHash, distHash,
  declarationsHash, declarationsIdenticalToBefore: true, versions: previous.versions,
  compilerEvaluation: { modes: ['valid','invalid'], generationExcluded: true, ordinarySingleUse: 'schema creation plus one validation, including factory cost', statistics: compilerStatistics },
  typecheck: { passed: true, log: '/tmp/loculus-opt3-typecheck.log' },
  schemaTests: { passed: 57, runtimes: ['Node 24.13.0', 'Bun 1.4.3'], logs: [nodeLog, bunLog] },
  ordinaryWorkerEquivalence: { proof: 'ordinary-worker-equivalence.json', proofHash: hash('bench/optimization-3/ordinary-worker-equivalence.json'), originalMeasuredSourceHash: performance('settled-results').environment.sourceHash },
  calendarChecks: { perRuntime: calendar.cases, fixedExceptions: calendar.previouslyThrownCount, reports: ['calendar-semantics-node.json', 'calendar-semantics-bun.json'] },
  browserTests: { ...previous.browserTests, log: rhfLog },
  polittyTests: { ...previous.polittyTests, log: polittyLog },
  treeShaking: { ...previous.treeShaking, log: '/tmp/loculus-opt3-all-trees.log' },
  logs: Object.fromEntries([nodeLog, bunLog, rhfLog, polittyLog, '/tmp/loculus-opt3-typecheck.log'].map(path => [path, hash(path)])),
};
writeFileSync('bench/optimization-3/verification.json', JSON.stringify(report, null, 2) + '\n');
const rhf = read('examples/react-hook-form/verification.json');
Object.assign(rhf, report, { runtimeIdenticalToBefore: false, typeReport: '../../bench/optimization-3/type-results.json' });
delete rhf.reportBrowserCheck;
writeFileSync('examples/react-hook-form/verification.json', JSON.stringify(rhf, null, 2) + '\n');
console.log('Final schema, integration, bundle, tree-shaking and source hashes recorded.');
