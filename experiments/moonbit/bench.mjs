import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { cpus } from 'node:os';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { z } from 'zod';
import * as v from 'valibot';
import * as l from '../../dist/index.js';
import { cases } from './generated/fixtures.mjs';
import { createSchema } from './adapter.mjs';
import { loadCores } from './load.mjs';
const cores = await loadCores();
const configs = {};
for(const n of [3,30]) configs[`strings-${n}`] = Array.from({length:n},(_,i)=>({key:`f${i}`,kind:0,min:1,max:100}));
configs.cli = [{key:'name',kind:0,min:1},{key:'port',kind:1,integer:true,gte:1,lte:65535,fallback:3000},{key:'verbose',kind:2,optional:true},{key:'mode',kind:3,values:['dev','prod']}];
configs['native-object']=[{key:'string',kind:0},{key:'boolean',kind:2},{key:'number',kind:1}];
cases['native-object']={schemas:[l.object({string:l.string(),boolean:l.boolean(),number:l.number()}),z.object({string:z.string(),boolean:z.boolean(),number:z.number()}),v.object({string:v.string(),boolean:v.boolean(),number:v.number()})],valid:{number:0.23,string:'0.456',boolean:true},invalid:{number:'wrong',string:5,boolean:7},sources:["export const schema=l.object({string:l.string(),boolean:l.boolean(),number:l.number()});","export const schema=z.object({string:z.string(),boolean:z.boolean(),number:z.number()});","export const schema=v.object({string:v.string(),boolean:v.boolean(),number:v.number()});"]};
configs.repeated=[{key:'tag',kind:4,min:1,max:3}];
cases.repeated={schemas:[l.object({tag:l.array(l.string(),{min:1,max:3})}),z.object({tag:z.union([z.array(z.string()),z.string().transform(x=>[x])]).pipe(z.array(z.string()).min(1).max(3))}),v.object({tag:v.pipe(v.union([v.array(v.string()),v.pipe(v.string(),v.transform(x=>[x]))]),v.minLength(1),v.maxLength(3))})],valid:{tag:['docs','code']},invalid:{tag:[7]},sources:["export const schema=l.object({tag:l.array(l.string(),{min:1,max:3})});","export const schema=z.object({tag:z.union([z.array(z.string()),z.string().transform(x=>[x])]).pipe(z.array(z.string()).min(1).max(3))});","export const schema=v.object({tag:v.pipe(v.union([v.array(v.string()),v.pipe(v.string(),v.transform(x=>[x]))]),v.minLength(1),v.maxLength(3))});"]};
const names=['typescript','moonbit-js','moonbit-wasm-gc','zod','zod-compiled','valibot'];
const report={environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,moon:execFileSync('moon',['version','--all'],{encoding:'utf8'}).trim(),versions:Object.fromEntries(['zod','valibot','esbuild'].map(n=>[n,JSON.parse(readFileSync(`node_modules/${n}/package.json`,'utf8')).version])),date:new Date().toISOString()},protocol:{warmup:10000,rounds:7,iterations:50000,operation:'Standard Schema validate + consume output keys / issue count',order:'rotate per round; no concurrent benchmarks',startup:'one process, cold imports/compile/instantiate without network IO',wasm:'wasm-gc + js-string builtins, no UTF-8 serialization; JS imports for dynamic object access / Number / result creation',issueMessages:'MoonBit prototype uses simplified messages; acceptance, outputs, issue paths and counts checked'},startup:cores.startup,runtime:{},bundle:{},setup:{},fixtures:{},sources:{},hashes:{}};
let sink=0;
const observe = r => {sink += r.issues ? r.issues.length : Object.keys(r.value).length;};
function stats(values){const sorted=[...values].sort((a,b)=>a-b);return{medianNs:sorted[3],minNs:sorted[0],maxNs:sorted[6],roundsNs:values};}
for (const [name,c] of Object.entries(cases)) {
 const candidates=[c.schemas[0],createSchema(cores.js,configs[name]),createSchema(cores.wasm,configs[name]),c.schemas[1],z.compile(c.schemas[1]),c.schemas[2]];
 report.fixtures[name]={config:configs[name],valid:c.valid,invalid:c.invalid};
 report.sources[name]={config:configs[name],typescript:c.sources[0],zod:c.sources[1],valibot:c.sources[2]};
 report.setup[name]={};
 for(const [key,core] of [['moonbit-js',cores.js],['moonbit-wasm-gc',cores.wasm]]){const start=performance.now();for(let i=0;i<1000;i++)core.compile_schema(configs[name]);report.setup[name][key]=(performance.now()-start)*1e3;}
 for(const dataset of ['valid','invalid']) {
  const input=c[dataset];const expected=candidates[0]['~standard'].validate(input);
  const validators=candidates.map(s=>s['~standard'].validate);
  for(const validate of validators){const result=validate(input);assert.equal(Boolean(result.issues),dataset==='invalid');if(!expected.issues)assert.deepStrictEqual(result.value,expected.value);else assert.equal(result.issues.length,expected.issues.length);}
  for(const validate of validators)for(let i=0;i<10000;i++)observe(validate(input));
  const rounds=names.map(()=>[]);
  for(let round=0;round<7;round++)for(let offset=0;offset<names.length;offset++){const index=(offset+round)%names.length;const validate=validators[index];const start=performance.now();for(let i=0;i<50000;i++)observe(validate(input));rounds[index].push((performance.now()-start)*1e6/50000);}
  report.runtime[`${name}/${dataset}`]=Object.fromEntries(names.map((n,i)=>[n,stats(rounds[i])]));
  console.log(`${name}/${dataset}: `+names.map((n,i)=>`${n} ${stats(rounds[i]).medianNs.toFixed(0)}ns`).join(' / '));
 }
 const tsImport="import * as l from './dist/index.js';";
 const declarations=[tsImport+c.sources[0],`import * as core from './experiments/moonbit/_build/js/release/build/core/core.js';import{createSchema}from'./experiments/moonbit/adapter.mjs';export const schema=createSchema(core,${JSON.stringify(configs[name])});`,`import{host}from'./experiments/moonbit/host.mjs';import{createSchema}from'./experiments/moonbit/adapter.mjs';export async function load(bytes){const {instance}=await WebAssembly.instantiate(bytes,{host},{builtins:['js-string'],importedStringConstants:'_'});return createSchema(instance.exports,${JSON.stringify(configs[name])});}`,"import{z}from'zod';"+c.sources[1],"import{z}from'zod';"+c.sources[1].replace('export const schema=z.object','export const schema=z.compile(z.object').replace(/;$/,');'),"import * as v from 'valibot';"+c.sources[2]];
 report.bundle[name]={};
 for(let i=0;i<names.length;i++){
 const contents=declarations[i]+(i===2?'':"export const validate=input=>schema['~standard'].validate(input);");
 const result=await build({stdin:{contents,loader:'js',resolveDir:process.cwd()},bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',write:false});
 const js=result.outputFiles[0].contents;const wasm=i===2?readFileSync(new URL('_build/wasm-gc/release/build/core/core.wasm',import.meta.url)):Buffer.alloc(0);
 report.bundle[name][names[i]]={jsBytes:js.length,wasmBytes:wasm.length,bytes:js.length+wasm.length,gzipBytes:gzipSync(js).length+(wasm.length?gzipSync(wasm).length:0)};
 }
}
report.kernel={};
const decimal=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
for(const input of ['8080','-12.34e+5','wrong']){
 const funcs=[s=>decimal.test(s),s=>cores.js.decimal(s),s=>cores.wasm.decimal(s)];const durations=funcs.map(()=>[]);
 for(const fn of funcs)for(let i=0;i<10000;i++)sink+=Number(fn(input));
 for(let round=0;round<7;round++)for(let o=0;o<3;o++){const j=(o+round)%3,start=performance.now();for(let i=0;i<100000;i++)sink+=Number(funcs[j](input));durations[j].push((performance.now()-start)*1e6/100000);}
 report.kernel[input]=Object.fromEntries(['js-regexp','moonbit-js','moonbit-wasm-gc'].map((n,i)=>[n,stats(durations[i])]));
}
for(const f of ['src/index.ts','experiments/moonbit/core/core.mbt','experiments/moonbit/core/host_js.mbt','experiments/moonbit/core/host_wasm.mbt','experiments/moonbit/host.mjs','experiments/moonbit/adapter.mjs','experiments/moonbit/bench.mjs'])report.hashes[f]=createHash('sha256').update(readFileSync(f)).digest('hex');
report.sink=sink;
writeFileSync(new URL('results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
const rows=Object.entries(report.runtime).map(([k,r])=>`| ${k} | ${names.map(n=>r[n].medianNs.toFixed(1)).join(' | ')} |`);
const bundleRows=Object.entries(report.bundle).map(([k,r])=>`| ${k} | ${names.map(n=>r[n].gzipBytes).join(' | ')} |`);
writeFileSync(new URL('RESULTS.md',import.meta.url),`# MoonBit feasibility measurements\n\n${report.environment.node}, ${report.environment.cpu}. Seven rotated rounds, Standard Schema validation with consumed results.\n\n| ns / input | ${names.join(' | ')} |\n|---|${names.map(()=>'---:').join('|')}|\n${rows.join('\n')}\n\n| Gzip bytes (Wasm binary + JS glue) | ${names.join(' | ')} |\n|---|${names.map(()=>'---:').join('|')}|\n${bundleRows.join('\n')}\n\n[Protocol and limitations](README.md), [raw measurements](results.json).\n`);
