import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { profiles, prelude } from './fixtures.mjs';

const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const report = { date: new Date().toISOString(), sourceHash: hash('src/index.ts'), distHash: hash('dist/index.js'), fixtureHash: hash('bench/single-use/fixtures.json'), cases: {}, completed: false };
const clean = value => {
  if (value === undefined) return { $undefined: true };
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Array.isArray(value)) return value.map(clean);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, clean(value[key])]));
  return value;
};
const before = await import('./before/index.js');
for (const profile of profiles) {
  const expectedSchema = new Function('l', prelude + '\nreturn ' + profile.expressions[0])(before);
  const candidates = {};
  for (const [library, index] of [['before', 0], ['loculus', 0], ['zod', 1], ['valibot', 2]]) {
    let expression = profile.expressions[index];
    let imported = index === 0 ? `import * as l from '${library === 'before' ? './bench/single-use/before/index.js' : './dist/index.js'}';` : "import * as v from 'valibot';";
    if (library === 'zod') {
      const names = [...new Set([...expression.matchAll(/\bz\.(\w+)/g)].map(match => match[1]))];
      imported = `import {${names.map(name => `${name} as z_${name}`).join(',')}} from 'zod';`;
      expression = expression.replace(/\bz\.(\w+)/g, (_, name) => `z_${name}`);
    }
    const contents = `${imported}\n${prelude}\nexport const schema=${expression};export const validate=input=>schema['~standard'].validate(input);`;
    const result = await build({ stdin: { contents, loader: 'ts', resolveDir: resolve('.') }, bundle: true, minify: true, treeShaking: true, format: 'esm', platform: 'browser', target: 'es2022', write: false });
    const code = result.outputFiles[0].text;
    const module = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
    for (const input of profile.valid) assert.deepEqual(clean(module.validate(input).value), clean(expectedSchema['~standard'].validate(input).value), profile.id + '/' + library + '/minified-output');
    if (library === 'loculus') assert.ok(!code.includes('new Function'));
    candidates[library] = { bytes: Buffer.byteLength(code), gzipBytes: gzipSync(code).length, minifiedModuleExecuted: true };
  }
  report.cases[profile.id] = candidates;
}
assert.equal(hash('src/index.ts'), report.sourceHash);
assert.equal(hash('dist/index.js'), report.distHash);
report.scope = '107 live browser ES2022 ESM schema/Standard Schema validate consumers, production tsdown JS, esbuild minify and gzip; named Zod imports; validation on flat records. Entry normalization and parse exception wrappers excluded from size. All minified valid outputs executed and matched.';
report.completed = true;
writeFileSync('bench/single-use/bundle-results.json', JSON.stringify(report, null, 2) + '\n');
console.log('Measured 107 ordinary schemas; 428 minified modules passed output checks.');
