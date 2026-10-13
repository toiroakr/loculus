import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const dir='bench/optimization-3/generated/scalar-verification';
const modules=[];
const sourceHash=createHash('sha256').update(readFileSync('src/index.ts')).digest('hex');
for(const name of ['baseline','date-calendar','date-calendar-mask','production']){
 const source=readFileSync(name==='production'?'src/index.ts':'bench/optimization-3/scalar-candidates/'+name+'.ts.txt','utf8');
 const r=await build({stdin:{contents:source,loader:'ts'},format:'esm',target:'es2022',write:false});
 const file=dir+'/'+name+'.mjs';writeFileSync(file,r.outputFiles[0].text);modules.push(await import(pathToFileURL(resolve(file))));
}
const schemas=modules.map(l=>l.date());let count=0;const thrown=[];
const years=new Set([0,1,4,99,100,400,1600,1700,1800,1900,1999,2000,2004,2100,2400,9999]);for(let y=0;y<=9999;y+=29)years.add(y);
for(let y=1600;y<2000;y++)years.add(y);
for(const year of years)for(let month=0;month<=13;month++)for(let day=0;day<=32;day++){
 const value=String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
 const variants=[value,value+'T00:30:00+14:00',value+'T23:30:00-12:00',value+'\n'];
 for(const input of variants){let expected;try{expected=modules[0].safeParse(schemas[0],input)}catch(e){assert(e instanceof RangeError);thrown.push(input);expected={issues:[{message:'Invalid date',code:'invalid_value'}]};}for(let i=1;i<modules.length;i++)assert.deepEqual(modules[i].safeParse(schemas[i],input),expected,input);count++;}
}
assert.equal(createHash('sha256').update(readFileSync('src/index.ts')).digest('hex'),sourceHash);
const report={date:new Date().toISOString(),sourceHash,cases:count,runtime:typeof Bun!=='undefined'?'Bun '+Bun.version:'Node '+process.version,years:years.size,gregorianCycle:[1600,1999],monthRange:[0,13],dayRange:[0,32],variants:['date','positive timezone','negative timezone','trailing newline'],matchedExceptPreviouslyThrown:true,previouslyThrownCount:thrown.length,previouslyThrownExamples:thrown.slice(0,10)};
writeFileSync('bench/optimization-3/calendar-semantics-'+(typeof Bun!=='undefined'?'bun':'node')+'.json',JSON.stringify(report,null,2)+'\n');console.log(report);
