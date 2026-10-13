import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
import {build} from 'esbuild';
import {rolldown} from 'rolldown';
import {profiles,libraries} from './fixtures.mjs';
const dir='bench/coverage/generated',bun=process.env.BUN_BIN??resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun');
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const compiledOnly=process.argv.includes('--only-compiled');const scalarsOnly=process.argv.includes('--only-scalars');
const manifest=JSON.parse(readFileSync(`${dir}/manifest.json`)).filter(c=>(scalarsOnly?c.id.startsWith('scalar-'):!c.id.startsWith('scalar-'))&&(compiledOnly?c.optimized==='compiled':c.optimized!=='compiled'));
const report={environment:{date:new Date().toISOString(),node:process.version,bun:spawnSync(bun,['--version'],{encoding:'utf8'}).stdout.trim(),cpu:cpus()[0].model,sourceHash:hash('src/index.ts'),distHash:hash('dist/index.js'),versions:Object.fromEntries(['zod','valibot','esbuild','rolldown','typescript'].map(n=>[n,JSON.parse(readFileSync(`node_modules/${n}/package.json`)).version]))},policy:{profiles:new Set(manifest.map(c=>c.id)).size,candidates:manifest.length,freshProcesses:3,rounds:7,warmup:3000,iterations:5000,constructionWarmup:100,constructionIterations:500,comparison:'accept/reject and normalized values; issue counts retained but differing native error structures allowed',zod:'ordinary jitless:true, optimized JIT default',normalization:'URLSearchParams/FormData constructed outside timer; fromEntries or equivalent normalization inside validation timer',gzip:'Node zlib defaults',scope:'exhaustive exported runtime API coverage with representative branches; not exhaustive inputs or every option cross-product'},cases:{}};
const persist=()=>writeFileSync(compiledOnly?(scalarsOnly?'bench/coverage/compiled-scalar-results.json':'bench/coverage/compiled-results.json'):(scalarsOnly?'bench/coverage/scalar-results.json':'bench/coverage/results.json'),JSON.stringify(report,null,2)+'\n');
const execute=(file,runtime,mode)=>{const r=spawnSync(runtime==='bun'?bun:process.execPath,[file,mode],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${file}/${runtime}/${mode}: ${r.stderr}`);return JSON.parse(r.stdout);};
const signature=rows=>rows.map(r=>r.ok?r:{ok:false});
const golden={};if(compiledOnly){const base=JSON.parse(readFileSync(scalarsOnly?'bench/coverage/scalar-results.json':'bench/coverage/results.json'));for(const p of profiles)if(base.cases[p.id+'-loculus'])golden[p.id]=base.cases[p.id+'-loculus'].runtime.node.verified;}
for(const candidate of manifest){
 const file=resolve(`${dir}/${candidate.name}.mjs`);const entry=report.cases[candidate.name]={...candidate,fixtureHash:hash(file),runtime:{},bundles:{}};
 for(const runtime of ['node','bun']){
  let results;try{results=execute(file,runtime,'verify');}catch(e){if(!compiledOnly)throw e;entry.unavailable=e.message;break;}assert.ok(results.good.every(r=>r.ok),`${candidate.name}: valid input rejected ${JSON.stringify(results.good)}`);assert.ok(results.bad.every(r=>!r.ok),`${candidate.name}: invalid input accepted`);
  if(!golden[candidate.id])golden[candidate.id]=results;
  for(const key of ['good','bad','probes'])assert.deepEqual(signature(results[key]),signature(golden[candidate.id][key]),`${candidate.name}/${runtime}/${key}`);
  entry.runtime[runtime]={verified:results};
 }
}
console.log(`Verified ${manifest.length} candidates in Node and Bun.`);persist();
if(process.argv.includes('--verify-only'))process.exit(0);
for(const candidate of manifest){
 const entry=report.cases[candidate.name];if(entry.unavailable)continue;const input=resolve(`${dir}/${candidate.name}-browser.ts`);
 for(const bundler of ['bun','esbuild','rolldown']){
  let code;
  if(bundler==='bun'){const output=`${dir}/bundle.js`;const r=spawnSync(bun,['build','--target','browser','--format','esm','--minify',input,'--outfile',output],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);code=readFileSync(output,'utf8');}
  else if(bundler==='esbuild')code=(await build({entryPoints:[input],bundle:true,minify:true,treeShaking:true,platform:'browser',format:'esm',target:'es2022',write:false})).outputFiles[0].text;
  else{const bundle=await rolldown({input,platform:'browser'});try{code=(await bundle.generate({format:'esm',minify:true})).output[0].code;}finally{await bundle.close();}}
  const module=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const p=profiles.find(p=>p.id===candidate.id);const clean=x=>{if(x===undefined)return {$undefined:true};if(x instanceof Date)return {$date:x.toISOString()};if(Array.isArray(x))return x.map(clean);if(x!==null&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,clean(x[k])]));return x;};
  const checked=p.probes.map(raw=>{let input=raw;if(p.format){const entries=[];for(const[k,x]of Object.entries(raw))for(const item of Array.isArray(x)?x:[x])entries.push([k,item]);if(p.format==='url')input=new URLSearchParams(entries);else{input=new FormData();for(const[k,x]of entries)input.append(k,x);}}const r=module.validate(input);return r.issues?{ok:false}:{ok:true,value:clean(r.value)};});
  assert.deepEqual(checked,signature(golden[candidate.id].probes),`${candidate.name}/${bundler}`);
  entry.bundles[bundler]={bytes:Buffer.byteLength(code),gzipBytes:gzipSync(code).length,verifiedProbes:checked.length};
 }
}
console.log('All browser bundles verified; measuring sequentially.');persist();
for(let pass=0;pass<3;pass++){
 const candidates=manifest.slice(pass%manifest.length).concat(manifest.slice(0,pass%manifest.length));
 for(const candidate of candidates.filter(c=>!report.cases[c.name].unavailable))for(const runtime of ['node','bun']){
  const measurements=execute(resolve(`${dir}/${candidate.name}.mjs`),runtime,'bench');for(const mode of ['valid','invalid','construct']){const measured=measurements[mode];const entry=report.cases[candidate.name].runtime[runtime];(entry[mode]??={samples:[],checksums:[]}).samples.push(...measured.samples);entry[mode].checksums.push(measured.checksum);
 }}
 console.log(`Timing process pass ${pass+1}/3 finished.`);persist();
}
for(const c of Object.values(report.cases).filter(c=>!c.unavailable))for(const e of Object.values(c.runtime))for(const mode of ['valid','invalid','construct']){const m=e[mode];const sorted=[...m.samples].sort((a,b)=>a-b);m.median=sorted[Math.floor(sorted.length/2)];m.min=sorted[0];m.max=sorted.at(-1);assert.ok(m.checksums.every(n=>n===m.checksums[0]));}
assert.equal(hash('src/index.ts'),report.environment.sourceHash);assert.equal(hash('dist/index.js'),report.environment.distHash);report.completed=true;persist();console.log('Finished bench/coverage/results.json');
