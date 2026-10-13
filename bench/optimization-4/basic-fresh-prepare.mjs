import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
const dir='bench/optimization-4';const base=readFileSync(dir+'/basic-identity-shared-single.ts.txt','utf8');
const start=base.indexOf('const tag = Symbol();');
let source=base.replace('const tag = Symbol();','declare const tag: unique symbol;');
source=source.replace('  [tag]: true as const,\n','');
source=source.replace('export function string(): StringField { return plain; }','export function string(): StringField { return { meta: plain.meta, "~standard": plain["~standard"], field: true } as StringField; }');
source=source.replace("if (field !== plain && (field.field !== true || field[tag] !== true || field['~standard'].validate !== validateString))","if (field.field !== true || field['~standard'].validate !== validateString)");
const variants={'basic-fresh':source};
const a=source.indexOf('  const keys = Object.keys(fields);');const b=source.indexOf('  const first = keys[0]!;',a);
let forin=source.slice(0,a)+`  let first: string | undefined;
  let count = 0;
  for (const key in fields) {
    if (!own(fields, key)) continue;
    const field = fields[key]!;
    if (field.field !== true || field['~standard'].validate !== validateString) throw new TypeError(\`Expected a plain string field: \${key}\`);
    first ??= key;
    count++;
  }
  const validate = count === 1 ? (input: unknown) => validateSingle(first!, input) : (input: unknown) => validateObject(fields, input);
`+source.slice(source.indexOf('\n  return {',b));
forin=forin.replace('function validateObject(keys: readonly string[], input: unknown)', 'function validateObject(fields: StringShape, input: unknown)').replace('    for (const key of keys) {','    for (const key in fields) {\n      if (!own(fields, key)) continue;');
variants['basic-fresh-forin']=forin;
const m=JSON.parse(readFileSync(dir+'/manifest.json'));for(const[name,contents]of Object.entries(variants)){writeFileSync(dir+'/'+name+'.ts.txt',contents);m.candidates.push({name,sourceHash:createHash('sha256').update(contents).digest('hex')});}writeFileSync(dir+'/manifest.json',JSON.stringify(m,null,2)+'\n');
