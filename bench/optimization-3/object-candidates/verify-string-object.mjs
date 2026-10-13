import {readFileSync,writeFileSync} from 'node:fs';
const dir=new URL('./',import.meta.url);
const ownManifest=JSON.parse(readFileSync(new URL('string-object-manifest.json',dir),'utf8'));
let verifier=readFileSync(new URL('verify.mjs',dir),'utf8');
verifier=verifier.replace("const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));",`const manifest = ${JSON.stringify({...ownManifest,candidates:[{name:'string-object-baseline3'},...ownManifest.candidates]})};`);
verifier=verifier.replace("'./semantics-results.json'","'./string-object-semantics-results.json'");
const extra=`
for(const width of [0,1,31,32,33,100])for(const mode of ['strip','strict','passthrough'])scenarios.push({name:'special-string-width-'+width+'-'+mode,run(l,compiled){
 const events=[];const shared=l.string();const keys=Array.from({length:width},(_,i)=>'f'+i);const shape=Object.fromEntries(keys.map(key=>[key,shared]));
 let stdReads=0;const std=shared['~standard'];Object.defineProperty(shared,'~standard',{get(){stdReads++;return std},configurable:true});
 const base=l.object(shape,{unknownKeys:mode});const schema=compiled?l.compile(base):base;
 const raw=Object.fromEntries(keys.map(key=>[key,'v']));raw.extra='x';const input=new Proxy(raw,{get(t,k,r){events.push(['get',k]);return Reflect.get(t,k,r)},getOwnPropertyDescriptor(t,k){events.push(['own',k]);return Reflect.getOwnPropertyDescriptor(t,k)},ownKeys(t){events.push(['keys']);return Reflect.ownKeys(t)}});
 return {stdReads,result:record(l.safeParse(schema,input)),events};
}});
for(const custom of ['presence','custom-validator','own-standard-getter'])scenarios.push({name:'special-exclusion-'+custom,run(l,compiled){
 const shape=Object.fromEntries(Array.from({length:32},(_,i)=>['f'+i,l.string()]));const input=Object.fromEntries(Array.from({length:32},(_,i)=>['f'+i,'v']));const events=[];
 if(custom==='presence'){shape.f0=l.string({default:'fallback'});delete input.f0;}
 else {const field=l.string();const standard={...field['~standard'],validate(value){events.push(value);return {get issues(){events.push('issues');return undefined},get value(){events.push('value');return value+'!'}}}};if(custom==='own-standard-getter')Object.defineProperty(field,'~standard',{get(){events.push('std');return standard},configurable:true});else field['~standard']=standard;shape.f0=field;}
 const base=l.object(shape);const schema=compiled?l.compile(base):base;return {result:record(l.safeParse(schema,input)),events};
}});
`;
verifier=verifier.replace('const results=[];',extra+'\nconst results=[];');
writeFileSync(new URL('string-object-equivalence.mjs',dir),verifier);
await import(new URL('string-object-equivalence.mjs',dir));
