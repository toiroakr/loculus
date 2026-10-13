import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {inspect} from 'node:util';
import {profiles,prelude} from './fixtures.mjs';
const dir='bench/coverage/generated',bun=process.env.BUN_BIN??resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const baseline=JSON.parse(readFileSync('bench/coverage/results.json'));assert.ok(baseline.completed);
const config=p=>{
 const f={key:'value',kind:0};
 if(p.id.startsWith('presence-')){const opts=Function('return '+p.expressions[0].match(/l.string\((.*)\)\}\)/)[1])();for(const k of ['optional','nullable','nullish'])if(opts[k])f[k]=true;if(opts.default!==undefined){const d=opts.default;if(typeof d==='string')f.fallback=d;else{if('undefined'in d)f.fallback=d.undefined;if('null'in d)f.nullFallback=d.null;if('nullish'in d){f.fallback=d.nullish;f.nullFallback=d.nullish;}}}return [f];}
 if(p.id==='string-basic')return [f];
 if(p.id.startsWith('number-')){f.kind=1;if(p.id==='number-inclusive')Object.assign(f,{integer:true,gte:1,lte:100});else if(p.id==='number-exclusive')Object.assign(f,{gt:0,lt:1});else if(p.id==='number-nullish-default')Object.assign(f,{fallback:0,nullFallback:0});return [f];}
 if(p.id==='boolean'||p.id==='boolean-default')return [{...f,kind:2,...(p.id==='boolean-default'?{fallback:false}:{})}];
 if(p.id.startsWith('enum-'))return [{...f,kind:3,values:p.id==='enum-default'?['a','b']:Array.from({length:Number(p.id.split('-')[1])},(_,i)=>'value-'+i),...(p.id==='enum-default'?{fallback:'a'}:{})}];
 if(p.id==='literal')return [{...f,kind:3,values:['ready']}];
 if(['array-wrap','array-strict','array-bounds','array-default'].includes(p.id))return [{...f,kind:4,...(p.id==='array-strict'?{wrapScalar:false}:p.id==='array-bounds'?{min:2,max:3}:p.id==='array-default'?{wrapScalar:false,fallback:['general'],nullFallback:[]}:{})}];
 if(p.id==='object-strip')return [{key:'name',kind:0}];
 if(p.id.startsWith('width-'))return Array.from({length:Number(p.id.split('-')[1])},(_,i)=>({key:'f'+i,kind:0}));
 if(p.format)return [{key:'search',kind:0},{key:'tag',kind:4,optional:true}];
 return null;
};
const report={date:new Date().toISOString(),sourceHash:hash('src/index.ts'),moonbitSourceHash:hash('experiments/moonbit/core/core.mbt'),jsHash:hash('experiments/moonbit/_build/js/release/build/core/core.js'),wasmHash:hash('experiments/moonbit/_build/wasm-gc/release/build/core/core.wasm'),policy:{scope:'existing subset prototype; matches tested successful values and accept/reject; different messages and compiler/inference bindings',rounds:7,freshProcesses:3,warmup:3000,iterations:5000,constructionWarmup:100,constructionIterations:500,wasmSize:'esbuild-minified browser JS host/glue/config + unmodified full prototype wasm; sum of separately gzipped files',normalization:'URL/Form inputs prepared outside timer; fromEntries inside'},cases:{},unavailable:{}};
const persist=()=>writeFileSync('bench/coverage/moonbit-results.json',JSON.stringify(report,null,2)+'\n');
const signature=rows=>rows.map(r=>r.ok?r:{ok:false});
const entries=`const entriesInput=(input,format)=>{if(!format)return input;const pairs=[];for(const[k,x]of Object.entries(input))for(const item of Array.isArray(x)?x:[x])pairs.push([k,item]);if(format==='url')return new URLSearchParams(pairs);const f=new FormData();for(const[k,x]of pairs)f.append(k,x);return f;};`;
for(const p of profiles){
 const plan=p.id.startsWith('scalar-')?null:config(p);if(!plan){report.unavailable[p.id]='Not implemented by the existing MoonBit prototype';continue;}
 const entry=report.cases[p.id]={config:plan,runtime:{},bundle:{}};
 for(const backend of ['js','wasm']){
  const init=backend==='js'?"import * as core from '../../../experiments/moonbit/_build/js/release/build/core/core.js';":"import {loadCores} from '../../../experiments/moonbit/load.mjs';const core=(await loadCores()).wasm;";
  const setup=`${init}\nimport {createSchema} from '../../../experiments/moonbit/adapter.mjs';import {fromEntries} from '../../../dist/index.js';\nconst config=${JSON.stringify(plan)};const create=()=>createSchema(core,config);const schema=create();`;
  const worker=`${setup}\n${entries}\nconst format=${JSON.stringify(p.format??null)};const good=${inspect(p.valid,{depth:null,compact:true,breakLength:Infinity})};const bad=${inspect(p.invalid,{depth:null,compact:true,breakLength:Infinity})};const probes=${inspect(p.probes,{depth:null,compact:true,breakLength:Infinity})};for(const list of [good,bad,probes])for(let i=0;i<list.length;i++)list[i]=entriesInput(list[i],format);
const clean=x=>{if(x===undefined)return {$undefined:true};if(x instanceof Date)return {$date:x.toISOString()};if(Array.isArray(x))return x.map(clean);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,clean(x[k])]));return x;};const invoke=(s,input)=>s['~standard'].validate(format?fromEntries(input):input);const summarize=r=>r.issues?{ok:false}:{ok:true,value:clean(r.value)};
if(process.argv[2]==='verify')console.log(JSON.stringify({good:good.map(x=>summarize(invoke(schema,x))),bad:bad.map(x=>summarize(invoke(schema,x))),probes:probes.map(x=>summarize(invoke(schema,x)))}));else{const out={};for(const mode of ['valid','invalid','construct']){const constructing=mode==='construct',data=mode==='invalid'?bad:good;const count=constructing?500:5000,warmup=constructing?100:3000;let checksum=0;const run=i=>{const r=invoke(constructing?create():schema,data[i%data.length]);checksum+=r.issues?r.issues.length:Object.keys(r.value).length;};for(let i=0;i<warmup;i++)run(i);const samples=[];for(let round=0;round<7;round++){const start=performance.now();for(let i=0;i<count;i++)run(i);samples.push((performance.now()-start)*1e6/count);}out[mode]={samples,checksum};}console.log(JSON.stringify(out));}`;
  const path=`${dir}/moonbit-${p.id}-${backend}.mjs`;writeFileSync(path,worker);
  for(const runtime of ['node','bun']){
   const result=spawnSync(runtime==='bun'?bun:process.execPath,[resolve(path),'verify'],{encoding:'utf8',timeout:30000});const state=entry.runtime[backend+'/'+runtime]={fixtureHash:hash(path),exit:result.status,stderr:result.stderr};
   try{assert.equal(result.status,0);const actual=JSON.parse(result.stdout);const golden=baseline.cases[p.id+'-loculus'].runtime.node.verified;for(const key of ['good','bad','probes'])assert.deepEqual(actual[key],signature(golden[key]));state.status='verified';}catch(e){state.status='unavailable-or-mismatch';state.reason=e.message.slice(0,1500);state.stdout=result.stdout;}
  }
  let code;
  if(backend==='js')code=`import * as core from './experiments/moonbit/_build/js/release/build/core/core.js';`;
  else code="import {host} from './experiments/moonbit/host.mjs';export const module=await WebAssembly.compile(await(await fetch('./core.wasm')).arrayBuffer(),{builtins:['js-string'],importedStringConstants:'_'});const core=(await WebAssembly.instantiate(module,{host})).exports;";
  code+=`import {createSchema} from './experiments/moonbit/adapter.mjs';import {fromEntries} from './dist/index.js';export const schema=createSchema(core,${JSON.stringify(plan)});export const create=()=>createSchema(core,${JSON.stringify(plan)});export const validate=input=>schema['~standard'].validate(${p.format?'fromEntries(input)':'input'});`;
  const built=(await build({stdin:{contents:code,loader:'js',resolveDir:process.cwd()},bundle:true,minify:true,platform:'browser',format:'esm',target:'es2022',write:false})).outputFiles[0].contents;
  const wasm=backend==='wasm'?readFileSync('experiments/moonbit/_build/wasm-gc/release/build/core/core.wasm'):null;
  const originalFetch=globalThis.fetch;if(wasm)globalThis.fetch=async()=>new Response(wasm);
  try{const module=await import(`data:text/javascript;base64,${Buffer.from(built).toString('base64')}`);const clean=x=>{if(x===undefined)return {$undefined:true};if(Array.isArray(x))return x.map(clean);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,clean(x[k])]));return x;};const actual=p.probes.map(raw=>{let input=raw;if(p.format){const pairs=[];for(const[k,x]of Object.entries(raw))for(const item of Array.isArray(x)?x:[x])pairs.push([k,item]);if(p.format==='url')input=new URLSearchParams(pairs);else{input=new FormData();for(const[k,x]of pairs)input.append(k,x);}}const r=module.validate(input);return r.issues?{ok:false}:{ok:true,value:clean(r.value)};});assert.deepEqual(actual,signature(baseline.cases[p.id+'-loculus'].runtime.node.verified.probes));}finally{globalThis.fetch=originalFetch;}
  entry.bundle[backend]={jsBytes:built.length,wasmBytes:wasm?.length??0,bytes:built.length+(wasm?.length??0),gzipBytes:gzipSync(built).length+(wasm?gzipSync(wasm).length:0),verifiedProbes:p.probes.length};
 }
}
persist();console.log(`MoonBit probes finished: ${Object.keys(report.cases).length} supported profiles, ${Object.keys(report.unavailable).length} unsupported.`);
if(process.argv.includes('--verify-only'))process.exit(0);
for(let pass=0;pass<3;pass++)for(const[id,entry]of Object.entries(report.cases))for(const[key,state]of Object.entries(entry.runtime))if(state.status==='verified'){
 const[backend,runtime]=key.split('/');const r=spawnSync(runtime==='bun'?bun:process.execPath,[resolve(`${dir}/moonbit-${id}-${backend}.mjs`),'bench'],{encoding:'utf8',timeout:30000});if(r.status!==0){state.status='timing-failed';state.stderr=r.stderr;continue;}
 const data=JSON.parse(r.stdout);for(const mode of ['valid','invalid','construct']){const m=state[mode]??={samples:[],checksums:[]};m.samples.push(...data[mode].samples);m.checksums.push(data[mode].checksum);}
}
for(const entry of Object.values(report.cases))for(const state of Object.values(entry.runtime))if(state.status==='verified')for(const mode of ['valid','invalid','construct']){const m=state[mode],sorted=[...m.samples].sort((a,b)=>a-b);m.median=sorted[Math.floor(sorted.length/2)];assert.ok(m.checksums.every(n=>n===m.checksums[0]));}
report.completed=true;persist();console.log('Finished MoonBit coverage');
