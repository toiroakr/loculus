import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const directory = 'bench/optimization-2/generated';
const report = {
  environment: { node: process.version, v8: process.versions.v8, date: new Date().toISOString() },
  sourceHash: hash('src/index.ts'),
  baselineHash: hash('bench/optimization-2/before/index.ts.txt'),
  policy: { workload: '100 required string fields, missing input, 100000 validations; 5000 warmups', metric: 'sum of V8 trace-gc-nvp allocated fields between markers, including final explicit GC', caution: 'diagnostic estimate including engine allocations; not application-only allocation accounting or an unprofiled throughput result', checksum: 'issue count plus first path length', processes: 3 },
  cases: {}, completed: false,
};
for (const version of ['before', 'after']) {
  const module = resolve(directory, version === 'before' ? 'before/index.js' : 'index.js');
  const worker = resolve(directory, `allocation-${version}.mjs`);
  const text = `import * as l from ${JSON.stringify(module)};
const schema=l.object(Object.fromEntries(Array.from({length:100},(_,i)=>['f'+i,l.string()])));
const input={};let checksum=0;
function run(){const r=schema['~standard'].validate(input);checksum+=r.issues.length+r.issues[0].path.length;}
for(let i=0;i<5000;i++)run();global.gc();console.log('ALLOCATION_START');
for(let i=0;i<100000;i++)run();global.gc();console.log('ALLOCATION_END',checksum);
`;
  writeFileSync(worker, text);
  const samples = [];
  for (let pass = 0; pass < 3; pass++) {
    const result = spawnSync(process.execPath, ['--expose-gc', '--trace-gc-nvp', worker], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 60000 });
    if (result.status !== 0) throw new Error(result.stderr);
    const segment = result.stdout.split('ALLOCATION_START')[1]?.split('ALLOCATION_END')[0];
    if (!segment) throw new Error('Missing GC markers');
    const allocated = [...segment.matchAll(/\ballocated=(\d+)/g)].map(match => Number(match[1]));
    const checksum = Number(result.stdout.match(/ALLOCATION_END (\d+)/)?.[1]);
    if (checksum !== 105000 * 101 || !allocated.length) throw new Error('Invalid allocation diagnostic');
    samples.push({ allocatedBytes: allocated.reduce((sum, n) => sum + n, 0), gcEvents: allocated.length, checksum });
    writeFileSync(`${directory}/allocation-${version}-${pass}.log`, result.stdout);
  }
  report.cases[version] = { moduleHash: hash(module), samples };
}
report.completed = true;
writeFileSync('bench/optimization-2/allocation-results.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.cases));
