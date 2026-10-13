import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const work = await mkdtemp(join(tmpdir(), 'loculus-packages-'));
function pack(directory) {
  return JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', work], { cwd: directory, encoding: 'utf8' }))[0];
}
async function consumer(name, archives) {
  const directory = join(work, name);
  await mkdir(directory);
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync('npm', ['install', '--offline', '--ignore-scripts', '--omit=dev', '--legacy-peer-deps', '--no-audit', '--no-fund', '--package-lock=false', ...archives], { cwd: directory, stdio: 'pipe' });
  return directory;
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
await assert.rejects(import('loculus/rolldown'), {code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'});
await assert.rejects(import('rolldown'), {code: 'ERR_MODULE_NOT_FOUND'});
`);
  execFileSync(process.execPath, ['verify.mjs'], { cwd: runtimeOnly, stdio: 'pipe' });
  const optimized = await consumer('optimized', [join(work, runtime.filename), join(work, plugin.filename)]);
  await symlink(join(root, 'node_modules/rolldown'), join(optimized, 'node_modules/rolldown'), 'dir');
  const pluginManifest = JSON.parse(await readFile(join(optimized, 'node_modules/@loculus/rolldown/package.json'), 'utf8'));
  assert.equal(pluginManifest.peerDependencies.loculus, '^0.1.0');
  assert.equal(pluginManifest.peerDependencies.rolldown, '>=1.2.13 <2');
  await writeFile(join(optimized, 'entry.js'), `import * as l from 'loculus'; export const query = l.object({q:l.string({trim:true,min:1}),draft:l.boolean({default:false})});`);
  await writeFile(join(optimized, 'verify.mjs'), `
import assert from 'node:assert/strict';
import {rolldown} from 'rolldown';
import {loculusPlugin} from '@loculus/rolldown';
let generated = false;
const build = await rolldown({input: new URL('./entry.js', import.meta.url).pathname, plugins:[loculusPlugin(),{name:'check',transform(code,id){if(id.endsWith('/entry.js'))generated=code.includes('function __loculus_');}}]});
try {
  const {output} = await build.generate({format:'esm',minify:true});
  assert.equal(generated,true);
  const {query} = await import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'));
  assert.deepEqual(query['~standard'].validate({q:' hello ',draft:'false'}),{value:{q:'hello',draft:false}});
  assert.deepEqual(query['~standard'].validate({q:'hello'}),{value:{q:'hello',draft:false}});
  assert.deepEqual(query['~standard'].validate({q:'hello',extra:'value'}).issues[0].path,['extra']);
} finally { await build.close(); }
`);
  execFileSync(process.execPath, ['verify.mjs'], { cwd: optimized, stdio: 'pipe' });
  console.log('Packed runtime works without Rolldown; standalone @loculus/rolldown generates and validates consumer schemas.');
} finally { await rm(work, { recursive: true, force: true }); }
