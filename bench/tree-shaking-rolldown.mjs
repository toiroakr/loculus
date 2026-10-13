import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sources } from './tree-shaking-fixtures.mjs';

const report = { node: process.version, bundler: 'rolldown', results: {} };
const entry = resolve('.loculus-tree-shaking-consumer.js');
const built = readFileSync('dist/index.js', 'utf8');
assert.equal((built.match(/@__NO_SIDE_EFFECTS__/g) ?? []).length, 14);
for (const minify of [false, true]) {
  const outputs = {};
  for (const [name, contents] of Object.entries(sources)) {
    const bundle = await rolldown({
      input: entry,
      platform: 'browser',
      plugins: [{
        name: 'consumer-fixture',
        resolveId(id) { if (id === entry) return entry; },
        load(id) { if (id === entry) return contents; },
      }],
    });
    let generated;
    try { generated = await bundle.generate({ format: 'esm', minify }); }
    finally { await bundle.close(); }
    assert.equal(generated.output.length, 1);
    const code = generated.output[0].code;
    outputs[name] = code;
    report.results[`${name}/${minify ? 'minified' : 'readable'}`] = {
      bytes: Buffer.byteLength(code), gzipBytes: gzipSync(code).length,
    };
    const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    if (name === 'empty' || name === 'unusedPackage') assert.equal(module.answer, 42);
    else {
      assert.deepEqual(module.validate({ name: 'hello' }).value, { name: 'hello' });
      assert.ok(module.validate({ name: 'hello', extra: true }).issues);
      assert.ok(module.validate({ name: '' }).issues);
      if (name === 'pureWithArgumentEffect') assert.equal(module.effects, 1);
    }
  }
  for (const name of ['namespace', 'unusedImports', 'pureUnusedSchema', 'pureUnusedObject', ...(minify ? ['unusedSchema', 'unusedObject'] : [])]) {
    assert.equal(Buffer.byteLength(outputs[name]), Buffer.byteLength(outputs.named), name);
  }
  assert.equal(Buffer.byteLength(outputs.unusedPackage), Buffer.byteLength(outputs.empty));
  assert.ok(!outputs.named.includes('Function('));
  if (!minify) {
    assert.ok(outputs.unusedSchema.includes('function date('));
    for (const name of ['date', 'union', 'refine', 'array', 'number', 'boolean']) {
      assert.ok(!outputs.named.includes(`function ${name}(`), name);
    }
  }
}
writeFileSync('bench/tree-shaking-rolldown-results.json', `${JSON.stringify(report, null, 2)}\n`);
console.log('Rolldown tree-shaking checks passed, including unannotated consumer construction.');
console.table(Object.fromEntries(Object.entries(report.results).filter(([name]) => name.endsWith('/minified')).map(([name, value]) => [name, value])));
