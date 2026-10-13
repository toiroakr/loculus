import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { sources } from '../../bench/tree-shaking-fixtures.mjs';

const bun = process.env.BUN_BIN ?? 'bun';
const directory = 'experiments/bun/generated';
const report = { bun: spawnSync(bun, ['--version'], { encoding: 'utf8' }).stdout.trim(), cases: {} };
for (const [name, source] of Object.entries(sources)) {
  const input = `${directory}/tree-${name}.ts`;
  const output = `${directory}/tree-${name}.js`;
  writeFileSync(input, source.replaceAll("'loculus'", "'../../../dist/index.js'"));
  const built = spawnSync(bun, ['build', '--target', 'browser', '--minify', input, '--outfile', output], { encoding: 'utf8' });
  assert.equal(built.status, 0, built.stderr);
  const bytes = readFileSync(output);
  const module = await import(resolve(output));
  if (name === 'empty' || name === 'unusedPackage') assert.equal(module.answer, 42);
  else {
    assert.deepEqual(module.validate({ name: 'hello', extra: 'strip' }).value, { name: 'hello' });
    assert.equal(module.validate({ name: '' }).issues.length, 1);
    if (name === 'pureWithArgumentEffect') assert.equal(module.effects, 1);
  }
  report.cases[name] = { bytes: bytes.length, gzipBytes: gzipSync(bytes).length, code: bytes.toString() };
}
const bytes = name => report.cases[name].bytes;
assert.equal(bytes('unusedPackage'), bytes('empty'));
for (const name of ['namespace', 'unusedImports', 'pureUnusedSchema', 'pureUnusedObject']) assert.equal(bytes(name), bytes('named'));
report.factoryAnnotationEliminatesUnusedSchema = bytes('unusedSchema') === bytes('named');
report.factoryAnnotationEliminatesUnusedObject = bytes('unusedObject') === bytes('named');
report.completed = true;
writeFileSync('experiments/bun/tree-shaking-results.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ bun: report.bun, cases: Object.fromEntries(Object.entries(report.cases).map(([name, r]) => [name, r.bytes])), annotationSchema: report.factoryAnnotationEliminatesUnusedSchema, annotationObject: report.factoryAnnotationEliminatesUnusedObject }));
