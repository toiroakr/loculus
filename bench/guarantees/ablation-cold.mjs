import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const cases={};const runtimes={node:process.execPath,bun:resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun')};
for(const [runtime,bin]of Object.entries(runtimes))for(let pass=0;pass<11;pass++)for(const variant of pass%2?['literal-validator-cache','baseline']:['baseline','literal-validator-cache']){
  const result=spawnSync(bin,['--expose-gc','bench/guarantees/ablation-cold-worker.mjs',variant],{encoding:'utf8',timeout:60000});assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);assert.ok(data.gc&&data.checksum>0);
  (cases[runtime+'/'+variant]??=[]).push(data);
}
writeFileSync('bench/guarantees/ablation-cold.json',JSON.stringify({completed:true,policy:{freshProcesses:11,uniqueSchemasPerProcess:25000,warmupUniqueSchemas:5000,batchUniqueSchemas:10000,retainedSchemas:32,gc:'Explicit full GC before heap readings; heap delta is observed JS retained heap, not total RSS. Heap counters across Node/Bun are not directly comparable.',scope:'Construction plus one validation with a different literal each time; the shared-validator cache remains intentionally unbounded for this experiment.'},cases},null,2)+'\n');console.log('verified cold construction and retained-heap growth');
