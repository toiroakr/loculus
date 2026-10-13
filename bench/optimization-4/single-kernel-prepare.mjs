import assert from 'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
const dir='bench/optimization-4';const source=readFileSync(dir+'/baseline.ts.txt','utf8');
const start=source.indexOf('export function object<'),end=source.indexOf('function appendCompiledIssues',start);const object=source.slice(start,end);
const captureStart=object.indexOf('  const validators:');const captureEnd=object.indexOf('  const mode =',captureStart);
const loopStart=object.indexOf('    for (let i = 0; i < keys.length; i++) {');const tailStart=object.indexOf('    if (mode === "strict")',loopStart);const tailEnd=object.indexOf('\n  };',tailStart);
const inputStart=object.indexOf('    if (typeof input !==');
const head=object.slice(inputStart,loopStart);
const tail=object.slice(tailStart,tailEnd).replace('output as ObjectOutput<S>','output');
const resultLoop=object.slice(loopStart,tailStart);
const fallback=resultLoop.replace('    for (let i = 0; i < keys.length; i++) {\n      const key = keys[i]!;\n      const result = validators[i]!(own(raw, key) ? raw[key] : undefined);','    {\n      const result = validateString(value);');
const helper=`function validateStringRecord(input: unknown, key: string, fields: Shape, mode: "strip" | "strict" | "passthrough"): Result<Record<string, unknown>> {
${head}    const value = own(raw, key) ? raw[key] : undefined;
    if ("issues" in Object.prototype || typeof value !== "string") {
${fallback}    } else if (key === "__proto__") Object.defineProperty(output, key, { value, enumerable: true, writable: true, configurable: true });
    else output[key] = value;
${tail}
}
function captureObjectFields(fields: Shape, keys: readonly string[]): typeof validateString | ((value: unknown) => Result<any>)[] {
  if (keys.length === 1) {
    const key = keys[0]!;
    const field = fields[key]!;
    if (field.field !== true) throw new TypeError(\`Expected field: \${key}\`);
    const validate = field["~standard"].validate;
    return validate === validateString ? validateString : [validate];
  }
  const validators: ((value: unknown) => Result<any>)[] = [];
  for (const key of keys) {
    const field = fields[key]!;
    if (field.field !== true) throw new TypeError(\`Expected field: \${key}\`);
    validators.push(field["~standard"].validate);
  }
  return validators;
}
`;
let modified=object.slice(0,captureStart)+'  const captured = captureObjectFields(fields, keys);\n  const validators = typeof captured === "function" ? undefined : captured;\n'+object.slice(captureEnd);
modified=modified.replace('  const validate = (input: unknown): Result<ObjectOutput<S>> => {','  const first = keys[0]!;\n  const validate = validators ? (input: unknown): Result<ObjectOutput<S>> => {').replace('\n  };\n  return {','\n  } : (input: unknown) => validateStringRecord(input, first, fields, mode) as Result<ObjectOutput<S>>;\n  return {');
assert.notEqual(modified,object);
const cooked=source.slice(0,start)+'\n'+modified+source.slice(end)+'\n'+helper;
const fast=s=>s.replace('  if (options !== emptyOptions) options = { ...options };','  if (options === emptyOptions) return { meta: { kind: "string", description: undefined }, "~standard": { version: 1, vendor: "loculus", validate: validateString }, field: true } as Field<any, any, boolean>;\n  options = { ...options };');
const variants={'single-kernel':cooked,'single-kernel-fast':fast(cooked),'single-kernel-no-freeze':cooked.replace('Object.freeze({ ...shape })','{ ...shape }'),'single-kernel-fast-no-freeze':fast(cooked).replace('Object.freeze({ ...shape })','{ ...shape }')};
const m=JSON.parse(readFileSync(dir+'/manifest.json'));for(const[name,contents]of Object.entries(variants)){writeFileSync(dir+'/'+name+'.ts.txt',contents);m.candidates.push({name,sourceHash:createHash('sha256').update(contents).digest('hex')});}writeFileSync(dir+'/manifest.json',JSON.stringify(m,null,2)+'\n');
