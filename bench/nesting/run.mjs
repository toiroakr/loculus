import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { profiles } from '../single-use/fixtures.mjs';

const ids = ['object-strip', 'object-strict', 'object-passthrough', 'cli-git-clone-full', 'cli-cf-deploy-sparse'];
function replace(source, search, replacement) {
  if (!source.includes(search)) throw new Error(`Benchmark harness changed: ${search}`);
  return source.replace(search, replacement);
}

const base = process.argv.find(arg => arg.startsWith('--base='))?.slice(7) ?? 'origin/main';
mkdirSync('bench/nesting/generated/before', { recursive: true });
writeFileSync('bench/nesting/generated/fixtures.json', JSON.stringify({ profiles: profiles.filter(p => ids.includes(p.id)) }, null, 2));
writeFileSync('bench/nesting/generated/before/source.ts', execFileSync('git', ['show', `${base}:src/index.ts`]));
let prepare = readFileSync('bench/coverage/prepare.mjs', 'utf8');
prepare = replace(prepare, "from './fixtures.mjs'", "from '../single-use/fixtures.mjs'");
prepare = replace(prepare, 'profiles,libraries,imports,prelude,coverage', 'profiles as allProfiles,libraries,imports,prelude,coverage');
prepare = replace(prepare, 'const ordinaryOnly=', `const profiles=allProfiles.filter(p=>${JSON.stringify(ids)}.includes(p.id));\nconst ordinaryOnly=`);
writeFileSync('bench/nesting/prepare.generated.mjs', prepare);
let settled = readFileSync('bench/coverage/settled.mjs', 'utf8');
settled = replace(settled, 'warmupMilliseconds:30,roundMilliseconds:8', 'warmupMilliseconds:150,roundMilliseconds:25');
settled = replace(settled, 'performance.now()-warming<30', 'performance.now()-warming<150');
settled = replace(settled, 'Math.ceil(warmup*8/', 'Math.ceil(warmup*25/');
writeFileSync('bench/nesting/settled.generated.mjs', settled);
for (const args of [
  ['bench/nesting/prepare.generated.mjs', '--source=src/index.ts', '--out-dir=bench/nesting/generated/after'],
  ['bench/nesting/prepare.generated.mjs', '--baseline', '--source=bench/nesting/generated/before/source.ts', '--out-dir=bench/nesting/generated/before'],
  ['bench/nesting/settled.generated.mjs', '--workers-dir=bench/nesting/generated/after', '--before-dir=bench/nesting/generated/before', '--baseline-source=bench/nesting/generated/before/source.ts', '--output=bench/nesting/generated/results.json', '--modes=construct,valid'],
]) execFileSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, BENCH_PROCESSES: '9' } });
