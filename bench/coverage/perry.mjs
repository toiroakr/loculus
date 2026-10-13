import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {writeFileSync,readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {inspect} from 'node:util';
import {gzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {profiles as allProfiles,libraries,imports,prelude} from './fixtures.mjs';
const scalarsOnly=process.argv.includes('--only-scalars');const profiles=allProfiles.filter(p=>scalarsOnly?p.id.startsWith('scalar-'):!p.id.startsWith('scalar-'));const dir='bench/coverage/generated';const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const baseline=JSON.parse(readFileSync(scalarsOnly?'bench/coverage/scalar-results.json':'bench/coverage/results.json'));assert.ok(baseline.completed);
const groups={fields:profiles.filter(p=>!/^(presence|array|object|width|entries|entry|transform|refine|union|discriminated|xor|intersection)-/.test(p.id)),presence:profiles.filter(p=>p.id.startsWith('presence-')),arrays:profiles.filter(p=>p.id.startsWith('array-')),objects:profiles.filter(p=>/^(object|width|entry)-/.test(p.id)),composites:profiles.filter(p=>/^(transform|refine|union|discriminated|xor|intersection)-/.test(p.id)),entries:profiles.filter(p=>p.id.startsWith('entries-'))};
const env={...process.env,PERRY_RUNTIME_DIR:process.env.PERRY_RUNTIME_DIR??resolve('experiments/perry/generated/runtime')};
const report={environment:{date:new Date().toISOString(),perry:spawnSync('perry',['--version'],{encoding:'utf8'}).stdout.trim(),sourceHash:hash('src/index.ts'),distHash:hash('dist/index.js'),runtimeManifest:JSON.parse(readFileSync(`${env.PERRY_RUNTIME_DIR}/manifest.json`))},policy:{groupedCompilation:'one program per library/feature group, covering every ordinary profile; failed group builds cannot provide per-profile runtime results',sizes:'grouped Mach-O standalone including Perry runtime and test harness; not individual browser bundle sizes',modes:['single-file-native','direct-import'],rounds:7,freshProcesses:3,warmup:3000,iterations:5000,constructionWarmup:100,constructionIterations:500},groups:{}};
const persist=()=>writeFileSync(scalarsOnly?'bench/coverage/perry-scalar-results.json':'bench/coverage/perry-results.json',JSON.stringify(report,null,2)+'\n');
const execute=(command,args,timeout=30000)=>{const start=performance.now();const r=spawnSync(command,args,{env,encoding:'utf8',timeout,maxBuffer:4*1024*1024});return {...r,ms:performance.now()-start};};
const normalizer=`const normalizeEntries=entries=>{const out=Object.create(null);for(const[k,x]of entries){if(Object.hasOwn(out,k)){if(Array.isArray(out[k]))out[k].push(x);else out[k]=[out[k],x];}else out[k]=x;}return out;};`;
for(const[group,cases]of Object.entries(groups))for(const[index,library]of libraries.entries()){
 if(!cases.length)continue;const key=(scalarsOnly?'scalar-':'')+group+'-'+library;
 const list=cases.map(p=>`{id:${JSON.stringify(p.id)},create:()=>${p.expressions[index]},good:${inspect(p.valid,{depth:null,compact:true,breakLength:Infinity})},bad:${inspect(p.invalid,{depth:null,compact:true,breakLength:Infinity})},probes:${inspect(p.probes,{depth:null,compact:true,breakLength:Infinity})},format:${JSON.stringify(p.format??null)},method:${JSON.stringify(p.method??null)}}`).join(',\n');
 let setup=imports[library].replace('../../dist','./dist')+"\nimport {performance} from 'node:perf_hooks';\n"+prelude+normalizer+(library==='zod'?'\nz.config({jitless:true});':'')+`\nconst cases=[${list}];\n`;
 const invocation=library==='loculus'?'l.safeParse(s,x)':library==='zod'?"(()=>{const r=s.safeParse(x);return r.success?{value:r.data}:{issues:r.error.issues};})()":"(()=>{const r=v.safeParse(s,x);return r.success?{value:r.output}:{issues:r.issues};})()";
 const parse=library==='loculus'?'l.parse(s,x)':library==='zod'?'s.parse(x)':'v.parse(s,x)';
 const norm=library==='loculus'?'l.fromEntries(input)':'normalizeEntries(input)';
 const harness=`
const clean=value=>{if(value===undefined)return {$undefined:true};if(value instanceof Date)return {$date:value.toISOString()};if(Array.isArray(value))return value.map(clean);if(value!==null&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,clean(value[k])]));return value;};
const c=cases.find(c=>c.id===process.argv[2]);const schema=c.create();
if(c.format)for(const list of[c.good,c.bad,c.probes])for(let i=0;i<list.length;i++){const pairs=[];for(const[k,x]of Object.entries(list[i]))for(const item of Array.isArray(x)?x:[x])pairs.push([k,item]);if(c.format==='url')list[i]=new URLSearchParams(pairs);else{const f=new FormData();for(const[k,x]of pairs)f.append(k,x);list[i]=f;}}
const invoke=(s,input)=>{const x=c.format?${norm}:input;if(c.method==='safeParse')return ${invocation};if(c.method==='parse'){try{return{value:${parse}};}catch(e){return {issues:e.issues};}}return s['~standard'].validate(x);};
const summarize=r=>r.issues?{ok:false}:{ok:true,value:clean(r.value)};
if(process.argv[3]==='verify')console.log(JSON.stringify({good:c.good.map(x=>summarize(invoke(schema,x))),bad:c.bad.map(x=>summarize(invoke(schema,x))),probes:c.probes.map(x=>summarize(invoke(schema,x)))}));
else{const measurements={};for(const mode of ['valid','invalid','construct']){const constructing=mode==='construct',data=mode==='invalid'?c.bad:c.good;const count=constructing?500:5000,warmup=constructing?100:3000;let checksum=0;const run=i=>{const r=invoke(constructing?c.create():schema,data[i%data.length]);checksum+=r.issues?r.issues.length:(r.value&&typeof r.value==='object'?Object.keys(r.value).length:1);};for(let i=0;i<warmup;i++)run(i);const samples=[];for(let round=0;round<7;round++){const start=performance.now();for(let i=0;i<count;i++)run(i);samples.push((performance.now()-start)*1e6/count);}measurements[mode]={samples,checksum};}console.log(JSON.stringify(measurements));}
`;
 const direct=`${dir}/perry-${key}-direct.ts`;writeFileSync(direct,(setup+harness).replace("'./dist/index.js'","'../../../dist/index.js'"));
 const built=await build({stdin:{contents:setup+harness,loader:'ts',resolveDir:process.cwd()},bundle:true,treeShaking:true,platform:'node',format:'esm',target:'es2022',write:false});const bundled=`${dir}/perry-${key}.ts`;writeFileSync(bundled,built.outputFiles[0].text);
 report.groups[key]={profiles:cases.map(p=>p.id),library,modes:{}};
 for(const mode of ['single-file-native','direct-import']){
  const source=mode==='single-file-native'?bundled:direct;const output=resolve(`${dir}/perry-${key}-${mode}`);console.log(`Building ${key}/${mode}`);
  const compiled=execute('perry',['compile',source,'-o',output,'--no-codegen'],180000);const entry=report.groups[key].modes[mode]={sourceHash:hash(source),buildStatus:compiled.status,buildSignal:compiled.signal,buildMs:compiled.ms,diagnostics:(compiled.stdout+compiled.stderr).slice(-10000),cases:{}};
  if(compiled.status!==0){entry.status='build-failed';persist();continue;}
  entry.bytes=statSync(output).size;entry.gzipBytes=gzipSync(readFileSync(output)).length;entry.binaryHash=hash(output);
  for(const p of cases){const verified=execute(output,[p.id,'verify']);const item=entry.cases[p.id]={verifyExit:verified.status,verifySignal:verified.signal,stdout:verified.stdout,stderr:verified.stderr};try{assert.equal(verified.status,0);const actual=JSON.parse(verified.stdout);const golden=baseline.cases[p.id+'-'+library].runtime.node.verified;for(const key of ['good','bad','probes'])assert.deepEqual(actual[key],golden[key].map(r=>r.ok?r:{ok:false}));item.status='verified';}catch(e){item.status='semantic-or-runtime-failure';item.reason=e.message.slice(0,1500);}}
  entry.status='built';persist();
 }
}
console.log('Perry builds and checks finished; measuring verified candidates.');
for(let pass=0;pass<3;pass++)for(const[key,group]of Object.entries(report.groups))for(const[mode,entry]of Object.entries(group.modes))if(entry.status==='built')for(const[id,item]of Object.entries(entry.cases))if(item.status==='verified'){
 const measured=execute(resolve(`${dir}/perry-${key}-${mode}`),[id,'bench']);if(measured.status!==0){item.status='timing-failed';item.timingError=measured.stderr;continue;}
 const data=JSON.parse(measured.stdout);for(const dataset of ['valid','invalid','construct']){const m=item[dataset]??={samples:[],checksums:[]};m.samples.push(...data[dataset].samples);m.checksums.push(data[dataset].checksum);}
}
for(const group of Object.values(report.groups))for(const entry of Object.values(group.modes))for(const item of Object.values(entry.cases))if(item.status==='verified')for(const mode of ['valid','invalid','construct']){const m=item[mode];const sorted=[...m.samples].sort((a,b)=>a-b);m.median=sorted[Math.floor(sorted.length/2)];assert.ok(m.checksums.every(n=>n===m.checksums[0]));}
assert.equal(hash('src/index.ts'),report.environment.sourceHash);report.completed=true;persist();console.log('Finished Perry coverage');
