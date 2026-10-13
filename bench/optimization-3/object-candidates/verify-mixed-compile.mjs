import {readFileSync,writeFileSync} from 'node:fs';
const dir=new URL('./',import.meta.url);
const ownManifest=JSON.parse(readFileSync(new URL('mixed-compile-manifest.json',dir),'utf8'));
let verifier=readFileSync(new URL('verify.mjs',dir),'utf8');
verifier=verifier.replace("const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));",`const manifest = ${JSON.stringify({...ownManifest,candidates:[{name:'mixed-compile-baseline3'},...ownManifest.candidates]})};`);
verifier=verifier.replace("'./semantics-results.json'","'./mixed-compile-semantics-results.json'");
const extra=`
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
`;
verifier=verifier.replace('const results=[];',extra+'\nconst results=[];');
writeFileSync(new URL('mixed-compile-equivalence.mjs',dir),verifier);
await import(new URL('mixed-compile-equivalence.mjs',dir));
