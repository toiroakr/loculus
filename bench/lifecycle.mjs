import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { createHash } from 'node:crypto';
import { libraries, profiles, inputFixture, expectedValues, expectedIssueCounts } from './lifecycle-fixtures.mjs';
const report = {
 environment:{node:process.version,cpu:cpus()[0]?.model,platform:process.platform,arch:process.arch,date:new Date().toISOString(),versions:Object.fromEntries(['zod','valibot'].map(n=>[n,JSON.parse(readFileSync(`node_modules/${n}/package.json`,'utf8')).version]))},
 protocol:{coldSamples:15,repeatedProcesses:3,roundsPerProcess:7,iterations:50000,warmup:10000,cold:'fresh Node process per profile/library/dataset/sample; no validation warmup',order:'rotate libraries each sample; serial child processes',repeated:'schema once, then warmed validation; normalization separately included',excluded:'Node boot excluded from importThroughFirstMs; argv token parsing, DOM extraction, network, actual HTTP serving excluded; OS filesystem cache not cleared',wall:'processWallMs includes Node startup, harness and IPC; cold worker only'},
 cases:{},hashes:{},
};
const capturedFiles = ['src/index.ts','dist/index.js','bench/lifecycle.mjs','bench/lifecycle-worker.mjs','bench/lifecycle-fixtures.mjs'];
for (const file of capturedFiles) report.hashes[file] = createHash('sha256').update(readFileSync(file)).digest('hex');
for (const profile of profiles) {
 report.cases[profile] = {};
 for(const dataset of ['valid','invalid']) {
  const raw=inputFixture(profile,dataset);
  const bucket=Object.fromEntries(libraries.map(n=>[n,{cold:[],repeated:[]} ]));
  report.cases[profile][dataset]={input:profile==='form'?Object.fromEntries(raw):raw,expected:dataset==='valid'?expectedValues[profile]:{issueCount:expectedIssueCounts[profile]},libraries:bucket};
  for(let round=0;round<15;round++) {
   for(let offset=0;offset<libraries.length;offset++) {
    const library=libraries[(offset+round)%libraries.length];
    const start=performance.now();
    const stdout=execFileSync(process.execPath,['bench/lifecycle-worker.mjs',profile,library,dataset,'cold'],{encoding:'utf8'});
    bucket[library].cold.push({...JSON.parse(stdout),processWallMs:performance.now()-start});
   }
  }
  console.log(`${profile}/${dataset}: 75 fresh-process measurements complete`);
  for(let round=0;round<3;round++)for(let offset=0;offset<libraries.length;offset++) {
   const library=libraries[(offset+round)%libraries.length];
   const stdout=execFileSync(process.execPath,['bench/lifecycle-worker.mjs',profile,library,dataset,'repeated'],{encoding:'utf8'});
   bucket[library].repeated.push(JSON.parse(stdout));
  }
  console.log(`${profile}/${dataset}: repeated measurements complete`);
 }
}
function summary(samples){const v=[...samples].sort((a,b)=>a-b);const middle=Math.floor(v.length/2);return{median:v.length%2?v[middle]:(v[middle-1]+v[middle])/2,p10:v[Math.floor((v.length-1)*.1)],p90:v[Math.ceil((v.length-1)*.9)],min:v[0],max:v.at(-1)};}
for(const variants of Object.values(report.cases))for(const c of Object.values(variants))for(const record of Object.values(c.libraries)){
 record.summary={cold:Object.fromEntries(Object.keys(record.cold[0]).filter(k=>k!=='sink').map(k=>[k,summary(record.cold.map(r=>r[k]))])),repeated:Object.fromEntries(['validation','withInput'].map(k=>[k,summary(record.repeated.flatMap(r=>r.repeated[k]))]))};
}
for (const file of capturedFiles) if (report.hashes[file] !== createHash('sha256').update(readFileSync(file)).digest('hex')) throw new Error(`Measured file changed during benchmark: ${file}`);
writeFileSync('bench/lifecycle-results.json',JSON.stringify(report,null,2)+'\n');
const heading=`| Case | ${libraries.join(' | ')} |\n|---|${libraries.map(()=>'---:').join('|')}|`;
const table=(metric)=>profiles.map(p=>['valid','invalid'].map(d=>`| ${p}/${d} | ${libraries.map(n=>metric(report.cases[p][d].libraries[n]).toFixed(2)).join(' | ')} |`).join('\n')).join('\n');
writeFileSync('bench/LIFECYCLE-RESULTS.md',`# Single-use and reused schema comparison\n\n${report.environment.node}, ${report.environment.cpu}, Zod ${report.environment.versions.zod}, Valibot ${report.environment.versions.valibot}.\n\n## Single use: schema construction + normalization + first validation (microseconds)\n\n15 fresh processes per cell; medians.\n\n${heading}\n${table(r=>r.summary.cold.schemaAndFirstMs.median*1000)}\n\n## Single use including library import (milliseconds)\n\n${heading}\n${table(r=>r.summary.cold.importThroughFirstMs.median)}\n\n## Reused schema: validation only (nanoseconds)\n\nThree fresh processes, seven rounds per process after warmup; median of 21 round means.\n\n${heading}\n${table(r=>r.summary.repeated.validation.median)}\n\n## Reused schema: input normalization + validation (nanoseconds)\n\n${heading}\n${table(r=>r.summary.repeated.withInput.median)}\n\n[Protocol and cases](LIFECYCLE.md). [Raw samples](lifecycle-results.json).\n`);
console.log(JSON.stringify({valid:Object.fromEntries(profiles.map(p=>[p,Object.fromEntries(libraries.map(n=>[n,report.cases[p].valid.libraries[n].summary]))]))},null,2));
