import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync, appendFileSync} from 'node:fs';
import {cpus, platform, arch} from 'node:os';
import {resolve} from 'node:path';
import {inspect, isDeepStrictEqual} from 'node:util';
import {pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
import {rolldown} from 'rolldown';
import {loculusPlugin} from '../../packages/rolldown/dist/index.js';
import {profiles as allProfiles, prelude} from '../single-use/fixtures.mjs';
import {median, runtimeMetrics, metricSet} from './metrics.mjs';

const selection = {
  'scalar-string-basic': 'scalars', 'scalar-string-trim': 'scalars',
  'scalar-number-inclusive': 'scalars', 'scalar-boolean': 'scalars',
  'scalar-presence-target-both': 'scalars', 'array-strict': 'arrays', 'array-wrap': 'arrays',
  'object-strict': 'objects', 'object-passthrough': 'objects',
  'cli-git-clone-full': 'CLI', 'cli-cf-deploy-sparse': 'CLI', 'supplement-rhf-items-10': 'forms',
};
const profiles = Object.keys(selection).map(id => {
  const profile = allProfiles.find(item => item.id === id);
  assert.ok(profile && !profile.format && !profile.method, id);
  return profile;
});
const quick = process.argv.includes('--quick');
const protocol = {version: 1, processes: quick ? 1 : 5, rounds: quick ? 2 : 7, warmupMs: quick ? 5 : 50, roundMs: quick ? 3 : 20, modes: ['construct', 'valid', 'invalid'], typeCopies: quick ? 1 : 20, typePasses: quick ? 1 : 3};
const dir = resolve('bench/ci/generated');
mkdirSync(dir, {recursive: true});
const json = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const hash = value => createHash('sha256').update(value).digest('hex');
const literal = value => inspect(value, {depth: null, compact: true, breakLength: Infinity, maxArrayLength: null, maxStringLength: null});
const versions = Object.fromEntries(['zod', 'valibot', 'rolldown', 'typescript'].map(name => [name, JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version]));
const bun = process.env.BUN_BIN ?? 'bun';
const runtimes = {node: process.execPath, bun};
const sourceHashes = Object.fromEntries(['src/index.ts', 'packages/rolldown/src/index.ts', 'dist/index.js', 'dist/index.d.ts'].map(file => [file, hash(readFileSync(file))]));
const environment = {node: process.version, bun: execFileSync(bun, ['--version'], {encoding: 'utf8'}).trim(), versions, cpu: cpus()[0].model, platform: platform(), arch: arch(), commit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim()};
const harnessHashes = Object.fromEntries(['bench/ci/run.mjs', 'bench/ci/worker.mjs', 'bench/ci/metrics.mjs'].map(file => [file, hash(readFileSync(file))]));
const fingerprint = hash(literal({protocol, profiles, prelude, versions, harnessHashes, node: environment.node, bun: environment.bun})).slice(0, 12);
const report = {completed: false, environment, protocol, fingerprint, sourceHashes, harnessHashes, cases: [], types: {}};
const entries = [];
const imports = {loculus: "import * as l from 'loculus';", generated: "import * as l from 'loculus';", zod: "import {z} from 'zod';", valibot: "import * as v from 'valibot';"};
async function bundle(source, library, filename) {
  const entry = resolve(dir, filename + '.ts');
  const build = await rolldown({input: entry, platform: 'browser', plugins: [
    {name: 'benchmark-entry', resolveId(id) {if (id === entry) return entry; if (id === 'loculus') return resolve('dist/index.js');}, load(id) {if (id === entry) return source;}},
    ...(library === 'generated' ? [loculusPlugin()] : []),
  ]});
  try {return (await build.generate({format: 'esm', minify: true})).output[0].code;} finally {await build.close();}
}
for (const profile of profiles) {
  const item = {id: profile.id, group: selection[profile.id], bundle: {}, runtime: {node: {}, bun: {}}};
  const peers = {};
  for (const [library, imported] of Object.entries(imports)) {
    const expression = profile.expressions[library === 'zod' ? 1 : library === 'valibot' ? 2 : 0];
    const source = `${imported}\n${prelude}\nexport const createSchema=()=>${expression};\nexport const schema=createSchema();\n`;
    const file = resolve(dir, `${profile.id}-${library}.mjs`);
    const code = await bundle(source + `export const good=${literal(profile.valid)};export const bad=${literal(profile.invalid)};`, library, profile.id + '-' + library);
    writeFileSync(file, code);
    const module = await import(pathToFileURL(file));
    peers[library] = profile.probes.map(input => module.schema['~standard'].validate(input));
    for (const input of module.good) assert.ok(!module.schema['~standard'].validate(input).issues, `${profile.id}/${library} valid`);
    for (const input of module.bad) assert.ok(module.schema['~standard'].validate(input).issues, `${profile.id}/${library} invalid`);
    const consumer = await bundle(`${imported}\n${prelude}\nexport const schema=${expression};export const validate=input=>schema['~standard'].validate(input);`, library, profile.id + '-' + library + '-consumer');
    const consumed = await import('data:text/javascript;base64,' + Buffer.from(consumer).toString('base64'));
    assert.deepEqual(consumed.validate(profile.valid[0]), module.schema['~standard'].validate(profile.valid[0]));
    writeFileSync(resolve(dir, `${profile.id}-${library}-consumer.mjs`), consumer);
    item.bundle[library] = {bytes: Buffer.byteLength(consumer), gzipBytes: gzipSync(consumer).length};
    item.runtime.node[library] = {}; item.runtime.bun[library] = {};
    entries.push({id: profile.id, key: profile.id + '/' + library, file});
  }
  assert.deepEqual(peers.generated, peers.loculus, profile.id + '/generated parity');
  for (let i = 0; i < peers.loculus.length; i++) {
    const actual = peers.loculus[i];
    assert.ok([peers.zod[i], peers.valibot[i]].some(peer => actual.issues ? !!peer.issues : !peer.issues && isDeepStrictEqual(actual.value, peer.value)), `${profile.id}/probe ${i}`);
  }
  report.cases.push(item);
}
const manifest = dir + '/manifest.json';
json(manifest, {protocol, entries});
for (const [runtime, bin] of Object.entries(runtimes)) for (let pass = 0; pass < protocol.processes; pass++) {
  const output = `${dir}/${runtime}-${pass}.json`;
  execFileSync(bin, ['bench/ci/worker.mjs', manifest, output, String(pass)], {stdio: 'inherit', timeout: 180000});
  const measurements = JSON.parse(readFileSync(output, 'utf8'));
  for (const item of report.cases) for (const library of Object.keys(imports)) for (const mode of protocol.modes) {
    (item.runtime[runtime][library][mode] ??= []).push(measurements[item.id + '/' + library][mode]);
  }
  console.log(`${runtime}: process ${pass + 1}/${protocol.processes}`);
}
for (const [index, library] of ['loculus', 'zod', 'valibot'].entries()) {
  let source = (library === 'loculus' ? "import * as l from '../../../dist/index.js';" : imports[library]) + '\n' + prelude.replace('(value)=>', '(value:string)=>') + '\n';
  const ordinary = await import(pathToFileURL(resolve('dist/index.js')));
  for (let copy = 0; copy < protocol.typeCopies; copy++) for (const profile of profiles) {
    const id = profile.id.replaceAll('-', '_') + '_' + copy;
    const out = new Function('l', prelude + '\nreturn ' + profile.expressions[0])(ordinary)['~standard'].validate(profile.valid[0]).value;
    source += `export const ${id}=${profile.expressions[index]};export type I_${id}=${['l.Input', 'z.input', 'v.InferInput'][index]}<typeof ${id}>;export type O_${id}=${['l.Output', 'z.output', 'v.InferOutput'][index]}<typeof ${id}>;export const input_${id}:I_${id}=${literal(profile.valid[0])};export const value_${id}:O_${id}=${literal(out)};\n`;
  }
  const path = `${dir}/types-${library}.ts`;
  writeFileSync(path, source);
  json(path + '.json', {compilerOptions: {strict: true, skipLibCheck: true, noEmit: true, types: [], target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext'}, files: [path]});
  report.types[library] = [];
}
for (let pass = 0; pass < protocol.typePasses; pass++) for (let offset = 0; offset < 3; offset++) {
  const library = ['loculus', 'zod', 'valibot'][(offset + pass) % 3];
  const start = performance.now();
  const diagnostics = execFileSync(resolve('node_modules/.bin/tsc'), ['-p', `${dir}/types-${library}.ts.json`, '--extendedDiagnostics'], {encoding: 'utf8', timeout: 90000});
  writeFileSync(`${dir}/diagnostics-${library}-${pass}.txt`, diagnostics);
  const value = key => {
    const match = diagnostics.match(new RegExp('^' + key + ':\\s+([\\d.]+)', 'm'));
    assert.ok(match, diagnostics);
    return Number(match[1]);
  };
  report.types[library].push({wallMs: performance.now() - start, checkSeconds: value('Check time'), instantiations: value('Instantiations'), memoryKiB: value('Memory used')});
}
for (const [file, expected] of Object.entries({...sourceHashes, ...harnessHashes})) assert.equal(hash(readFileSync(file)), expected);
report.completed = true;
json(dir + '/results.json', report);
const metadata = {protocol: JSON.stringify(protocol), environment: JSON.stringify(environment), fixtures: fingerprint};
for (const runtime of Object.keys(runtimes)) json(`${dir}/metrics-${runtime}.json`, metricSet(`runtime-${runtime}-${fingerprint}`, `${runtime} validation: Loculus / peer`, {...metadata, interpretation: '100% = peer; lower favors Loculus; geometric mean of per-case paired process ratios; observational, no statistical gate'}, runtimeMetrics(report, runtime)));
const sizes = report.cases.filter(item => ['scalar-string-basic', 'cli-git-clone-full', 'cli-cf-deploy-sparse', 'supplement-rhf-items-10'].includes(item.id)).flatMap(item => Object.entries(item.bundle).flatMap(([library, sizes]) => Object.entries(sizes).map(([unit, value]) => ({key: `${item.id}/${library}/${unit}`, name: `${item.id} / ${library} / ${unit}`, value, unit: 'B'}))));
json(`${dir}/metrics-size.json`, metricSet(`size-${fingerprint}`, 'Browser ESM bundles', metadata, sizes));
const types = Object.entries(report.types).flatMap(([library, samples]) => ['wallMs', 'checkSeconds', 'instantiations', 'memoryKiB'].map(key => ({key: `${library}/${key}`, name: `${library} / ${key}`, value: median(samples.map(sample => sample[key])), unit: {wallMs: 'ms', checkSeconds: 's', memoryKiB: 'KiB'}[key] ?? 'count'})));
json(`${dir}/metrics-types.json`, metricSet(`types-${fingerprint}`, 'TypeScript input/output inference', metadata, types));
let summary = '# Loculus benchmark report\n\nConstruction includes schema creation + one valid validation. Repeated valid/invalid validation excludes schema creation and build-time generation. Zod uses its default JIT mode. Lower is better. Ratios summarize per-case paired measurements, not statistical significance.\n\n';
for (const runtime of Object.keys(runtimes)) {
  summary += `## ${runtime}\n\n| Domain | Mode | Loculus ÷ Valibot | Loculus ÷ Zod | Loculus ÷ Generated |\n|---|---|---:|---:|---:|\n`;
  const metrics = runtimeMetrics(report, runtime);
  for (const group of [...new Set(report.cases.map(item => item.group))]) for (const mode of protocol.modes) {
    summary += `| ${group} | ${mode} | ${['valibot', 'zod', 'generated'].map(peer => metrics.find(item => item.key === `${group}/${mode}/${peer}`).value.toFixed(1) + '%').join(' | ')} |\n`;
  }
}
summary += '\nThe full JSON, fixture hashes, rounds, checksums, compiler diagnostics, and octocov metrics are available in the benchmark artifact. Different fixture/protocol/dependency/runtime versions use different metric-set keys. No universal speed or size claim is made.\n';
writeFileSync(dir + '/summary.md', summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log('Benchmark reports and octocov custom metrics written to ' + dir);
