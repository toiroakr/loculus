import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const ids=(process.argv[2]??'string-basic,enum-2,enum-32,literal,presence-required,presence-target-null,object-strict,width-100,union-first,scalar-string-basic,scalar-enum-32,scalar-literal').split(',');
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const manifest=JSON.parse(readFileSync('bench/coverage/generated/manifest.json')).filter(c=>ids.includes(c.id)&&(process.argv.includes("--optimized") || c.optimized===false));
const before=resolve('bench/coverage/generated/before'),after=resolve('bench/coverage/generated');
const run=(path,bin,mode)=>{const r=spawnSync(bin,[path,mode],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
const results={};
for(const runtime of ['bun','node']){const bin=runtime==='bun'?resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun'):process.execPath;
 for(const c of manifest){const versions=c.library==='loculus'?['before','after']:['after'];
 for(const version of versions){const file=resolve(version==='before'?before:after,c.name+'.mjs');const probes=run(file,bin,'verify');if(version==='after'&&c.library==='loculus')assert.deepEqual(probes,run(resolve(before,c.name+'.mjs'),bin,'verify'));results[runtime+'/'+c.name+'/'+version]={valid:[],invalid:[],construct:[]};}}
 for(let pass=0;pass<3;pass++)for(const c of manifest)for(const version of (c.library==='loculus'?(pass%2?['after','before']:['before','after']):['after'])){const r=run(resolve(version==='before'?before:after,c.name+'.mjs'),bin,'bench');for(const mode of ['valid','invalid','construct'])results[runtime+'/'+c.name+'/'+version][mode].push(median(r[mode].samples));}
 for(const id of ids){const f=lib=>results[runtime+'/'+id+'-'+lib+'/after'];const b=results[runtime+'/'+id+'-loculus/before'];const a=f('loculus'),v=f('valibot');if(a)console.log(runtime,id,...['valid','invalid','construct'].map(m=>`${m} ${Math.round(median(b[m]))} → ${Math.round(median(a[m]))} / v ${Math.round(median(v[m]))}`));}}
writeFileSync('bench/coverage/tuning-results.json',JSON.stringify(results,null,2)+'\n');
