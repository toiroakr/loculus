import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {median, runtimeMetrics, metricSet} from './metrics.mjs';
import {benchmarkSummary} from './summary.mjs';

export function collect(dir) {
  const read = file => JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'));
  const json = (file, value) => writeFileSync(`${dir}/${file}`, JSON.stringify(value, null, 2) + '\n');
  const report = read('prepared.json');
  const {protocol, environment, fingerprint} = report;
  report.workers = {};
  for (const runtime of ['node', 'bun']) {
    report.workers[runtime] = [];
    for (let pass = 0; pass < protocol.processes; pass++) {
      const shard = read(`${runtime}-${pass}.json`);
      assert.equal(shard.fingerprint, fingerprint, 'Benchmark fingerprint differs');
      assert.equal(shard.pass, pass, 'Benchmark pass differs');
      assert.equal(shard.environment.runtime, runtime, 'Benchmark runtime differs');
      assert.equal(shard.environment.version, environment[runtime], 'Runtime version differs');
      assert.equal(shard.environment.platform, environment.platform, 'Runner platform differs');
      assert.equal(shard.environment.arch, environment.arch, 'Runner architecture differs');
      report.workers[runtime].push(shard.environment);
      for (const item of report.cases) for (const library of Object.keys(item.bundle)) for (const mode of protocol.modes) {
        const measurement = shard.measurements[item.id + '/' + library]?.[mode];
        assert.ok(measurement && Number.isFinite(measurement.median) && measurement.median >= 0, 'Missing or invalid measurement');
        assert.equal(measurement.samples.length, protocol.rounds, 'Incomplete measurement rounds');
        assert.ok(measurement.samples.every(value => Number.isFinite(value) && value >= 0), 'Invalid measurement round');
        (item.runtime[runtime][library][mode] ??= []).push(measurement);
      }
    }
  }
  report.completed = true;
  json('results.json', report);
  const metadata = {protocol: JSON.stringify(protocol), environment: JSON.stringify(environment), workers: JSON.stringify(report.workers), fixtures: fingerprint};
  for (const runtime of ['node', 'bun']) json(`metrics-${runtime}.json`, metricSet(`runtime-${runtime}-${fingerprint}`, `${runtime} validation: Loculus`, {...metadata, interpretation: 'Lower is better; geometric mean of per-case process-median latency; Loculus and generated only; observational, no statistical gate'}, runtimeMetrics(report, runtime)));
  const sizes = report.cases.filter(item => ['scalar-string-basic', 'cli-git-clone-full', 'cli-cf-deploy-sparse', 'supplement-rhf-items-10'].includes(item.id)).flatMap(item => Object.entries(item.bundle).filter(([library]) => library === 'loculus' || library === 'generated').flatMap(([library, sizes]) => Object.entries(sizes).map(([unit, value]) => ({key: `${item.id}/${library}/${unit}`, name: `${item.id} / ${library} / ${unit}`, value, unit: 'B'}))));
  json('metrics-size.json', metricSet(`size-${fingerprint}`, 'Browser ESM bundles', metadata, sizes));
  const types = Object.entries(report.types).filter(([library]) => library === 'loculus').flatMap(([library, samples]) => ['wallMs', 'checkSeconds', 'instantiations', 'memoryKiB'].map(key => ({key: `${library}/${key}`, name: `${library} / ${key}`, value: median(samples.map(sample => sample[key])), unit: {wallMs: 'ms', checkSeconds: 's', memoryKiB: 'KiB'}[key] ?? 'count'})));
  json('metrics-types.json', metricSet(`types-${fingerprint}`, 'TypeScript input/output inference', metadata, types));
  const summary = benchmarkSummary(report);
  writeFileSync(`${dir}/summary.md`, summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log('Benchmark reports and octocov custom metrics written to ' + dir);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) collect(resolve('bench/ci/generated'));
