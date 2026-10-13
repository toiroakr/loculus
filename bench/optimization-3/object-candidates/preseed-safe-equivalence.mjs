import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { transform } from 'esbuild';
const manifest = {baselineHash:"25a54b1c230cf21a20920b068711dc64b0506c628264a18be3b13ec358e00b95",candidates:[{name:'baseline3'},{name:'preseed-safe'}]};
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

const setterScenarios=['second-result-read-adds-setter','setter-changes-output-prototype','earlier-issue-and-missing','readonly-added-on-second-read'];
for(const kind of setterScenarios)scenarios.push({name:kind,run(l,compiled){
 const events=[];const shape=Object.fromEntries(Array.from({length:32},(_,i)=>['f'+i,l.string()]));
 const input=Object.fromEntries(Array.from({length:32},(_,i)=>['f'+i,'v'+i]));
 const old=Object.getOwnPropertyDescriptor(Object.prototype,'f2');
 const restore=()=>{if(old)Object.defineProperty(Object.prototype,'f2',old);else delete Object.prototype.f2};
 const install=()=>Object.defineProperty(Object.prototype,'f2',kind==='readonly-added-on-second-read'?{value:'readonly',writable:false,configurable:true}:{configurable:true,set(value){
   events.push({setter:value,keys:Object.keys(this),values:Object.keys(this).map(k=>this[k])});
   if(kind==='setter-changes-output-prototype')Object.setPrototypeOf(this,{set f3(next){events.push({nextSetter:next,keys:Object.keys(this)});Object.defineProperty(this,'f3',{value:next,enumerable:true,writable:true,configurable:true})}});
 }});
 if(kind==='second-result-read-adds-setter'||kind==='readonly-added-on-second-read'){
   let reads=0;const field=l.string();shape.f2={...field,'~standard':{...field['~standard'],validate(value){return {get issues(){events.push('issues');return undefined},get value(){events.push('value-'+(++reads));if(reads===2)install();return value}}}}};
 }
 if(kind==='earlier-issue-and-missing'){shape.f0=l.string({optional:true});delete input.f0;input.f1=42;}
 const base=l.object(shape);const schema=compiled?l.compile(base):base;
 try{
   if(kind==='setter-changes-output-prototype'||kind==='earlier-issue-and-missing')install();
   const result=l.safeParse(schema,input);
   return {events,result:result.issues?{issues:result.issues}:{keys:Object.keys(result.value),values:Object.keys(result.value).map(k=>result.value[k]),prototypeKeys:Object.keys(Object.getPrototypeOf(result.value))}};
 }catch(error){return {events,error:error.name}}finally{restore()}
}});
scenarios.push({name:'object-public-representation',run(l,compiled){
 const symbol=Symbol('field');const child=l.string();const shape=Object.fromEntries(Array.from({length:32},(_,i)=>['f'+i,child]));shape[symbol]=child;
 const base=l.object(shape);const schema=compiled?l.compile(base):base;
 return {keys:Object.keys(schema),metaKeys:Object.keys(schema.meta),shapeKeys:Object.keys(schema.shape),shapeSymbols:Object.getOwnPropertySymbols(schema.shape).length,frozen:Object.isFrozen(schema.shape),schemaPrototype:Object.getPrototypeOf(schema),stdDescriptor:Object.getOwnPropertyDescriptor(schema,'~standard')&&{enumerable:true,configurable:true,writable:true},resultKeys:Object.keys(l.parse(schema,Object.fromEntries(Array.from({length:32},(_,i)=>['f'+i,'v']))))};
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
writeFileSync(new URL('./preseed-safe-semantics-results.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),baselineHash:manifest.baselineHash,results},null,2)+'\n');
console.log(JSON.stringify(results));
