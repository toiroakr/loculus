import { build } from 'esbuild';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {inspect} from 'node:util';
import {resolve,relative} from 'node:path';
import {profiles,libraries,imports,prelude,coverage} from './fixtures.mjs';
const ordinaryOnly=!process.argv.includes('--historical-compiled');
const baseline=process.argv.includes('--baseline');
const option=name=>process.argv.find(arg=>arg.startsWith(name+'='))?.slice(name.length+1);
const dir=option('--out-dir')??'bench/coverage/generated'+(baseline?'/before':'');mkdirSync(dir,{recursive:true});const manifest=[];
const sourceFile=option('--source')??(baseline?'bench/coverage/before-optimization/index.ts.txt':undefined);
if(!ordinaryOnly&&!sourceFile)throw Error('Historical compile measurement requires --source=<snapshot>');
if(sourceFile){const result=await build({stdin:{contents:readFileSync(sourceFile,'utf8'),loader:'ts'},format:'esm',target:'es2022',write:false});writeFileSync(dir+'/index.js',result.outputFiles[0].text);}
const normalize=`const normalizeEntries=entries=>{const out=Object.create(null);for(const [k,x]of entries){if(Object.hasOwn(out,k)){if(Array.isArray(out[k]))out[k].push(x);else out[k]=[out[k],x];}else out[k]=x;}return out;};`;
for(const profile of profiles)for(const [index,library]of libraries.entries())for(const optimized of (ordinaryOnly?[false]:[false,true,'compiled'])){
 if(optimized==='compiled'&&library!=='zod')continue;
 if(optimized===true&&(library==='valibot'||!profile.expressions[0].startsWith('l.object(')))continue;
 if(baseline&&library!=='loculus')continue;
 if(!ordinaryOnly&&!sourceFile&&library==='loculus'&&optimized)throw Error('Loculus compile was removed. Use --ordinary-only or a historical source snapshot.');
 const expression=profile.expressions[index];
 const rootImport=library==='loculus'&&sourceFile?`import * as l from './${dir}/index.js';`:imports[library].replace('../../dist','./dist');
 const create=optimized==='compiled'?`z.compile(${expression})`:optimized?(library==='loculus'?`l.compile(${expression})`:expression.replaceAll('z.object(', 'z.object(').replaceAll('z.object({','z.object({')):expression;
 let base=`${rootImport}\n${prelude}\n${normalize}\nexport const createSchema=()=>${create};\nexport const schema=createSchema();\n`;
 if(library==='zod'&&!optimized)base=base.replace(`${prelude}\n`,`${prelude}\nz.config({jitless:true});\n`);
 let call=`s['~standard'].validate(input)`;
 if(profile.method==='safeParse')call=library==='loculus'?'l.safeParse(s,input)':library==='zod'?"(()=>{const r=s.safeParse(input);return r.success?{value:r.data}:{issues:r.error.issues};})()":"(()=>{const r=v.safeParse(s,input);return r.success?{value:r.output}:{issues:r.issues};})()";
 if(profile.method==='parse')call=`(()=>{try{return {value:${library==='loculus'?'l.parse(s,input)':library==='zod'?'s.parse(input)':'v.parse(s,input)'}};}catch(e){return {issues:e.issues};}})()`;
 let prepare='input';
 if(profile.format){base+=`const prepareInput=input=>{const entries=[];for(const [key,value]of Object.entries(input))for(const item of Array.isArray(value)?value:[value])entries.push([key,item]);return ${profile.format==='url'?'new URLSearchParams(entries)':'(()=>{const f=new FormData();for(const [k,v]of entries)f.append(k,v);return f;})()'};};\n`;prepare=`${library==='loculus'?'l.fromEntries':'normalizeEntries'}(input)`;}
 base+=`const invoke=(s,raw)=>{const input=${prepare.replaceAll('input','raw')};return ${call};};\nexport const validate=input=>invoke(schema,input);\n`;
 const modulePath=sourceFile?dir+'/index.js':'dist/index.js';
 const source=library==='loculus'?base.replace(rootImport,`import * as l from ${JSON.stringify('./'+relative(resolve(dir),resolve(modulePath)))};`):base;
 const name=profile.id+'-'+library+(optimized==='compiled'?'-compiled':optimized?'-optimized':'');writeFileSync(`${dir}/${name}-browser.ts`,source);
 const literalOptions={depth:null,compact:true,breakLength:Infinity,maxArrayLength:null,maxStringLength:null};
 const data=`const good=${inspect(profile.valid,literalOptions)};const bad=${inspect(profile.invalid,literalOptions)};const probes=${inspect(profile.probes,literalOptions)};`;
 const harness=`
${data}
${profile.format?'for(const list of [good,bad,probes])for(let i=0;i<list.length;i++)list[i]=prepareInput(list[i]);':''}
const clean=value=>{if(value===undefined)return {$undefined:true};if(value instanceof Date)return {$date:value.toISOString()};if(Array.isArray(value))return value.map(clean);if(value!==null&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,clean(value[k])]));if(typeof value==='number'&&!Number.isFinite(value))return {$number:String(value)};return value;};
const summarize=r=>r.issues?{ok:false,issueCount:r.issues.length}:{ok:true,value:clean(r.value)};
const mode=process.argv[2]??'verify';
if(mode==='verify')console.log(JSON.stringify({good:good.map(x=>summarize(validate(x))),bad:bad.map(x=>summarize(validate(x))),probes:probes.map(x=>summarize(validate(x)))}));
else{
 const measurements={};for(const dataset of (mode==='bench'?['valid','invalid','construct']:[mode])){
 const data=dataset==='invalid'?bad:good;const constructing=dataset==='construct';const iterations=constructing?500:5000;const warmup=constructing?100:3000;let checksum=0;
 const run=i=>{const r=invoke(constructing?createSchema():schema,data[i%data.length]);checksum+=r.issues?r.issues.length:(r.value&&typeof r.value==='object'?Object.keys(r.value).length:1);};
 for(let i=0;i<warmup;i++)run(i);const samples=[];
 for(let round=0;round<7;round++){const start=performance.now();for(let i=0;i<iterations;i++)run(i);samples.push((performance.now()-start)*1e6/iterations);}
 measurements[dataset]={samples,checksum,iterations,warmup};}
 console.log(JSON.stringify(mode==='bench'?measurements:measurements[mode]));
}
`;
 const result=await build({stdin:{contents:base+harness,loader:'ts',resolveDir:process.cwd()},bundle:true,treeShaking:true,format:'esm',platform:'node',target:'es2022',write:false});
 writeFileSync(`${dir}/${name}.mjs`,result.outputFiles[0].text);manifest.push({id:profile.id,library,name,optimized,format:profile.format,method:profile.method,note:profile.note,nativeValibot:profile.nativeValibot});
}
writeFileSync(`${dir}/manifest.json`,JSON.stringify(manifest,null,2));if(!baseline&&!option('--out-dir'))writeFileSync('bench/coverage/coverage.json',JSON.stringify(coverage,null,2)+'\n');console.log(`Prepared ${profiles.length} profiles, ${manifest.length} candidates.`);
