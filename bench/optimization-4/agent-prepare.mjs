import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir=new URL('./',import.meta.url);
const source=readFileSync(new URL('baseline.ts.txt',dir),'utf8');
const start=source.indexOf('export function object<'),end=source.indexOf('function appendCompiledIssues',start);
const original=source.slice(start,end);
const replace=(text,from,to)=>{if(!text.includes(from))throw Error('Missing '+from);return text.replace(from,to)};
const capture=`  const validators: ((value: unknown) => Result<any>)[] = [];
  for (const key of keys) {
    const s = fields[key]!;
    if (s.field !== true) throw new TypeError(\`Expected field: \${key}\`);
    validators.push(s["~standard"].validate);
  }`;
const deferred=`  let validators: ((value: unknown) => Result<any>)[] | undefined;
  let captured = 0;
  for (const key of keys) {
    const s = fields[key]!;
    if (s.field !== true) throw new TypeError(\`Expected field: \${key}\`);
    const validator = s["~standard"].validate;
    if (!validators && validator !== validateString) {
      validators = [];
      for (let j = 0; j < captured; j++) validators.push(validateString);
    }
    if (validators) validators.push(validator);
    captured++;
  }`;
const single=`  let validators: ((value: unknown) => Result<any>)[] | undefined;
  if (keys.length === 1) {
    const key = keys[0]!;
    const s = fields[key]!;
    if (s.field !== true) throw new TypeError(\`Expected field: \${key}\`);
    const validator = s["~standard"].validate;
    if (validator !== validateString) validators = [validator];
  } else {
    validators = [];
    for (const key of keys) {
      const s = fields[key]!;
      if (s.field !== true) throw new TypeError(\`Expected field: \${key}\`);
      validators.push(s["~standard"].validate);
    }
  }`;
const validation='      const result = validators[i]!(own(raw, key) ? raw[key] : undefined);';
const variants={};
for(const [name,constructor] of [['agent-deferred-string',deferred],['agent-single-string',single]]){
 let candidate=replace(original,capture,constructor);
 candidate=replace(candidate,validation,'      const value = own(raw, key) ? raw[key] : undefined;\n      const result = validators ? validators[i]!(value) : validateString(value);');
 variants[name]=source.slice(0,start)+candidate+source.slice(end);
}
for(const name of Object.keys(variants)){
 variants[name+'-fast']=replace(variants[name],'  if (options !== emptyOptions) options = { ...options };',`  if (options === emptyOptions) return { meta: { kind: "string", description: undefined }, "~standard": { version: 1, vendor: "loculus", validate: validateString }, field: true } as Field<any, any, boolean>;\n  options = { ...options };`);
}
const hash=text=>createHash('sha256').update(text).digest('hex');
writeFileSync(new URL('agent-manifest.json',dir),JSON.stringify({baselineHash:hash(source),candidates:Object.entries(variants).map(([name,text])=>{writeFileSync(new URL(name+'.ts.txt',dir),text);return {name,sourceHash:hash(text)}})},null,2)+'\n');
console.log('Prepared isolated agent source snapshots; no build or verification.');
