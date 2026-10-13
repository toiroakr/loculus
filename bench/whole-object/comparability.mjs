import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {profiles} from '../single-use/fixtures.mjs';
const cases=[];
for(const profile of profiles){
 const outputs={};
 const input=raw=>{
  if(!profile.format)return raw;
  const entries=Object.entries(raw).flatMap(([k,value])=>(Array.isArray(value)?value:[value]).map(v=>[k,v]));
  if(profile.format==='url')return new URLSearchParams(entries);
  const form=new FormData();for(const[k,v]of entries)form.append(k,v);return form;
 };
 for(const library of ['ordinary','generated','zod','valibot']){
  const module=await import(new URL(`./generated/${profile.id}-${library}-consumer.mjs`,import.meta.url));
  outputs[library]=profile.invalid.map(raw=>{const result=module.validate(input(raw));return{rejected:!!result.issues,issueCount:result.issues?.length??0};});
 }
 assert.deepEqual(outputs.generated,outputs.ordinary,profile.id);
 const peers=Object.fromEntries(['zod','valibot'].map(library=>[library,{sameRejection:outputs[library].every((result,i)=>result.rejected===outputs.ordinary[i].rejected),sameIssueCount:outputs[library].every((result,i)=>result.issueCount===outputs.ordinary[i].issueCount)}]));
 cases.push({id:profile.id,outputs,peers});
}
writeFileSync('bench/whole-object/comparability-results.json',JSON.stringify({completed:true,scope:'invalid fixtures; acceptance/rejection parity required for invalid peer claims; error count differences retained and reported',cases},null,2)+'\n');
console.log('Verified invalid rejection status for all 107 profiles.');
for(const c of cases)for(const [lib,result]of Object.entries(c.peers))if(!result.sameRejection||!result.sameIssueCount)console.log(c.id,lib,result);
