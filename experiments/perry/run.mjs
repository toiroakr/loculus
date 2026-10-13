import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';

const directory = 'experiments/perry/generated';
const fixtures = JSON.parse(readFileSync(`${directory}/fixtures.json`, 'utf8'));
const environment = { ...process.env, PERRY_RUNTIME_DIR: process.env.PERRY_RUNTIME_DIR ?? resolve(`${directory}/runtime`) };
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const sourceHash = hash('src/index.ts');
const baselineBuild = spawnSync('perry', ['compile', `${directory}/baseline.ts`, '-o', `${directory}/baseline`, '--no-codegen'], { env: environment, encoding: 'utf8', timeout: 180000 });
writeFileSync(`${directory}/baseline-build.log`, baselineBuild.stdout + baselineBuild.stderr);
assert.equal(baselineBuild.status, 0, baselineBuild.stderr);
const report = {
  environment: { date: new Date().toISOString(), node: process.version, perry: spawnSync('perry', ['--version'], { encoding: 'utf8' }).stdout.trim(), versions: Object.fromEntries(['zod', 'valibot', 'esbuild'].map(name => [name, JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version])), platform: process.platform, arch: process.arch, cpu: cpus()[0].model, sourceHash, distHash: hash('dist/index.js'), runtimeManifest: JSON.parse(readFileSync(`${environment.PERRY_RUNTIME_DIR}/manifest.json`, 'utf8')) },
  policy: { zodJitless: true, nodeReference: 'identical-byte prebuilt .mjs copy; no runtime TypeScript stripping', rounds: 7, freshProcesses: 3, coldProcesses: 15, warmup: 10000, datasets: ['valid', 'invalid'], modes: ['single-file-native', 'direct-import'], coldScope: 'process launch, imports/init, schema construction, first valid validation, JSON output and exit', binarySizeScope: 'standalone Mach-O including prebuilt Perry runtime; no workspace runtime size optimization' },
  baseline: { bytes: statSync(`${directory}/baseline`).size, gzipBytes: gzipSync(readFileSync(`${directory}/baseline`)).length },
  cases: {},
};
const records = stdout => stdout.trim().split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
const execute = (command, args, timeout = 30000) => {
  const start = performance.now();
  const result = spawnSync(command, args, { encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024, env: environment });
  return { ...result, wallMs: performance.now() - start };
};
const summarize = samples => {
  const sorted = samples.slice().sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], min: sorted[0], max: sorted.at(-1), samples };
};
const persist = () => writeFileSync('experiments/perry/results.json', `${JSON.stringify(report, null, 2)}\n`);
for (const fixture of fixtures) {
  const nodeFile = `${directory}/${fixture.name}.mjs`;
  const nodeVerify = execute(process.execPath, [nodeFile, 'verify']);
  assert.equal(nodeVerify.status, 0, nodeVerify.stderr);
  const golden = records(nodeVerify.stdout);
  assert.equal(golden.length, fixture.probeCount);
  const once = execute(process.execPath, [nodeFile, 'once']);
  const expectedOnce = records(once.stdout);
  assert.equal(expectedOnce[0].ok, true);
  report.cases[fixture.name] = { fixture, sourceHash: hash(nodeFile), probes: golden, node: {} };
  const entry = report.cases[fixture.name];
  for (const direct of [false, true]) {
    const name = `${fixture.name}${direct ? '-direct' : ''}`;
    const source = `${directory}/${name}.ts`;
    const output = resolve(`${directory}/${name}`);
    const args = ['compile', source, '-o', output, '--no-codegen'];
    console.log(`Building ${name}`);
    const compiled = execute('perry', args, 180000);
    writeFileSync(`${directory}/${name}-build.log`, compiled.stdout + compiled.stderr);
    const candidate = { mode: direct ? 'direct-import' : 'single-file-native', command: ['perry', ...args], sourceHash: hash(source), buildStatus: compiled.status, buildSignal: compiled.signal, buildMs: compiled.wallMs, diagnostics: (compiled.stdout + compiled.stderr).slice(-8000) };
    entry[direct ? 'direct' : 'native'] = candidate;
    if (compiled.status !== 0) { candidate.status = 'build-failed'; persist(); continue; }
    candidate.bytes = statSync(output).size;
    candidate.gzipBytes = gzipSync(readFileSync(output)).length;
    candidate.binaryHash = hash(output);
    candidate.file = execute('file', [output]).stdout.trim();
    candidate.linkedLibraries = execute('otool', ['-L', output]).stdout;
    const verified = execute(output, ['verify']);
    candidate.verifyExit = verified.status;
    candidate.verifySignal = verified.signal;
    candidate.verifyStdout = verified.stdout;
    candidate.verifyStderr = verified.stderr;
    try {
      assert.equal(verified.status, 0);
      assert.deepEqual(records(verified.stdout), golden);
      const cold = execute(output, ['once']);
      assert.equal(cold.status, 0);
      assert.deepEqual(records(cold.stdout), expectedOnce);
      candidate.status = 'verified';
    } catch (error) {
      candidate.status = 'semantic-or-runtime-failure';
      candidate.verificationError = String(error).slice(0, 2000);
    }
    console.log(`${name}: ${candidate.status}; ${candidate.bytes} bytes`);
    persist();
  }
}
console.log('All builds finished; measuring sequentially.');
for (const fixture of fixtures) {
  const entry = report.cases[fixture.name];
  const candidates = [{ key: 'node', command: process.execPath, prefix: [`${directory}/${fixture.name}.mjs`] }];
  for (const key of ['native', 'direct']) {
    if (entry[key].status === 'verified') candidates.push({ key, command: resolve(`${directory}/${fixture.name}${key === 'direct' ? '-direct' : ''}`), prefix: [] });
  }
  const cold = Object.fromEntries(candidates.map(c => [c.key, []]));
  for (let i = 0; i < report.policy.coldProcesses; i++) {
    for (const c of candidates.slice(i % candidates.length).concat(candidates.slice(0, i % candidates.length))) {
      const result = execute(c.command, [...c.prefix, 'once']);
      assert.equal(result.status, 0, result.stderr);
      cold[c.key].push(result.wallMs);
    }
  }
  for (const c of candidates) entry[c.key].coldMs = summarize(cold[c.key]);
  for (const dataset of ['valid', 'invalid']) {
    const durations = Object.fromEntries(candidates.map(c => [c.key, []]));
    const runs = Object.fromEntries(candidates.map(c => [c.key, []]));
    for (let i = 0; i < report.policy.freshProcesses; i++) {
      for (const c of candidates.slice(i % candidates.length).concat(candidates.slice(0, i % candidates.length))) {
        console.log(`Measuring ${fixture.name}/${c.key}/${dataset}/${i + 1}`);
        const result = execute(c.command, [...c.prefix, dataset], 120000);
        if (result.status !== 0) {
          entry[c.key].measurementFailure = { dataset, exit: result.status, signal: result.signal, stderr: result.stderr };
          continue;
        }
        const rows = records(result.stdout);
        assert.deepEqual(rows.filter(row => row.kind === 'probe'), entry.probes);
        const samples = rows.filter(row => row.kind === 'bench');
        assert.equal(samples.length, report.policy.rounds);
        for (const sample of samples) {
          assert.ok(sample.elapsedMs > 0 && sample.iterations > 0);
          const expectedCount = dataset === 'valid' ? Object.keys(entry.probes[0].value).length : entry.probes[1].issueCount;
          assert.equal(sample.sink, (10000 + (sample.round + 1) * sample.iterations) * expectedCount);
        }
        runs[c.key].push(samples);
        durations[c.key].push(...samples.map(sample => sample.elapsedMs * 1e6 / sample.iterations));
      }
    }
    for (const c of candidates) {
      entry[c.key][dataset] = { ...summarize(durations[c.key]), runs: runs[c.key] };
    }
    persist();
  }
}
assert.equal(hash('src/index.ts'), sourceHash, 'Source changed during the benchmark');
report.completed = true;
persist();
console.log('Perry comparison finished: experiments/perry/results.json');
