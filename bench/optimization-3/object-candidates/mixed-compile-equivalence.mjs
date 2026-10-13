import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { transform } from 'esbuild';
const manifest = {"baselineHash":"25a54b1c230cf21a20920b068711dc64b0506c628264a18be3b13ec358e00b95","candidates":[{"name":"mixed-compile-baseline3"},{"name":"mixed-compile-exact-all","sourceHash":"62e5af48732b4b9a298cf4e849d6c215f691b3031104b6492235253f57862691"},{"name":"mixed-compile-exact-4","sourceHash":"7cc51e3299f66a7ce27b8d6c1044788e061d06a1ea01ebfca5b63d186676a662"},{"name":"mixed-compile-wide-presence","sourceHash":"626e2b15c8ba6471de161150e284fd313d3be4e82ec1a5086789cc3f07ad6a2a"},{"name":"mixed-compile-wide-selective","sourceHash":"0ef5f2e830f2e8f709fb11d56be0e161f74967d9ff8bd2f8a4d337e506fe11d1"}]};
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

const {make}=await import('./mixed-compile-fixtures.mjs');
for(const profile of ['transform-100','default-100','query-12'])for(const invalid of [false,true])scenarios.push({name:profile+'-'+invalid,run(l,compiled){const fixture=make(l,profile);return record(l.safeParse(compiled?l.compile(fixture.schema):fixture.schema,invalid?fixture.bad:fixture.good))}});
for(const width of [8,40])for(const kind of ['changing-value','missing-value','throw-value','changing-issues'])scenarios.push({name:'mixed-result-accessor-'+kind+'-'+width,run(l,compiled){
 const events=[];let valueReads=0,issueReads=0;const base=l.string();
 const field={...base,'~standard':{...base['~standard'],validate(value){events.push(['validate',value]);return {get issues(){events.push('issues-'+(++issueReads));return kind==='changing-issues'?(issueReads===1?[{message:'bad',code:'custom'}]:[]):undefined},get value(){events.push('value-'+(++valueReads));if(kind==='throw-value'&&valueReads===2)throw Error('value-stop');return kind==='missing-value'?undefined:kind==='changing-value'&&valueReads===2?undefined:'changed'}}}}};
 const shape={first:field,...Object.fromEntries(Array.from({length:width},(_,i)=>['s'+i,l.string()]))};
 const raw=Object.fromEntries(Array.from({length:width},(_,i)=>['s'+i,'v']));
 const input=new Proxy(raw,{get(t,k,r){events.push(['raw-get',k]);return Reflect.get(t,k,r)},getOwnPropertyDescriptor(t,k){events.push(['raw-own',k]);return Reflect.getOwnPropertyDescriptor(t,k)}});
 const schema=l.object(shape);try{return {events,result:record(l.safeParse(compiled?l.compile(schema):schema,input))}}catch(error){return {events,error:error.message}}
}});
for(const readonly of [false,true])scenarios.push({name:'mixed-prototype-hook-'+readonly,run(l,compiled){const events=[];const saved=Object.getOwnPropertyDescriptor(Object.prototype,'s0');const shape={first:l.transform(l.string(),value=>{Object.defineProperty(Object.prototype,'s0',readonly?{value:'readonly',writable:false,configurable:true}:{set(value){events.push({value,keys:Object.keys(this)})},configurable:true});return value+'!'}),...Object.fromEntries(Array.from({length:8},(_,i)=>['s'+i,l.string()]))};const schema=l.object(shape);const input={first:'v',...Object.fromEntries(Array.from({length:8},(_,i)=>['s'+i,'v']))};try{return {events,result:record(l.safeParse(compiled?l.compile(schema):schema,input))}}catch(error){return {events,error:error.name}}finally{if(saved)Object.defineProperty(Object.prototype,'s0',saved);else delete Object.prototype.s0}}});
scenarios.push({name:'mixed-input-getter-edits-later',run(l,compiled){const events=[];const shape={first:l.transform(l.string(),value=>{events.push('transform');return value+'!'}),...Object.fromEntries(Array.from({length:8},(_,i)=>['s'+i,l.string()]))};const input={get first(){events.push('first');delete input.s0;input.s1='changed';return 'v'},...Object.fromEntries(Array.from({length:8},(_,i)=>['s'+i,'v']))};const schema=l.object(shape);return {events,result:record(l.safeParse(compiled?l.compile(schema):schema,input))}}});

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
writeFileSync(new URL('./mixed-compile-semantics-results.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),baselineHash:manifest.baselineHash,results},null,2)+'\n');
console.log(JSON.stringify(results));
