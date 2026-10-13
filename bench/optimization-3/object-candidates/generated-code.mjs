import { writeFileSync } from 'node:fs';
import * as z from 'zod';
import * as l from './baseline.mjs';
import * as c from './compile-captured-own.mjs';
const original = globalThis.Function;
const sources = [];
let current;
globalThis.Function = new Proxy(original, {
  construct(target,args) { sources.push({label:current,args:args.slice(0,-1),body:args.at(-1)}); return Reflect.construct(target,args); },
  apply(target,thisArg,args) { sources.push({label:current,args:args.slice(0,-1),body:args.at(-1)}); return Reflect.apply(target,thisArg,args); },
});
try {
  for (const width of [1,100]) for (const [label,module] of [['loculus',l],['loculus-captured-own',c],['zod',z]]) {
    current = `${label}-width-${width}`;
    const shape=Object.fromEntries(Array.from({length:width},(_,i)=>['f'+i,module.string()]));
    const schema=module.compile(module.object(shape));
    schema['~standard'].validate(Object.fromEntries(Array.from({length:width},(_,i)=>['f'+i,'hello'])));
  }
} finally { globalThis.Function = original; }
writeFileSync(new URL('./generated-code.json',import.meta.url),JSON.stringify({sources},null,2)+'\n');
for(const source of sources) writeFileSync(new URL(`./${source.label}-generated.js.txt`,import.meta.url),source.body+'\n');
console.log(JSON.stringify(sources.map(source=>({label:source.label,bytes:Buffer.byteLength(source.body),memberOwnCalls:(source.body.match(/Object\.hasOwn/g)??[]).length,capturedOwnCalls:(source.body.match(/own\(raw/g)??[]).length}))));
