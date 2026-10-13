import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const cases={};
for(const runtime of ['node','bun']) for(let pass=0;pass<5;pass++) for(const lib of ['generated','unroll','chunked','valibot']){
 const path=resolve(`bench/whole-object/generated/strategies/width-100-${lib}.mjs`);
 const isolated=path.replace('.mjs','-isolated.mjs');
 writeFileSync(isolated,readFileSync(path,'utf8').replace("['construct','valid']","['valid']").replace('warming<30','warming<500'));
 const r=spawnSync(runtime==='node'?process.execPath:resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun'),[isolated,'bench'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);const d=JSON.parse(r.stdout).valid;
 ((cases[runtime]??={})[lib]??=[]).push(median(d.samples));
}
writeFileSync('bench/whole-object/isolation-results.json',JSON.stringify({scope:'diagnostic; repeated valid only, 500ms warmup, no prior construction mode',cases},null,2)+'\n'); console.log(cases);
