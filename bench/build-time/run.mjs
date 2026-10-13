import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const bundles=JSON.parse(readFileSync('bench/build-time/bundle-results.json'));
assert.equal(hash('packages/rolldown/src/index.ts'),bundles.pluginHash);
assert.equal(hash('src/index.ts'),bundles.sourceHash);
const profiles=bundles.cases.filter(c=>c.timed);
const libraries=['ordinary','generated','zod','valibot'];
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const runtimes={node:process.execPath,bun:resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun')};
const execute=(path,bin,mode)=>{const r=spawnSync(bin,[path,mode],{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
const report={completed:false,environment:{date:new Date().toISOString(),sourceHash:bundles.sourceHash,pluginHash:bundles.pluginHash,node:process.version,bun:spawnSync(runtimes.bun,['--version'],{encoding:'utf8'}).stdout.trim(),cpu:cpus()[0].model},policy:{freshProcesses:9,rounds:7,warmupMilliseconds:30,roundMilliseconds:8,modes:['construct','valid'],scope:'build-time generated Loculus versus ordinary Loculus, Zod jitless and Valibot; construction includes one valid validation; repeated validation excludes schema creation; bundling and code generation excluded from runtime timings',selection:profiles.map(c=>c.id)},cases:{}};
for(const profile of profiles)for(const library of libraries){
 const name=profile.id+'-'+(library==='ordinary'||library==='generated'?'loculus':library);
 const version=library==='ordinary'?'before':'after';
 const file=resolve(`bench/build-time/generated/${profile.id}-${library}.mjs`);
 report.cases[name+'/'+version]={id:profile.id,library:library==='ordinary'||library==='generated'?'loculus':library,name,version,file,fixtureHash:hash(file),runtime:{}};
 for(const bin of Object.values(runtimes)){
  const result=execute(file,bin,'verify');
  const before=resolve(`bench/build-time/generated/${profile.id}-ordinary.mjs`);
  if(library==='generated')assert.deepEqual(result,execute(before,bin,'verify'),profile.id);
 }
}
for(const [runtime,bin]of Object.entries(runtimes))for(let pass=0;pass<9;pass++){
 for(let i=0;i<profiles.length;i++){
  const profile=profiles[(i+pass)%profiles.length];
  for(let j=0;j<libraries.length;j++){
   const library=libraries[(j+pass)%libraries.length];
   const name=profile.id+'-'+(library==='ordinary'||library==='generated'?'loculus':library);
   const entry=report.cases[name+'/'+(library==='ordinary'?'before':'after')];
   const measured=execute(entry.file,bin,'bench');
   const target=entry.runtime[runtime]??={};
   for(const mode of ['construct','valid']){
    const m=measured[mode],output=target[mode]??={processMedians:[],samples:[],checksums:[],iterations:[],warmups:[]};
    assert.ok(Number.isFinite(m.checksum)&&m.checksum!==0&&m.samples.length===7&&m.iterations>0);
    output.processMedians.push(median(m.samples));output.samples.push(m.samples);output.checksums.push(m.checksum);output.iterations.push(m.iterations);output.warmups.push(m.warmup);
   }
  }
 }
 console.log(runtime,'process',pass+1,'/ 9');
 writeFileSync('bench/build-time/settled-results.partial.json',JSON.stringify(report,null,2)+'\n');
}
for(const entry of Object.values(report.cases))for(const runtime of Object.values(entry.runtime))for(const data of Object.values(runtime))data.median=median(data.processMedians);
assert.equal(hash('packages/rolldown/src/index.ts'),report.environment.pluginHash);
assert.equal(hash('src/index.ts'),report.environment.sourceHash);
report.completed=true;
writeFileSync('bench/build-time/settled-results.json',JSON.stringify(report,null,2)+'\n');
const fixtures=JSON.parse(readFileSync('bench/build-time/fixtures.json'));fixtures.profiles=fixtures.profiles.filter(p=>profiles.some(c=>c.id===p.id));
writeFileSync('bench/build-time/timed-fixtures.json',JSON.stringify(fixtures,null,2)+'\n');
for(const profile of profiles)for(const runtime of Object.keys(runtimes)){
 const lookup=(library,version='after')=>report.cases[profile.id+'-'+library+'/'+version].runtime[runtime];
 console.log(runtime,profile.id,...['construct','valid'].map(mode=>`${mode}: ${Math.round(lookup('loculus','before')[mode].median)} → ${Math.round(lookup('loculus')[mode].median)} / Val ${Math.round(lookup('valibot')[mode].median)}`));
}
