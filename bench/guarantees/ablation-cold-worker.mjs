import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
const id=process.argv[2]??'baseline';
const file=resolve(`bench/guarantees/generated/ablations/library-${id}.mjs`);
const module=id==='literal-validator-cache'
  ?await import('data:text/javascript;base64,'+Buffer.from(readFileSync(file,'utf8')+'\nexport const cacheEntries=()=>__literalCache.size;').toString('base64'))
  :await import(pathToFileURL(file));
const {l}=module;
export const schemas=new Array(32),results=new Array(32);
let checksum=0,counter=0;
function batch(count){const start=performance.now();for(let i=0;i<count;i++){const value='unique-'+counter++;const s=l.literal(value);const r=l.safeParse(s,value);schemas[i&31]=s;results[i&31]=r;if(r.issues||r.value!==value)throw new Error('Invalid cold output');checksum+=r.value.length;}return (performance.now()-start)*1e6/count;}
batch(5000);global.gc?.();const before=process.memoryUsage().heapUsed;
const first=batch(10000);global.gc?.();const afterFirst=process.memoryUsage().heapUsed;
const second=batch(10000);global.gc?.();const afterSecond=process.memoryUsage().heapUsed;
const cacheEntries=module.cacheEntries?.()??0;
if(id==='literal-validator-cache'&&cacheEntries!==counter)throw new Error('Unexpected cache retention');
console.log(JSON.stringify({id,gc:typeof global.gc==='function',firstNs:first,secondNs:second,before,afterFirst,afterSecond,firstGrowth:afterFirst-before,secondGrowth:afterSecond-afterFirst,checksum,uniqueSchemas:counter,cacheEntries,retainedSchemas:32}));
