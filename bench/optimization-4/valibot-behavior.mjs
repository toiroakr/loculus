import assert from 'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{transform}from'esbuild';import *as v from 'valibot';
const src=readFileSync('bench/optimization-4/baseline.ts.txt','utf8');const code=(await transform(src,{loader:'ts',format:'esm'})).code;const l=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const clean=r=>r.issues?{issues:r.issues.map(x=>({message:x.message,path:x.path?.map(p=>typeof p==='object'?p.key:p)}))}:{value:r.value};
const cases={};
for(const[name,lib]of [['valibot',v],['loculus',l]]){
 const shape={value:lib.string()};const schema=lib.object(shape);const first=clean(schema['~standard'].validate({value:'ok'}));shape.value=lib.number();const shapeChanged=clean(schema['~standard'].validate({value:'ok'}));
 const field=lib.string();const replaced=lib.object({value:field});field['~standard'].validate=()=>({value:'replacement'});const standardChanged=clean(replaced['~standard'].validate({value:'ok'}));
 const beforeField=lib.string();beforeField['~standard'].validate=()=>({value:'replacement'});const standardBefore=clean(lib.object({value:beforeField})['~standard'].validate({value:'ok'}));
 const inherited=Object.create({value:'inherited'});const inheritedValue=clean(lib.object({value:lib.string()})['~standard'].validate(inherited));
 const arr=[];arr.value='array-property';const arrayValue=clean(lib.object({value:lib.string()})['~standard'].validate(arr));
 cases[name]={first,shapeChanged,standardChanged,standardBefore,inheritedValue,arrayValue,frozenShape:Object.isFrozen(name==='valibot'?schema.entries:schema.shape)};
}
assert.deepEqual(cases.valibot.first.value,{value:'ok'});assert.ok(cases.valibot.shapeChanged.issues);assert.deepEqual(cases.loculus.shapeChanged.value,{value:'ok'});assert.deepEqual(cases.valibot.standardChanged.value,{value:'ok'});assert.deepEqual(cases.loculus.standardChanged.value,{value:'ok'});assert.deepEqual(cases.valibot.standardBefore.value,{value:'ok'});assert.deepEqual(cases.loculus.standardBefore.value,{value:'replacement'});assert.deepEqual(cases.valibot.inheritedValue.value,{value:'inherited'});assert.ok(cases.loculus.inheritedValue.issues);assert.deepEqual(cases.valibot.arrayValue.value,{value:'array-property'});assert.ok(cases.loculus.arrayValue.issues);
writeFileSync('bench/optimization-4/valibot-behavior-results.json',JSON.stringify({date:new Date().toISOString(),cases,completed:true},null,2)+'\n');console.log('Live entries, child Standard Schema overrides, inherited values, array roots and shape freezing verified.');
