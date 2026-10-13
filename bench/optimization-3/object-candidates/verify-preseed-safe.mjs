import {readFileSync,writeFileSync} from 'node:fs';
const dir=new URL('./',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('preseed-safe-manifest.json',dir),'utf8'));
let verifier=readFileSync(new URL('verify.mjs',dir),'utf8');
verifier=verifier.replace("const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));",`const manifest = {baselineHash:${JSON.stringify(manifest.baselineHash)},candidates:[{name:'baseline3'},{name:'preseed-safe'}]};`);
verifier=verifier.replace("'./semantics-results.json'","'./preseed-safe-semantics-results.json'");
const extra=`
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
`;
verifier=verifier.replace('const results=[];',extra+'\nconst results=[];');
writeFileSync(new URL('preseed-safe-equivalence.mjs',dir),verifier);
await import(new URL('preseed-safe-equivalence.mjs',dir));
