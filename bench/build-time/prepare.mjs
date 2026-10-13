import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspect } from 'node:util';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { rolldown } from 'rolldown';
import { loculusPlugin } from '../../dist/rolldown.js';
import { profiles, prelude } from '../single-use/fixtures.mjs';

const dir = 'bench/build-time/generated';
mkdirSync(dir, { recursive:true });
const entry = resolve(dir + '/consumer.ts');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const report = { completed:false, sourceHash:hash('src/index.ts'), pluginHash:hash('src/rolldown.ts'), bundler:'rolldown@1.2.13', cases:[] };
const timingIds = ['scalar-string-basic','scalar-string-trim','scalar-number-decimal','scalar-number-inclusive',
  'scalar-boolean','scalar-presence-optional','scalar-presence-target-both','string-pattern','array-number',
  'object-strict','width-100','cli-git-clone-full','cli-cf-deploy-full','cli-cf-dns-records-list-full',
  'supplement-rhf-items-1','supplement-rhf-items-100'];
for (const id of timingIds) assert.ok(profiles.some(p => p.id === id), id);
const literal = value => inspect(value, { depth:null, compact:true, breakLength:Infinity, maxArrayLength:null });
const imports = {
  ordinary:"import * as l from 'loculus';", generated:"import * as l from 'loculus';",
  zod:"import {z} from 'zod';", valibot:"import * as v from 'valibot';",
};
const cleanSource = `const clean=value=>{if(value===undefined)return {$undefined:true};if(value instanceof Date)return {$date:value.toISOString()};if(Array.isArray(value))return value.map(clean);if(value!==null&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,clean(value[k])]));if(typeof value==='number'&&!Number.isFinite(value))return {$number:String(value)};return value;};`;
async function build(code, library, minify) {
  let transformed = '';
  const bundle = await rolldown({ input:entry, platform:'node', plugins:[
    { name:'consumer', resolveId(id) { if(id===entry)return entry;if(id==='loculus')return resolve('dist/index.js'); }, load(id) { if(id===entry)return code; } },
    ...(library==='generated' ? [loculusPlugin()] : []),
    {name:'capture',transform(code,id){if(id===entry)transformed=code;}},
  ] });
  try {
    const output = (await bundle.generate({format:'esm',minify})).output;
    assert.equal(output.length,1);
    return { code:output[0].code, transformed };
  } finally { await bundle.close(); }
}
for (const profile of profiles) {
  const record = { id:profile.id, nativeValibot:profile.nativeValibot!==false, timed:timingIds.includes(profile.id), libraries:{} };
  const verified = {};
  for(const [library,importSource] of Object.entries(imports)) {
    const index = library==='zod'?1:library==='valibot'?2:0;
    const expression = profile.expressions[index];
    let base = `${importSource}\n${prelude}\n${library==='zod'?'z.config({jitless:true});':''}\nexport const createSchema=()=>${expression};\nexport const schema=createSchema();\n`;
    const normalized = `const normalize=raw=>{const result=Object.create(null);for(const [k,v]of raw){if(Object.hasOwn(result,k)){if(Array.isArray(result[k]))result[k].push(v);else result[k]=[result[k],v];}else result[k]=v;}return result;};`;
    if(profile.format) base += normalized;
    let call = `s['~standard'].validate(input)`;
    if(profile.method==='safeParse') call = library==='ordinary'||library==='generated'?'l.safeParse(s,input)':library==='zod'?"(()=>{const r=s.safeParse(input);return r.success?{value:r.data}:{issues:r.error.issues};})()":"(()=>{const r=v.safeParse(s,input);return r.success?{value:r.output}:{issues:r.issues};})()";
    if(profile.method==='parse') call = `(()=>{try{return {value:${library==='ordinary'||library==='generated'?'l.parse(s,input)':library==='zod'?'s.parse(input)':'v.parse(s,input)'}};}catch(e){return {issues:e.issues};}})()`;
    const prepare = profile.format ? (index===0?'l.fromEntries(raw)':'normalize(raw)') : 'raw';
    base += `export const invoke=(s,raw)=>{const input=${prepare};return ${call};};\nexport const validate=input=>invoke(schema,input);\n`;
    const consumer = await build(base,library,true);
    const path = `${dir}/${profile.id}-${library}-consumer.mjs`;
    writeFileSync(path, consumer.code);
    const module = await import(new URL('../../'+path,import.meta.url));
    const convert = input => {
      if (!profile.format) return input;
      const entries=Object.entries(input).flatMap(([k,x])=>(Array.isArray(x)?x:[x]).map(v=>[k,v]));
      if(profile.format==='url')return new URLSearchParams(entries);
      const form=new FormData();for(const[k,v]of entries)form.append(k,v);return form;
    };
    const outputs = [profile.valid,profile.invalid,profile.probes].map(list=>list.map(x=>module.validate(convert(x))));
    if(index===0) verified[library] = outputs;
    record.libraries[library] = { bytes:Buffer.byteLength(consumer.code), gzipBytes:gzipSync(consumer.code).length, consumerHash:hash(path), optimizedCalls:(consumer.transformed.match(/validate:__loculus_/g)??[]).length };
    if(library==='generated')assert.deepEqual(outputs,verified.ordinary,profile.id);
    const clean = value => JSON.parse(JSON.stringify(value,(_,v)=>v===undefined?{$undefined:true}:v));
    if(index!==0) assert.deepEqual(outputs[0].map(r=>clean(r.value)),verified.ordinary[0].map(r=>clean(r.value)),profile.id+' '+library);
    if(!record.timed)continue;
    const worker = `${base}\n${cleanSource}\nconst good=${literal(profile.valid)},bad=${literal(profile.invalid)},probes=${literal(profile.probes)};
${profile.format?`const prepare=raw=>{const entries=Object.entries(raw).flatMap(([k,x])=>(Array.isArray(x)?x:[x]).map(v=>[k,v]));return ${profile.format==='url'?'new URLSearchParams(entries)':'(()=>{const f=new FormData();for(const[k,v]of entries)f.append(k,v);return f;})()'};};for(const list of [good,bad,probes])for(let i=0;i<list.length;i++)list[i]=prepare(list[i]);`:''}
export const schemaCache=new Array(32),resultCache=new Array(32);const consume=value=>{if(typeof value==='string')return value.length+(value.charCodeAt(0)||0);if(typeof value==='number')return value;if(typeof value==='boolean')return +value;if(value instanceof Date)return value.getTime();if(Array.isArray(value))return value.reduce((sum,item)=>sum+consume(item),0);if(value&&typeof value==='object')return Object.values(value).reduce((sum,item)=>sum+consume(item),0);return 0;};const mode=process.argv[2]??'verify';if(mode==='verify')console.log(JSON.stringify([good,bad,probes].map(list=>list.map(x=>clean(validate(x))))));else{
const measurements={};for(const mode of ['construct','valid']){let checksum=0;const run=i=>{const s=mode==='construct'?createSchema():schema;const result=invoke(s,good[i%good.length]);schemaCache[i&31]=s;resultCache[i&31]=result;checksum+=result.issues?result.issues.length:consume(result.value)+1;};let warmup=0;const warming=performance.now();do{for(let i=0;i<256;i++)run(i);warmup+=256;}while(performance.now()-warming<30);const iterations=Math.max(256,Math.min(1000000,Math.ceil(warmup*8/(performance.now()-warming))));const samples=[];for(let round=0;round<7;round++){const start=performance.now();for(let i=0;i<iterations;i++)run(i);samples.push((performance.now()-start)*1e6/iterations);}measurements[mode]={samples,checksum,iterations,warmup};}console.log(JSON.stringify(measurements));}`;
    const timed = await build(worker,library,false);
    writeFileSync(`${dir}/${profile.id}-${library}.mjs`,timed.code);
  }
  report.cases.push(record);
}
report.completed=true;
writeFileSync('bench/build-time/bundle-results.json',JSON.stringify(report,null,2)+'\n');
writeFileSync('bench/build-time/fixtures.json',JSON.stringify({profiles},null,2)+'\n');
console.log('Verified all 107 profiles and 428 minified Rolldown bundles; prepared 16 timing profiles.');
