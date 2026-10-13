import {make} from './mixed-compile-fixtures.mjs';
const [name='mixed-compile-baseline3',profile='transform-100',mode='valid']=process.argv.slice(2);
const l=await import(new URL(name+'.mjs',import.meta.url));
const fixture=make(l,profile),schema=l.compile(fixture.schema),data=mode==='invalid'?fixture.bad:fixture.good;
const constructing=mode==='construct';let checksum=0;
const run=()=>{const s=constructing?l.compile(make(l,profile).schema):schema;const result=s['~standard'].validate(data);if(result.issues){checksum+=result.issues.length;for(const issue of result.issues)checksum+=issue.message.length}else{for(const key of Object.keys(result.value)){const value=result.value[key];checksum+=key.length+(typeof value==='string'?value.length:typeof value==='number'?value:Array.isArray(value)?value.length:1)}}};
const iterations=constructing?500:5000,warmup=constructing?100:3000;
for(let i=0;i<warmup;i++)run();
const samples=[];for(let round=0;round<9;round++){const start=performance.now();for(let i=0;i<iterations;i++)run();samples.push((performance.now()-start)*1e6/iterations)}
console.log(JSON.stringify({exploratory:true,name,profile,mode,runtime:process.versions,iterations,warmup,samples,checksum}));
