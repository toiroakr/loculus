import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { transform } from 'esbuild';
const dir = new URL('./', import.meta.url);
const baseline = readFileSync(new URL('baseline.ts.txt', dir), 'utf8');
const from = `function field<I, O, Optional extends boolean = undefined extends O ? true : false>(
  meta: Meta,
  validate: (value: unknown) => Result<O>,
): Field<I, O, Optional> {
  return { meta, "~standard": { version: 1, vendor: "loculus", validate }, field: true } as Field<I, O, Optional>;
}`;
const to = `const fieldValidator = Symbol();
class FieldClass {
  declare readonly meta: Meta;
  declare readonly field: true;
  declare readonly [fieldValidator]: (value: unknown) => Result<any>;
  constructor(meta: Meta, validate: (value: unknown) => Result<any>) {
    this.meta = meta;
    this.field = true;
    Object.defineProperty(this, fieldValidator, { value: validate });
  }
  get ["~standard"](): Schema<any, any>["~standard"] {
    const standard = { version: 1 as const, vendor: "loculus", validate: this[fieldValidator] };
    Object.defineProperty(this, "~standard", { value: standard, enumerable: true, configurable: true, writable: true });
    return standard;
  }
  set ["~standard"](standard: Schema<any, any>["~standard"]) {
    Object.defineProperty(this, "~standard", { value: standard, enumerable: true, configurable: true, writable: true });
  }
}
function getValidator(s: AnySchema): (value: unknown) => Result<any> {
  return s instanceof FieldClass && !own(s, "~standard") ? s[fieldValidator] : s["~standard"].validate;
}
function field<I, O, Optional extends boolean = undefined extends O ? true : false>(
  meta: Meta,
  validate: (value: unknown) => Result<O>,
): Field<I, O, Optional> {
  return new FieldClass(meta, validate) as unknown as Field<I, O, Optional>;
}`;
if (!baseline.includes(from)) throw Error('Field factory changed');
let source = baseline.replace(from, to);
source = source.replaceAll('const validate = result["~standard"].validate as PlannedValidate;', 'const validate = getValidator(result) as PlannedValidate;');
source = source.replace('const innerValidate = s["~standard"].validate;', 'const innerValidate = getValidator(s);');
source = source.replace('validators.push(s["~standard"].validate);', 'validators.push(getValidator(s));');
if (!source.includes('keys.map((key) => s.shape[key]!["~standard"].validate)') && !source.includes('keys.map(key => s.shape[key]!["~standard"].validate)')) {
  const compileSource = source.slice(source.indexOf('export function compile'));
  if (!compileSource.includes('["~standard"].validate')) throw Error('Compile lost Standard reference');
}
const name = 'lazy-field-class';
writeFileSync(new URL(name+'.ts.txt', dir), source);
const output = await transform(source, {loader:'ts',format:'esm',target:'es2022'});
writeFileSync(new URL(name+'.mjs', dir), output.code);
const result = {name, baselineHash:createHash('sha256').update(baseline).digest('hex'), sourceHash:createHash('sha256').update(source).digest('hex')};
writeFileSync(new URL('lazy-field-manifest.json',dir),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
