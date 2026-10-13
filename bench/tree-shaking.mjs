import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

import { sources } from './tree-shaking-fixtures.mjs';

const report = { node: process.version, bundler: 'esbuild', results: {} };
for (const minify of [false, true]) {
  const outputs = {};
  for (const [name, contents] of Object.entries(sources)) {
    const result = await build({
      stdin: { contents, resolveDir: process.cwd(), sourcefile: 'consumer.js' },
      bundle: true, treeShaking: true, minify, format: 'esm', platform: 'browser',
      target: 'es2022', write: false, metafile: true,
    });
    const code = result.outputFiles[0].text;
    outputs[name] = code;
    report.results[`${name}/${minify ? 'minified' : 'readable'}`] = {
      bytes: Buffer.byteLength(code), gzipBytes: gzipSync(code).length,
      inputs: Object.keys(result.metafile.inputs),
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
  if (minify) assert.equal(Buffer.byteLength(outputs.unusedImports), Buffer.byteLength(outputs.named));
  else assert.equal(outputs.unusedImports, outputs.named);
  for (const name of ['pureUnusedSchema', 'pureUnusedObject']) {
    if (minify) assert.equal(Buffer.byteLength(outputs[name]), Buffer.byteLength(outputs.named));
    else assert.equal(outputs[name], outputs.named);
  }
  if (minify) assert.equal(Buffer.byteLength(outputs.unusedPackage), Buffer.byteLength(outputs.empty));
  else assert.equal(outputs.unusedPackage, outputs.empty);
  assert.ok(!outputs.named.includes('new Function'));
  if (!minify) {
    for (const name of ['date', 'union', 'refine', 'array', 'number', 'boolean']) {
      assert.ok(!outputs.named.includes(`function ${name}(`), `${name} remained in the string-only bundle`);
    }
    assert.ok(outputs.unusedSchema.includes('function date('));
    assert.ok(report.results['named/readable'].inputs.some(path => path.endsWith('dist/index.js')));
  }
}
writeFileSync('bench/tree-shaking-results.json', `${JSON.stringify(report, null, 2)}\n`);
console.log('Tree-shaking checks passed (readable and minified browser ESM; published dist entry).');
console.table(Object.fromEntries(Object.entries(report.results).filter(([name]) => name.endsWith('/minified')).map(([name, value]) => [name, { bytes: value.bytes, gzipBytes: value.gzipBytes }])));
