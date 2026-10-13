import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const dir='bench/build-time/generated/diagnosis';mkdirSync(dir,{recursive:true});
const read=(profile,lib)=>readFileSync(`bench/build-time/generated/${profile}-${lib}.mjs`,'utf8');
const replace=(source,from,to)=>{assert.ok(source.includes(from),from);return source.replace(from,to);};
const ownField=source=>replace(source,'validators[i](own(raw, key) ? raw[key] : void 0)','validators[i](raw[key])');
const valOwn=source=>source.replaceAll('if (key in input ||','if (Object.hasOwn(input, key) ||').replaceAll('= key in input ?','= Object.hasOwn(input, key) ?').replace('if (input && typeof input === "object") {','if (input && typeof input === "object" && !Array.isArray(input)) {');
const s=read('object-strict','generated'),v=read('object-strict','valibot'),w=read('width-100','generated'),wv=read('width-100','valibot');
const fusedBody=`const validate=(input)=>{
if(typeof input!=="object"||input===null||Array.isArray(input))return fail("Expected an object","invalid_type");
const output={};let issues;
${Array.from({length:100},(_,i)=>`const v${i}=own(input,"f${i}")?input.f${i}:void 0;if(typeof v${i}!=="string")(issues??=[]).push({message:"Expected a string",code:"invalid_type",path:["f${i}"]});else output.f${i}=v${i};`).join('\n')}
return issues?{issues}:{value:output};
};`;
const start=w.indexOf('const validate = (input) => {');assert.ok(start>0);const end=w.indexOf('\n\treturn {\n\t\tmeta:',start);assert.ok(end>start);
const variants={
 'strict-loculus':{profile:'object-strict',source:s},
 'strict-loculus-no-freeze':{profile:'object-strict',source:replace(s,'Object.freeze({ ...shape })','{ ...shape }')},
 'strict-loculus-reference':{profile:'object-strict',source:replace(s,'Object.freeze({ ...shape })','shape')},
 'strict-valibot':{profile:'object-strict',source:v},
 'strict-valibot-copy-freeze':{profile:'object-strict',source:replace(v,'entries: entries$1,','entries: Object.freeze({ ...entries$1 }),')},
 'strict-valibot-copy-freeze-own':{profile:'object-strict',source:valOwn(replace(v,'entries: entries$1,','entries: Object.freeze({ ...entries$1 }),'))},
 'wide-loculus':{profile:'width-100',source:w},
 'wide-loculus-no-own':{profile:'width-100',source:ownField(w)},
 'wide-valibot':{profile:'width-100',source:wv},
 'wide-valibot-own':{profile:'width-100',source:valOwn(wv)},
 'wide-loculus-fused':{profile:'width-100',source:w.slice(0,start)+fusedBody+w.slice(end)},
};
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const binaries={node:process.execPath,bun:resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun')};
const execute=(file,bin,mode)=>{const r=spawnSync(bin,[file,mode],{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
const report={completed:false,date:new Date().toISOString(),policy:{freshProcesses:9,scope:'Causal diagnostic variants; same retained-schema/result and recursive-checksum harness as build-time measurements; some variants change contracts and are not production candidates; fused variant supports only this fixed required-string object',modes:['construct','valid']},cases:{}};
for(const[name,variant]of Object.entries(variants)){
 const file=resolve(dir+'/'+name+'.mjs');writeFileSync(file,variant.source);
 report.cases[name]={profile:variant.profile,workerHash:createHash('sha256').update(variant.source).digest('hex'),runtime:{}};
 for(const bin of Object.values(binaries)){
  const output=execute(file,bin,'verify');
  if(name==='wide-loculus-fused')assert.deepEqual(output,execute(resolve(dir+'/wide-loculus.mjs'),bin,'verify'));
 }
}
const names=Object.keys(variants);
for(const[runtime,bin]of Object.entries(binaries))for(let pass=0;pass<9;pass++){
 for(let i=0;i<names.length;i++){
  const name=names[(i+pass)%names.length],measured=execute(resolve(dir+'/'+name+'.mjs'),bin,'bench');
  const target=report.cases[name].runtime[runtime]??={};
  for(const mode of ['construct','valid']){
   const entry=target[mode]??={processMedians:[],samples:[],checksums:[]};
   entry.processMedians.push(median(measured[mode].samples));entry.samples.push(measured[mode].samples);entry.checksums.push(measured[mode].checksum);
  }
 }
 console.log(runtime,'process',pass+1,'/9');
}
for(const c of Object.values(report.cases))for(const r of Object.values(c.runtime))for(const d of Object.values(r))d.median=median(d.processMedians);
report.completed=true;writeFileSync('bench/build-time/object-diagnosis-results.json',JSON.stringify(report,null,2)+'\n');
for(const[name,c]of Object.entries(report.cases))console.log(name,Object.fromEntries(Object.entries(c.runtime).map(([r,m])=>[r,Object.fromEntries(Object.entries(m).map(([k,v])=>[k,Math.round(v.median)]))])));
