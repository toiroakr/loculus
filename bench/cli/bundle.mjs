import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { profiles, prelude } from './fixtures.mjs';
import { behaviorProbes } from './behavior-probes.mjs';

const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const report = {
  date: new Date().toISOString(), sourceHash: hash('src/index.ts'), distHash: hash('dist/index.js'), fixturesHash: hash('bench/cli/fixtures.mjs'),
  scope: 'Live schema and Standard Schema validate exports; production tsdown JS; esbuild minified browser ES2022 ESM, gzip. Zod named imports and namespace imports shown separately. No argv parser or command runtime.',
  referenceHash: hash('bench/cli/cf-reference.json'), behaviorProbesHash: hash('bench/cli/behavior-probes.mjs'), cases: {}, completed: false,
};
const bundled = async (profile, library, mode) => {
  const index = library === 'loculus' ? 0 : library.startsWith('zod') ? 1 : 2;
  let expression = profile.expressions[index];
  let imported = index === 0 ? "import * as l from './dist/index.js';" : index === 1 ? "import {z} from 'zod';" : "import * as v from 'valibot';";
  if (library === 'zodNamed') {
    const names = [...new Set([...expression.matchAll(/\bz\.(\w+)/g)].map(match => match[1]))];
    imported = `import {${names.map(name => `${name} as z_${name}`).join(',')}} from 'zod';`;
    expression = expression.replace(/\bz\.(\w+)/g, (_, name) => `z_${name}`);
  }
  const source = `${imported}\n${prelude}\nexport const schema=${expression};export const validate=input=>schema['~standard'].validate(input);`;
  const compile = async contents => (await build({ stdin: { contents, loader: 'ts', resolveDir: resolve('.') }, bundle: true, minify: true, treeShaking: true, platform: 'browser', format: 'esm', target: 'es2022', write: false })).outputFiles[0].text;
  const code = await compile(source);
  const module = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  for (const [i, input] of profile.valid.entries()) assert.deepEqual(module.validate(input).value, profile.expectedValid[i], profile.id + '/' + library + '/' + mode + '/good');
  for (const input of profile.invalid) assert.equal(module.validate(input).issues.length, 1, profile.id + '/' + library + '/' + mode + '/bad');
  for (const [input, output] of behaviorProbes[profile.command].valid) assert.deepEqual(module.validate(input).value, output, profile.id + '/behavior-output');
  for (const [input, key] of behaviorProbes[profile.command].invalid) {
    const result = module.validate(input);
    assert.equal(result.issues.length, 1, profile.id + '/behavior-issue-count');
    assert.deepEqual(result.issues[0].path.map(part => part !== null && typeof part === 'object' && 'key' in part ? part.key : part), [key], profile.id + '/behavior-path');
  }
  let unusedDateImportRemoved;
  if (library === 'loculus' && mode === 'ordinary') {
    const withUnused = source.replace(imported, imported + "import {date as unusedDate} from './dist/index.js';");
    assert.equal(await compile(withUnused), code, 'Unused date import must not affect the ordinary bundle.');
    unusedDateImportRemoved = true;
  }
  const filename = `bench/cli/generated/${profile.id}-${library}-${mode}-min.mjs`;
  writeFileSync(filename, code);
  return { bytes: Buffer.byteLength(code), gzipBytes: gzipSync(code).length, sha256: createHash('sha256').update(code).digest('hex'), minifiedModuleExecuted: true, untimedBehaviorProbesPassed: true, unusedDateImportRemoved };
};
for (const profile of profiles) {
  report.cases[profile.id] = {};
  for (const mode of ['ordinary']) {
    report.cases[profile.id][mode] = {};
    for (const library of ['loculus', 'zodNamed', 'zodNamespace', 'valibot']) report.cases[profile.id][mode][library] = await bundled(profile, library, mode);
  }
}
assert.equal(hash('src/index.ts'), report.sourceHash);
assert.equal(hash('dist/index.js'), report.distHash);
report.completed = true;
writeFileSync('bench/cli/bundle-results.json', JSON.stringify(report, null, 2) + '\n');
console.log('Executed and measured 32 minified modules; unused Loculus date imports disappear in ordinary bundles.');
