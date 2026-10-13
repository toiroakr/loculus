import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const option=name=>process.argv.find(arg=>arg.startsWith(name+'='))?.slice(name.length+1);
const dir=resolve(option('--workers-dir')??'bench/optimization-3/supplement-generated');
const before=resolve(option('--before-dir')??dir+'/before');
const manifest=JSON.parse(readFileSync(dir+'/manifest.json','utf8'));
const bin=option('--runtime')??process.execPath;
const execute=(directory,name)=>{const result=spawnSync(bin,[resolve(directory,name+'.mjs'),'verify'],{encoding:'utf8',timeout:60000});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout)};
const results=[];
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const sourceHash=hash('src/index.ts');
for(const id of [...new Set(manifest.map(candidate=>candidate.id))]){
 const ordinary=manifest.find(c=>c.id===id&&c.library==='loculus'&&c.optimized===false);
 const expected=execute(dir,ordinary.name);
 for(const candidate of manifest.filter(c=>c.id===id)){
  const actual=execute(dir,candidate.name);assert.deepEqual(actual,expected,candidate.name);results.push({id,name:candidate.name,version:'after',matchesOutputIssueCountPaths:true});
  if(candidate.library==='loculus'){assert.deepEqual(execute(before,candidate.name),expected,candidate.name+'/before');results.push({id,name:candidate.name,version:'before',matchesOutputIssueCountPaths:true})}
 }
}
const file=option('--output')??'bench/optimization-3/supplement-semantics-results.json';
assert.equal(hash('src/index.ts'),sourceHash);
writeFileSync(file,JSON.stringify({supplement:true,sourceHash,fixturesHash:hash('bench/optimization-3/supplement-fixtures.mjs'),runtime:bin,results,completed:true},null,2)+'\n');console.log(JSON.stringify(results));
