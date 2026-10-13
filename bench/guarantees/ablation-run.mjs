import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {cpus} from 'node:os';
const manifest=JSON.parse(readFileSync('bench/guarantees/ablation-manifest.json'));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const bins={node:process.execPath,bun:resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun')};
const execute=(file,bin,mode)=>{const r=spawnSync(bin,[file,mode],{encoding:'utf8',timeout:60000});assert.equal(r.status,0,file+' '+r.stderr);return JSON.parse(r.stdout);};
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const unique=new Map();const aliases={};
for(const c of manifest.cases){assert.equal(hash(c.file),c.hash);if(unique.has(c.hash)){aliases[c.id]=unique.get(c.hash).id;}else{unique.set(c.hash,c);}}
const entries=[...unique.values()];
const report={completed:false,environment:{date:new Date().toISOString(),node:process.version,bun:spawnSync(bins.bun,['--version'],{encoding:'utf8'}).stdout.trim(),cpu:cpus()[0].model,sourceHash:manifest.sourceHash,pluginHash:manifest.pluginHash,manifestHash:hash('bench/guarantees/ablation-manifest.json')},policy:{freshProcesses:11,rounds:7,warmupMilliseconds:30,wideWarmupMilliseconds:500,roundMilliseconds:8,modes:['construct','valid','invalid'],scope:'Current runtime and current Rolldown-generated consumers; construct includes full schema creation and one validation; repeated modes exclude creation; generation/build excluded from all timings; complete outputs and complete issues consumed, 32 retained schemas/results; identical executable hashes measured once, aliases declared before timing; each variant/profile contrasted against current baseline, all three modes and both runtimes.'},aliases,cases:{}};
for(const c of entries){
  report.cases[c.id]={...c,runtime:{}};
  for(const bin of Object.values(bins)){
    const actual=execute(c.file,bin,'verify');
    if(c.pipeline==='ordinary'||c.pipeline==='generated'){
      const base=manifest.cases.find(x=>x.profile===c.profile&&x.pipeline===c.pipeline&&x.variant==='baseline');
      if(!['first-unknown','no-array-root-check'].includes(c.variant))assert.deepEqual(actual,execute(base.file,bin,'verify'),c.id);
    }
  }
}
console.log('verified',entries.length,'unique workers;',manifest.cases.length,'declared consumers');
for(const [runtime,bin]of Object.entries(bins))for(let pass=0;pass<11;pass++){
  let seed=0xabc123+pass;const order=[...entries];
  for(let i=order.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[order[i],order[j]]=[order[j],order[i]];}
  for(let i=0;i<entries.length;i++){
    const entry=order[i];
    const measured=execute(entry.file,bin,'bench');
    const target=report.cases[entry.id].runtime[runtime]??={};
    for(const mode of report.policy.modes){
      const m=measured[mode],data=target[mode]??={processMedians:[],samples:[],checksums:[],iterations:[],warmups:[]};
      assert.ok(Number.isFinite(m.checksum)&&m.checksum!==0&&m.samples.length===7&&m.iterations>0);
      data.processMedians.push(median(m.samples));data.samples.push(m.samples);data.checksums.push(m.checksum);data.iterations.push(m.iterations);data.warmups.push(m.warmup);
    }
    if((i+1)%40===0)console.log(runtime,'process',pass+1,'worker',i+1,'/',entries.length);
  }
  console.log(runtime,'independent process',pass+1,'/ 11');
  writeFileSync('bench/guarantees/ablation-results.partial.json',JSON.stringify(report,null,2)+'\n');
}
for(const c of Object.values(report.cases))for(const runtime of Object.values(c.runtime))for(const mode of Object.values(runtime))mode.median=median(mode.processMedians);
assert.equal(hash('src/index.ts'),manifest.sourceHash);assert.equal(hash('packages/rolldown/src/index.ts'),manifest.pluginHash);
report.completed=true;writeFileSync('bench/guarantees/ablation-results.json',JSON.stringify(report,null,2)+'\n');console.log('completed');
