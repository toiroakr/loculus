import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const source = readFileSync('bench/optimization-3/before/index.ts.txt', 'utf8');
const dir = 'bench/optimization-3/scalar-candidates';
mkdirSync(dir, { recursive: true });
const replace = (text, from, to) => {
  if (!text.includes(from)) throw Error('Missing fragment: ' + from);
  return text.replace(from, to);
};
const wrapper = `    if (optional || nullable) validate = (input: unknown): Result<any> => {
      if (input === undefined && optional) return { value: missing };
      if (input === null && nullable) return { value: defaults & 2 ? nil : null };
      return base(input);
    };`;
const flags = `    const flags = (optional ? 1 : 0) | (nullable ? 2 : 0);
    const nullValue = defaults & 2 ? nil : null;
    if (flags) validate = (input: unknown): Result<any> => {
      if (input === undefined && (flags & 1)) return { value: missing };
      if (input === null && (flags & 2)) return { value: nullValue };
      return base(input);
    };`;
const direct = `    const nullValue = defaults & 2 ? nil : null;
    if (optional || nullable) validate = (input: unknown): Result<any> => {
      if (input === undefined && optional) return { value: missing };
      if (input === null && nullable) return { value: nullValue };
      return base(input);
    };`;
const errorStart = source.indexOf('    super(\n', source.indexOf('export class ValidationError'));
const errorEnd = source.indexOf('    this.name = ', errorStart);
const imperative = source.slice(0,errorStart)+`    let message = "";
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i]!;
      if (i) message += "; ";
      const path = issue.path;
      if (path) for (let j = 0; j < path.length; j++) {
        if (j) message += ".";
        const part = path[j]!;
        message += typeof part === "object" ? String(part.key) : String(part);
      }
      message += ": " + issue.message;
    }
    super(message);
`+source.slice(errorEnd);
const variants = {
  baseline: source,
  'presence-flags': replace(source, wrapper, flags),
  'presence-null-value': replace(source, wrapper, direct),
  'error-imperative': imperative,
  'presence-specialized': replace(source,wrapper,`    const nullValue = defaults & 2 ? nil : null;
    if (optional && nullable) validate = (input: unknown): Result<any> => input === undefined ? { value: missing } : input === null ? { value: nullValue } : base(input);
    else if (optional) validate = (input: unknown): Result<any> => input === undefined ? { value: missing } : base(input);
    else if (nullable) validate = (input: unknown): Result<any> => input === null ? { value: nullValue } : base(input);`),
  'field-inline': source.replaceAll('return field(meta, validate);','return { meta, "~standard": { version: 1, vendor: "loculus", validate }, field: true } as Field<any, any, boolean>;'),
  'standard-factory': source.replaceAll('"~standard": { version: 1, vendor: "loculus", validate }','"~standard": standard(validate)')+`\nfunction standard<O>(validate: (value: unknown) => Result<O>) { return { version: 1 as const, vendor: "loculus" as const, validate }; }\n`,
};
const numberStart=source.indexOf("    (value) => {", source.indexOf("export function number(\n  options: NumberOptions & FieldOptions"));
const numberEnd=source.indexOf("\n    },",numberStart)+7;
const numberBody=source.slice(numberStart+18,numberEnd-7);
let shared=source.slice(0,numberStart)+"    options === emptyOptions ? validateBasicNumber : (value) => validateNumber(value, options)"+source.slice(numberEnd);
shared=replace(shared,"if (validate !== validateString) {\n    const plan = (options === emptyOptions ? {} : options) as FieldPlan;\n    plan.kind = \"number\";","if (validate !== validateBasicNumber) {\n    const plan = options as FieldPlan;\n    plan.kind = \"number\";");
shared=shared.replaceAll("validate === validateBoolean ? { kind: \"boolean\" as const } :", "validate === validateBoolean ? { kind: \"boolean\" as const } : validate === validateBasicNumber ? { kind: \"number\" as const } :");
shared=shared.replaceAll("inner === validateBoolean ? { kind: \"boolean\" as const } :", "inner === validateBoolean ? { kind: \"boolean\" as const } : inner === validateBasicNumber ? { kind: \"number\" as const } :");
shared+="\nfunction validateNumber(value: unknown, options: NumberOptions): Result<number> {"+numberBody+"\n}\nfunction validateBasicNumber(value: unknown): Result<number> { return validateNumber(value, emptyOptions); }\n";
variants["number-shared-helper"]=shared;
let planShared=shared.replaceAll("validate === validateBasicNumber ? { kind: \"number\" as const } : ","").replaceAll("inner === validateBasicNumber ? { kind: \"number\" as const } : ","");
planShared=replace(planShared,"if (validate !== validateBasicNumber) {\n    const plan = options as FieldPlan;", "{\n    const plan = (options === emptyOptions ? basicNumberPlan : options) as FieldPlan;");
planShared+="\nconst basicNumberPlan: FieldPlan = { kind: \"number\" };\n";
variants["number-shared-plan"]=planShared;
variants["date-regex-hoisted"]=replace(source,"!/^\\d{4}-\\d{2}-\\d{2}(?:T.*)?$/.test(value)", "!isoDate.test(value)")+"\nconst isoDate = /^\\d{4}-\\d{2}-\\d{2}(?:T.*)?$/;\n";
let unguarded=source;
for(const kind of ["number","array"]){
 const start=unguarded.indexOf("    plan.kind = \""+kind+"\";");const guard=unguarded.lastIndexOf("  if (validate !== validateString) {",start);const end=unguarded.indexOf("\n  }\n  return result;",start);
 unguarded=unguarded.slice(0,guard)+unguarded.slice(guard+"  if (validate !== validateString) {\n".length,end).split("\n").map(x=>x.startsWith("  ")?x.slice(2):x).join("\n")+unguarded.slice(end+4);
}
variants["redundant-plan-guards"]=unguarded;
const removeArrayGuard = text => {
  const start = text.indexOf('    plan.kind = "array";');
  const guard = text.lastIndexOf('  if (validate !== validateString) {',start);
  const end = text.indexOf('\n  }\n  return result;',start);
  return text.slice(0,guard)+text.slice(guard+'  if (validate !== validateString) {\n'.length,end).split('\n').map(x=>x.startsWith('  ')?x.slice(2):x).join('\n')+text.slice(end+4);
};
let staticPlan=shared.replaceAll('validate === validateBasicNumber ? { kind: "number" as const } : ','').replaceAll('inner === validateBasicNumber ? { kind: "number" as const } : ','');
staticPlan=replace(staticPlan,'function validateBasicNumber(value: unknown): Result<number> { return validateNumber(value, emptyOptions); }',`const validateBasicNumber = /* @__PURE__ */ Object.assign(
  (value: unknown): Result<number> => validateNumber(value, emptyOptions),
  { [fieldPlan]: { kind: "number" as const } },
);`);
staticPlan=removeArrayGuard(staticPlan);
variants['number-static-plan']=staticPlan;
const purePlan=staticPlan.replace('const validateBasicNumber = /* @__PURE__ */ Object.assign(','const validateBasicNumber = /* @__PURE__ */ (() => Object.assign(').replace('{ [fieldPlan]: { kind: "number" as const } },\n);','{ [fieldPlan]: { kind: "number" as const } },\n))();');
variants['number-pure-init']=purePlan;
variants['combined-compact']=replace(unguarded,'return field(meta, validate);','return { meta, "~standard": { version: 1, vendor: "loculus", validate }, field: true } as Field<any, any, boolean>;');
variants['combined-number']=staticPlan.replaceAll('return field(meta, validate);','return { meta, "~standard": { version: 1, vendor: "loculus", validate }, field: true } as Field<any, any, boolean>;');
variants['compact-all-inline']=unguarded.replaceAll('return field(meta, validate);','return { meta, "~standard": { version: 1, vendor: "loculus", validate }, field: true } as Field<any, any, boolean>;');
variants['combined-pure-number']=purePlan.replaceAll('return field(meta, validate);','return { meta, "~standard": { version: 1, vendor: "loculus", validate }, field: true } as Field<any, any, boolean>;');
variants['number-single-digit']=source.replace('!decimal.test(value)','!(value.length === 1 ? value >= "0" && value <= "9" : decimal.test(value))');
let planned=source;
for(const kind of ['string','number','boolean','array']) {
 const start=planned.indexOf('  const validate = result["~standard"].validate as PlannedValidate;',kind === 'string' ? 0 : planned.indexOf('export function '+kind+'('));
 const end=planned.indexOf('\n  return result;',start)+'\n  return result;'.length;
 const args=kind==='string'?', validateString':kind==='boolean'?', validateBoolean':kind==='array'?', undefined, innerValidate':'';
 planned=planned.slice(0,start)+`  return plannedField(result, options, "${kind}"${args});`+planned.slice(end);
}
planned+=`\nfunction plannedField(s: Field<any,any,boolean>, options: FieldOptions<any>, kind: Meta["kind"], shared?: (value: unknown) => Result<any>, inner?: (value: unknown) => Result<any>): Field<any,any,boolean> {
  const validate = s["~standard"].validate as PlannedValidate;
  if (validate !== shared) {
    const plan = (options === emptyOptions ? {} : options) as FieldPlan;
    plan.kind = kind;
    if (inner) plan.inner = inner;
    validate[fieldPlan] = plan;
  }
  return s;
}\n`;
variants['plan-factory']=planned;
let duplicated=source.slice(0,numberStart)+`    options === emptyOptions ? validateBasicNumber : `+source.slice(numberStart+4);
duplicated=replace(duplicated,'if (validate !== validateString) {\n    const plan = (options === emptyOptions ? {} : options) as FieldPlan;\n    plan.kind = "number";','if (validate !== validateBasicNumber) {\n    const plan = options as FieldPlan;\n    plan.kind = "number";');
duplicated=removeArrayGuard(duplicated);
duplicated+=`\nconst validateBasicNumber = /* @__PURE__ */ (() => Object.assign(
  (value: unknown): Result<number> => {
    if (typeof value !== "number") {
      if (typeof value !== "string" || !decimal.test(value)) return fail("Expected a decimal number", "invalid_type");
      value = Number(value);
    }
    return Number.isFinite(value) ? { value: value as number } : fail("Expected a finite number");
  },
  { [fieldPlan]: { kind: "number" as const } },
))();\n`;
variants['number-duplicated-pure']=duplicated;
variants['validators-map']=replace(source,`  const validators: ((value: unknown) => Result<any>)[] = [];
  for (const key of keys) {
    const s = fields[key]!;
    if (s.field !== true) throw new TypeError(\`Expected field: \${key}\`);
    validators.push(s["~standard"].validate);
  }`,`  const validators = keys.map(key => {
    const s = fields[key]!;
    if (s.field !== true) throw new TypeError(\`Expected field: \${key}\`);
    return s["~standard"].validate;
  });`);
let early=source;
for(const [kind,validator] of [['string','validateString'],['boolean','validateBoolean'],['date','validateDate']]) {
 const marker=kind==='string'?'export function string(\n  options: StringOptions & FieldOptions<string> = emptyOptions,':kind==='boolean'?'export function boolean(options: FieldOptions<boolean> = emptyOptions)':'export function date(options: FieldOptions<Date> = emptyOptions)';
 const pos=early.indexOf('  if (options !== emptyOptions) options = { ...options };',early.indexOf(marker));
 early=early.slice(0,pos)+`  if (options === emptyOptions) return field({ kind: "${kind}", description: options.description }, ${validator});\n`+early.slice(pos);
}
variants['basic-early-field']=early;
variants['date-calendar']=replace(source,`  if (
    !Number.isFinite(output.getTime()) ||
    new Date(value.slice(0, 10) + "T00:00:00.000Z").toISOString().slice(0, 10) !==
      value.slice(0, 10)
  )
    return fail("Invalid date");`,`  if (!Number.isFinite(output.getTime())) return fail("Invalid date");
  const year = +value.slice(0, 4);
  const month = +value.slice(5, 7);
  const day = +value.slice(8, 10);
  const days = month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
  if (month < 1 || month > 12 || day < 1 || day > days) return fail("Invalid date");`);
variants['date-calendar-mask']=variants['date-calendar'].replace('month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31','31 - ((((1 << 4) | (1 << 6) | (1 << 9) | (1 << 11)) >> month) & 1)');
writeFileSync(dir+'/manifest.json',JSON.stringify({baselineHash:createHash('sha256').update(source).digest('hex'),candidates:Object.entries(variants).map(([name,text])=>{writeFileSync(dir+'/'+name+'.ts.txt',text);return {name,sourceHash:createHash('sha256').update(text).digest('hex')};})},null,2)+'\n');
