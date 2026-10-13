import {readFileSync,writeFileSync} from 'node:fs';
const dir=new URL('./',import.meta.url);
const original=JSON.parse(readFileSync(new URL('manifest.json',dir),'utf8'));
let verifier=readFileSync(new URL('verify.mjs',dir),'utf8');
verifier=verifier.replace("const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));",`const manifest = ${JSON.stringify({baselineHash:original.baselineHash,candidates:[{name:'baseline'},{name:'number-native-elision'}]})};`);
verifier=verifier.replace("'./semantics-results.json'","'./number-proxy-semantics-results.json'");
const extra=`
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
`;
verifier=verifier.replace('const results=[];',extra+'\nconst results=[];');
writeFileSync(new URL('number-proxy-equivalence.mjs',dir),verifier);
await import(new URL('number-proxy-equivalence.mjs',dir));
