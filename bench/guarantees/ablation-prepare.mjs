import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {inspect} from 'node:util';
import {rolldown} from 'rolldown';
import {loculusPlugin} from '../../dist/rolldown.js';
import {profiles as all,prelude} from '../single-use/fixtures.mjs';
import {variants,runtimeVariant,transformedVariant} from './ablation-variants.mjs';

const dir='bench/guarantees/generated/ablations';mkdirSync(dir,{recursive:true});
const entry=resolve(dir+'/consumer.ts'),runtimePath=resolve('dist/index.js');
const source=readFileSync(runtimePath,'utf8');
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const literal=value=>inspect(value,{depth:null,compact:true,breakLength:Infinity,maxArrayLength:null});
const only=process.argv.find(x=>x.startsWith('--only='))?.slice(7).split(',');
const report=only?JSON.parse(readFileSync('bench/guarantees/ablation-manifest.json')):{cases:[],modules:[]};
Object.assign(report,{completed:false,sourceHash:hash('src/index.ts'),pluginHash:hash('src/rolldown.ts'),distHash:hash(runtimePath),variantHash:hash('bench/guarantees/ablation-variants.mjs'),variants});
async function build(code,id,pipeline,minify){
  const plugin={name:'ablation',transform(code,path){if(path!==runtimePath&&path!==entry)return;return transformedVariant(code,id,text=>this.parse(text));}};
  const bundle=await rolldown({input:entry,platform:'node',plugins:[
    {name:'source',resolveId(id){if(id===entry)return entry;if(id==='loculus')return runtimePath;},load(path){if(path===entry)return code;if(path===runtimePath)return runtimeVariant(source,id);}},
    ...(pipeline==='generated'?[loculusPlugin()]:[]),plugin,
  ]});
  try{return (await bundle.generate({format:'esm',minify})).output[0].code;}finally{await bundle.close();}
}
export const cleanSource=`const clean=value=>{if(value===undefined)return {$undefined:true};if(value instanceof Date)return {$date:value.toISOString()};if(Array.isArray(value))return value.map(clean);if(value!==null&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,clean(value[k])]));if(typeof value==='number'&&!Number.isFinite(value))return {$number:String(value)};return value;};`;
const worker=`
export const schemaCache=new Array(32),resultCache=new Array(32);
const consume=value=>{if(typeof value==='string')return value.length+(value.charCodeAt(0)||0);if(typeof value==='number')return value;if(typeof value==='boolean')return +value;if(value instanceof Date)return value.getTime();if(Array.isArray(value))return value.reduce((s,x)=>s+consume(x),0);if(value&&typeof value==='object')return Object.values(value).reduce((s,x)=>s+consume(x),0);return 0;};
const mode=process.argv[2]??'verify';if(mode==='verify')console.log(JSON.stringify([good,bad,probes].map(list=>list.map(x=>clean(validate(x))))));else{
const measurements={};for(const mode of ['construct','valid','invalid']){let checksum=0;const run=i=>{const s=mode==='construct'?createSchema():schema;const inputs=mode==='invalid'?bad:good;const result=invoke(s,inputs[i%inputs.length]);schemaCache[i&31]=s;resultCache[i&31]=result;checksum+=result.issues?consume(result.issues)+1:consume(result.value)+1;};let warmup=0;const warming=performance.now();do{for(let i=0;i<256;i++)run(i);warmup+=256;}while(performance.now()-warming<WARMUP);const iterations=Math.max(256,Math.min(1000000,Math.ceil(warmup*8/(performance.now()-warming))));const samples=[];for(let round=0;round<7;round++){const start=performance.now();for(let i=0;i<iterations;i++)run(i);samples.push((performance.now()-start)*1e6/iterations);}measurements[mode]={samples,checksum,iterations,warmup};}console.log(JSON.stringify(measurements));}`;
const strict=all.find(p=>p.id==='object-strict'),literalProfile=all.find(p=>p.id==='scalar-literal');
const selected=[...all.filter(p=>variants[0].profiles.includes(p.id)),
  {...strict,id:'strict-unknown-10',invalid:[{name:'a',...Object.fromEntries(Array.from({length:10},(_,i)=>['extra'+i,'x']))}],probes:[]},
  {...literalProfile,id:'enum-metadata',metadata:true},
];
for(const profile of selected)for(const pipeline of ['ordinary','generated','zod','valibot']){
  const candidates=(pipeline==='ordinary'||pipeline==='generated'?variants.filter(v=>v.profiles.includes(profile.id)):[{id:'baseline'}]).filter(v=>!only||only.includes(v.id));
  for(const variant of candidates){
    const index=pipeline==='zod'?1:pipeline==='valibot'?2:0;
    const imports=index===0?"import * as l from 'loculus';":index===1?"import {z} from 'zod';z.config({jitless:true});":"import * as v from 'valibot';";
    let expression=profile.expressions[index];
    if(variant.id==='du-static')expression=expression.replace('l.discriminatedUnion(\'kind\',[','__staticDu(').replace(/\]\)$/ ,')');
    const staticHelper=variant.id==='du-static'?`function __staticDu(a,b){return {meta:{kind:'union',discriminator:'kind',options:Object.freeze([a,b]),description:undefined},'~standard':{version:1,vendor:'loculus',validate(input){if(typeof input!=='object'||input===null||!Object.hasOwn(input,'kind'))return {issues:[{message:'Missing discriminator: kind',code:'invalid_value'}]};const tag=input.kind;return tag==='a'?a['~standard'].validate(input):tag==='b'?b['~standard'].validate(input):{issues:[{message:'Invalid discriminator: kind',path:['kind']}]};}}};}`:'';
    const metadata=profile.metadata?index===0?'s.meta.enumValues;':index===1?'s.options;':'s.literal;':'';
    const base=`${imports}\n${prelude}\n${staticHelper}\nexport const createSchema=()=>${expression};export const schema=createSchema();export const invoke=(s,input)=>{${metadata}return s['~standard'].validate(input);};export const validate=input=>invoke(schema,input);`;
    const minified=await build(base,variant.id,pipeline,true);
    const name=profile.id+'-'+pipeline+'-'+variant.id;
    const consumerPath=`${dir}/${name}-consumer.mjs`;writeFileSync(consumerPath,minified);
    const module=await import(new URL('../../'+consumerPath,import.meta.url));
    const outputs=[profile.valid,profile.invalid,profile.probes].map(list=>list.map(x=>module.validate(x)));
    assert.ok(outputs[0].every(r=>!r.issues),name+' valid');
    assert.ok(outputs[1].every(r=>r.issues),name+' invalid');
    const baseCase=report.cases.find(c=>c.profile===profile.id&&c.pipeline===pipeline&&c.variant==='baseline');
    if(baseCase&&variant.id!=='first-unknown'&&variant.id!=='no-array-root-check')assert.deepEqual(JSON.parse(JSON.stringify(outputs)),baseCase.outputs,name);
    const code=await build(base+'\n'+cleanSource+`\nconst good=${literal(profile.valid)},bad=${literal(profile.invalid)},probes=${literal(profile.probes)};`+worker.replace('WARMUP',profile.id==='width-100'?'500':'30'),variant.id,pipeline,false);
    const file=`${dir}/${name}.mjs`;writeFileSync(file,code);
    report.cases=report.cases.filter(c=>c.id!==name);
    report.cases.push({id:name,profile:profile.id,pipeline,variant:variant.id,topic:variant.topic??0,file,hash:hash(file),bytes:Buffer.byteLength(minified),gzipBytes:gzipSync(minified).length,consumerHash:hash(consumerPath),outputs:JSON.parse(JSON.stringify(outputs)),unchanged:baseCase?.hash===hash(file)});
  }
  console.log('prepared',profile.id,pipeline,candidates.length);
}
for(const variant of variants.filter(v=>!only||only.includes(v.id))){
  const code=await build("import * as l from 'loculus';export {l};",variant.id,'ordinary',false);
  const file=`${dir}/library-${variant.id}.mjs`;writeFileSync(file,code);
  report.modules=report.modules.filter(c=>c.variant!==variant.id);report.modules.push({variant:variant.id,file,hash:hash(file),unchanged:code===source});
}
report.completed=true;writeFileSync('bench/guarantees/ablation-manifest.json',JSON.stringify(report,null,2)+'\n');
console.log('prepared',report.cases.length,'consumers and',report.modules.length,'experimental modules');
