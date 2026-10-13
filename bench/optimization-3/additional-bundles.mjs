import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { profiles as rhf } from './supplement-fixtures.mjs';
import { profiles as mixed } from './mixed-fixtures.mjs';
import { prelude } from '../coverage/fixtures.mjs';
import { profiles as canonical } from '../coverage/fixtures.mjs';

const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const report = {
  date: new Date().toISOString(), sourceHash: hash('src/index.ts'), distHash: hash('dist/index.js'),
  scope: 'Additional six profiles, actual before/after JS, live schema and Standard Schema validate, esbuild browser ES2022 ESM; separate from canonical96',
  cases: {}, entrySanity: {}, namedZodOrdinary: {}, completed: false,
};
const bundle = async contents => {
  const result = await build({ stdin: { contents, resolveDir: resolve('.'), loader: 'ts' }, bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022', write: false });
  const code = result.outputFiles[0].text;
  return { bytes: Buffer.byteLength(code), gzipBytes: gzipSync(code).length };
};
for (const profile of [...rhf, ...mixed]) {
  report.cases[profile.id] = {};
  for (const mode of ['ordinary', 'compiled']) {
    const values = report.cases[profile.id][mode] = {};
    for (const [index, library] of ['before', 'after', 'zod', 'valibot'].entries()) {
      const imported = index < 2 ? `import * as l from '${index === 0 ? './bench/optimization-3/before/index.js' : './dist/index.js'}';` : index === 2 ? "import { z } from 'zod';" : "import * as v from 'valibot';";
      const expression = profile.expressions[index < 2 ? 0 : index - 1];
      const schema = mode === 'ordinary' || library === 'valibot' ? expression : `${index < 2 ? 'l' : 'z'}.compile(${expression})`;
      values[library] = await bundle(`${imported}\n${prelude}\nexport const schema=${schema};export const validate=input=>schema['~standard'].validate(input);`);
    }
  }
}
const entries = {
  loculus: "import { object, string } from './dist/index.js';",
  valibot: "import { object, string } from 'valibot';",
  zodRootNamespace: "import { z } from 'zod';",
  zodRootNamed: "import { object, string } from 'zod';",
  zodV4Named: "import { object, string } from 'zod/v4';",
  zodMiniNamed: "import { object, string } from 'zod/mini';",
};
for (const [id, imported] of Object.entries(entries)) {
  const expression = id === 'zodRootNamespace' ? 'z.object({value:z.string()})' : 'object({value:string()})';
  report.entrySanity[id] = await bundle(`${imported}export const schema=${expression};export const validate=input=>schema['~standard'].validate(input);`);
}
for (const profile of canonical) {
  const names = [...new Set([...profile.expressions[1].matchAll(/\bz\.([\w$]+)/g)].map(match => match[1]))];
  const imported = `import {${names.map(name => `${name} as z_${name}`).join(',')}} from 'zod';`;
  const expression = profile.expressions[1].replace(/\bz\.([\w$]+)/g, (_, name) => `z_${name}`);
  report.namedZodOrdinary[profile.id] = { ...await bundle(`${imported}\n${prelude}\nexport const schema=${expression};export const validate=input=>schema['~standard'].validate(input);`), imports: imported, expression };
}
for (const entry of ['zod', 'zod/v4', 'zod/mini']) {
  const { object, string } = await import(entry);
  const schema = object({ value: string() });
  assert.deepEqual(schema['~standard'].validate({ value: 'hello', ignored: true }), { value: { value: 'hello' } });
  assert.ok(schema['~standard'].validate({ value: 42 }).issues);
}
assert.equal(hash('src/index.ts'), report.sourceHash);
assert.equal(hash('dist/index.js'), report.distHash);
report.completed = true;
writeFileSync('bench/optimization-3/additional-bundle-results.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.entrySanity, null, 2));
