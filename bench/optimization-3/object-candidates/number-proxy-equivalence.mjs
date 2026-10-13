import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { transform } from 'esbuild';
const manifest = {"baselineHash":"77754cfa558e4c48e367626d6545f1b676a51a78ddf6b03474c2862d710f3ae0","candidates":[{"name":"baseline"},{"name":"number-native-elision"}]};
const modules = [];
for (const c of manifest.candidates) {
  const source = readFileSync(new URL(c.name+'.ts.txt', import.meta.url), 'utf8');
  const result = await transform(source, {loader:'ts',format:'esm',target:'es2022'});
  writeFileSync(new URL(c.name+'.mjs',import.meta.url), result.code);
  modules.push([c.name,await import(new URL(c.name+'.mjs',import.meta.url))]);
}
const [_, baseline] = modules[0];
const record = result => result.issues ? { issues:result.issues } : { value:result.value,keys:Object.keys(result.value),prototype:Object.getPrototypeOf(result.value) };
const scenarios = [
  ...[0,1,3,30,100].flatMap(width => [false,true].map(invalid => ({
    name:`width-${width}-${invalid?'invalid':'valid'}`,
    run(l, compiled) {
      const shape=Object.fromEntries(Array.from({length:width},(_,i)=>['f'+i,l.string()]));
      const base=l.object(shape);const schema=compiled?l.compile(base):base;
      assert(Object.isFrozen(schema.shape));
      return record(l.safeParse(schema,invalid?{}:Object.fromEntries(Array.from({length:width},(_,i)=>['f'+i,'hello']))));
    },
  }))),
  ...['strip','strict','passthrough'].map(mode => ({name:'presence-'+mode,run(l,compiled){
    const shape={a:l.string({optional:true}),b:l.number({default:3}),['__proto__']:l.string({nullish:true}),c:l.array(l.string()),d:l.boolean({optional:true})};
    const base=l.object(shape,{unknownKeys:mode});const schema=compiled?l.compile(base):base;
    const inputs=[{c:'x'},{a:undefined,c:['x'],d:false},{a:null,b:'bad',c:[42,43]},JSON.parse('{"__proto__":null,"c":"x","extra":1}'),Object.assign(Object.create({a:'inherited',b:10}),{c:'x'})];
    return inputs.map(x=>record(l.safeParse(schema,x)));
  }})),
  {name:'getters-callbacks',run(l,compiled){
    const events=[];let backing='b';
    const base=l.object({a:l.transform(l.string(),value=>{events.push('transform-a');backing='changed';return value+'!'}),b:l.string(),c:l.array(l.string())});
    const schema=compiled?l.compile(base):base;
    const input={get a(){events.push('get-a');return 'a'},get b(){events.push('get-b');return backing},get c(){events.push('get-c');return [1,2]}};
    return {result:record(l.safeParse(schema,input)),events};
  }},
  {name:'getter-add-delete',run(l,compiled){
    const events=[];const input={get a(){events.push('get-a');delete input.b;input.c='added';return 'a'},b:'b'};
    const base=l.object({a:l.string(),b:l.string({optional:true}),c:l.string()});const schema=compiled?l.compile(base):base;
    return {result:record(l.safeParse(schema,input)),events};
  }},
  {name:'proxy-traps',run(l,compiled){
    const events=[];
    const input=new Proxy({a:'a',b:undefined,c:42},{get(t,k,r){events.push(['get',k]);return Reflect.get(t,k,r)},getOwnPropertyDescriptor(t,k){events.push(['own',k]);return Reflect.getOwnPropertyDescriptor(t,k)},ownKeys(t){events.push(['keys']);return Reflect.ownKeys(t)},has(t,k){events.push(['has',k]);return Reflect.has(t,k)}});
    const base=l.object({a:l.string(),b:l.string({optional:true}),c:l.string()});const schema=compiled?l.compile(base):base;
    return {result:record(l.safeParse(schema,input)),events};
  }},
  {name:'shape-snapshot-and-key-order',run(l,compiled){
    const keys=['10','2','__proto__','a";throw Error("injected");//','constructor','\n'];
    const shape=Object.fromEntries(keys.map(key=>[key,l.string()]));
    const base=l.object(shape);shape['2']=l.string({min:100});delete shape['10'];shape.added=l.string();
    const schema=compiled?l.compile(base):base;
    return {result:record(l.safeParse(schema,Object.fromEntries(keys.map(key=>[key,key])))),shapeKeys:Object.keys(schema.shape),frozen:Object.isFrozen(schema.shape)};
  }},
  {name:'passthrough-getter-deletes-next',run(l,compiled){
    const events=[];const input={a:'a',get extra(){events.push('extra');delete input.next;return 'x'},next:'y'};
    const base=l.object({a:l.string()},{unknownKeys:'passthrough'});const schema=compiled?l.compile(base):base;
    return {result:record(l.safeParse(schema,input)),events};
  }},
  {name:'callback-throws',run(l,compiled){
    const events=[];const base=l.object({a:l.transform(l.string(),()=>{events.push('callback');throw Error('stop')}),b:l.string()});const schema=compiled?l.compile(base):base;
    try {l.safeParse(schema,{a:'a',get b(){events.push('b');return 'b'}})}catch(e){return {error:e.message,events}}
    throw Error('Expected callback throw');
  }},
];
for (const count of [100,129]) scenarios.push({name:'enumerable-symbol-'+count,run(l,compiled){
  const symbol=Symbol.for('loculus.test.symbol');
  const shape=Object.fromEntries(Array.from({length:count},(_,i)=>['f'+i,l.string()]));shape[symbol]=l.string();
  const base=l.object(shape);const schema=compiled?l.compile(base):base;
  return record(l.safeParse(schema,Object.fromEntries(Array.from({length:count},(_,i)=>['f'+i,'hello']))));
}});
for (const kind of ['success','invalid','missing','explicit-undefined']) scenarios.push({name:'result-accessors-'+kind,run(l,compiled){
  const events=[];const original=l.string();const input=kind==='missing'?{b:'b'}:{a:kind==='explicit-undefined'?undefined:'a',b:'b'};
  const custom={...original,'~standard':{...original['~standard'],validate(value){events.push('validate-a');return {
    get issues(){events.push('result-issues');return kind==='invalid'?[{message:'custom',code:'custom'}]:undefined},
    get value(){events.push('result-value');input.b='changed';return value},
  }}}};
  const base=l.object({a:custom,b:l.string()});const schema=compiled?l.compile(base):base;
  return {result:record(l.safeParse(schema,input)),events};
}});
for (const kind of ['setter','read-only']) scenarios.push({name:'prototype-'+kind,run(l,compiled){
  const shape=Object.fromEntries(Array.from({length:100},(_,i)=>['f'+i,l.string()]));const base=l.object(shape);const schema=compiled?l.compile(base):base;
  const input=Object.fromEntries(Array.from({length:100},(_,i)=>['f'+i,'hello']));const events=[];const original=Object.getOwnPropertyDescriptor(Object.prototype,'f0');
  try{
    Object.defineProperty(Object.prototype,'f0',kind==='setter'?{set(value){events.push({value,receiverKeys:Object.keys(this)})},configurable:true}:{value:'inherited',writable:false,configurable:true});
    try{return {result:record(l.safeParse(schema,input)),events}}catch(error){return {error:error.name,events}}
  }finally{if(original)Object.defineProperty(Object.prototype,'f0',original);else delete Object.prototype.f0}
}});

for(const throws of [false,true])scenarios.push({name:'opaque-callable-proxy-numeric-'+(throws?'throw':'log'),run(l,compiled){
 const events=[];const callable=new Proxy(value=>({value}),{
   get(target,key,receiver){events.push(['get',String(key)]);if(throws&&typeof key==='symbol')throw new Error('opaque validator get');return Reflect.get(target,key,receiver)},
   apply(target,thisArg,args){events.push(['apply',args]);return Reflect.apply(target,thisArg,args)}
 });
 const field={...l.number(),'~standard':{version:1,vendor:'opaque',validate:callable}};
 const base=l.object({value:field});let schema;
 try{schema=compiled?l.compile(base):base}catch(error){return {phase:'compile',error:error.message,events}}
 events.length=0;
 try{return {events,result:record(l.safeParse(schema,{value:42}))}}catch(error){return {phase:'validate',error:error.message,events}}
}});

const results=[];
for(const [name,l] of modules){
 let count=0;const failures=[];
 for(const compiled of [false,true])for(const scenario of scenarios){
  try{assert.deepStrictEqual(scenario.run(l,compiled),scenario.run(baseline,compiled),`${name}/${scenario.name}/${compiled?'compiled':'plain'}`);count++;}catch(error){failures.push({scenario:scenario.name,compiled,message:error.message.slice(0,300)})}
 }
 const original=globalThis.Function;const schema=l.object({a:l.string()});
 try{globalThis.Function=()=>{throw new EvalError('CSP')};assert.strictEqual(l.compile(schema),schema)}finally{globalThis.Function=original}
 results.push({name,scenarioChecks:count,cspFallback:true,failures});
}
writeFileSync(new URL('./number-proxy-semantics-results.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),baselineHash:manifest.baselineHash,results},null,2)+'\n');
console.log(JSON.stringify(results));
