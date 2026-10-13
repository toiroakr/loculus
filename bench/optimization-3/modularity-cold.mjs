import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const sourceHash = hash('src/index.ts');
const root = resolve('bench/optimization-3/generated/modular');
const worker = root + '/cold-worker.mjs';
writeFileSync(worker, `
const [variant, profile] = process.argv.slice(2);
const start = performance.now();
let l;
if (variant === 'original') l = await import(${JSON.stringify(resolve('dist/index.js'))});
else if (variant === 'barrel') l = await import(${JSON.stringify(root + '/published/index.mjs')});
else {
  const groups = profile === 'string' ? ['object','string'] : profile === 'number' ? ['object','number'] : ['object','string','number','boolean','enum','array'];
  l = Object.assign({}, ...await Promise.all(groups.map(group => import(${JSON.stringify(root + '/published/')} + group + '.mjs'))));
}
const loaded = performance.now();
const schema = profile === 'string' ? l.object({value:l.string()}) : profile === 'number' ? l.object({count:l.number()}) : l.object({q:l.string({optional:true}),page:l.number({integer:true,gte:1,default:1}),sort:l.enum(['new','old'],{default:'new'}),tag:l.array(l.string(),{default:[]}),active:l.boolean({default:false})});
const input = profile === 'string' ? {value:'hello'} : profile === 'number' ? {count:'42'} : {q:'hello',page:'2',tag:'one',active:'true'};
const result = schema['~standard'].validate(input);
const finished = performance.now();
if (result.issues) throw new Error('Unexpected validation failure');
process.stdout.write(JSON.stringify({importNs:(loaded-start)*1e6,importAndFirstValidateNs:(finished-start)*1e6,value:result.value}));
`);
const median = data => [...data].sort((a,b) => a-b)[Math.floor(data.length / 2)];
const report = { date: new Date().toISOString(), sourceHash, distHash: hash('dist/index.js'), scope: 'Nine fresh processes per runtime/profile/variant, rotating variant order, warm filesystem. Imports include dynamic module loading; process wall includes interpreter startup and shutdown. Descriptive medians, no significance test.', runtimeVersions: {}, cases: {}, completed: false };
const variants = ['original', 'barrel', 'direct'];
for (const [runtime, binary] of [['node',process.execPath],['bun',resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun')]]) {
  report.runtimeVersions[runtime] = execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim();
  for (const profile of ['string','number','query']) {
    const cases = report.cases[runtime + '/' + profile] = Object.fromEntries(variants.map(v => [v, { samples: [] }]));
    let expected;
    for (let pass = 0; pass < 9; pass++) for (let offset = 0; offset < variants.length; offset++) {
      const variant = variants[(offset + pass) % variants.length];
      const started = performance.now();
      const output = JSON.parse(execFileSync(binary, [worker, variant, profile], { encoding: 'utf8' }));
      output.processWallNs = (performance.now() - started) * 1e6;
      expected ??= output.value;
      assert.deepEqual(output.value, expected);
      delete output.value;
      cases[variant].samples.push(output);
    }
    for (const item of Object.values(cases)) item.medians = Object.fromEntries(['importNs','importAndFirstValidateNs','processWallNs'].map(key => [key, median(item.samples.map(s => s[key]))]));
    console.log(runtime,profile,Object.fromEntries(Object.entries(cases).map(([v,d]) => [v, Object.fromEntries(Object.entries(d.medians).map(([key,n]) => [key, Number((n / 1e6).toFixed(3))]))])));
  }
}
assert.equal(sourceHash, hash('src/index.ts'));
report.completed = true;
writeFileSync('bench/optimization-3/modularity-cold-results.json', JSON.stringify(report,null,2)+'\n');
