import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const source=readFileSync('bench/whole-object/generated/width-100-generated.mjs','utf8');
assert.ok(source.includes('"issues" in {}'));
writeFileSync('bench/whole-object/generated/width-100-probe.mjs','const __guardProbe={};\n'+source.replaceAll('"issues" in {}','"issues" in __guardProbe'));
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const report={completed:false,scope:'exploratory, run sequentially after the full screening',cases:{}};
for(const [runtime,bin]of [['node',process.execPath],['bun',resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun')]])for(let pass=0;pass<3;pass++)for(const name of ['width-100-generated','width-100-probe']){
 const result=spawnSync(bin,[resolve('bench/whole-object/generated/'+name+'.mjs'),'bench'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);const data=JSON.parse(result.stdout);
 const entry=(report.cases[name]??={})[runtime]??={};for(const mode of ['construct','valid','invalid'])(entry[mode]??=[]).push(median(data[mode].samples));
}
report.completed=true;writeFileSync('bench/whole-object/probe-results.json',JSON.stringify(report,null,2)+'\n');console.log(report);
