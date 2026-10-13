import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const dir = 'bench/optimization-3/object-candidates';
const manifest = JSON.parse(readFileSync(`${dir}/mixed-compile-manifest.json`));
const names = ['mixed-compile-baseline3', ...manifest.candidates.map(c => c.name)];
const profiles = ['transform-100', 'default-100', 'query-12'];
const expressions = Object.fromEntries(profiles.map(profile => [profile, profile === 'query-12'
  ? "l.object({page:l.number({integer:true,gte:1,default:1}),limit:l.number({integer:true,gte:1,lte:100,default:20}),q:l.string({optional:true,max:200}),sort:l.enum(['new','old']),tags:l.array(l.string(),{wrapScalar:true,default:[]}),expanded:l.boolean({default:false}),locale:l.string(),category:l.string(),owner:l.string(),view:l.string(),format:l.string(),source:l.string()})"
  : `l.object({${Array.from({length:100}, (_, i) => `f${i}:${i ? 'l.string()' : profile === 'transform-100' ? "l.transform(l.string(),value=>value+'!')" : "l.string({default:'fallback'})"}`).join(',')}})`]));
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const report = { date: new Date().toISOString(), sourceHash: hash('src/index.ts'), candidateHashes: Object.fromEntries(names.map(name => [name, hash(`${dir}/${name}.ts.txt`)])), exploratory: true, processes: 3, profiles, cases: {}, completed: false };
const bin = { node: process.execPath, bun: resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun') };
for (const runtime of ['node', 'bun']) for (let pass = 0; pass < 3; pass++) {
  for (const profile of profiles) for (const mode of ['valid', 'invalid', 'construct']) for (let n = 0; n < names.length; n++) {
    const name = names[(n + pass) % names.length];
    const result = spawnSync(bin[runtime], [`${dir}/bench-mixed-compile.mjs`, name, profile, mode], { encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    const entry = report.cases[[runtime, profile, mode, name].join('/')] ??= { runtime, profile, mode, name, processMedians: [], checksums: [], samples: [] };
    entry.processMedians.push(median(data.samples));
    entry.samples.push(data.samples);
    entry.checksums.push(data.checksum);
  }
  console.log(runtime, 'process', pass + 1);
}
for (const name of names) for (const profile of profiles) {
  const input = `import * as l from './${name}.mjs';export const schema=l.compile(${expressions[profile]});export const validate=input=>schema['~standard'].validate(input);`;
  const result = await build({ stdin: { contents: input, resolveDir: resolve(dir), loader: 'js' }, bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022', write: false });
  const code = result.outputFiles[0].text;
  (report.bundles ??= {})[`${profile}/${name}`] = { bytes: Buffer.byteLength(code), gzipBytes: gzipSync(code).length };
}
for (const entry of Object.values(report.cases)) entry.median = median(entry.processMedians);
assert.equal(hash('src/index.ts'), report.sourceHash);
report.completed = true;
writeFileSync('bench/optimization-3/mixed-screen-results.json', JSON.stringify(report, null, 2) + '\n');
