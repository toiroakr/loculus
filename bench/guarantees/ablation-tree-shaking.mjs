import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {rolldown} from 'rolldown';
import {runtimeVariant,transformedVariant,variants} from './ablation-variants.mjs';
const entry=resolve('bench/guarantees/generated/tree-consumer.js'),runtime=resolve('dist/index.js');
const base=readFileSync(runtime,'utf8');const cases=[];
for(const variant of variants){
  for(const mode of ['unused','caller-freeze']){
    const source=mode==='unused'?`import * as l from 'loculus';l.string();l.literal('unused');export const keep=1;`:`import * as l from 'loculus';export const shape={name:l.string()};l.object(shape);export const frozen=Object.isFrozen(shape);`;
    const bundle=await rolldown({input:entry,platform:'node',plugins:[{name:'experiment',resolveId(id){if(id===entry)return entry;if(id==='loculus')return runtime;},load(id){if(id===entry)return source;if(id===runtime)return runtimeVariant(base,variant.id);},transform(code,id){if(id===runtime)return transformedVariant(code,variant.id,text=>this.parse(text));}}]});
    let code;try{code=(await bundle.generate({format:'esm',minify:true})).output[0].code;}finally{await bundle.close();}
    const module=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
    if(mode==='unused'){assert.equal(module.keep,1);assert.ok(!code.includes('loculus')&&!code.includes('~standard'),variant.id+' unused library retained');}
    cases.push({variant:variant.id,mode,bytes:Buffer.byteLength(code),frozen:module.frozen});
  }
}
const raw=(await import('./generated/ablations/library-freeze-caller.mjs')).l;const shape={name:raw.string()};raw.object(shape);assert.equal(Object.isFrozen(shape),true);
assert.equal(cases.find(c=>c.variant==='freeze-caller'&&c.mode==='caller-freeze').frozen,false);
writeFileSync('bench/guarantees/ablation-tree-shaking.json',JSON.stringify({completed:true,cases,freezeCaller:{unbundledFrozen:true,bundledFrozen:false,reason:'Retaining the current NO_SIDE_EFFECTS annotation while freezing caller-owned input permits removal of the unused object call. The proposal would also need annotation changes; do not ship the isolated patch as-is.'}},null,2)+'\n');console.log('verified unused schema elimination and freeze-caller annotation mismatch');
