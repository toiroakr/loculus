import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {profiles} from '../single-use/fixtures.mjs';
const dir='bench/guarantees/generated/types';mkdirSync(dir,{recursive:true});
const declaration=readFileSync('dist/index.d.ts','utf8');assert.equal(declaration.split('readonly shape: S;').length,2);
const variants={baseline:declaration,readonly:declaration.replace('readonly shape: S;','readonly shape: Readonly<S>;')};
const selected=profiles.filter(p=>['width-1','width-100','supplement-rhf-items-10'].includes(p.id));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const compiler=resolve('node_modules/typescript/bin/tsc');
const execute=file=>spawnSync(process.execPath,[compiler,'-p',file+'.json','--extendedDiagnostics'],{encoding:'utf8',timeout:90000});
function configuration(file){writeFileSync(file+'.json',JSON.stringify({compilerOptions:{strict:true,skipLibCheck:true,noEmit:true,types:[],target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext'},files:[resolve(file)]}));}
const cases=[];const proofs={};
for(const [variant,text]of Object.entries(variants)){
  writeFileSync(`${dir}/${variant}.d.ts`,text);
  const proof=`${dir}/proof-${variant}.ts`;writeFileSync(proof,`import * as l from './${variant}.js';const s=l.object({name:l.string()});s.shape.name=l.string({min:3});`);configuration(proof);
  const checked=execute(proof);if(variant==='baseline')assert.equal(checked.status,0,checked.stdout+checked.stderr);else{assert.ok(checked.status!==0);assert.match(checked.stdout,/TS2540/);}proofs[variant]={status:checked.status,diagnostics:checked.stdout.split('\n').filter(x=>x.includes('error TS'))};
  if(variant==='readonly')writeFileSync(proof,`import * as l from './${variant}.js';const s=l.object({name:l.string()});\n// @ts-expect-error Shape members cannot be replaced\ns.shape.name=l.string({min:3});\n`);
  for(const profile of selected){
    let source=`import * as l from './${variant}.js';\n`;
    for(let i=0;i<100;i++){
      const value=profile.valid[0];
      const output=profile.id.startsWith('supplement')?{title:value.title.trim(),items:value.items.map(x=>({name:x.name.trim(),quantity:Number(x.quantity)}))}:value;
      source+=`export const s${i}=${profile.expressions[0]};export type O${i}=l.Output<typeof s${i}>;export type I${i}=l.Input<typeof s${i}>;export type F${i}=typeof s${i}.shape;export const field${i}=s${i}.shape.${profile.id.startsWith('width')?'f0':'title'};export const value${i}:O${i}=${JSON.stringify(output)};\n`;
    }
    const file=`${dir}/${profile.id}-${variant}.ts`;writeFileSync(file,source);configuration(file);cases.push({profile:profile.id,variant,file,fixtureHash:hash(file),samples:[]});
  }
}
for(let pass=0;pass<11;pass++)for(const c of pass%2?[...cases].reverse():cases){
  const measured=execute(c.file);assert.equal(measured.status,0,measured.stdout+measured.stderr);
  const metrics=Object.fromEntries(measured.stdout.split('\n').map(line=>{const i=line.indexOf(':');return i<0?null:[line.slice(0,i),line.slice(i+1).trim()];}).filter(Boolean));
  assert.ok(metrics['Check time']&&metrics.Instantiations);c.samples.push({checkSeconds:parseFloat(metrics['Check time']),instantiations:parseFloat(metrics.Instantiations),memoryKiB:parseFloat(metrics['Memory used'])});
}
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];for(const c of cases)for(const key of ['checkSeconds','instantiations','memoryKiB'])c[key]=median(c.samples.map(x=>x[key]));
writeFileSync('bench/guarantees/ablation-types.json',JSON.stringify({completed:true,compiler:JSON.parse(readFileSync('node_modules/typescript/package.json')).version,declarationHash:hash('dist/index.d.ts'),policy:{freshProcesses:11,copiesPerProfile:100,scope:'Only the public shape member changes from S to Readonly<S>; output/input inference and valid output assignments retained. Check time excludes compiler startup; three predeclared paired comparisons. JS-only runtime variants use the identical public declaration and are not counted as type-checking speedups.'},proofs,cases},null,2)+'\n');console.log('verified readonly shape typing and compiler costs');
