import assert from 'node:assert/strict';
import * as l from '../../dist/index.js';
import { loadCores } from './load.mjs';
import { createSchema } from './adapter.mjs';
const cores = await loadCores();
let checks = 0;
function check(config, schema, inputs) {
  const candidates = [cores.js, cores.wasm].map(core => createSchema(core, config)['~standard'].validate);
  for (const input of inputs) {
    const expected = schema['~standard'].validate(input);
    for (const validate of candidates) {
      const actual = validate(input);
      assert.equal(Boolean(actual.issues), Boolean(expected.issues));
      if (!expected.issues) assert.deepStrictEqual(actual.value, expected.value);
      else assert.deepStrictEqual(actual.issues.map(i => i.path ?? []), expected.issues.map(i => i.path ?? []));
      checks++;
    }
  }
}
const values = [undefined, null, '', 'hello', '😀', '\ud800', 0, 1, true, false, [], {}, 'true', 'false', '1', '0', 'yes'];
check([{key:'x',kind:0,min:1,max:5}], l.object({x:l.string({min:1,max:5})}), values.map(x => ({x})));
check([{key:'x',kind:2}], l.object({x:l.boolean()}), values.map(x => ({x})));
check([{key:'x',kind:3,values:['dev','prod']}], l.object({x:l.enum(['dev','prod'])}), [...values,'dev','prod'].map(x => ({x})));
const numbers=[...values, NaN, Infinity, -Infinity, -0, 42, 9007199254740992, '1.','-.5','+1e3','1e-3','-2E+2',' 1','1 ','0x10','Infinity','NaN','1_000','1e','1e+','1e309','0003','--1'];
for (const options of [{},{integer:true,gte:1,lte:65535},{gt:0,lt:2}]) check([{key:'x',kind:1,...options}], l.object({x:l.number(options)}), numbers.map(x => ({x})));
check([{key:'x',kind:4}], l.object({x:l.array(l.string())}), [[],['a'],['a','b'],'a',42,[42],['a',42],undefined,null].map(x=>({x})));
check([{key:'x',kind:4,wrapScalar:false,min:1,max:2}], l.object({x:l.array(l.string(),{wrapScalar:false,min:1,max:2})}), [[],['a'],['a','b'],['a','b','c'],'a'].map(x=>({x})));
for (const [options, config] of [
  [{},{}], [{optional:true},{optional:true}], [{nullable:true},{nullable:true}], [{nullish:true},{nullish:true}],
  [{default:'U'},{fallback:'U'}], [{nullable:true,default:'U'},{nullable:true,fallback:'U'}],
  [{default:{null:'N'}},{nullFallback:'N'}], [{optional:true,default:{null:'N'}},{optional:true,nullFallback:'N'}],
  [{default:{undefined:'U',null:'N'}},{fallback:'U',nullFallback:'N'}], [{default:{nullish:'D'}},{fallback:'D',nullFallback:'D'}],
]) check([{key:'x',kind:0,...config}], l.object({x:l.string(options)}), [{},{x:undefined},{x:null},{x:''},{x:7},{x:'hello'},Object.create({x:'hello'})]);
check([{key:'x',kind:0}], l.object({x:l.string()}), [null,undefined,[],1,'x',{x:'ok',extra:1}]);
for (const key of ['__proto__','constructor','toString','']) {
 const shape=Object.fromEntries([[key,l.string()]]);
 check([{key,kind:0}],l.object(shape),[Object.fromEntries([[key,'safe']]),{}]);
}
for (const core of [cores.js,cores.wasm]) for (const n of numbers) if (typeof n==='string') {assert.equal(Boolean(core.decimal(n)),/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(n));checks++;}
console.log(`MoonBit JS / Wasm GC: ${checks} compatibility assertions passed`);
