import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { profiles, prelude } from '../coverage/fixtures.mjs';
const dir='bench/optimization-3/generated/scalar-verification';mkdirSync(dir,{recursive:true});
const report=[];let baseline;
const manifest=JSON.parse(readFileSync('bench/optimization-3/scalar-candidates/manifest.json'));
for(const c of manifest.candidates){
 const compiled=await build({stdin:{contents:readFileSync('bench/optimization-3/scalar-candidates/'+c.name+'.ts.txt','utf8'),loader:'ts'},write:false,target:'es2022',format:'esm'});
 const file=dir+'/'+c.name+'.mjs';writeFileSync(file,compiled.outputFiles[0].text);const l=await import(pathToFileURL(resolve(file)));baseline??=l;
 const failures=[];
 for(const p of profiles){
  const create=new Function('l',prelude+'\nreturn '+p.expressions[0]);const b=create(baseline);const a=create(l);const variants=[a];if(a.shape)variants.push(l.compile(a));
  for(const input of p.probes){
   try {const expected=baseline.safeParse(b,input);for(const s of variants){assert.deepEqual(l.safeParse(s,input),expected,p.id);if(expected.issues){try{l.parse(s,input);assert.fail('must throw')}catch(e){assert(e instanceof l.ValidationError);assert.equal(e.message,new baseline.ValidationError(expected.issues).message);}}}}
   catch(e){failures.push({profile:p.id,message:e.message});}
  }
 }
 for(const issues of [[{message:'bad',path:[]}],[{message:'bad',path:[Symbol('x'),{key:Symbol('y')},'z']}],[{message:'bad',path:[,'x']}],Array(2)]){
  try{assert.equal(new l.ValidationError(issues).message,new baseline.ValidationError(issues).message)}catch(e){failures.push({profile:'error-message-structure',message:e.message})}
 }
 try {const n=l.number();Object.freeze(n['~standard'].validate);assert.deepEqual(l.safeParse(l.number(),'42'),{value:42});}catch(e){failures.push({profile:'frozen-shared-validator',message:e.message})}
 report.push({name:c.name,profiles:profiles.length,failures});
}
writeFileSync('bench/optimization-3/scalar-semantics-results.json',JSON.stringify(report,null,2)+'\n');console.log(report.map(r=>({name:r.name,failures:r.failures.length})));
