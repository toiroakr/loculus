import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {inspect} from 'node:util';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {profiles} from './fixtures.mjs';
const dir='bench/coverage/generated',bun=process.env.BUN_BIN??resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const reports=['results.json','scalar-results.json','compiled-results.json','compiled-scalar-results.json'].map(n=>JSON.parse(readFileSync('bench/coverage/'+n)));assert.ok(reports.every(r=>r.completed));const cases=Object.assign({},...reports.map(r=>r.cases));
const report={date:new Date().toISOString(),sourceHash:hash('src/index.ts'),distHash:hash('dist/index.js'),policy:{freshProcesses:5,scope:'wall time from process launch through imports, schema construction/compile, input preparation, one successful validation, JSON printing and process exit; build excluded; identical-byte prebuilt ESM for Node/Bun',dataset:'first valid input per profile; all other branch datasets are in warmed validation/construction reports'},cases:{}};
const decode=x=>{if(x&&typeof x==='object'&&'$date'in x)return x.$date;if(x&&typeof x==='object'&&'$undefined'in x)return undefined;if(Array.isArray(x))return x.map(decode);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,decode(v)]));return x;};
for(const [name,c]of Object.entries(cases))if(!c.unavailable){const p=profiles.find(p=>p.id===c.id);const source=resolve(`${dir}/${name}-browser.ts`);const code=readFileSync(source,'utf8')+`\nconst input=${p.format?'prepareInput('+inspect(p.valid[0],{depth:null,compact:true,breakLength:Infinity})+')':inspect(p.valid[0],{depth:null,compact:true,breakLength:Infinity})};const r=validate(input);if(r.issues)throw Error('Expected success');console.log(JSON.stringify(r.value));`;
 const result=await build({stdin:{contents:code,loader:'ts',resolveDir:dirname(source)},bundle:true,platform:'node',format:'esm',target:'es2022',write:false});const file=`${dir}/${name}-cold.mjs`;writeFileSync(file,result.outputFiles[0].text);report.cases[name]={fixtureHash:hash(file),node:{samples:[]},bun:{samples:[]},expected:decode(c.runtime.node.verified.good[0].value)};}
console.log('Cold-launch fixtures built; measuring sequentially.');
const entries=Object.entries(report.cases);
for(let pass=0;pass<5;pass++){
 const rotated=entries.slice(pass%entries.length).concat(entries.slice(0,pass%entries.length));for(const[name,c]of rotated)for(const runtime of ['node','bun']){const start=performance.now();const r=spawnSync(runtime==='bun'?bun:process.execPath,[resolve(`${dir}/${name}-cold.mjs`)],{encoding:'utf8',timeout:30000});const elapsed=performance.now()-start;assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),c.expected,name+'/'+runtime);c[runtime].samples.push(elapsed);}
 console.log(`Cold-launch pass ${pass+1}/5 done.`);
}
for(const c of Object.values(report.cases))for(const runtime of ['node','bun']){const sorted=[...c[runtime].samples].sort((a,b)=>a-b);c[runtime].median=sorted[2];c[runtime].min=sorted[0];c[runtime].max=sorted.at(-1);}
assert.equal(hash('src/index.ts'),report.sourceHash);report.completed=true;writeFileSync('bench/coverage/cold-results.json',JSON.stringify(report,null,2)+'\n');
