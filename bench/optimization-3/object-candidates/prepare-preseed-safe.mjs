import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir=new URL('./',import.meta.url);
const snapshot=new URL('baseline3.ts.txt',dir);
const source=process.argv.includes('--refresh')?readFileSync(new URL('../../../src/index.ts',dir),'utf8'):readFileSync(snapshot,'utf8');
if(process.argv.includes('--refresh'))writeFileSync(snapshot,source);
const start=source.indexOf('export function object<'),end=source.indexOf('function appendCompiledIssues',start);
let object=source.slice(start,end);
const replace=(from,to)=>{if(!object.includes(from))throw Error('Missing '+from);object=object.replace(from,to)};
replace('  const mode = options.unknownKeys ?? "strip";', '  const template = keys.length >= 32 ? Object.fromEntries(keys.map(key => [key, undefined])) : undefined;\n  const mode = options.unknownKeys ?? "strip";');
replace('    const output: Record<string, unknown> = {};','    let seeded = template !== undefined;\n    const output: Record<string, unknown> = seeded ? { ...template } : {};');
replace('          issues.push({ ...issue, path: issue.path ? [key, ...issue.path] : [key] });','          issues.push({ ...issue, path: issue.path ? [key, ...issue.path] : [key] });\n        if (seeded) delete output[key];');
replace('        else output[key] = result.value;\n      }',`        else {
          const value = result.value;
          if (seeded && key in Object.prototype) {
            for (let j = i; j < keys.length; j++) delete output[keys[j]!];
            seeded = false;
          }
          output[key] = value;
        }
      } else if (seeded) delete output[key];`);
const candidate=source.slice(0,start)+object+source.slice(end);
writeFileSync(new URL('preseed-safe.ts.txt',dir),candidate);
const hash=s=>createHash('sha256').update(s).digest('hex');
const manifest={name:'preseed-safe',baselineHash:hash(source),sourceHash:hash(candidate)};
writeFileSync(new URL('preseed-safe-manifest.json',dir),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest));
