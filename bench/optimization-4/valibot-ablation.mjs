import assert from 'node:assert/strict';
import {build} from 'esbuild';
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';
import{spawnSync}from'node:child_process';
import{createHash}from'node:crypto';
import{resolve}from'node:path';
import{gzipSync}from'node:zlib';
const dir=resolve('bench/optimization-4/generated/valibot-ablation');mkdirSync(dir,{recursive:true});
const val=readFileSync('node_modules/valibot/dist/index.mjs','utf8');const loc=readFileSync('bench/optimization-4/baseline.ts.txt','utf8');
const start=val.indexOf('function object(entries$1, message$1) {');const end=val.indexOf('\n//#endregion',start);const object=val.slice(start,end);
const replace=(s,a,b)=>{assert.ok(s.includes(a),a);return s.replace(a,b)};
const objectVariant=body=>val.slice(0,start)+body+val.slice(end);
const ownObject=replace(object,'if (input && typeof input === "object") {','if (input && typeof input === "object" && !Array.isArray(input)) {').replaceAll('key in input','Object.hasOwn(input, key)');
const variants={
'valibot':{source:val,library:'valibot'},
'valibot-copy':{source:objectVariant(replace(object,'entries: entries$1,','entries: { ...entries$1 },')),library:'valibot'},
'valibot-freeze-copy':{source:objectVariant(replace(object,'entries: entries$1,','entries: Object.freeze({ ...entries$1 }),')),library:'valibot'},
'valibot-own':{source:objectVariant(ownObject),library:'valibot'},
'valibot-freeze-copy-own':{source:objectVariant(replace(ownObject,'entries: entries$1,','entries: Object.freeze({ ...entries$1 }),')),library:'valibot'},
'valibot-child-standard':{source:objectVariant(replace(object,'valueSchema["~run"]({ value: value$1 }, config$1)','valueSchema["~standard"].validate(value$1)')),library:'valibot'},
'loculus':{source:loc,library:'loculus'},
'loculus-no-freeze':{source:replace(loc,'const fields = Object.freeze({ ...shape });','const fields = { ...shape };'),library:'loculus'},
'loculus-reference-shape':{source:replace(loc,'const fields = Object.freeze({ ...shape });','const fields = shape;'),library:'loculus'},
};
const report={date:new Date().toISOString(),purpose:'Diagnostic ablations of installed Valibot 1.5.0 and Loculus; contract-changing variants are not product candidates; diagnostic process medians; significance requires a separate corrected analysis',sourceHashes:{valibot:createHash('sha256').update(val).digest('hex'),loculus:createHash('sha256').update(loc).digest('hex')},environment:{node:process.version,bun:spawnSync(resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun'),['--version'],{encoding:'utf8'}).stdout.trim()},cases:{}};
const passes=Number(process.env.BENCH_PROCESSES??3);report.freshProcesses=passes;
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
for(const[name,{source,library}]of Object.entries(variants)){
 const module=await build({stdin:{contents:source,loader:library==='loculus'?'ts':'js'},write:false,format:'esm',target:'es2022'});writeFileSync(dir+'/'+name+'.js',module.outputFiles[0].text);
 const consumer=`import*as l from './${name}.js';export const create=()=>l.object({value:l.string()});export const schema=create();export const validate=input=>schema['~standard'].validate(input);`;
 const worker=await build({stdin:{contents:consumer+`
const good=[{value:'hello'},{value:''}],bad=[{value:42},{value:null}];
const records={};for(const mode of ['valid','invalid','construct']){
 const data=mode==='invalid'?bad:good;let sum=0;const run=i=>{const r=(mode==='construct'?create():schema)['~standard'].validate(data[i%data.length]);sum+=r.issues?r.issues.length:Object.keys(r.value).length;};
 let count=0;let start=performance.now();do{for(let i=0;i<256;i++)run(i);count+=256;}while(performance.now()-start<30);
 const iterations=Math.max(256,Math.min(1000000,Math.ceil(count*8/(performance.now()-start))));const samples=[];
 for(let round=0;round<7;round++){start=performance.now();for(let i=0;i<iterations;i++)run(i);samples.push((performance.now()-start)*1e6/iterations)}records[mode]={samples,sum};}
console.log(JSON.stringify(records));`,resolveDir:dir,loader:'js'},bundle:true,write:false,platform:'node',target:'es2022',format:'esm'});writeFileSync(dir+'/'+name+'.mjs',worker.outputFiles[0].text);
 const bundle=await build({stdin:{contents:consumer,resolveDir:dir,loader:'js'},bundle:true,write:false,platform:'browser',target:'es2022',format:'esm',minify:true});writeFileSync(dir+'/'+name+'-min.js',bundle.outputFiles[0].text);
 report.cases[name]={sourceHash:createHash('sha256').update(source).digest('hex'),gzipBytes:gzipSync(bundle.outputFiles[0].text).length,runtime:{}};
 const live=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));for(const input of [{value:'hello'},{value:''}])assert.deepEqual(live.validate(input).value,{value:input.value});for(const input of [{value:42},{value:null}])assert.equal(live.validate(input).issues.length,1);
}
for(const[runtime,bin]of [['node',process.execPath],['bun',resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun')]]){
 for(let pass=0;pass<passes;pass++){
 const names=Object.keys(variants);for(let i=0;i<names.length;i++){const name=names[(i+pass)%names.length];const run=spawnSync(bin,[dir+'/'+name+'.mjs'],{encoding:'utf8',timeout:60000});assert.equal(run.status,0,run.stderr);const measured=JSON.parse(run.stdout);const dest=report.cases[name].runtime[runtime]??={};for(const mode of ['valid','invalid','construct'])(dest[mode]??=[]).push(median(measured[mode].samples));}
 console.log(runtime,pass+1);
 }
}
report.completed=true;writeFileSync('bench/optimization-4/valibot-ablation-results.json',JSON.stringify(report,null,2)+'\n');for(const[name,c]of Object.entries(report.cases))console.log(name,c.gzipBytes,...Object.entries(c.runtime).map(([r,m])=>r+' '+Object.entries(m).map(([k,v])=>k+':'+median(v).toFixed(2)).join(' ')));
