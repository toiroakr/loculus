import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const folder='bench/guarantees',dir=folder+'/generated/errors';mkdirSync(dir,{recursive:true});
const manifest=JSON.parse(readFileSync(folder+'/ablation-manifest.json'));
const report=JSON.parse(readFileSync(folder+'/ablation-results.json'));assert.ok(report.completed);
const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const unique=new Map(),entries=[];
const helper=`function consumeIssues(issues){let checksum=0;for(const issue of issues){checksum+=issue.message.length;for(const segment of issue.path??[]){const key=typeof segment==='object'?segment.key:segment;checksum+=typeof key==='number'?key:String(key).length;}}return checksum;}\n`;
for(const c of manifest.cases){
  const id=report.aliases[c.id]??c.id;
  if(unique.has(id))continue;
  assert.equal(digest(c.file),c.hash);
  const original=readFileSync(c.file,'utf8');
  let code=original.replace('consume(result.issues) + 1','consumeIssues(result.issues) + 1').replace(/for \(const mode of \[\s*"construct",\s*"valid",\s*"invalid"\s*\]\)/,'for (const mode of ["invalid"])');
  assert.notEqual(code,original);assert.ok(code.includes('consumeIssues(result.issues) + 1')&&code.includes('for (const mode of ["invalid"])'));
  code=helper+code;const file=`${dir}/${id}.mjs`;writeFileSync(file,code);
  const entry={id,file,hash:digest(file),originalHash:c.hash};unique.set(id,entry);entries.push(entry);
}
const bins={node:process.execPath,bun:resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun')};
const execute=(entry,bin,mode)=>{const r=spawnSync(bin,[entry.file,mode],{encoding:'utf8',timeout:60000});assert.equal(r.status,0,entry.id+r.stderr);return JSON.parse(r.stdout);};
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const refreshed={completed:false,policy:{scope:'Repeated invalid validation with retained full results and checksums of Standard Schema message/path only. No traversal of library-specific input/dataset/issue context. Original construction/valid samples retained with their unchanged original fixture hashes.',freshProcesses:11},cases:{}};
for(const c of entries){refreshed.cases[c.id]={...c,runtime:{}};for(const bin of Object.values(bins))execute(c,bin,'verify');}
for(const [runtime,bin]of Object.entries(bins))for(let pass=0;pass<11;pass++){
  let seed=0xecc12+pass;const order=[...entries];for(let i=order.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[order[i],order[j]]=[order[j],order[i]];}
  for(let i=0;i<order.length;i++){
    const c=order[i],m=execute(c,bin,'bench').invalid;assert.ok(m.samples.length===7&&m.checksum>0);
    const data=refreshed.cases[c.id].runtime[runtime]??={processMedians:[],samples:[],checksums:[],iterations:[],warmups:[]};data.processMedians.push(median(m.samples));data.samples.push(m.samples);data.checksums.push(m.checksum);data.iterations.push(m.iterations);data.warmups.push(m.warmup);
    if((i+1)%60===0)console.log('errors',runtime,'process',pass+1,'worker',i+1,'/',order.length);
  }
  console.log('errors',runtime,'process',pass+1,'/ 11');
}
for(const c of entries)for(const [runtime,data]of Object.entries(refreshed.cases[c.id].runtime)){data.median=median(data.processMedians);data.fixtureFile=c.file;data.fixtureHash=c.hash;report.cases[c.id].runtime[runtime].invalid=data;}
refreshed.completed=true;writeFileSync(folder+'/ablation-errors.json',JSON.stringify(refreshed,null,2)+'\n');
report.policy.invalidChecksumRefresh={date:new Date().toISOString(),reportHash:digest(folder+'/ablation-errors.json'),scope:refreshed.policy.scope};
writeFileSync(folder+'/ablation-results.json',JSON.stringify(report,null,2)+'\n');console.log('standardized error measurements complete');
