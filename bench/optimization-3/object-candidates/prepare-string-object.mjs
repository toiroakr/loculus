import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir=new URL('./',import.meta.url);
const source=readFileSync(new URL('string-object-baseline3.ts.txt',dir),'utf8');
const start=source.indexOf('export function object<'),end=source.indexOf('function appendCompiledIssues',start);
const object=source.slice(start,end);
const loopStart=object.indexOf('    for (let i = 0; i < keys.length; i++) {');
const loopEnd=object.indexOf('    if (mode === "strict")',loopStart);
const specialLoop=`    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const value = own(raw, key) ? raw[key] : undefined;
      if (typeof value === "string") {
        if (key === "__proto__")
          Object.defineProperty(output, key, { value, enumerable: true, writable: true, configurable: true });
        else output[key] = value;
      } else {
        const result = validateString(value);
        if (result.issues) {
          issues ??= [];
          for (const issue of result.issues)
            issues.push({ ...issue, path: issue.path ? [key, ...issue.path] : [key] });
        }
      }
    }
`;
const bodyStart=object.indexOf('    if (typeof input !==');
const bodyEnd=object.indexOf('\n  };',bodyStart);
const helperBody=object.slice(bodyStart,loopStart)+specialLoop+object.slice(loopEnd,bodyEnd);
const helper=`function validateStringObject(
  input: unknown,
  keys: readonly string[],
  fields: Shape,
  mode: "strip" | "strict" | "passthrough",
): Result<Record<string, unknown>> {
${helperBody.replace('value: output as ObjectOutput<S>','value: output')}
}
`;
const variants={};
const replace=(text,from,to)=>{if(!text.includes(from))throw Error('Missing '+from);return text.replace(from,to)};
for(const classifier of ['every','loopflag'])for(const threshold of [0,32]){
 let candidate=object;
 const eligible=threshold?`keys.length >= ${threshold}`:'keys.length !== 0';
 if(classifier==='every'){
  candidate=replace(candidate,'  const mode = options.unknownKeys ?? "strip";',`  const stringsOnly = ${eligible} && validators.every(validate => validate === validateString);\n  const mode = options.unknownKeys ?? "strip";`);
 }else{
  candidate=replace(candidate,'  const validators: ((value: unknown) => Result<any>)[] = [];',`  const validators: ((value: unknown) => Result<any>)[] = [];\n  let stringsOnly = ${eligible};`);
  candidate=replace(candidate,'    validators.push(s["~standard"].validate);','    const validate = s["~standard"].validate;\n    validators.push(validate);\n    stringsOnly = stringsOnly && validate === validateString;');
 }
 candidate=replace(candidate,'  const validate = (input: unknown): Result<ObjectOutput<S>> => {',`  const validate = stringsOnly\n    ? (input: unknown): Result<ObjectOutput<S>> => validateStringObject(input, keys, fields, mode) as Result<ObjectOutput<S>>\n    : (input: unknown): Result<ObjectOutput<S>> => {`);
 const name=`string-object-${classifier}-${threshold||'all'}`;
 const annotation='/* @__NO_SIDE_EFFECTS__ */\n';
 const prefix=source.slice(0,start);
 if(!prefix.endsWith(annotation))throw Error('Object annotation changed');
 variants[name]=prefix.slice(0,-annotation.length)+helper+annotation+candidate+source.slice(end);
}
{
 const finish=helperBody.lastIndexOf('    return issues ?');
 const stripBody=helperBody.slice(0,helperBody.indexOf('    if (mode === "strict")'))+helperBody.slice(finish);
 const stripHelper=`function validateStringObject(input: unknown, keys: readonly string[]): Result<Record<string, unknown>> {\n${stripBody.replace('value: output as ObjectOutput<S>','value: output')}\n}\n`;
 let candidate=replace(object,'  const mode = options.unknownKeys ?? "strip";',`  const mode = options.unknownKeys ?? "strip";\n  const stringsOnly = mode === "strip" && keys.length >= 32 && validators.every(validate => validate === validateString);`);
 candidate=replace(candidate,'  const validate = (input: unknown): Result<ObjectOutput<S>> => {',`  const validate = stringsOnly\n    ? (input: unknown): Result<ObjectOutput<S>> => validateStringObject(input, keys) as Result<ObjectOutput<S>>\n    : (input: unknown): Result<ObjectOutput<S>> => {`);
 const annotation='/* @__NO_SIDE_EFFECTS__ */\n';
 const prefix=source.slice(0,start);
 variants['string-object-every-32-strip']=prefix.slice(0,-annotation.length)+stripHelper+annotation+candidate+source.slice(end);
}
const hash=s=>createHash('sha256').update(s).digest('hex');
const manifest={baselineHash:hash(source),candidates:Object.entries(variants).map(([name,contents])=>{writeFileSync(new URL(name+'.ts.txt',dir),contents);return {name,sourceHash:hash(contents)}})};
writeFileSync(new URL('string-object-manifest.json',dir),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest));
