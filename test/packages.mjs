import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const work = await mkdtemp(join(tmpdir(), 'loculus-packages-'));
function pack(directory) {
  const packed = JSON.parse(execFileSync('pnpm', ['pack', '--json', '--pack-destination', work], { cwd: directory, encoding: 'utf8' }));
  return { ...packed, filename: basename(packed.filename) };
}
async function consumer(name, archives) {
  const directory = join(work, name);
  await mkdir(directory);
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync('npm', ['install', '--engine-strict', '--offline', '--ignore-scripts', '--omit=dev', '--legacy-peer-deps', '--no-audit', '--no-fund', '--package-lock=false', ...archives], { cwd: directory, stdio: 'pipe' });
  return directory;
}
function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  assert.ok(match, `Expected a plain x.y.z version, got ${version}`);
  return match.slice(1).map(Number);
}
function assertCaret(range, version) {
  assert.ok(range.startsWith('^'), `Expected a caret range, got ${range}`);
  const [lo, ver] = [parseVersion(range.slice(1)), parseVersion(version)];
  const pivot = lo.findIndex(part => part !== 0);
  const end = pivot === -1 ? 2 : pivot;
  const sameLine = lo.slice(0, end + 1).every((part, index) => part === ver[index]);
  const atLeast = ver[0] - lo[0] || ver[1] - lo[1] || ver[2] - lo[2];
  assert.ok(sameLine && atLeast >= 0, `Peer range ${range} must accept runtime version ${version}`);
}
try {
  const runtime = pack(root);
  const plugin = pack(join(root, 'packages/rolldown'));
  assert.equal(runtime.name, 'loculus');
  assert.equal(plugin.name, '@loculus/rolldown');
  assert.deepEqual(runtime.files.filter(file => file.path.startsWith('dist/')).map(file => file.path).sort(), ['dist/index.d.ts', 'dist/index.js']);
  assert.deepEqual(plugin.files.filter(file => file.path.startsWith('dist/')).map(file => file.path).sort(), ['dist/index.d.ts', 'dist/index.js']);
  const runtimeOnly = await consumer('runtime', [join(work, runtime.filename)]);
  const manifest = JSON.parse(await readFile(join(runtimeOnly, 'node_modules/loculus/package.json'), 'utf8'));
  assert.equal(manifest.peerDependencies, undefined);
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.exports['./rolldown'], undefined);
  await writeFile(join(runtimeOnly, 'verify.mjs'), `
import assert from 'node:assert/strict';
import * as l from 'loculus';
assert.deepEqual(l.parse(l.object({ flag: l.boolean(), count: l.number({default: 1}) }), {flag: 'false'}), {flag: false, count: 1});
assert.equal(l.parse(l.number({nullish:true}), ''), null);
assert.equal(l.parse(l.number({default:{null:10}}), ''), 10);
await assert.rejects(import('loculus/rolldown'), {code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'});
await assert.rejects(import('rolldown'), {code: 'ERR_MODULE_NOT_FOUND'});
`);
  execFileSync(process.execPath, ['verify.mjs'], { cwd: runtimeOnly, stdio: 'pipe' });
  const optimized = await consumer('optimized', [join(work, runtime.filename), join(work, plugin.filename)]);
  await symlink(join(root, 'node_modules/rolldown'), join(optimized, 'node_modules/rolldown'), 'dir');
  const pluginManifest = JSON.parse(await readFile(join(optimized, 'node_modules/@loculus/rolldown/package.json'), 'utf8'));
  assertCaret(pluginManifest.peerDependencies.loculus, runtime.version);
  assert.equal(pluginManifest.peerDependencies.rolldown, '>=1.2.13 <2');
  await writeFile(join(optimized, 'entry.js'), `import * as l from 'loculus'; export const query = l.object({q:l.string({trim:true,min:1}),draft:l.boolean({default:false}),count:l.number({nullish:true}),fallback:l.number({optional:true,default:{null:10}})});export const choices=l.object({code:l.literal([200,201]),mode:l.literal(['auto',1,false]),items:l.array(l.literal([1,2]))});`);
  await writeFile(join(optimized, 'verify.mjs'), `
import assert from 'node:assert/strict';
import {rolldown} from 'rolldown';
import {loculusPlugin} from '@loculus/rolldown';
let generated = false;
let literalsGenerated = false;
const build = await rolldown({input: new URL('./entry.js', import.meta.url).pathname, plugins:[loculusPlugin(),{name:'check',transform(code,id){if(id.endsWith('/entry.js')){generated=code.includes('function __loculus_');literalsGenerated=!/l\\.literal\\(/.test(code);}}}]});
try {
  const {output} = await build.generate({format:'esm',minify:true});
  assert.equal(generated,true);
  assert.equal(literalsGenerated,true);
  const {query,choices} = await import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'));
  assert.deepEqual(query['~standard'].validate({q:' hello ',draft:'false'}),{value:{q:'hello',draft:false}});
  assert.deepEqual(query['~standard'].validate({q:'hello'}),{value:{q:'hello',draft:false}});
  assert.deepEqual(query['~standard'].validate({q:'hello',count:'',fallback:''}),{value:{q:'hello',draft:false,count:null,fallback:10}});
  assert.deepEqual(query['~standard'].validate({q:'hello',extra:'value'}).issues[0].path,['extra']);
  assert.deepEqual(choices['~standard'].validate({code:'201',mode:'1',items:['1',2]}),{value:{code:201,mode:1,items:[1,2]}});
  assert.deepEqual(choices['~standard'].validate({code:'202',mode:'auto',items:[3]}).issues.map(issue=>issue.path),[['code'],['items',0]]);
} finally { await build.close(); }
`);
  execFileSync(process.execPath, ['verify.mjs'], { cwd: optimized, stdio: 'pipe' });
  const release = join(work, 'release');
  for (const path of ['package.json', 'pnpm-workspace.yaml', '.changeset', 'dist', 'packages/rolldown/package.json', 'packages/rolldown/dist']) {
    await mkdir(join(release, path, '..'), { recursive: true });
    await cp(join(root, path), join(release, path), { recursive: true });
  }
  await symlink(join(root, 'node_modules'), join(release, 'node_modules'), 'dir');
  execFileSync('pnpm', ['exec', 'changeset', 'version'], { cwd: release, stdio: 'pipe' });
  const releasedRuntime = pack(release);
  const releasedPlugin = pack(join(release, 'packages/rolldown'));
  const released = await consumer('released', [join(work, releasedRuntime.filename), join(work, releasedPlugin.filename)]);
  const releasedManifest = JSON.parse(await readFile(join(released, 'node_modules/@loculus/rolldown/package.json'), 'utf8'));
  assert.equal(releasedManifest.peerDependencies.loculus, `^${releasedRuntime.version}`);
  console.log(`Release tarballs require loculus@${releasedRuntime.version}.`);
  await symlink(join(root, 'node_modules/rolldown'), join(released, 'node_modules/rolldown'), 'dir');
  await cp(join(optimized, 'entry.js'), join(released, 'entry.js'));
  await cp(join(optimized, 'verify.mjs'), join(released, 'verify.mjs'));
  execFileSync(process.execPath, ['verify.mjs'], { cwd: released, stdio: 'pipe' });
  console.log('Packed runtime works without Rolldown; standalone @loculus/rolldown generates and validates consumer schemas.');
} finally { await rm(work, { recursive: true, force: true }); }
