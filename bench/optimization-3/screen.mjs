import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { inspect } from 'node:util';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { profiles, prelude } from '../coverage/fixtures.mjs';
const option = name => process.argv.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1);
const candidateDir = option('--candidates') ?? 'bench/optimization-3/object-candidates';
const ids = option('--ids')?.split(',') ?? ['width-100', 'string-basic', 'object-passthrough', 'presence-default'];
const names = option('--names')?.split(',');
const compiled = process.argv.includes('--compiled');
const out = option('--output') ?? 'bench/optimization-3/screen-results.json';
const dir = resolve('bench/optimization-3/generated/screen');
mkdirSync(dir, { recursive: true });
const candidates = (names ? names.map(name => ({ name })) : JSON.parse(readFileSync(candidateDir + '/manifest.json')).candidates);
const selected = profiles.filter(p => ids.includes(p.id));
assert.equal(selected.length, ids.length);
const report = { date: new Date().toISOString(), purpose: 'Exploratory screening, three fresh processes, no significance claims', compiled, cases: {} };
const median = a => [...a].sort((a,b) => a-b)[Math.floor(a.length/2)];
for (const c of candidates) {
  const module = await build({ stdin: { contents: readFileSync(candidateDir + '/' + c.name + '.ts.txt', 'utf8'), loader: 'ts' }, write: false, format: 'esm', target: 'es2022' });
  writeFileSync(dir + '/' + c.name + '.js', module.outputFiles[0].text);
  for (const p of selected) {
    const expression = compiled ? `l.compile(${p.expressions[0]})` : p.expressions[0];
    const call = p.method === 'parse' ? `(()=>{try{return {value:l.parse(s,input)};}catch(e){return {issues:e.issues};}})()` : p.method === 'safeParse' ? 'l.safeParse(s,input)' : `s['~standard'].validate(input)`;
    const contents = `import * as l from './${c.name}.js';\n${prelude}\nconst create=()=>${expression};const schema=create();const invoke=(s,input)=>${call};
const good=${inspect(p.valid,{depth:null,compact:true,breakLength:Infinity})};const bad=${inspect(p.invalid,{depth:null,compact:true,breakLength:Infinity})};
const results={};for(const mode of ['valid','invalid','construct']){
const data=mode==='invalid'?bad:good;let checksum=0;const run=i=>{const s=mode==='construct'?create():schema;const r=invoke(s,data[i%data.length]);checksum+=r.issues?r.issues.length:(r.value&&typeof r.value==='object'?Object.keys(r.value).length:1);};
let count=0;let start=performance.now();do{for(let i=0;i<256;i++)run(i);count+=256;}while(performance.now()-start<30);
const iterations=Math.max(256,Math.min(1000000,Math.ceil(count*8/(performance.now()-start))));const samples=[];
for(let round=0;round<7;round++){start=performance.now();for(let i=0;i<iterations;i++)run(i);samples.push((performance.now()-start)*1e6/iterations);}results[mode]={samples,checksum};}console.log(JSON.stringify(results));`;
    const worker = await build({ stdin: { contents, resolveDir: dir, loader: 'ts' }, bundle: true, write: false, platform: 'node', target: 'es2022', format: 'esm' });
    const file = dir + '/' + c.name + '-' + p.id + '.mjs';
    writeFileSync(file, worker.outputFiles[0].text);
    const bundle = await build({ stdin: { contents: `import * as l from './${c.name}.js';\n${prelude}\nexport const schema=${expression};export const validate=x=>schema['~standard'].validate(x);`, resolveDir: dir, loader: 'ts' }, bundle: true, write: false, platform: 'browser', target: 'es2022', format: 'esm', minify: true });
    const key = c.name + '/' + p.id;
    report.cases[key] = { candidate: c.name, profile: p.id, gzipBytes: gzipSync(bundle.outputFiles[0].text).length, file, runtime: {} };
  }
}
for (const runtime of ['node','bun']) {
  const bin = runtime === 'node' ? process.execPath : resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun');
  const entries = Object.values(report.cases);
  for (let pass=0;pass<3;pass++) {
    for(let i=0;i<entries.length;i++) {
      const entry=entries[(i+pass)%entries.length];
      const result=spawnSync(bin,[entry.file],{encoding:'utf8',timeout:60000});assert.equal(result.status,0,result.stderr);
      const measured=JSON.parse(result.stdout);const dest=entry.runtime[runtime]??={};
      for(const mode of ['valid','invalid','construct']) (dest[mode]??=[]).push(median(measured[mode].samples));
    }
    console.log(runtime,'screen',pass+1);
  }
}
writeFileSync(out,JSON.stringify(report,null,2)+'\n');
for(const e of Object.values(report.cases))console.log(e.candidate,e.profile,e.gzipBytes,...Object.entries(e.runtime).map(([r,m])=>r+' '+Object.entries(m).map(([k,v])=>k+':'+median(v).toFixed(2)).join(' ')));
