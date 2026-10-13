import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('./',import.meta.url);
let verifier=readFileSync(new URL('verify.mjs',dir),'utf8');
verifier=verifier.replace("const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));", "const manifest = {baselineHash:'77754cfa558e4c48e367626d6545f1b676a51a78ddf6b03474c2862d710f3ae0',candidates:[{name:'baseline'},{name:'lazy-field-class'}]};");
verifier=verifier.replace("'./semantics-results.json'","'./lazy-field-semantics-results.json'");
writeFileSync(new URL('lazy-field-equivalence.mjs',dir),verifier);
await import(new URL('lazy-field-equivalence.mjs',dir));
const l=await import(new URL('lazy-field-class.mjs',dir));
const base=await import(new URL('baseline.mjs',dir));
const checks=[];
const check=(name,fn)=>{fn();checks.push(name)};
check('metadata independent and mutable',()=>{
 const a=l.string(),b=l.string();assert.notStrictEqual(a.meta,b.meta);a.meta.description='a';assert.equal(b.meta.description,undefined);
});
check('object and array do not materialize child wrapper',()=>{
 const a=l.string(),b=l.string({min:1}),n=l.number(),bool=l.boolean(),inner=l.string(),arr=l.array(inner);
 l.object({a,b,n,bool,arr});for(const s of [a,b,n,bool,inner,arr])assert.equal(Object.hasOwn(s,'~standard'),false);
 assert.deepEqual(l.parse(l.object({a}),{a:'x'}),{a:'x'});assert.equal(Object.hasOwn(a,'~standard'),false);
});
check('first standard access caches independent own wrapper',()=>{
 const a=l.string(),b=l.string();assert.equal(Object.hasOwn(a,'~standard'),false);const std=a['~standard'];assert.strictEqual(a['~standard'],std);
 const descriptor=Object.getOwnPropertyDescriptor(a,'~standard');assert.equal(descriptor.enumerable,true);assert.equal(descriptor.configurable,true);assert.equal(descriptor.writable,true);
 assert.notStrictEqual(std,b['~standard']);assert.equal(std.version,1);assert.equal(std.vendor,'loculus');assert.deepEqual(std.validate('x'),{value:'x'});
});
check('standard override before and after caching respected by object and array',()=>{
 for(const materialize of [false,true]){const a=l.string();if(materialize)void a['~standard'];a['~standard']={version:1,vendor:'custom',validate:x=>({value:x+'!'})};
 assert.deepEqual(l.parse(l.object({a}),{a:'x'}),{a:'x!'});assert.deepEqual(l.parse(l.array(a),'x'),['x!']);}
});
check('compile materializes wrappers and retains standard overrides',()=>{
 const a=l.string();const s=l.object({a});assert.equal(Object.hasOwn(a,'~standard'),false);l.compile(s);assert.equal(Object.hasOwn(a,'~standard'),true);
 const b=l.string();b['~standard']={version:1,vendor:'custom',validate:x=>({value:x+'!'})};assert.deepEqual(l.parse(l.compile(l.object({b})),{b:'x'}),{b:'x!'});
});
check('transform refine enum literals and presence remain valid',()=>{
 assert.equal(l.parse(l.transform(l.string(),x=>x+'!'),'a'),'a!');assert.equal(l.parse(l.refine(l.string(),x=>x==='a','bad'),'a'),'a');
 assert.equal(l.parse(l.enum(['a','b']),'a'),'a');assert.equal(l.parse(l.literal('a'),'a'),'a');
 assert.equal(l.parse(l.string({default:{nullish:'x'}}),null),'x');assert.equal(l.parse(l.string({default:{nullish:'x'}}),undefined),'x');
});
const before=l.string(),original=base.string();
const reflection={baselineKeys:Object.keys(original),lazyKeysBefore:Object.keys(before),standardIn:'~standard' in before,ownStandardBefore:Object.hasOwn(before,'~standard'),symbols:Object.getOwnPropertySymbols(before).length,spreadKeysBefore:Object.keys({...before}),jsonBefore:JSON.stringify(before)};
void before['~standard'];reflection.lazyKeysAfter=Object.keys(before);reflection.spreadKeysAfter=Object.keys({...before});reflection.jsonAfter=JSON.stringify(before);
const frozen=l.string();Object.freeze(frozen);try{void frozen['~standard'];reflection.frozenAccess='success'}catch(e){reflection.frozenAccess=e.name}
const deleted=l.string();void deleted['~standard'];delete deleted['~standard'];reflection.deletedStandardRegenerates=!!deleted['~standard'];
writeFileSync(new URL('lazy-field-api-results.json',dir),JSON.stringify({checks,reflection},null,2)+'\n');
console.log(JSON.stringify({checks,reflection}));
