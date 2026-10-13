import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const directory = 'experiments/perry/generated';
const environment = { ...process.env, PERRY_RUNTIME_DIR: process.env.PERRY_RUNTIME_DIR ?? resolve(`${directory}/runtime`) };
const report = {};
for (const library of ['loculus', 'valibot']) {
  const name = `${library}-unicode`;
  let source = readFileSync(`${directory}/${library}-strings-3.ts`, 'utf8');
  const start = source.indexOf('var probes =');
  assert.ok(start >= 0);
  const end = source.indexOf(';', start) + 1;
  const probes = [50, 51].map(count => ({ f0: '😀'.repeat(count), f1: 'hello', f2: 'hello' }));
  source = source.slice(0, start) + `var probes = ${JSON.stringify(probes)};` + source.slice(end);
  writeFileSync(`${directory}/${name}.ts`, source);
  const compiled = spawnSync('perry', ['compile', `${directory}/${name}.ts`, '-o', `${directory}/${name}`, '--no-codegen'], { env: environment, encoding: 'utf8', timeout: 180000 });
  assert.equal(compiled.status, 0, compiled.stderr);
  report[name] = {};
  for (const runtime of ['node', 'perry']) {
    const command = runtime === 'node' ? process.execPath : resolve(`${directory}/${name}`);
    const args = runtime === 'node' ? [`${directory}/${name}.ts`, 'verify'] : ['verify'];
    const result = spawnSync(command, args, { env: environment, encoding: 'utf8', timeout: 15000 });
    report[name][runtime] = { exit: result.status, rows: result.stdout.trim().split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line)), stderr: result.stderr };
  }
  assert.deepEqual(report[name].perry, report[name].node);
  assert.deepEqual(report[name].perry.rows.map(row => row.ok), [true, false]);
  report[name].matches = true;
}
writeFileSync('experiments/perry/unicode-results.json', `${JSON.stringify(report, null, 2)}\n`);
console.log('UTF-16 length boundary checks passed for loculus and Valibot on Node and Perry.');
