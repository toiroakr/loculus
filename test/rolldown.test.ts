import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rolldown } from 'rolldown';
import { fileURLToPath } from 'node:url';
import * as l from '../src/index.js';
import { loculusPlugin, type LoculusPluginOptions } from '../packages/rolldown/src/index.js';
import {z} from 'zod';
import * as v from 'valibot';

async function bundle(source: string, optimized = true, extension = 'ts', directory = '/loculus-test', options: LoculusPluginOptions = {}) {
  const id = `${directory}/entry.${extension}`;
  let transformed = '';
  const build = await rolldown({
    input: id,
    plugins: [
      {
        name: 'fixture',
        resolveId(module) {
          if (module === id) return id;
          if (module === 'loculus') return fileURLToPath(new URL('../src/index.ts', import.meta.url));
        },
        load(module) {
          if (module === id) return { code: source, moduleType: extension.startsWith('tsx') ? 'tsx' : extension.startsWith('ts') ? 'ts' : 'js' };
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
    'l.string({trim:true,min:2,max:4,description:"名前"})',
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
  const source = `'use client';import {string} from 'loculus';const __loculus_0='日本語😀';
    export const create=():unknown=>string({min:1,description:__loculus_0});
    export const field=string({description:'日本語😀',min:1});`;
  const after = await bundle(source, true, 'tsx');
  assert.ok(after.transformed.startsWith("'use client';"));
  assert.match(after.transformed, /description:__loculus_0/);
  assert.equal(after.exports.field.meta.description, '日本語😀');
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
