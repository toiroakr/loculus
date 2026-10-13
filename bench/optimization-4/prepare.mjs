import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dir = 'bench/optimization-4';
const source = readFileSync(dir + '/baseline.ts.txt', 'utf8');
const replace = (text, from, to) => { if (!text.includes(from)) throw Error('Missing ' + from); return text.replace(from, to); };
const objectStart = source.indexOf('export function object<');
const objectEnd = source.indexOf('function appendCompiledIssues', objectStart);
const object = source.slice(objectStart, objectEnd);
const validationStart = object.indexOf('  const validate = (input: unknown): Result<ObjectOutput<S>> => {');
const validationEnd = object.indexOf('\n  };', validationStart) + 5;
const validation = object.slice(validationStart, validationEnd);
const helper = `function validateObject(input: unknown, fields: Shape, keys: readonly string[], validators: readonly ((value: unknown) => Result<any>)[], mode: "strip" | "strict" | "passthrough"): Result<Record<string, unknown>> {\n${validation.slice(validation.indexOf('\n') + 1, -5).replace('output as ObjectOutput<S>', 'output')}\n}\n`;
const objectOnly = modified => source.slice(0, objectStart) + modified + source.slice(objectEnd);
const stringFast = text => replace(text, '  if (options !== emptyOptions) options = { ...options };', `  if (options === emptyOptions) return { meta: { kind: "string", description: undefined }, "~standard": { version: 1, vendor: "loculus", validate: validateString }, field: true } as Field<any, any, boolean>;\n  options = { ...options };`);
const shared = source.slice(0, objectStart - '/* @__NO_SIDE_EFFECTS__ */\n'.length) + helper + '/* @__NO_SIDE_EFFECTS__ */\n' + object.replace(validation, '  const validate = (input: unknown): Result<ObjectOutput<S>> => validateObject(input, fields, keys, validators, mode) as Result<ObjectOutput<S>>;') + source.slice(objectEnd);
const capture = `function captureField(s: Field<any, any, boolean>, key: string): (value: unknown) => Result<any> {\n  if (s.field !== true) throw new TypeError(\`Expected field: \${key}\`);\n  return s["~standard"].validate;\n}\n`;
const originalCapture = `  const validators: ((value: unknown) => Result<any>)[] = [];
  for (const key of keys) {
    const s = fields[key]!;
    if (s.field !== true) throw new TypeError(\`Expected field: \${key}\`);
    validators.push(s["~standard"].validate);
  }`;
const captureVariant = text => replace(text, originalCapture, `  const validators = keys.length === 1\n    ? [captureField(fields[keys[0]!]!, keys[0]!)]\n    : keys.map(key => captureField(fields[key]!, key));`) + '\n' + capture;
const basic = objectOnly(replace(object, '      const result = validators[i]!(own(raw, key) ? raw[key] : undefined);', `      const value = own(raw, key) ? raw[key] : undefined;
      const result = validators[i] === validateString && typeof value === "string" ? { value } : validators[i]!(value);`));
const noEarlyField = replace(source, '  if (options === emptyOptions) return { meta, "~standard": { version: 1, vendor: "loculus", validate }, field: true } as Field<any, any, boolean>;\n  const value = own(options, "default") ? options.default : undefined;', '  const value = options !== emptyOptions && own(options, "default") ? options.default : undefined;');
const variants = { baseline: source, 'string-fast': stringFast(source), 'object-shared': shared, 'shared-string-fast': stringFast(shared), 'capture-single': captureVariant(source), 'capture-single-fast': stringFast(captureVariant(source)), 'basic-result-elision': basic, 'compact-field': noEarlyField };
const manifest = {date:new Date().toISOString(),baselineHash:createHash('sha256').update(source).digest('hex'),candidates:Object.entries(variants).map(([name, contents]) => {writeFileSync(dir + '/' + name + '.ts.txt', contents); return {name, sourceHash:createHash('sha256').update(contents).digest('hex')};})};
writeFileSync(dir + '/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared',manifest.candidates.length,'candidates');
const keysFirst = text => replace(text, '  const fields = Object.freeze({ ...shape });\n  const keys = Object.keys(fields);', '  const fields = { ...shape };\n  const keys = Object.keys(fields);\n  Object.freeze(fields);');
const assigned = text => replace(text, 'Object.freeze({ ...shape })', 'Object.freeze(Object.assign({}, shape))');
const indexed = text => replace(text, '  for (const key of keys) {\n    const s = fields[key]!;', '  for (let i = 0; i < keys.length; i++) {\n    const key = keys[i]!;\n    const s = fields[key]!;');
const extra = {
  'keys-first': keysFirst(source),
  'assign-shape': assigned(source),
  'keys-first-indexed': indexed(keysFirst(source)),
  'keys-first-capture': captureVariant(keysFirst(source)),
  'indexed-capture': indexed(source),
  'compact-keys-first': keysFirst(noEarlyField),
  'compact-indexed': indexed(noEarlyField),
  'compact-capture': captureVariant(noEarlyField),
};
for (const [name, contents] of Object.entries(extra)) { writeFileSync(dir + '/' + name + '.ts.txt', contents); manifest.candidates.push({name,sourceHash:createHash('sha256').update(contents).digest('hex')}); }
writeFileSync(dir + '/manifest.json',JSON.stringify(manifest,null,2)+'\n');
