import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const folder='bench/guarantees';
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const old=JSON.parse(readFileSync(folder+'/ablation-results.json'));
assert.ok(old.completed);
const manifest=JSON.parse(readFileSync(folder+'/ablation-manifest.json'));
assert.equal(hash(folder+'/ablation-manifest.json'),old.environment.manifestHash);
for(const file of ['ablation-results.json','ablation-manifest.json'])copyFileSync(folder+'/'+file,folder+'/'+file.replace('.json','.initial.json'));
for(const c of manifest.cases.filter(c=>c.variant==='du-static')){
  copyFileSync(c.file,c.file.replace('.mjs','.initial.mjs'));
  copyFileSync(c.file.replace('.mjs','-consumer.mjs'),c.file.replace('.mjs','-consumer.initial.mjs'));
}
const prepared=spawnSync(process.execPath,[folder+'/ablation-prepare.mjs','--only=du-static,lazy-standard-prototype'],{encoding:'utf8',timeout:60000});
assert.equal(prepared.status,0,prepared.stdout+prepared.stderr);
const updated=JSON.parse(readFileSync(folder+'/ablation-manifest.json'));
const targets=updated.cases.filter(c=>c.profile==='discriminated-union'||c.variant==='lazy-standard-prototype');
const bins={node:process.execPath,bun:resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun')};
const execute=(c,bin,mode)=>{const r=spawnSync(bin,[c.file,mode],{encoding:'utf8',timeout:60000});assert.equal(r.status,0,c.id+r.stderr);return JSON.parse(r.stdout);};
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const unique=new Map();
for(const c of targets){
  assert.equal(hash(c.file),c.hash);
  if(unique.has(c.hash)){old.aliases[c.id]=unique.get(c.hash).id;continue;}
  unique.set(c.hash,c);delete old.aliases[c.id];old.cases[c.id]={...c,runtime:{}};
  for(const bin of Object.values(bins))execute(c,bin,'verify');
}
const entries=[...unique.values()];
for(const [runtime,bin]of Object.entries(bins))for(let pass=0;pass<11;pass++){
  const ordered=pass%2?[...entries].reverse():entries;
  for(let i=0;i<ordered.length;i++){
    const c=ordered[(i+pass)%ordered.length],measured=execute(c,bin,'bench');
    const target=old.cases[c.id].runtime[runtime]??={};
    for(const mode of old.policy.modes){const m=measured[mode];assert.ok(m.samples.length===7&&m.checksum!==0);
      const data=target[mode]??={processMedians:[],samples:[],checksums:[],iterations:[],warmups:[]};data.processMedians.push(median(m.samples));data.samples.push(m.samples);data.checksums.push(m.checksum);data.iterations.push(m.iterations);data.warmups.push(m.warmup);}
  }
  console.log('refreshed',runtime,'process',pass+1,'/ 11');
}
for(const c of entries)for(const runtime of Object.values(old.cases[c.id].runtime))for(const mode of Object.values(runtime))mode.median=median(mode.processMedians);
old.environment.initialManifestHash=old.environment.manifestHash;
old.environment.manifestHash=hash(folder+'/ablation-manifest.json');
old.environment.refreshedAt=new Date().toISOString();
old.policy.incrementalRefresh={profiles:['discriminated-union'],additionalVariant:'lazy-standard-prototype',reason:'Static union prototype now reads the discriminator once before dispatch; all DU variants and peers remeasured together. Added prototype-shared lazy Standard Schema implementation. Other workers retain their identical hashes and original samples.',initialResultsHash:hash(folder+'/ablation-results.initial.json')};
for(const c of updated.cases)assert.equal(hash(c.file),c.hash);
writeFileSync(folder+'/ablation-results.json',JSON.stringify(old,null,2)+'\n');console.log('refresh complete');
