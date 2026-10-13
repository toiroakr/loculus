import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {profiles} from './mixed-fixtures.mjs';
const option=name=>process.argv.find(arg=>arg.startsWith(name+'='))?.slice(name.length+1);
const dir=resolve(option('--workers-dir')??'bench/optimization-3/mixed-generated');
const before=resolve(option('--before-dir')??dir+'/before');
const manifest=JSON.parse(readFileSync(dir+'/manifest.json','utf8'));
const bin=option('--runtime')??process.execPath;
const execute=(directory,name)=>{const result=spawnSync(bin,[resolve(directory,name+'.mjs'),'verify'],{encoding:'utf8',timeout:60000});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout)};
const results=[];
const errorGranularityDifferences=[];
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const sourceHash=hash('src/index.ts');
for(const id of [...new Set(manifest.map(candidate=>candidate.id))]){
 const ordinary=manifest.find(c=>c.id===id&&c.library==='loculus'&&c.optimized===false);
 const expected=execute(dir,ordinary.name);
 for(const candidate of manifest.filter(c=>c.id===id)){
  const actual=execute(dir,candidate.name);
  assert.deepEqual(actual.good,expected.good,candidate.name+'/good');
  assert.deepEqual(actual.bad,expected.bad,candidate.name+'/bad');
  const fixture=profiles.find(profile=>profile.id===id);
  for(let i=0;i<expected.probes.length;i++) {
   if(candidate.library==='valibot'&&Array.isArray(fixture.probes[i])) {
    assert.equal(actual.probes[i].ok,false);
    assert.equal(expected.probes[i].ok,false);
    errorGranularityDifferences.push({id,name:candidate.name,probeIndex:i,reason:'Valibot object reports missing fields for an array root; Loculus and Zod reject the root type.',expected:expected.probes[i],actual:actual.probes[i],timed:false});
   } else if(id==='mixed-http-query-12'&&fixture.probes[i]?.tags===null&&candidate.library!=='loculus') {
    assert.deepEqual(actual.probes[i],{ok:false,issueCount:1,issuePaths:[['tags']]});
    assert.deepEqual(expected.probes[i],{ok:false,issueCount:1,issuePaths:[['tags',0]]});
    errorGranularityDifferences.push({id,name:candidate.name,probeIndex:i,reason:'Peer array/string unions report the union field; Loculus reports wrapped item 0.',expected:expected.probes[i],actual:actual.probes[i],timed:false});
   } else assert.deepEqual(actual.probes[i],expected.probes[i],candidate.name+'/probe-'+i);
  }
  results.push({id,name:candidate.name,version:'after',matchesOutputIssueCountPathsExceptRecordedUntimedRootArray:true});
  if(candidate.library==='loculus'){assert.deepEqual(execute(before,candidate.name),expected,candidate.name+'/before');results.push({id,name:candidate.name,version:'before',matchesOutputIssueCountPaths:true})}
 }
}
const file=option('--output')??'bench/optimization-3/mixed-semantics-results.json';
assert.equal(hash('src/index.ts'),sourceHash);
writeFileSync(file,JSON.stringify({additionalMixedSchemas:true,sourceHash,fixturesHash:hash('bench/optimization-3/mixed-fixtures.mjs'),runtime:bin,results,errorGranularityDifferences,completed:true},null,2)+'\n');console.log(JSON.stringify(results));
