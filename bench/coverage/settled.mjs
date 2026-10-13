import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {cpus} from 'node:os';
const option=name=>process.argv.find(arg=>arg.startsWith(name+'='))?.slice(name.length+1);
const dir=resolve(option('--workers-dir')??'bench/coverage/generated'),target=dir+'/settled';mkdirSync(target,{recursive:true});
const beforeDir=resolve(option('--before-dir')??dir+'/before');
const baselineSource=option('--baseline-source')??'bench/coverage/before-optimization/index.ts.txt';
const ids=process.argv.slice(2).find(arg=>!arg.startsWith('--'))?.split(',');
const passes=Number(process.env.BENCH_PROCESSES??9);
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const compiled=process.argv.includes('--compiled');
const requestedModes=option('--modes');
const modes=requestedModes?requestedModes.split(','):compiled?['valid','invalid']:['valid','invalid','construct'];
assert.ok(modes.length&&new Set(modes).size===modes.length&&modes.every(mode=>['valid','invalid','construct'].includes(mode)));
assert.ok(!compiled||!modes.includes('construct'));
const candidates=JSON.parse(readFileSync(dir+'/manifest.json')).filter(c=>(compiled?(c.library==='loculus'?c.optimized===true:c.library==='zod'?c.optimized==='compiled':c.optimized===false):c.optimized===false)&&(!ids||ids.includes(c.id)));
const availableIds=new Set(candidates.filter(c=>c.library==='loculus').map(c=>c.id));
const manifest=candidates.filter(c=>availableIds.has(c.id));
const sourceFile=option('--source')??'src/index.ts';
const outputFile=option('--output')??'bench/coverage/settled-results.json';
const report={environment:{date:new Date().toISOString(),sourceHash:hash(sourceFile),baselineHash:hash(baselineSource),node:process.version,bun:spawnSync(resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun'),['--version'],{encoding:'utf8'}).stdout.trim(),cpu:cpus()[0].model},policy:{freshProcesses:passes,rounds:7,warmupMilliseconds:30,roundMilliseconds:8,unit:'ns per operation',modes,scope:(compiled?'compiled Loculus and explicit Zod compile, ordinary Valibot; generation completes before repeated validation timing; construction excluded':'ordinary schemas; construction includes one valid validation')+'; same consumed outputs and rotating inputs as coverage suite'},cases:{}};
const execute=(file,bin,mode)=>{const r=spawnSync(bin,[file,mode],{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
for(const c of manifest)for(const version of c.library==='loculus'?['before','after']:['after']){
 const path=resolve(version==='before'?beforeDir:dir,c.name+'.mjs');
 let code=readFileSync(path,'utf8');
 const start=code.indexOf('    const iterations = constructing ? 500 : 5e3;');
 assert.ok(start>=0,c.name);
 const end=code.indexOf('    const samples = [];',start);
 const old=code.slice(start,end);
 const run=old.slice(old.indexOf('    let checksum = 0;'),old.indexOf('    for (let i = 0; i < warmup; i++)'));
 code=code.slice(0,start)+run+`    let warmup=0;const warming=performance.now();
    do{for(let i=0;i<256;i++)run(i);warmup+=256;}while(performance.now()-warming<30);
    const iterations=Math.max(256,Math.min(1000000,Math.ceil(warmup*8/(performance.now()-warming))));
`+code.slice(end);
 if(compiled||requestedModes){
  const loop='mode === "bench" ? ["valid", "invalid", "construct"] : [mode]';
  assert.ok(code.includes(loop),c.name);
  code=code.replace(loop,'mode === \"bench\" ? '+JSON.stringify(modes)+' : [mode]');
 }
 const file=target+'/'+c.name+'-'+version+'.mjs';writeFileSync(file,code);
 const probes=execute(file,process.execPath,'verify');
 if(version==='after'&&c.library==='loculus')assert.deepEqual(probes,execute(target+'/'+c.name+'-before.mjs',process.execPath,'verify'));
 report.cases[c.name+'/'+version]={...c,version,fixtureHash:hash(file),runtime:{}};
}
for(const runtime of ['node','bun']){
 const bin=runtime==='node'?process.execPath:resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun');
 for(let pass=0;pass<passes;pass++){
  for(let i=0;i<manifest.length;i++){
   const c=manifest[(i+pass)%manifest.length];
   const versions=c.library==='loculus'?(pass%2?['after','before']:['before','after']):['after'];
   for(const version of versions){const key=c.name+'/'+version;
    const measured=execute(target+'/'+c.name+'-'+version+'.mjs',bin,'bench');
    const entry=report.cases[key].runtime[runtime]??={};
    assert.deepEqual(Object.keys(measured).sort(),[...modes].sort());
    for(const mode of modes){
     const m=entry[mode]??={processMedians:[],samples:[],checksums:[],iterations:[],warmups:[]};
     m.samples.push(measured[mode].samples);m.processMedians.push(median(measured[mode].samples));m.checksums.push(measured[mode].checksum);m.iterations.push(measured[mode].iterations);m.warmups.push(measured[mode].warmup);
    }
   }
  }
  console.log(runtime,'process',pass+1,'/',passes);
  writeFileSync(outputFile+'.partial.json',JSON.stringify({...report,progress:{runtime,process:pass+1},completed:false},null,2)+'\n');
 }
}
for(const c of Object.values(report.cases))for(const e of Object.values(c.runtime))for(const m of Object.values(e)){m.median=median(m.processMedians);}
assert.equal(hash(sourceFile),report.environment.sourceHash);report.completed=true;
writeFileSync(outputFile,JSON.stringify(report,null,2)+'\n');
for(const id of [...new Set(manifest.map(c=>c.id))])for(const runtime of ['node','bun']){
 const lookup=(lib,ver='after')=>{const c=manifest.find(c=>c.id===id&&c.library===lib);return report.cases[c.name+'/'+ver].runtime[runtime];};
 const a=lookup('loculus'),b=lookup('loculus','before'),v=lookup('valibot');
 console.log(runtime,id,...modes.map(m=>`${m}: ${Math.round(b[m].median)} → ${Math.round(a[m].median)} / Val ${Math.round(v[m].median)}`));
}
