import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { profiles, prelude, imports } from '../coverage/fixtures.mjs';
const folder = 'bench/optimization-2/generated/bundles';
mkdirSync(folder, { recursive: true });
const snapshots = { before: 'bench/optimization-2/before/index.ts.txt', after: 'src/index.ts' };
const report = { date: new Date().toISOString(), scope: '96 ordinary schema profiles, minified browser ESM, esbuild; schema and Standard Schema validate remain live', hashes: {}, cases: {}, completed: false };
for (const [version, source] of Object.entries(snapshots)) {
  const text = readFileSync(source, 'utf8');
  report.hashes[version] = createHash('sha256').update(text).digest('hex');
  const output = await build({ stdin: { contents: text, loader: 'ts' }, format: 'esm', target: 'es2022', write: false });
  writeFileSync(`${folder}/${version}.js`, output.outputFiles[0].text);
}
for (const profile of profiles) {
  const result = report.cases[profile.id] = {};
  for (const [index, version] of ['before', 'after', 'zod', 'valibot'].entries()) {
    const contents = index < 2 ? `import * as l from './${version}.js';\n${prelude}\nexport const schema=${profile.expressions[0]};export const validate=input=>schema['~standard'].validate(input);` : `${imports[version]}\n${prelude}\nexport const schema=${profile.expressions[index - 1]};export const validate=input=>schema['~standard'].validate(input);`;
    const bundle = await build({ stdin: { contents, resolveDir: resolve(folder), loader: 'ts' }, bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022', write: false });
    const code = bundle.outputFiles[0].text;
    result[version] = { bytes: Buffer.byteLength(code), gzipBytes: gzipSync(code).length };
  }
}
report.completed = true;
writeFileSync('bench/optimization-2/bundle-results.json', JSON.stringify(report, null, 2) + '\n');
for (const [id, result] of Object.entries(report.cases)) {
  if (result.after.gzipBytes > result.before.gzipBytes) console.log('gzip increase', id, result.before.gzipBytes, result.after.gzipBytes);
}
