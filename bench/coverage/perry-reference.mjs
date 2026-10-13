import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const scalarsOnly=process.argv.includes('--only-scalars');const r=JSON.parse(readFileSync(scalarsOnly?'bench/coverage/perry-scalar-results.json':'bench/coverage/perry-results.json'));assert.ok(r.completed);
const base=JSON.parse(readFileSync(scalarsOnly?'bench/coverage/scalar-results.json':'bench/coverage/results.json'));
const report={date:new Date().toISOString(),scope:'Node executes the identical-byte grouped Perry sources as ESM; both import modes must match the ordinary comparison',groups:{}};
for(const[key,g]of Object.entries(r.groups))for(const mode of ['single-file-native','direct-import']){
 const source=`bench/coverage/generated/perry-${key}${mode==='direct-import'?'-direct':''}.ts`;const file=source+'.mjs';writeFileSync(file,readFileSync(source));
 const checks=[];for(const id of g.profiles){const result=spawnSync(process.execPath,[resolve(file),id,'verify'],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);const actual=JSON.parse(result.stdout);const golden=base.cases[id+'-'+g.library].runtime.node.verified;for(const k of ['good','bad','probes'])assert.deepEqual(actual[k],golden[k].map(r=>r.ok?r:{ok:false}),key+'/'+mode+'/'+id);checks.push(id);}
 report.groups[key+'/'+mode]={sourceHash:createHash('sha256').update(readFileSync(source)).digest('hex'),verified:checks};
}
report.completed=true;writeFileSync(scalarsOnly?'bench/coverage/perry-scalar-reference-results.json':'bench/coverage/perry-reference-results.json',JSON.stringify(report,null,2)+'\n');console.log('All grouped Perry sources verified in Node.');
