import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import assert from'node:assert/strict';
const dir='bench/optimization-4';const source=readFileSync(dir+'/baseline.ts.txt','utf8');
const old=`  const validators: ((value: unknown) => Result<any>)[] = [];
  for (const key of keys) {
    const s = fields[key]!;
    if (s.field !== true) throw new TypeError(\`Expected field: \${key}\`);
    validators.push(s["~standard"].validate);
  }`;
const helper=`
const plainStringValidators = /* @__PURE__ */ Object.freeze([validateString]);
function captureValidators(fields: Shape, keys: readonly string[]): readonly ((value: unknown) => Result<any>)[] {
  if (keys.length === 1) {
    const key = keys[0]!;
    const field = fields[key]!;
    if (field.field !== true) throw new TypeError(\`Expected field: \${key}\`);
    const validate = field["~standard"].validate;
    return validate === validateString ? plainStringValidators : [validate];
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
assert.ok(source.includes(old));const cached=source.replace(old,'  const validators = captureValidators(fields, keys);')+helper;
const fast=s=>s.replace('  if (options !== emptyOptions) options = { ...options };','  if (options === emptyOptions) return { meta: { kind: "string", description: undefined }, "~standard": { version: 1, vendor: "loculus", validate: validateString }, field: true } as Field<any, any, boolean>;\n  options = { ...options };');
const variants={'cached-vector':cached,'cached-vector-fast':fast(cached)};
const m=JSON.parse(readFileSync(dir+'/manifest.json'));for(const[name,contents]of Object.entries(variants)){writeFileSync(dir+'/'+name+'.ts.txt',contents);m.candidates.push({name,sourceHash:createHash('sha256').update(contents).digest('hex')});}writeFileSync(dir+'/manifest.json',JSON.stringify(m,null,2)+'\n');
