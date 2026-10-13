import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {profiles,libraries,imports,prelude} from './fixtures.mjs';
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const run=JSON.parse(readFileSync('bench/coverage/results.json'));if(process.argv.includes('--with-scalars'))Object.assign(run.cases,JSON.parse(readFileSync('bench/coverage/scalar-results.json')).cases);
const groups={primitives:profiles.filter(p=>/^(string|number|boolean|enum|literal|date)-?/.test(p.id)),presence:profiles.filter(p=>p.id.startsWith('presence-')),arrays:profiles.filter(p=>p.id.startsWith('array-')),composition:profiles.filter(p=>/^(transform|refine|union|discriminated|intersection)/.test(p.id)),objects:profiles.filter(p=>/^(object|width|entries|entry)-/.test(p.id))};
if(process.argv.includes('--with-scalars'))groups['scalar-fields']=profiles.filter(p=>p.id.startsWith('scalar-'));
const report={sourceHash:hash('src/index.ts'),distHash:hash('dist/index.d.ts'),typescript:JSON.parse(readFileSync('node_modules/typescript/package.json')).version,date:new Date().toISOString(),policy:{freshProcesses:3,copiesPerCase:20,strict:true,skipLibCheck:true,ambientTypes:[],inference:'Input and Output plus a valid output assignment; xor excluded because Valibot lacks a native type-preserving xor constructor'},groups:{}};
const literal=x=>{if(x&&typeof x==='object'&&'$date'in x)return `new Date(${JSON.stringify(x.$date)})`;if(x&&typeof x==='object'&&'$undefined'in x)return 'undefined';if(Array.isArray(x))return '['+x.map(literal).join(',')+']';if(x&&typeof x==='object')return '{'+Object.entries(x).map(([k,v])=>JSON.stringify(k)+':'+literal(v)).join(',')+'}';return JSON.stringify(x);};
for(const[group,cases]of Object.entries(groups)){
 report.groups[group]={caseIds:cases.map(p=>p.id),libraries:{}};
 for(const[index,library]of libraries.entries()){
  let source=imports[library].replace('../../dist','../../../dist')+'\n'+prelude.replace('(value)=>','(value:string)=>')+'\n';
  for(let copy=0;copy<20;copy++)for(const p of cases){const id=p.id.replaceAll('-','_')+'_'+copy;const output=run.cases[p.id+'-loculus'].runtime.node.verified.good[0].value;source+=`export const ${id}=${p.expressions[index]};export type O_${id}=${['l.Output','z.output','v.InferOutput'][index]}<typeof ${id}>;export type I_${id}=${['l.Input','z.input','v.InferInput'][index]}<typeof ${id}>;export const value_${id}:O_${id}=${literal(output)};\n`;}
  const path=`bench/coverage/generated/types-${group}-${library}.ts`;writeFileSync(path,source);writeFileSync(path+'.json',JSON.stringify({compilerOptions:{strict:true,skipLibCheck:true,noEmit:true,types:[],target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext'},files:[resolve(path)]}));report.groups[group].libraries[library]={fixtureHash:hash(path),samples:[]};
 }
}
for(let pass=0;pass<3;pass++)for(const[group]of Object.entries(groups))for(let offset=0;offset<3;offset++){
 const library=libraries[(pass+offset)%3];const filename=`bench/coverage/generated/types-${group}-${library}.ts.json`;
 const r=spawnSync(resolve('node_modules/.bin/tsc'),['-p',filename,'--extendedDiagnostics'],{encoding:'utf8',timeout:90000});assert.equal(r.status,0,r.stdout+r.stderr);
 const metrics=Object.fromEntries(r.stdout.split('\n').map(line=>{const i=line.indexOf(':');return i<0?null:[line.slice(0,i),line.slice(i+1).trim()];}).filter(Boolean));report.groups[group].libraries[library].samples.push(metrics);console.log(`${group}/${library}/${pass+1}: ${metrics['Check time']}, ${metrics.Instantiations} instantiations`);
}
for(const group of Object.values(report.groups))for(const library of Object.values(group.libraries)){const median=key=>{const v=library.samples.map(m=>parseFloat(m[key])).sort((a,b)=>a-b);return v[1];};library.checkSeconds=median('Check time');library.instantiations=median('Instantiations');library.memoryKiB=median('Memory used');}
const outputFile=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)??'bench/coverage/type-results.json';
assert.equal(hash('src/index.ts'),report.sourceHash);report.completed=true;writeFileSync(outputFile,JSON.stringify(report,null,2)+'\n');
