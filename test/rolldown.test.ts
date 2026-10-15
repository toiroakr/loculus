import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { rolldown } from 'rolldown';
import { fileURLToPath } from 'node:url';
import * as l from '../src/index.js';
import { loculusPlugin, type LoculusPluginOptions } from '../packages/rolldown/src/index.js';
import {z} from 'zod';
import * as v from 'valibot';

async function bundle(source: string, optimized = true, extension = 'ts', directory = '/loculus-test', options: LoculusPluginOptions = {}, files: Record<string,string> = {}) {
  const id = `${directory}/entry.${extension}`;
  let transformed = '';
  const build = await rolldown({
    input: id,
    plugins: [
      {
        name: 'fixture',
        resolveId(module) {
          if (module === id) return id;
          if (Object.hasOwn(files, module)) return module;
          if (module === 'loculus') return fileURLToPath(new URL('../src/index.ts', import.meta.url));
        },
        load(module) {
          if (module === id) return { code: source, moduleType: extension.startsWith('tsx') ? 'tsx' : extension.startsWith('ts') ? 'ts' : 'js' };
          if (Object.hasOwn(files, module)) return {code:files[module]!,moduleType:'ts'};
        },
      },
      ...(optimized ? [loculusPlugin(options)] : []),
      { name: 'capture', transform(code, module) { if (module === id) transformed = code; } },
    ],
  });
  try {
    const { output } = await build.generate({ format: 'esm', minify: true, sourcemap: 'hidden' });
    const chunk = output.find(item => item.type === 'chunk')!;
    const exports = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
    return { exports, code: chunk.code, transformed, map: chunk.map };
  } finally { await build.close(); }
}

test('nested objects and arrays preserve generated children and ordinary container fallback', async () => {
  const source = `import * as l from 'loculus'; export const create=()=>l.object({
    address:l.object({zip:l.string({trim:true,min:1}),floor:l.number({default:1})}),
    optional:l.object({name:l.string()},{optional:true}),
    defaulted:l.object({count:l.number()},{default:{nullish:{count:2}}}),
    rows:l.array(l.array(l.object({count:l.number({gte:1})}),{wrapScalar:false,min:1}),{wrapScalar:false,min:1}),
  });`;
  const before = await bundle(source, false);
  const after = await bundle(source);
  assert.match(after.transformed, /function __loculus_/);
  for (const input of [
    {address:{zip:' 100 '},rows:[[{count:'2'}]]},
    {address:{zip:'100'},defaulted:null,rows:[[{count:2}]]},
    {address:{zip:'',extra:1},optional:{name:1},rows:[[{count:'bad'}, {count:'0'}],[]]},
    {address:{zip:'100'},rows:['1']}, {}, null, [],
  ]) assert.deepEqual(after.exports.create()['~standard'].validate(input), before.exports.create()['~standard'].validate(input));
  const schema = after.exports.create();
  assert.equal(schema.shape.address.field, true);
  assert.equal(schema.shape.optional.field, true);
  assert.deepEqual(Object.keys(schema.shape.address), Object.keys(before.exports.create().shape.address));
});

test('generated scalar validators preserve values, issues, metadata and fresh identities', async () => {
  const expressions = [
    'l.string()', 'l.string({})', 'l.string(undefined)',
    'l.string({trim:true,min:2,max:4,description:"Name"})',
    'l.string({optional:true})', 'l.string({nullable:true})', 'l.string({nullish:true})',
    'l.string({default:"",min:2})', 'l.string({default:{undefined:"missing",null:"nil"}})',
    'l.string({default:{nullish:"same"}})', 'l.string({default:{null:undefined},optional:true})',
    'l.string({default:undefined,optional:false})',
    'l.number()', 'l.number({integer:true,gt:-2,gte:-1,lt:4,lte:3})',
    'l.number({default:{nullish:-0}})', 'l.number({nullable:true,default:3})',
    'l.boolean()', 'l.boolean({default:false})', 'l.boolean({nullish:true})',
  ];
  const source = `import * as l from 'loculus'; export const factories=[${expressions.map(x => `()=>${x}`).join(',')}];`;
  const before = await bundle(source, false);
  const after = await bundle(source);
  assert.match(after.transformed, /function __loculus_/);
  const inputs = [undefined, null, '', ' a ', 'abcde', '1', '0', 'true', 'false', '1.5', ' 2', '0x10',
    '1e3', '-1', '1e999', -0, 0, -2, -1, 3, 4, 1.5, NaN, Infinity, true, false, {}, [], ['a']];
  for (let i = 0; i < expressions.length; i++) {
    const normal = before.exports.factories[i]();
    const generated = after.exports.factories[i]();
    assert.deepEqual(generated.meta, normal.meta, expressions[i]);
    assert.deepEqual(Object.keys(generated), Object.keys(normal));
    const second = after.exports.factories[i]();
    assert.notEqual(generated, second);
    assert.notEqual(generated.meta, second.meta);
    assert.notEqual(generated['~standard'], second['~standard']);
    for (const input of inputs) assert.deepEqual(generated['~standard'].validate(input), normal['~standard'].validate(input), `${expressions[i]}: ${String(input)}`);
    generated.meta.optional = true;
    assert.deepEqual(generated['~standard'].validate(42), normal['~standard'].validate(42));
  }
});

test('number empty strings follow null presence in generated scalars, objects and arrays', async () => {
  const expressions = [
    'l.number()', 'l.number({optional:true})', 'l.number({nullable:true})',
    'l.number({nullish:true})', 'l.number({optional:true,nullable:true})',
    'l.number({default:10})', 'l.number({nullable:true,default:10})',
    'l.number({nullish:true,default:10})', 'l.number({default:{null:10}})',
    'l.number({default:{nullish:10}})', 'l.number({default:{undefined:20,null:10}})',
    'l.number({default:{undefined:20,null:undefined}})', 'l.number({gte:20,default:{null:10}})',
    'l.literal(1,{nullable:true})', 'l.literal([1,2],{default:{null:1}})',
  ];
  const source = `import * as l from 'loculus'; export const factories=[${expressions.map(expression =>
    `()=>({scalar:${expression},object:l.object({value:${expression}}),array:l.array(${expression})})`).join(',')}];`;
  const ordinary = await bundle(source, false);
  for (const objects of [false, 'auto', 'loop', 'unroll', 'chunked'] as const) {
    const generated = await bundle(source, true, 'ts', '/loculus-test', {objects});
    assert.match(generated.transformed, /function __loculus_/);
    for (let i = 0; i < expressions.length; i++) {
      const expected = ordinary.exports.factories[i]();
      const actual = generated.exports.factories[i]();
      for (const input of ['', null, undefined, ' ', ' 42 ', '0', '42']) {
        for (const [kind, value] of [['scalar', input], ['object', {value:input}], ['array', [input]]])
          assert.deepEqual(actual[kind as string]['~standard'].validate(value), expected[kind as string]['~standard'].validate(value), `${objects}: ${expressions[i]}: ${kind}: ${String(input)}`);
      }
      assert.deepEqual(actual.object['~standard'].validate({}), expected.object['~standard'].validate({}));
    }
  }
});

test('generated basic string errors have fresh results, arrays and issues on every validation', async () => {
  const built = await bundle(`import {string} from 'loculus';export const schema=string();`);
  const validate = built.exports.schema['~standard'].validate;
  const first = validate(null);
  const second = validate(42);
  assert.deepEqual(first, l.string()['~standard'].validate(null));
  assert.deepEqual(second, l.string()['~standard'].validate(42));
  assert.ok(first.issues && second.issues);
  assert.ok(first.issues[0]);
  assert.notEqual(first, second);
  assert.notEqual(first.issues, second.issues);
  assert.notEqual(first.issues[0], second.issues[0]);
  Object.defineProperty(first.issues[0], 'message', {value: 'changed'});
  assert.deepEqual(validate(undefined), l.string()['~standard'].validate(undefined));
  assert.deepEqual(validate('hello'), {value: 'hello'});
});

test('generated fields work in objects and arrays with snapshot and input getter behavior', async () => {
  const source = `import * as l from 'loculus';
    export const create=()=>l.object({a:l.string({optional:true}),b:l.number(),items:l.array(l.object({title:l.string({min:1})}))},{unknownKeys:'passthrough'});`;
  const before = await bundle(source, false);
  const after = await bundle(source);
  for (const input of [
    { b: '2', items: [{title:'hi'}], other: 1 }, { a:undefined,b:'3',items:[] },
    {b:'x',items:[{title:''},{title:42}]}, {}, null, [],
    Object.create({b:3,items:[]}), JSON.parse('{"b":"1","items":[],"__proto__":{"polluted":true}}'),
  ]) {
    assert.deepEqual(after.exports.create()['~standard'].validate(input), before.exports.create()['~standard'].validate(input));
  }
  const createInput = () => {
    const input: Record<string, unknown> = {b:'1',items:[]};
    Object.defineProperty(input, 'a', { enumerable:true, get() { input.b='2'; return undefined; } });
    return input;
  };
  assert.deepEqual(after.exports.create()['~standard'].validate(createInput()), before.exports.create()['~standard'].validate(createInput()));
  const schema = after.exports.create();
  assert.equal(Object.isFrozen(schema.shape), false);
  schema.shape.b['~standard'].validate = () => ({ value:99 });
  assert.equal(schema['~standard'].validate({b:'2',items:[]}).value.b, 2);
});

test('dynamic options, side effects, regular expressions and invalid targets use ordinary factories', async () => {
  const source = `import * as l from 'loculus';let calls=0;
    const config={get min(){calls++;return 2}};
    export const create=()=>[l.string(config),l.string({pattern:/a/g}),l.string({...config}),
      l.string({min:(calls++,1),max:4}),l.string({min:(calls++,1),min:2})];
    export const count=()=>calls;
    export const invalid=()=>l.string({default:{nullish:'x',null:'y'}});`;
  const after = await bundle(source);
  assert.equal(after.transformed, source);
  assert.equal(after.exports.count(), 0);
  after.exports.create();
  assert.equal(after.exports.count(), 4);
  assert.throws(after.exports.invalid, /Invalid default targets/);
});

test('aliases optimize and shadowed names retain their meaning', async () => {
  const aliased = await bundle(`import {string as text} from 'loculus'; export const create=()=>text({min:1});`);
  assert.match(aliased.transformed, /function __loculus_/);
  assert.deepEqual(aliased.exports.create()['~standard'].validate(''), l.string({min:1})['~standard'].validate(''));
  for (const source of [
    `import {string as text} from 'loculus';export const first=text();export const call=(text)=>text();`,
    `import * as l from 'loculus';export const call=(l)=>l.string();`,
    `import * as l from 'loculus';const Number={isFinite:()=>true};export const create=()=>l.number();`,
    `import * as l from 'loculus';export const call=()=>{eval('');return l.string()};`,
  ]) assert.equal((await bundle(source)).transformed, source);
});

test('Unicode offsets, directives, helper collisions, TSX and sourcemaps survive transformation', async () => {
  const source = `'use client';import {string} from 'loculus';const __loculus_0='abc😀';
    export const create=():unknown=>string({min:1,description:__loculus_0});
    export const field=string({description:'abc😀',min:1});`;
  const after = await bundle(source, true, 'tsx');
  assert.ok(after.transformed.startsWith("'use client';"));
  assert.match(after.transformed, /description:__loculus_0/);
  assert.equal(after.exports.field.meta.description, 'abc😀');
  assert.deepEqual(after.exports.field['~standard'].validate(''), l.string({min:1})['~standard'].validate(''));
  assert.ok(after.map?.mappings.length);
});

test('unused generated validators and runtime factories are removed from the bundle', async () => {
  const after = await bundle(`import {string,number} from 'loculus';const unused=number({gte:42});export const create=()=>string();`);
  assert.doesNotMatch(after.code, /decimal|finite|at least|42|loculus:codegen|RolldownMagicString/);
  assert.equal(after.exports.create()['~standard'].validate('ok').value, 'ok');
});

test('TypeScript parsing depends on the filename extension, including query suffixes', async () => {
  const source = `import {string} from 'loculus';export const identity=<T>(value:T)=>value;export const create=()=>string();`;
  const after = await bundle(source, true, 'ts?unit', '/loculus-test/directory.tsx');
  assert.match(after.transformed, /function __loculus_/);
  assert.equal(after.exports.identity(42), 42);
  assert.deepEqual(after.exports.create()['~standard'].validate('hi'), {value:'hi'});
});

test('whole-object validation preserves presence, boundaries, errors and metadata', async () => {
  const expressions = [
    'l.string({trim:true,min:2,max:4})','l.string({optional:true})','l.string({nullable:true})',
    'l.string({default:{undefined:"U",null:"N"}})','l.string({default:{null:undefined},optional:true})',
    'l.number({integer:true,gt:-2,gte:-1,lt:4,lte:3})','l.number({default:{nullish:-0}})',
    'l.boolean({default:false})', 'l.boolean({nullish:true})','l.string({pattern:/a/g})',
    "l.enum(['a','b'],{optional:true})",'l.date({nullable:true})',
  ];
  const source=`import * as l from 'loculus';export const factories=[${expressions.map(x=>`()=>l.object({value:${x}},{unknownKeys:'strict'})`).join(',')}];`;
  const before=await bundle(source,false),after=await bundle(source);
  assert.doesNotMatch(after.transformed,/l\.object\(/);
  const inputs=[{}, {value:undefined}, {value:null}, ...['', ' a ', 'abc','abcde','true','false','1','0','1.5','1e309','-1','2026-10-12',-0,0,-2,-1,3,4,1.5,NaN,Infinity,true,false,{},[]].map(value=>({value})), {value:'a',extra:1},null,[]];
  for(let i=0;i<expressions.length;i++){
    const a=before.exports.factories[i](),b=after.exports.factories[i]();
    assert.equal(Object.isFrozen(b.shape), false);
    assert.equal(b.meta.shape,b.shape);
    assert.deepEqual({...b.meta.shape.value.meta},{...a.meta.shape.value.meta});
    assert.deepEqual(b.meta.shape.value.meta.enumValues,a.meta.shape.value.meta.enumValues);
    for(const input of inputs)assert.deepEqual(b['~standard'].validate(input),a['~standard'].validate(input),expressions[i]);
  }
});

test('generated object constructors retain opaque option effects and snapshots', async () => {
  const source=`import * as l from 'loculus';let calls=0;const opts={get min(){calls++;return 2}};
    export const create=()=>l.object({a:l.string(opts),b:l.refine(l.number(),x=>x>0,'positive'),c:l.enum(['x','y'])});
    export const count=()=>calls;export const nested=()=>l.object({x:l.transform(l.object({a:l.string()}),x=>x)});`;
  const before=await bundle(source,false),after=await bundle(source);
  assert.equal(after.exports.count(),0);
  const a=before.exports.create(),b=after.exports.create();
  assert.equal(after.exports.count(),1);
  for(const input of [{a:'ok',b:'2',c:'x'},{a:'a',b:'0',c:'z'}])assert.deepEqual(b['~standard'].validate(input),a['~standard'].validate(input));
  b.shape.a['~standard'].validate=()=>({value:'changed'});
  assert.equal(b['~standard'].validate({a:'ok',b:'2',c:'x'}).value.a,'ok');
  assert.deepEqual(after.exports.nested()['~standard'].validate({x:{a:'nested'}}), {value:{x:{a:'nested'}}});
});

test('object generation preserves numeric keys, own __proto__, getters and proxy order', async () => {
  const source=`import * as l from 'loculus';export const create=()=>l.object({b:l.string({optional:true}),2:l.number(),1:l.string(),['__proto__']:l.string({optional:true})},{unknownKeys:'passthrough'});`;
  const before=await bundle(source,false),after=await bundle(source);
  assert.doesNotMatch(after.transformed,/l\.object\(/);
  const run=(factory:()=>l.AnySchema)=>{
    const events:string[]=[];
    const raw:Record<string,unknown>={'1':'first','2':'3',other:'x'};
    Object.defineProperty(raw,'b',{enumerable:true,configurable:true,get(){events.push('b');delete raw.b;raw.other='changed';return undefined;}});
    Object.defineProperty(raw,'__proto__',{enumerable:true,value:'safe'});
    const input=new Proxy(raw,{get(t,k,r){events.push('get:'+String(k));return Reflect.get(t,k,r);},getOwnPropertyDescriptor(t,k){events.push('own:'+String(k));return Reflect.getOwnPropertyDescriptor(t,k);},ownKeys(t){events.push('keys');return Reflect.ownKeys(t);}});
    const result=factory()['~standard'].validate(input);
    return {result,events};
  };
  assert.deepEqual(run(after.exports.create),run(before.exports.create));
});

test('prototype issue getters introduced during validation retain ordinary behavior', async () => {
  const source=`import * as l from 'loculus';export const create=()=>l.object({a:l.string(),b:l.string()});`;
  const before=await bundle(source,false),after=await bundle(source);
  const run=(factory:()=>l.AnySchema)=>{
    let reads=0;
    const schema=factory();
    const input={get a(){Object.defineProperty(Object.prototype,'issues',{configurable:true,get(){reads++;return [{message:'inherited',code:'custom'}]}});return 'a';},b:'b'};
    try{return {result:schema['~standard'].validate(input),reads};}
    finally{delete (Object.prototype as {issues?:unknown}).issues;}
  };
  assert.deepEqual(run(after.exports.create),run(before.exports.create));
});

test('array object aliases capture their actual validators at construction', async () => {
  const source=`import * as l from 'loculus';export const row=l.object({name:l.string()});export const create=()=>l.object({title:l.string(),items:l.array(row,{wrapScalar:false})});`;
  const after=await bundle(source);
  after.exports.row['~standard'].validate=()=>({value:{name:'replacement'}});
  const schema=after.exports.create();
  after.exports.row['~standard'].validate=()=>({value:{name:'late'}});
  assert.deepEqual(schema['~standard'].validate({title:'t',items:[{name:'original'}]}),{value:{title:'t',items:[{name:'replacement'}]}});
});


test('grouped and chunked fields retain interleaved reads, writes and omission', async () => {
  for (const objects of ['auto','loop','unroll','chunked'] as const) {
    for(const optional of [false,true]) {
      const fields=Array.from({length:40},(_,i)=>`f${i}:l.string(${optional?'{optional:true}':''})`).join(',');
      const source=`import * as l from 'loculus';export const create=()=>l.object({${fields}});`;
      const before=await bundle(source,false);
      const after=await bundle(source,true,'ts','/loculus-test',{objects});
      const run=(factory:()=>l.ObjectSchema)=>{
        const events:string[]=[];
        const input:Record<string,unknown>=Object.fromEntries(Array.from({length:40},(_,i)=>[`f${i}`,'v'+i]));
        Object.defineProperty(input,'f7',{enumerable:true,configurable:true,get(){events.push('read7');delete input.f7;input.f8='changed';return undefined;}});
        Object.defineProperty(Object.prototype,'f9',{configurable:true,set(value){events.push('write9:'+value);input.f10='setter';}});
        try {
          const schema=factory();
          assert.equal(Object.isFrozen(schema.shape), false);
          const result=schema['~standard'].validate(input);
          return {result,events};
        } finally {delete (Object.prototype as Record<string,unknown>).f9;}
      };
      assert.deepEqual(run(after.exports.create),run(before.exports.create),objects+':'+optional);
      assert.deepEqual(after.exports.create()['~standard'].validate(Object.create({f0:'inherited'})),before.exports.create()['~standard'].validate(Object.create({f0:'inherited'})));
    }
  }
});

test('custom fields keep their captured validator receiver and cloned issues', async () => {
  const source=`import * as l from 'loculus';
    const issue=Object.freeze({message:'custom',path:Object.freeze([{key:'inner'}])});
    const custom={field:true,meta:{kind:'string'},'~standard':{version:1,vendor:'custom',validate:function(value){return {issues:[{...issue,message:Array.isArray(this)?'array':'other'}]}}}};
    export const create=()=>l.object({x:custom,y:l.string()});`;
  const before=await bundle(source,false),after=await bundle(source);
  assert.match(after.transformed,/l\.object\(/);
  assert.deepEqual(after.exports.create()['~standard'].validate({x:'a',y:'b'}),before.exports.create()['~standard'].validate({x:'a',y:'b'}));
});

test('unused whole-object kernels disappear while argument effects remain', async () => {
  const fields=Array.from({length:40},(_,i)=>`f${i}:l.number({gte:42})`).join(',');
  const source=`import * as l from 'loculus';let calls=0;
    const unused=l.object({${fields}},{unknownKeys:'strict'});
    const effect=l.object({name:l.string({min:(calls++,1)})});
    export const count=()=>calls;export const create=()=>l.string();`;
  const before=await bundle(source,false),after=await bundle(source);
  assert.equal(after.exports.count(),before.exports.count());
  assert.equal(after.exports.count(),1);
  assert.doesNotMatch(after.code,/decimal|unrecognized_key|f39|Object\.freeze|at least 42/);
  assert.deepEqual(after.exports.create()['~standard'].validate('ok'),{value:'ok'});
});

test('static arrays preserve scalar presence, bounds, metadata and fresh identities', async () => {
  const expressions=[
    'l.array(l.string())','l.array(l.string(),{})','l.array(l.string(),{wrapScalar:undefined})','l.array(l.string(),{wrapScalar:true})','l.array(l.string(),{wrapScalar:false,min:1,max:3,description:"tags"})',
    'l.array(l.number({integer:true,gte:1}))','l.array(l.string({optional:true}))',
    'l.array(l.string({default:{undefined:"U",null:"N"}}))','l.array(l.boolean({nullish:true}),{max:3})',
  ];
  const source=`import * as l from 'loculus';export const factories=[${expressions.map(x=>`()=>${x}`).join(',')}];`;
  const before=await bundle(source,false),after=await bundle(source);
  assert.doesNotMatch(after.transformed,/l\.array\(/);
  assert.ok(after.exports.factories[0]()['~standard'].validate('abc').issues);
  assert.deepEqual(after.exports.factories[3]()['~standard'].validate('abc'),{value:['abc']});
  const inputs=[undefined,null,[],['a','bb'],'abc',[''],[1],new Array(2),['1','bad'],['true',false],['1',null,undefined],false,['abcde','a','b','c']];
  for(let i=0;i<expressions.length;i++){
    const a=before.exports.factories[i](),b=after.exports.factories[i](),second=after.exports.factories[i]();
    assert.deepEqual({...b.meta,inner:undefined},{...a.meta,inner:undefined});
    assert.deepEqual(b.meta.inner.meta,a.meta.inner.meta);
    for(const value of inputs)assert.deepEqual(b['~standard'].validate(value),a['~standard'].validate(value),expressions[i]);
    assert.notEqual(b,second);assert.notEqual(b.meta,second.meta);assert.notEqual(b['~standard'],second['~standard']);assert.notEqual(b.meta.inner,second.meta.inner);
  }
});

test('generated arrays keep sparse values, proxy access order and captured child validation', async () => {
  const source=`import * as l from 'loculus';export const create=()=>l.array(l.string({optional:true}),{min:1,max:8,wrapScalar:false});`;
  const before=await bundle(source,false),after=await bundle(source);
  const run=(factory:()=>l.Field<unknown,unknown>)=>{
    const schema=factory();
    assert.ok(Reflect.set(schema.meta.inner!['~standard'],'validate',()=>({value:'changed'})));
    const events:string[]=[];const raw:(string|undefined)[]=['a',undefined,'c'];
    Object.defineProperty(raw,1,{configurable:true,get(){delete raw[1];raw[2]='d';return undefined}});
    const input=new Proxy(raw,{get(target,key,receiver){events.push(String(key));return Reflect.get(target,key,receiver);}});
    return {result:schema['~standard'].validate(input),events};
  };
  assert.deepEqual(run(after.exports.create),run(before.exports.create));
});

test('dynamic array options, outer defaults and nested arrays keep ordinary behavior', async () => {
  const source=`import * as l from 'loculus';let calls=0;const options={get wrapScalar(){calls++;return false}};
    export const create=()=>l.array(l.string(),options);export const count=()=>calls;
    export const defaulted=()=>l.array(l.string(),{wrapScalar:false,default:[]});
    export const nested=()=>l.array(l.array(l.string()));`;
  const before=await bundle(source,false),after=await bundle(source);
  assert.match(after.transformed,/l\.array\([\s\S]*?options\)/);
  const a=before.exports.create(),b=after.exports.create();
  assert.equal(after.exports.count(),1);
  for(const value of [[],['a'],'a',null])assert.deepEqual(b['~standard'].validate(value),a['~standard'].validate(value));
  assert.deepEqual(after.exports.defaulted()['~standard'].validate(undefined),{value:[]});
  assert.deepEqual(after.exports.nested()['~standard'].validate([['a'],['b']]), {value:[['a'],['b']]});
  assert.ok(after.exports.nested()['~standard'].validate(['a','b']).issues);
});

test('every object generation strategy matches peers for inherited inputs, strict errors and __proto__', async () => {
  for (const objects of ['auto', 'loop', 'unroll', 'chunked'] as const) {
    for (const mode of ['strip', 'strict', 'passthrough'] as const) {
      const fields = Array.from({length: 40}, (_, i) => `f${i}:l.string({optional:true})`).join(',');
      const source = `import * as l from 'loculus';export const create=()=>l.object({${fields},opaque:l.enum(['a','b'],{optional:true}),['__proto__']:l.string()},{unknownKeys:'${mode}'});`;
      const after = await bundle(source, true, 'ts', '/loculus-test', {objects});
      assert.doesNotMatch(after.transformed, /l\.object\(/);
      const shape = {...Object.fromEntries(Array.from({length: 40}, (_, i) => [`f${i}`, z.string().optional()])), opaque: z.enum(['a', 'b']).optional(), ['__proto__']: z.string()};
      const peer = mode === 'passthrough' ? z.looseObject(shape) : z.object(shape);
      const strictPeer = v.strictObject({...Object.fromEntries(Array.from({length: 40}, (_, i) => [`f${i}`, v.optional(v.string())])), opaque: v.optional(v.picklist(['a', 'b'])), ['__proto__']: v.unknown()});
      for (const input of [{}, Object.create({f0: 'inherited', f1: undefined, opaque: 'a'}), JSON.parse('{"f0":"a","__proto__":"ignored"}'), Object.assign(Object.create({extra1: 1}), {extra2: 2, f0: 'a'})]) {
        const result = after.exports.create()['~standard'].validate(input);
        if (mode === 'strict') {
          const expected = v.safeParse(strictPeer, input);
          assert.equal(!result.issues, expected.success);
          if (result.issues) assert.deepEqual(result.issues.map((issue: l.Issue) => issue.path), expected.issues?.map(issue => issue.path?.map(item => item.key)));
          else assert.deepEqual(result.value, peer.parse(input));
        } else assert.deepEqual(result, {value: peer.parse(input)});
      }
    }
  }
});

test('generated array child errors precede bounds like Valibot', async () => {
  const after = await bundle(`import * as l from 'loculus';export const create=()=>l.array(l.string(),{wrapScalar:false,min:3,max:4});`);
  const peer = v.pipe(v.array(v.string()), v.minLength(3), v.maxLength(4));
  for (const input of [[1], ['a'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd', 1]]) {
    const result = after.exports.create()['~standard'].validate(input);
    const expected = v.safeParse(peer, input, {abortPipeEarly: true});
    assert.equal(!result.issues, expected.success);
    if (result.issues) assert.deepEqual(result.issues.map((issue: l.Issue) => issue.path ?? []), expected.issues?.map(issue => issue.path?.map(item => item.key) ?? []));
    else assert.deepEqual(result.value, expected.output);
  }
});

test('generated non-finite numeric literals preserve bounds and default values', async () => {
  const expressions = ['l.number({gte:1e999})', 'l.number({lte:-1e999})', 'l.number({default:1e999})', 'l.number({default:-1e999})'];
  const source = `import * as l from 'loculus';export const create=()=>[${expressions.join(',')},${expressions.map(expression => `l.object({value:${expression}})`).join(',')}];`;
  const before = await bundle(source, false), after = await bundle(source);
  const a = before.exports.create(), b = after.exports.create();
  for (let i = 0; i < a.length; i++) {
    for (const input of [undefined, 0, 1, -1, '1', null]) {
      const raw = i < expressions.length ? input : {value: input};
      assert.deepEqual(b[i]['~standard'].validate(raw), a[i]['~standard'].validate(raw));
    }
  }
});

test('generated objects default to strict for omitted, empty, undefined and description-only options', async () => {
  const suffixes = ['', ',undefined', ',{}', ',{unknownKeys:undefined}', ',{description:"Options"}'];
  const source = `import * as l from 'loculus';export const create=()=>[${suffixes.map(suffix => `l.object({name:l.string()}${suffix})`).join(',')},l.object({name:l.string()},{unknownKeys:'strip'})];`;
  const before = await bundle(source, false), after = await bundle(source);
  assert.doesNotMatch(after.transformed, /l\.object\(/);
  const normal = before.exports.create(), generated = after.exports.create();
  for (let i = 0; i < suffixes.length; i++) {
    assert.equal(generated[i].meta.unknownKeys, 'strict');
    assert.deepEqual(generated[i]['~standard'].validate({name: 'guest', typo: 1}), normal[i]['~standard'].validate({name: 'guest', typo: 1}));
    assert.deepEqual(generated[i]['~standard'].validate({name: 'guest', typo: 1}).issues.map((issue: l.Issue) => issue.path), [['typo']]);
  }
  assert.deepEqual(generated[suffixes.length]['~standard'].validate({name: 'guest', extra: 1}), {value: {name: 'guest'}});
});

test('static literals generate validators and preserve scalar errors, metadata and identities', async () => {
  const expressions = [
    `l.literal('a')`, `l.literal('a',{optional:true})`, `l.literal(['a','b','a'] as const)`,
    `l.literal(42)`, `l.literal(true)`, `l.literal(false)`, `l.literal(-0)`,
    `l.literal([42])`, `l.literal([true])`, `l.literal([false])`,
    `l.literal([200,201,204])`, `l.literal([true,false])`, `l.literal([-0,0,1])`,
    `l.literal([0,-0])`, `l.literal(['auto',1,false])`, `l.literal(['1',1,true])`,
    `l.literal([1,'1',true])`, `l.literal([true,1,'1'])`,
    `l.literal([1,2],{nullable:true,description:'codes'})`,
    `l.literal(['a','b'],{default:{nullish:'a'}})`,
    `l.literal([1,2],{default:{undefined:1,null:2}})`,
    `l.literal([true,false],{nullish:true})`,
    `l.literal([1,2],{default:{null:undefined},optional:true})`,
    `l.literal([1,2],{default:undefined,optional:false})`,
    `l.array(l.literal([1,2]),{wrapScalar:true,min:1,max:3})`,
    `l.array(l.literal(['auto',1,false]))`,
    `l.transform(l.literal([1,2]),value=>value*2)`,
    `l.refine(l.literal([1,2]),value=>value===1,'one')`,
  ];
  const source = `import * as l from 'loculus';export const factories=[${expressions.map(expression => `()=>${expression}`).join(',')}];`;
  const before = await bundle(source, false), after = await bundle(source);
  assert.doesNotMatch(after.transformed, /l\.(literal|array)\(/);
  const metadata = (schema: l.AnySchema): unknown => ({
    ...schema.meta, enumValues:schema.meta.enumValues,
    inner:schema.meta.inner ? metadata(schema.meta.inner) : undefined,
    options:schema.meta.options?.map(metadata),
  });
  const inputs = [undefined,null,'',' ','a','b','auto','true','false','1','0','2','42','+42','4.2e1','200','201','204',
    ' 42','0x2a','1e999',true,false,0,-0,1,2,42,200,201,204,NaN,Infinity,{},[],['1',2],[3],new Array(2)];
  for (let i = 0; i < expressions.length; i++) {
    const normal = before.exports.factories[i](), generated = after.exports.factories[i]();
    const second = after.exports.factories[i]();
    assert.deepEqual(metadata(generated), metadata(normal), expressions[i]);
    assert.deepEqual(Object.keys(generated.meta), Object.keys(normal.meta), expressions[i]);
    assert.notEqual(generated.meta, second.meta);
    assert.notEqual(generated['~standard'], second['~standard']);
    const choices = generated.meta.literalValues ?? generated.meta.enumValues;
    if (choices) assert.notEqual(choices, second.meta.literalValues ?? second.meta.enumValues);
    if (generated.meta.options) {
      assert.notEqual(generated.meta.options, second.meta.options);
      assert.notEqual(generated.meta.options[0], second.meta.options[0]);
    }
    for (const input of inputs)
      assert.deepEqual(generated['~standard'].validate(input), normal['~standard'].validate(input), `${expressions[i]}: ${String(input)}`);
  }
  const validate = after.exports.factories[3]()['~standard'].validate;
  const first = validate('bad'), second = validate('bad');
  assert.notEqual(first.issues, second.issues);
  assert.notEqual(first.issues[0], second.issues[0]);
});

test('literal object kernels inline comparisons across strategies and preserve read order', async () => {
  const fields = Array.from({length:40},(_,index)=>`f${index}:l.literal([1,2])`).join(',');
  const source = `import * as l from 'loculus';export const create=()=>l.object({${fields},flag:l.literal(true),mode:l.literal(['auto',1,false]),optional:l.literal(['a','b'],{optional:true})});`;
  const before = await bundle(source, false);
  for (const objects of ['auto','unroll','loop','chunked',false] as const) {
    const after = await bundle(source, true, 'ts', '/loculus-test', {objects});
    assert.doesNotMatch(after.transformed, /l\.literal\(/);
    if (objects !== false) {
      assert.doesNotMatch(after.transformed, /l\.object\(|const v\d+=/);
      assert.match(after.transformed, /numeric===1/);
    }
    const a = before.exports.create(), b = after.exports.create();
    const createInput = (invalid: boolean) => {
      const input: Record<string,unknown> = Object.fromEntries(Array.from({length:40},(_,index)=>[`f${index}`,'1']));
      input.flag = 'true'; input.mode = 'auto';
      Object.defineProperty(input,'f0',{enumerable:true,get(){input.f1=invalid?'bad':'2';return '1';}});
      return input;
    };
    for (const invalid of [false,true])
      assert.deepEqual(b['~standard'].validate(createInput(invalid)), a['~standard'].validate(createInput(invalid)), String(objects));
    assert.equal(b['~standard'].validate(createInput(false)).value.f1, 2);
    assert.equal('optional' in b['~standard'].validate(createInput(false)).value, false);
  }
});

test('generated literal discriminants retain typed matches and scalar conversions', async () => {
  const source = `import * as l from 'loculus';export const create=()=>l.discriminatedUnion('kind',[
    l.object({kind:l.literal(['auto',1,true]),value:l.literal([1,2])}),
    l.object({kind:l.literal([2,false]),value:l.literal([3,4])})
  ]);`;
  const before = await bundle(source, false), after = await bundle(source);
  assert.doesNotMatch(after.transformed, /l\.literal\(/);
  for (const kind of ['auto',1,true,2,false,'1','true',null,undefined])
    for (const value of [1,2,3,4,'1','4','bad'])
      assert.deepEqual(after.exports.create()['~standard'].validate({kind,value}), before.exports.create()['~standard'].validate({kind,value}));
});

test('literal schemas constructed before imports initialize without errors', async () => {
  const source = `'use client';export const schema=literal('a');export const mixed=literal(['auto',1,false]);export const result=literal([1,2])['~standard'].validate('2');import {literal} from 'loculus';`;
  const before = await bundle(source, false);
  await assert.doesNotReject(async () => {
    const after = await bundle(source);
    assert.ok(after.transformed.startsWith("'use client';"));
    assert.deepEqual(after.exports.schema['~standard'].validate('a'), before.exports.schema['~standard'].validate('a'));
    assert.deepEqual(after.exports.mixed['~standard'].validate('1'), {value:1});
    assert.deepEqual(after.exports.result, {value:2});
  });
});

test('generated literal helpers preserve executable module hashbangs', async () => {
  for (const newline of ['\n','\r\n','\r','\u2028','\u2029']) {
    const hashbang = `#!/usr/bin/env node${newline}`;
    const source = `${hashbang}export const schema=literal('a');import {literal} from 'loculus';`;
    await assert.doesNotReject(async () => {
      const after = await bundle(source);
      assert.ok(after.transformed.startsWith(hashbang));
      assert.deepEqual(after.exports.schema['~standard'].validate('a'), {value:'a'});
    });
  }
});

test('literal import aliases named after built-ins retain ordinary validation', async () => {
  for (const [source,input,expected] of [
    [`import {literal as Object} from 'loculus';export const create=()=>Object('a');`,'a','a'],
    [`import {literal as Number} from 'loculus';export const create=()=>Number([1,2]);`,'2',2],
    [`import * as Object from 'loculus';export const create=()=>Object.literal(['a','b']);`,'b','b'],
    [`import * as Number from 'loculus';export const create=()=>Number.literal(42);`,'42',42],
    [`import {literal as Array,array} from 'loculus';export const create=()=>array(Array([1,2]));`,['2'],[2]],
  ] as const) {
    await assert.doesNotReject(async () => {
      const after = await bundle(source);
      assert.deepEqual(after.exports.create()['~standard'].validate(input), {value:expected});
      assert.equal(after.transformed, source);
    });
  }
});

test('literal metadata initializes during circular dependency construction', async () => {
  for (const expression of [`l.literal('a')`,`l.literal(['a',1,false])`]) {
    const source = `import * as l from 'loculus';import {schema,second} from '/loculus-cycle/consumer.ts';export function create(){return ${expression};}export {schema,second};`;
    const files = {'/loculus-cycle/consumer.ts':`import {create} from '/loculus-cycle/entry.ts';export const schema=create();export const second=create();`};
    const before = await bundle(source, false, 'ts', '/loculus-cycle', {}, files);
    await assert.doesNotReject(async () => {
      const after = await bundle(source, true, 'ts', '/loculus-cycle', {}, files);
      assert.deepEqual(after.exports.schema['~standard'].validate('a'), before.exports.schema['~standard'].validate('a'));
      const meta = (schema: l.AnySchema) => schema.meta.options?.[0]?.meta ?? schema.meta;
      assert.equal(Object.getPrototypeOf(meta(after.exports.schema)), Object.getPrototypeOf(meta(after.exports.second)));
    });
  }
});

test('literal validation can run before a circular importing module executes', async () => {
  for (const [expression,input] of [
    [`l.literal(42)`,'42'], [`l.literal([1,2])`,'2'],
    [`l.array(l.literal([1,2]))`,['1','2']],
    [`l.object({a:l.literal([1,2]),b:l.literal([1,2]),c:l.literal([1,2])})`,{a:'1',b:'2',c:'1'}],
  ] as const) {
    const source = `import * as l from 'loculus';import {result} from '/loculus-cycle/consumer.ts';export function create(){return ${expression};}export {result};`;
    const files = {'/loculus-cycle/consumer.ts':`import {create} from '/loculus-cycle/entry.ts';export const result=create()['~standard'].validate(${JSON.stringify(input)});`};
    const before = await bundle(source, false, 'ts', '/loculus-cycle', {}, files);
    await assert.doesNotReject(async () => {
      const after = await bundle(source, true, 'ts', '/loculus-cycle', {}, files);
      assert.deepEqual(after.exports.result, before.exports.result);
    });
  }
});

test('non-string literal branches preserve inherited issue getter reads', async () => {
  for (const expression of [`l.literal([1,2])`,`l.literal([true,false])`,`l.literal(['1',1,false])`,`l.literal(1)`,`l.literal(true)`]) {
    const source = `import * as l from 'loculus';export const create=()=>l.object({a:${expression},b:${expression},c:${expression}});`;
    const before = await bundle(source, false), after = await bundle(source);
    const run = (factory:()=>l.AnySchema, pattern: number) => {
      let reads = 0;
      const schema = factory();
      const previous = Object.getOwnPropertyDescriptor(Object.prototype,'issues');
      const input = {get a(){Object.defineProperty(Object.prototype,'issues',{configurable:true,get(){reads++;return pattern===0 || (pattern===2 && reads%2===0) ? undefined : [{message:'inherited',code:'custom'}];}});return '1';},b:'1',c:'1'};
      try {return {result:schema['~standard'].validate(input),reads};}
      catch(error) {return {error:error instanceof Error ? error.name : String(error),reads};}
      finally {if(previous)Object.defineProperty(Object.prototype,'issues',previous);else delete (Object.prototype as {issues?:unknown}).issues;}
    };
    for (const pattern of [0,1,2]) assert.deepEqual(run(after.exports.create,pattern), run(before.exports.create,pattern), expression);
  }
});

test('larger string tuples retain ordinary adaptive lookup', async () => {
  for (const size of [8,9,32]) {
    const values = Array.from({length:size},(_,index)=>`choice-${index}`);
    const source = `import {literal} from 'loculus';export const create=()=>literal(${JSON.stringify(values)});`;
    const after = await bundle(source);
    if (size > 8) assert.equal(after.transformed, source);
    else assert.doesNotMatch(after.transformed, /literal\(/);
    const schema = after.exports.create();
    for (let pass = 0; pass < 12; pass++) {
      assert.deepEqual(schema['~standard'].validate(values[0]), {value:values[0]});
      assert.deepEqual(schema['~standard'].validate(values.at(-1)), {value:values.at(-1)});
      assert.ok(schema['~standard'].validate('missing').issues);
    }
  }
});

test('literal-only consumers remove runtime factories and unused choice metadata', async () => {
  const after = await bundle(`import {literal} from 'loculus';const unused=literal(['unused-choice',false]);export const schema=literal([1,2]);`);
  assert.doesNotMatch(after.transformed, /literal\(/);
  assert.doesNotMatch(after.code, /unused-choice|Invalid default targets|Expected at least one literal value/);
  assert.deepEqual(after.exports.schema['~standard'].validate('2'), {value:2});
});

test('dynamic and unsupported literals preserve factory effects and fallback', async () => {
  const source = `import * as l from 'loculus';let calls=0;
    const values=[1,2],opts={get optional(){calls++;return true;}};
    export const create=()=>[l.literal(values),l.literal([1,...values]),l.literal([(calls++,1),2]),l.literal([1,2],opts),l.literal([1,2],{...opts}),l.literal(1e999),l.literal([NaN,Infinity])];
    export const invalid=()=>l.literal([]);export const count=()=>calls;`;
  const after = await bundle(source), before = await bundle(source + 'export const ordinary=true;', false);
  assert.equal(after.transformed, source);
  after.exports.create(); before.exports.create();
  assert.equal(after.exports.count(), 3);
  assert.equal(after.exports.count(), before.exports.count());
  assert.throws(after.exports.invalid, /at least one literal/);
  for (const source of [
    `import {literal} from 'loculus';const Number={};export const create=()=>literal([1,2]);`,
    `import {literal} from 'loculus';const Object={};export const create=()=>literal(['a','b']);`,
    `import {literal} from 'loculus';export const call=(literal)=>literal(1);`,
    `import * as l from 'loculus';const undefined=1;export const create=()=>l.literal(true);`,
  ]) assert.equal((await bundle(source)).transformed, source);
  const aliased = await bundle(`import {literal as choice} from 'loculus';export const create=()=>choice([1,2] as const);`);
  assert.doesNotMatch(aliased.transformed, /choice\(/);
  assert.deepEqual(aliased.exports.create()['~standard'].validate('2'), {value:2});
});

test('multiple literal choices preserve generated object validation and metadata', async () => {
  const source = `import * as l from 'loculus';export const create=()=>l.object({
    status:l.literal(['draft','published']),
    code:l.literal([200,201],{default:200}),
    flag:l.literal([true,false],{optional:true}),
    mixed:l.literal(['auto',1,false]),
    items:l.array(l.literal([1,2]))
  });`;
  const normal = await bundle(source, false), optimized = await bundle(source);
  assert.match(optimized.transformed, /function __loculus_/);
  const a = normal.exports.create(), b = optimized.exports.create();
  for (const key of Object.keys(a.shape)) {
    assert.equal(b.shape[key].meta.kind, a.shape[key].meta.kind);
    assert.deepEqual(b.shape[key].meta.enumValues, a.shape[key].meta.enumValues);
    assert.deepEqual(b.shape[key].meta.literalValues, a.shape[key].meta.literalValues);
    const choices = (branch: l.AnySchema) => [branch.meta.kind, branch.meta.enumValues, branch.meta.literalValues];
    assert.deepEqual(b.shape[key].meta.options?.map(choices), a.shape[key].meta.options?.map(choices));
  }
  const input = {status:'draft',flag:'0',mixed:'1',items:['1',2]};
  assert.deepEqual(b['~standard'].validate(input), {value:{status:'draft',code:200,flag:false,mixed:1,items:[1,2]}});
  for (const raw of [input, {...input,status:'other'}, {...input,code:'202'}, {...input,mixed:true}, {...input,items:[3]}, null])
    assert.deepEqual(b['~standard'].validate(raw), a['~standard'].validate(raw));
});

test('non-string literals preserve ordinary and optimized values, issues and metadata', async () => {
  const expressions = [
    'l.literal(true)', 'l.literal(false,{default:false,description:"flag"})',
    'l.literal(42,{nullable:true})', 'l.literal(-0.5,{default:{nullish:-0.5}})',
    'l.array(l.literal(42),{wrapScalar:true})',
    'l.transform(l.literal(true),value=>value?"yes":"no")',
    'l.refine(l.literal(42),value=>value<40,"Too large")',
    'l.object({flag:l.literal(true),count:l.literal(42,{default:42}),off:l.literal(false,{optional:true})})',
    'l.object({items:l.array(l.literal(42)),flag:l.refine(l.literal(true),value=>value,"Enabled")})',
    'l.discriminatedUnion("kind",[l.object({kind:l.literal(true),count:l.literal(42)}),l.object({kind:l.literal(false),count:l.literal(0)})])',
  ];
  const source = `import * as l from 'loculus';export const factories=[${expressions.map(expression => `()=>${expression}`).join(',')}];`;
  const normal = await bundle(source, false);
  const optimized = await bundle(source);
  assert.match(optimized.transformed, /function __loculus_/);
  const inputs = [true, false, 'true', 'false', '1', '0', 1, 0, 42, '42', '4.2e1', -0.5, '-.5',
    undefined, null, '', ' ', '0x2a', '1e999', Infinity, NaN, [], ['42', 42], [43],
    {flag:'1'}, {flag:false,count:42}, {flag:true,off:'false',count:'42'},
    {items:['42',43],flag:false}, {items:['42'],flag:'true'},
    {kind:true,count:'42'}, {kind:false,count:'0'}, {kind:'true',count:42}, {kind:true,count:0}];
  for (let i = 0; i < expressions.length; i++) {
    const a = normal.exports.factories[i]();
    const b = optimized.exports.factories[i]();
    assert.deepEqual({...b.meta,inner:undefined,shape:undefined,options:undefined}, {...a.meta,inner:undefined,shape:undefined,options:undefined}, expressions[i]);
    if (a.meta.inner) assert.deepEqual(b.meta.inner.meta, a.meta.inner.meta);
    if (a.shape) for (const key of Object.keys(a.shape))
      assert.deepEqual({...b.shape[key].meta,inner:undefined}, {...a.shape[key].meta,inner:undefined});
    for (const input of inputs)
      assert.deepEqual(b['~standard'].validate(input), a['~standard'].validate(input), expressions[i]);
    assert.notEqual(b.meta, optimized.exports.factories[i]().meta);
  }
  assert.deepEqual(optimized.exports.factories[7]()['~standard'].validate({flag:'1'}), {value:{flag:true,count:42}});
  assert.deepEqual(optimized.exports.factories[9]()['~standard'].validate({kind:false,count:'0'}), {value:{kind:false,count:0}});
});

test('discriminator scalar conversions survive every object optimization strategy and composite wrapper', async () => {
  const source = `import * as l from 'loculus';
    const numeric=()=>l.discriminatedUnion('edition',[
      l.object({edition:l.literal(1),value:l.string()},{unknownKeys:'strip'}),
      l.object({edition:l.literal(2),value:l.string()},{unknownKeys:'strip'})
    ]);
    const wrap=schema=>l.transform(l.refine(schema,value=>!('value' in value)||value.value!=='bad','Bad value'),value=>({...value,transformed:true}));
    export const createCallbacks=()=>{
      let calls=0;
      return {count:()=>calls,schema:l.discriminatedUnion('kind',[
        l.object({kind:l.transform(l.refine(l.literal(1),()=>{calls++;return true},'Rejected'),value=>{calls++;return value})}),
        l.object({kind:l.literal(true)})
      ]),rejected:l.discriminatedUnion('kind',[
        l.object({kind:l.refine(l.literal(1),()=>false,'Rejected')}),l.object({kind:l.literal(true)})
      ])};
    };
    export const factories=[numeric,
      ()=>l.discriminatedUnion('edition',[l.object({edition:l.literal(true)}),l.object({edition:l.literal(false)})]),
      ()=>l.discriminatedUnion('edition',[l.object({edition:l.literal(1)}),l.object({edition:l.literal(true)}),l.object({edition:l.literal('1')})]),
      ()=>l.discriminatedUnion('edition',[l.object({edition:l.literal(true)}),l.object({edition:l.literal(1)})]),
      ()=>wrap(l.union([numeric(),l.object({other:l.string()})])),
      ()=>wrap(l.xor([numeric(),l.object({other:l.string()})])),
      ()=>wrap(l.intersection(numeric(),l.object({extra:l.string()},{unknownKeys:'strip'})))
    ];`;
  const before = await bundle(source, false);
  const inputs = [
    {edition:'2',value:'hello'}, {edition:'2.0',value:'hello',extra:'kept'},
    {edition:'2e0',value:'bad',extra:'kept'}, {edition:'+2',value:'hello',extra:'kept'},
    {edition:2,value:42}, {edition:'3',value:'hello',extra:'kept'},
    {edition:' 2',value:'hello'}, {edition:'0x2',value:'hello'},
    ...['true','false','1','0',1,true,'TRUE',null,undefined].map(edition=>({edition})), null, [],
  ];
  for (const objects of ['auto','unroll','loop','chunked',false] as const) {
    const after = await bundle(source, true, 'ts', '/loculus-test', {objects});
    assert.doesNotMatch(after.transformed, /l\.literal\(/);
    for (let i = 0; i < before.exports.factories.length; i++) {
      const normal = before.exports.factories[i](), optimized = after.exports.factories[i]();
      for (const input of inputs)
        assert.deepEqual(optimized['~standard'].validate(input), normal['~standard'].validate(input), `${objects}: ${i}`);
    }
    const validate = (index: number, input: unknown) => after.exports.factories[index]()['~standard'].validate(input);
    assert.deepEqual(validate(0,{edition:'2.0',value:'hello'}), {value:{edition:2,value:'hello'}});
    assert.deepEqual(validate(1,{edition:'0'}), {value:{edition:false}});
    assert.deepEqual(validate(2,{edition:'1'}), {value:{edition:'1'}});
    assert.deepEqual(validate(3,{edition:'1'}), {value:{edition:true}});
    const callbacks = after.exports.createCallbacks();
    assert.deepEqual(callbacks.schema['~standard'].validate({kind:'1'}), {value:{kind:1}});
    assert.equal(callbacks.count(), 2);
    assert.equal(callbacks.rejected['~standard'].validate({kind:'1'}).issues?.[0]?.message, 'Rejected');
    for (const i of [4,5,6]) {
      assert.deepEqual(validate(i,{edition:'2.0',value:'hello',extra:'kept'}),
        {value:{edition:2,value:'hello',...(i===6?{extra:'kept'}:{}),transformed:true}});
      assert.equal(validate(i,{edition:'2.0',value:'bad',extra:'kept'}).issues?.[0]?.message, 'Bad value');
    }
  }
});


test('generated string bounds follow live defaults and explicit counters in containers', async () => {
  const source = `import * as l from 'loculus';
    export const configure=l.configure;
    export const schema=l.object({text:l.string({trim:true,min:1,max:1}),rows:l.array(l.string({max:1})),explicit:l.string({length:s=>s.length,max:1})});
    export const scalar=l.string({min:1,max:1});
    export const custom=l.string({length:s=>[...s].length,max:1});`;
  for (const objects of ['auto', 'unroll', 'loop', 'chunked', false] as const) {
    const before = await bundle(source, false);
    const after = await bundle(source, true, 'ts', '/loculus-test', {objects});
    for (const length of [undefined, (s: string) => [...s].length, (s: string) => new TextEncoder().encode(s).length]) {
      for (const module of [before, after]) module.exports.configure({stringLength:length});
      for (const input of [
        {text:' 😀 ',rows:['😀'],explicit:'a'}, {text:'あ',rows:['a'],explicit:'😀'},
        {text:'',rows:[]}, {text:'a',rows:[1],explicit:'a'}, null,
      ]) assert.deepEqual(after.exports.schema['~standard'].validate(input), before.exports.schema['~standard'].validate(input));
      for (const value of ['😀', 'あ', '', 'ab', null, undefined]) {
        assert.deepEqual(after.exports.scalar['~standard'].validate(value), before.exports.scalar['~standard'].validate(value));
        assert.deepEqual(after.exports.custom['~standard'].validate(value), before.exports.custom['~standard'].validate(value));
      }
    }
  }
});

test('custom errors preserve messages and callbacks in generated parents and runtime fallbacks', async () => {
  const source = `import * as l from 'loculus';
    export const seen=[];
    const error=issue=>{seen.push(issue);return issue.input===undefined?'Required':undefined;};
    export const factories=[
      ()=>l.string({min:2,error:'Name'}),
      ()=>l.number({gte:1,error}),
      ()=>l.boolean({error:'Flag'}),
      ()=>l.enum(['a','b'],{error:'Choice'}),
      ()=>l.literal([42,true,'a'],{error:'Literal'}),
      ()=>l.date({error:'Date'}),
      ()=>l.array(l.number({error:'Number'}),{min:1,error:'Rows'}),
      ()=>l.object({name:l.string({error:'Name'}),count:l.number()}),
      ()=>l.object({name:l.string({min:2})},{error:'Object'}),
      ()=>l.object({rows:l.array(l.object({name:l.string({error})}),{min:1,error:'Rows'})}),
      ()=>l.object({name:l.string({error})},{optional:true,error:'Object'}),
    ];`;
  const before = await bundle(source, false);
  const after = await bundle(source);
  assert.match(after.transformed, /function __loculus_/);
  for (let i = 0; i < before.exports.factories.length; i++) {
    const ordinary = before.exports.factories[i]();
    const optimized = after.exports.factories[i]();
    for (const input of [undefined, null, '', 'a', 'bad', '0', 1, true, [], ['bad'], {},
      { name: 1 }, { name: 'a', extra: true }, { rows: [] }, { rows: [{}] }, { rows: [{ name: 1 }] }]) {
      assert.deepEqual(optimized['~standard'].validate(input), ordinary['~standard'].validate(input), `${i}: ${JSON.stringify(input)}`);
    }
  }
  assert.deepEqual(after.exports.seen, before.exports.seen);
});

test('global error maps and structured bounds match runtime in every generated object strategy', async () => {
  const source = `import * as l from 'loculus';
    export const seen=[];
    export const setup=prefix=>l.config({customError:prefix===undefined?undefined:issue=>{seen.push(issue);return prefix+':'+issue.code+':'+issue.origin+':'+(issue.min??issue.max)+':'+issue.inclusive;}});
    export const schemas=[
      l.string({min:3,max:10,trim:true}),
      l.number({gt:3,lt:10}),
      l.array(l.string({min:3,max:10}),{min:1,max:2}),
      l.object({name:l.string({min:3,max:10}),count:l.number({gte:1,lte:5}),local:l.string({min:1,error:'Local'})}),
      l.object({rows:l.array(l.number({gte:1,lte:5}),{min:1,max:2})}),
      l.object({${Array.from({length:40},(_,i)=>`f${i}:l.string({min:3,max:10})`).join(',')}}),
    ];`;
  const ordinary = await bundle(source, false);
  for (const strategy of ['auto', 'unroll', 'loop', 'chunked'] as const) {
    const generated = await bundle(source, true, 'ts', '/loculus-test', {objects:strategy});
    assert.match(generated.transformed, /function __loculus_/);
    for (const prefix of ['ja', 'en', undefined]) {
      ordinary.exports.seen.length = 0;
      generated.exports.seen.length = 0;
      ordinary.exports.setup(prefix);
      generated.exports.setup(prefix);
      for (let i=0;i<ordinary.exports.schemas.length;i++) {
        for (const input of [undefined, null, '', '  a  ', 'abcdefghijk', '3', '10', 'bad', [], ['a'], ['abc', 'def', 'ghi'],
          {name:'',count:'0',local:''}, {name:'abcdefghijk',count:'6',local:'a',extra:true},
          {rows:['0','6']}, {rows:[]}, Object.fromEntries(Array.from({length:40},(_,i)=>[`f${i}`,i%2?'a':'abcdefghijk']))]) {
          assert.deepEqual(generated.exports.schemas[i]['~standard'].validate(input), ordinary.exports.schemas[i]['~standard'].validate(input), `${strategy}: ${i}: ${JSON.stringify(input)}`);
        }
      }
      assert.deepEqual(generated.exports.seen,ordinary.exports.seen);
    }
  }
});

test('generated field errors read accessors once and pass the original value to error maps', async () => {
  const source = `import * as l from 'loculus';
    export const form=l.object({name:l.string({min:3}),count:l.number({gte:1})});
    export const run=custom=>{
      const reads=[];
      const seen=[];
      l.config({customError:custom?issue=>{seen.push(issue.input);return 'Translated';}:undefined});
      const input={
        get name(){reads.push('name');return reads.filter(key=>key==='name').length===1?'a':'changed';},
        get count(){reads.push('count');return reads.filter(key=>key==='count').length===1?'0':'2';},
      };
      return {result:form['~standard'].validate(input),reads,seen};
    };`;
  const ordinary = await bundle(source, false);
  const generated = await bundle(source);
  for (const custom of [false, true]) {
    const expected = ordinary.exports.run(custom);
    assert.deepEqual(expected.reads, ['name', 'count']);
    if (custom) assert.deepEqual(expected.seen, ['a', '0']);
    assert.deepEqual(generated.exports.run(custom), expected);
  }
});


test('generated schemas keep global messages isolated between configured runtime modules', async () => {
  const runtime = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  const source = `import * as a from 'loculus-a';import * as b from 'loculus-b';
    export const first=a.object({name:a.string({min:3})});
    export const second=b.object({count:b.number({gte:1})});
    export const mixed=a.object({name:b.string({min:3}),own:a.string({min:3})});
    export const setup=(left,right)=>{a.config({customError:()=>left});b.config({customError:()=>right});};`;
  const files = { 'loculus-a': runtime, 'loculus-b': runtime };
  const ordinary = await bundle(source, false, 'ts', '/loculus-test', {}, files);
  const generated = await bundle(source, true, 'ts', '/loculus-test', { modules: ['loculus-a', 'loculus-b'] }, files);
  assert.match(generated.transformed, /function __loculus_/);
  assert.ok(generated.map?.mappings.length);
  for (const [left,right] of [['First','Second'],['Updated first','Updated second']]) {
    ordinary.exports.setup(left,right);
    generated.exports.setup(left,right);
    assert.equal(generated.exports.first['~standard'].validate({name:''}).issues[0].message,left);
    assert.equal(generated.exports.second['~standard'].validate({count:'0'}).issues[0].message,right);
    assert.deepEqual(generated.exports.mixed['~standard'].validate({name:'',own:''}).issues.map((issue: l.Issue)=>issue.message),[right,left]);
    assert.equal(generated.exports.mixed['~standard'].validate(null).issues[0].message,left);
    for (const [key,input] of [['first',{name:''}],['second',{count:'0'}]] as const)
      assert.deepEqual(generated.exports[key]['~standard'].validate(input),ordinary.exports[key]['~standard'].validate(input));
  }
});

test('literal generation respects builtin aliases imported from another runtime', async () => {
  const runtime = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  const files = { 'loculus-a': runtime, 'loculus-b': runtime };
  for (const source of [
    `import * as Object from 'loculus-a';import {literal} from 'loculus-b';export const schema=literal('a');export const other=Object.string();`,
    `import {number as Number} from 'loculus-a';import {literal} from 'loculus-b';export const schema=literal(42);export const other=Number();`,
  ]) {
    const generated = await bundle(source, true, 'ts', '/loculus-test', {modules:['loculus-a','loculus-b']}, files);
    assert.deepEqual(generated.exports.schema['~standard'].validate(source.includes("literal('a')") ? 'a' : '42'), {value:source.includes("literal('a')") ? 'a' : 42});
  }
});

test('converted discriminator probes never invoke error callbacks across generated or foreign fields', async () => {
  const runtime = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  const files = { 'loculus-a': runtime, 'loculus-b': runtime };
  for (const foreign of [false,true]) {
    const source = `import * as a from 'loculus-a';import * as b from 'loculus-b';
      export const schema=a.discriminatedUnion('kind',[
        a.object({kind:${foreign?'b':'a'}.literal(42)}),a.object({kind:${foreign?'b':'a'}.literal(true)})
      ]);
      export let calls=0;
      export const setup=throws=>{const customError=()=>{calls++;if(throws)throw Error('probe callback');};a.config({customError});b.config({customError});};`;
    for (const optimized of [false,true]) {
      for (const throws of [false,true]) {
        const built = await bundle(source, optimized, 'ts', '/loculus-test', {modules:['loculus-a','loculus-b']}, files);
        built.exports.setup(throws);
        assert.deepEqual(built.exports.schema['~standard'].validate({kind:'true'}),{value:{kind:true}});
        assert.equal(built.exports.calls,0);
      }
    }
  }
});

test('generated scalar results customize inherited issues with the original field input', async () => {
  const source = `import * as l from 'loculus';
    export const seen=[];
    export const create=()=>l.object({a:l.string()});
    export const setup=()=>{seen.length=0;l.config({customError:issue=>{seen.push(issue.received);return 'Translated';}});};`;
  const ordinary = await bundle(source,false);
  const run = (built:typeof ordinary) => {
    const schema = built.exports.create();
    built.exports.setup();
    let reads = 0;
    const previous = Object.getOwnPropertyDescriptor(Object.prototype,'issues');
    const input = {get a(){Object.defineProperty(Object.prototype,'issues',{configurable:true,get(){reads++;return [{message:'inherited',code:'custom'}];}});return 'original';}};
    try {return {result:schema['~standard'].validate(input),reads,seen:[...built.exports.seen]};}
    finally {if(previous)Object.defineProperty(Object.prototype,'issues',previous);else delete (Object.prototype as {issues?:unknown}).issues;}
  };
  const expected = run(ordinary);
  assert.deepEqual(expected.result,{issues:[{message:'Translated',code:'custom',path:['a']}]});
  assert.deepEqual(expected.seen,['original']);
  for (const objects of ['auto','unroll','loop','chunked'] as const) {
    const generated = await bundle(source,true,'ts','/loculus-test',{objects});
    assert.deepEqual(run(generated),expected,objects);
  }
});

test('generated scalar success paths leave rejected literal probes uncustomized', async () => {
  const source = `import * as l from 'loculus';
    export const seen=[];
    export const setup=()=>{seen.length=0;l.config({customError:issue=>{seen.push(issue.received);return 'Translated';}});};
    export const fields=[l.string(),l.number(),l.boolean(),l.literal([42,true,'a'])];`;
  const built = await bundle(source);
  built.exports.setup();
  for (const [index,input,value] of [[0,'ok','ok'],[1,'42',42],[2,'true',true],[3,'true',true]] as const)
    assert.deepEqual(built.exports.fields[index]['~standard'].validate(input),{value});
  assert.deepEqual(built.exports.seen,[]);
  for (const field of built.exports.fields)
    assert.equal(field['~standard'].validate({}).issues[0].message,'Translated');
  assert.equal(built.exports.seen.length,4);
});

test('generated accepted literal branches preserve inherited issue reads with global messages', async () => {
  const source = `import * as l from 'loculus';export let calls=0;
    export const setup=()=>{calls=0;l.config({customError:()=>{calls++;return 'Translated';}});};
    export const fields=[l.literal([1,2]),l.literal([true,false]),l.literal(['a',1,false])];`;
  const ordinary = await bundle(source,false), generated = await bundle(source);
  const run = (built:typeof ordinary,index:number,input:unknown) => {
    built.exports.setup();
    let reads = 0;
    const previous = Object.getOwnPropertyDescriptor(Object.prototype,'issues');
    Object.defineProperty(Object.prototype,'issues',{configurable:true,get(){return ++reads<=2?undefined:[{message:'inherited',code:'custom'}];}});
    try {return {result:built.exports.fields[index]['~standard'].validate(input),reads,calls:built.exports.calls};}
    finally {if(previous)Object.defineProperty(Object.prototype,'issues',previous);else delete (Object.prototype as {issues?:unknown}).issues;}
  };
  for (const [index,input,value] of [[0,'1',1],[1,'true',true],[2,'a','a']] as const) {
    const expected = run(ordinary,index,input);
    assert.deepEqual(expected.result,{value});
    assert.equal(expected.calls,0);
    assert.deepEqual(run(generated,index,input),expected);
  }
});

test('generated containers preserve changing inherited issue accessors with global messages', async () => {
  const source = `import * as l from 'loculus';export let calls=0;
    export const setup=()=>{calls=0;l.config({customError:()=>{calls++;return 'Translated';}});};
    export const object=l.object({name:l.string()});export const array=l.array(l.string());`;
  const ordinary = await bundle(source,false);
  const run = (built:typeof ordinary,key:string,input:unknown) => {
    built.exports.setup();
    let reads = 0;
    const previous = Object.getOwnPropertyDescriptor(Object.prototype,'issues');
    Object.defineProperty(Object.prototype,'issues',{configurable:true,get(){return ++reads<=2?undefined:[{message:'inherited',code:'custom'}];}});
    try {return {result:built.exports[key]['~standard'].validate(input),reads,calls:built.exports.calls};}
    finally {if(previous)Object.defineProperty(Object.prototype,'issues',previous);else delete (Object.prototype as {issues?:unknown}).issues;}
  };
  const expected = run(ordinary,'object',{name:'ok'});
  assert.deepEqual(expected.result,{value:{name:'ok'}});
  assert.equal(expected.calls,0);
  for (const objects of ['auto','unroll','loop','chunked'] as const) {
    const generated = await bundle(source,true,'ts','/loculus-test',{objects});
    assert.deepEqual(run(generated,'object',{name:'ok'}),expected,objects);
    assert.deepEqual(run(generated,'array',['ok']),run(ordinary,'array',['ok']),objects);
    generated.exports.setup();
    assert.equal(generated.exports.object['~standard'].validate(null).issues[0].message,'Translated');
    assert.equal(generated.exports.calls,1);
  }
});

test('generated strings keep length settings isolated between configured runtime modules', async () => {
  const runtime = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  const source = `import * as a from 'loculus-a';import * as b from 'loculus-b';
    export const first=a.object({text:a.string({max:1})});
    export const second=b.object({text:b.string({max:1})});
    export const mixed=a.object({first:a.string({max:1}),second:b.string({max:1})});
    export const setup=(left,right)=>{a.config({stringLength:left,customError:()=>"First"});b.config({stringLength:right,customError:()=>"Second"});};`;
  const files = { 'loculus-a': runtime, 'loculus-b': runtime };
  const ordinary = await bundle(source, false, 'ts', '/loculus-test', {}, files);
  const generated = await bundle(source, true, 'ts', '/loculus-test', { modules: ['loculus-a', 'loculus-b'] }, files);
  for (const [left, right] of [[undefined, (value: string) => [...value].length], [(value: string) => [...value].length, undefined]]) {
    ordinary.exports.setup(left, right);
    generated.exports.setup(left, right);
    for (const key of ['first', 'second']) {
      for (const text of ['a', '😀', 'ab'])
        assert.deepEqual(generated.exports[key]['~standard'].validate({text}), ordinary.exports[key]['~standard'].validate({text}));
    }
    const input = {first:'😀', second:'😀'};
    assert.deepEqual(generated.exports.mixed['~standard'].validate(input), ordinary.exports.mixed['~standard'].validate(input));
    assert.deepEqual(generated.exports.mixed['~standard'].validate(input).issues.map((issue: l.Issue) => issue.message), [left ? 'Second' : 'First']);
  }
});
