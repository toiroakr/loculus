import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';

const directory='experiments/bun/generated';
const bun=process.env.BUN_BIN ?? 'bun';
const fixtures=JSON.parse(readFileSync(`${directory}/fixtures.json`));
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const execute=(command,args,timeout=120000)=>{
  const start=performance.now();
  const result=spawnSync(command,args,{encoding:'utf8',timeout,maxBuffer:8*1024*1024});
  assert.equal(result.status,0,`${command} ${args.join(' ')}\n${result.stderr}`);
  return {...result,wallMs:performance.now()-start};
};
const records=stdout=>stdout.trim().split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
const summarize=samples=>{
  const sorted=samples.slice().sort((a,b)=>a-b);
  return {median:sorted[Math.floor(sorted.length/2)],min:sorted[0],max:sorted.at(-1),samples};
};
const sizes=path=>({bytes:statSync(path).size,gzipBytes:gzipSync(readFileSync(path)).length,hash:hash(path)});
const report={environment:{date:new Date().toISOString(),node:process.version,bun:execute(bun,['--version']).stdout.trim(),platform:process.platform,arch:process.arch,cpu:cpus()[0].model,versions:Object.fromEntries(['zod','valibot'].map(name=>[name,JSON.parse(readFileSync(`node_modules/${name}/package.json`)).version])),sourceHash:hash('src/index.ts'),distHash:hash('dist/index.js')},policy:{rounds:7,freshProcesses:3,coldProcesses:15,warmup:10000,constructionWarmup:100,constructionIterations:500,reference:'identical-byte prebuilt ESM; Standard Schema validation, consumed output/checksum',coldScope:'process launch, module initialization, schema construction, one valid validation, JSON output and exit',constructScope:'schema construction plus one valid validation per iteration after module initialization; optimized modes include compile/JIT construction',binaryScope:'bun build --compile --minify, includes Bun runtime; no bytecode flag',browserScope:'bun build --target browser --minify; schema and Standard Schema validate exports; excludes benchmark harness',zodModes:'base jitless:true; optimized jitless:false',loculusModes:'ordinary object(); no schema compiler API'},cases:{}};
const persist=()=>writeFileSync('experiments/bun/results.json',JSON.stringify(report,null,2)+'\n');
execute(bun,['build','--compile','--minify',`${directory}/baseline.mjs`,'--outfile',`${directory}/baseline`]);
report.baseline=sizes(`${directory}/baseline`);
const candidates=[];
for(const fixture of fixtures){
  console.log(`Building/verifying ${fixture.name}`);
  const source=`${directory}/${fixture.name}.mjs`;
  const golden=records(execute(process.execPath,[source,'verify']).stdout);
  assert.equal(golden.length,fixture.probeCount);
  const expectedOnce=records(execute(process.execPath,[source,'once']).stdout);
  const entry={fixture,sourceHash:hash(source),probes:golden,node:{},bun:{}};
  report.cases[fixture.name]=entry;
  assert.deepEqual(records(execute(bun,[source,'verify']).stdout),golden);
  assert.deepEqual(records(execute(bun,[source,'once']).stdout),expectedOnce);
  candidates.push({name:fixture.name,key:'node',command:process.execPath,prefix:[source]},{name:fixture.name,key:'bun',command:bun,prefix:[source]});
  if(!fixture.optimized){
    const output=resolve(`${directory}/${fixture.name}`);
    const built=execute(bun,['build','--compile','--minify',source,'--outfile',output]);
    entry.standalone={...sizes(output),buildMs:built.wallMs};
    assert.deepEqual(records(execute(output,['verify']).stdout),golden);
    assert.deepEqual(records(execute(output,['once']).stdout),expectedOnce);
    candidates.push({name:fixture.name,key:'standalone',command:output,prefix:[]});
    const browser=`${directory}/${fixture.name}-browser.js`;
    execute(bun,['build','--target','browser','--format','esm','--minify',`${directory}/${fixture.name}-browser.ts`,'--outfile',browser]);
    const exported=await import(resolve(browser));
    assert.deepEqual(entry.probes.map((probe)=>{
      const original=JSON.parse(readFileSync(`experiments/perry/generated/${fixture.name}-direct.ts`,'utf8').match(/const probes=(.*);/)[1]);
      const r=exported.validate(original[probe.index]);
      return JSON.parse(JSON.stringify({kind:'probe',index:probe.index,ok:!r.issues,value:r.value,issueCount:r.issues?r.issues.length:0}));
    }),golden);
    entry.browser=sizes(browser);
  }
  persist();
}
console.log('Builds and semantic checks finished; measuring sequentially.');
const rotate=(array,index)=>array.slice(index%array.length).concat(array.slice(0,index%array.length));
for(const candidate of candidates){const entry=report.cases[candidate.name][candidate.key];entry.coldMs={samples:[]};for(const dataset of ['valid','invalid','construct'])entry[dataset]={samples:[],runs:[]};}
for(let i=0;i<report.policy.coldProcesses;i++){
  for(const c of rotate(candidates,i))report.cases[c.name][c.key].coldMs.samples.push(execute(c.command,[...c.prefix,'once']).wallMs);
}
for(const dataset of ['valid','invalid','construct']){
  for(let i=0;i<report.policy.freshProcesses;i++){
    for(const c of rotate(candidates,i)){
      console.log(`Measuring ${c.name}/${c.key}/${dataset}/${i+1}`);
      const rows=records(execute(c.command,[...c.prefix,dataset]).stdout);
      const entry=report.cases[c.name];
      assert.deepEqual(rows.filter(row=>row.kind==='probe'),entry.probes);
      const rounds=rows.filter(row=>row.kind==='bench');
      assert.equal(rounds.length,report.policy.rounds);
      for(const r of rounds){
        const count=dataset==='invalid'?entry.probes[1].issueCount:Object.keys(entry.probes[0].value).length;
        assert.equal(r.sink,((dataset==='construct'?100:10000)+(r.round+1)*r.iterations)*count);
        assert.ok(r.elapsedMs>0);
      }
      entry[c.key][dataset].samples.push(...rounds.map(r=>r.elapsedMs*1e6/r.iterations));
      entry[c.key][dataset].runs.push(rounds);
    }
  }
  persist();
}
for(const c of candidates){const entry=report.cases[c.name][c.key];entry.coldMs=summarize(entry.coldMs.samples);for(const dataset of ['valid','invalid','construct'])entry[dataset]={...entry[dataset],...summarize(entry[dataset].samples)};}
assert.equal(hash('src/index.ts'),report.environment.sourceHash);
assert.equal(hash('dist/index.js'),report.environment.distHash);
report.completed=true;
persist();
console.log('Finished: experiments/bun/results.json');
