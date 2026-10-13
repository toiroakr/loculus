import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dir = new URL('./', import.meta.url);
const snapshot = new URL('./baseline.ts.txt', dir);
const source = readFileSync(!process.argv.includes('--refresh') && existsSync(snapshot) ? snapshot : new URL('../../../src/index.ts', dir), 'utf8');
const replace = (text, from, to) => {
  if (!text.includes(from)) throw new Error(`Missing source fragment: ${from}`);
  return text.replace(from, to);
};
const objectOnly = (text, edit) => {
  const start = text.indexOf('export function object<');
  const end = text.indexOf('function appendCompiledIssues', start);
  return text.slice(0, start) + edit(text.slice(start, end)) + text.slice(end);
};
const preseed = (text, wide = false) => objectOnly(text, object => {
  object = replace(object, 'const output: Record<string, unknown> = {};',
    `const output: Record<string, unknown> = ${wide ? 'keys.length >= 32 ? { ...fields } : {}' : '{ ...fields }'};`);
  return replace(object, '        else output[key] = result.value;\n      }\n    }',
    '        else output[key] = result.value;\n      } else delete output[key];\n    }');
});
const basic = text => objectOnly(text, object => replace(object,
  '      const result = validators[i]!(own(raw, key) ? raw[key] : undefined);',
  `      const value = own(raw, key) ? raw[key] : undefined;
      const validator = validators[i]!;
      if (validator === validateString && typeof value === "string") {
        if (key === "__proto__") Object.defineProperty(output, key, { value, enumerable: true, writable: true, configurable: true });
        else output[key] = value;
        continue;
      }
      const result = validators[i]!(value);`));
const variants = {
  baseline: source,
  'own-prototype-call': replace(source, 'const own = Object.hasOwn;', 'const own = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);'),
  'own-bound-call': replace(source, 'const own = Object.hasOwn;', 'const own = Function.prototype.call.bind(Object.prototype.hasOwnProperty) as (value: object, key: PropertyKey) => boolean;'),
  'output-preseed': preseed(source),
  'output-preseed-wide': preseed(source, true),
  'basic-allocation-elision': basic(source),
  'preseed-wide-basic': basic(preseed(source, true)),
  'compile-captured-own': replace(replace(replace(source,
    'const prefix = `v${i}=Object.hasOwn(raw,${property})?raw[${property}]:undefined;`;',
    'const prefix = `v${i}=own(raw,${property})?raw[${property}]:undefined;`;'),
    'const validate = new Function("fail", "decimal", "remainder", "keys", "validators",',
    'const validate = new Function("fail", "decimal", "remainder", "keys", "validators", "own",'),
    ')(fail, decimal, compiledRemainder, keys, compiledValidators);',
    ')(fail, decimal, compiledRemainder, keys, compiledValidators, own);'),
  'validators-presized': objectOnly(source, object => replace(replace(object,
    'const validators: ((value: unknown) => Result<any>)[] = [];\n  for (const key of keys) {',
    'const validators: ((value: unknown) => Result<any>)[] = new Array(keys.length);\n  for (let i = 0; i < keys.length; i++) {\n    const key = keys[i]!;'),
    'validators.push(s["~standard"].validate);', 'validators[i] = s["~standard"].validate;')),
};
variants['compile-captured-own'] = variants['compile-captured-own'].replaceAll('!Object.hasOwn(raw,${property})', '!own(raw,${property})');
variants['compile-captured-bound-own'] = replace(variants['compile-captured-own'], 'const own = Object.hasOwn;', 'const own = Function.prototype.call.bind(Object.prototype.hasOwnProperty) as (value: object, key: PropertyKey) => boolean;');
variants['compile-per-field-var'] = replace(replace(source,
  'const prefix = `v${i}=Object.hasOwn(raw,${property})?raw[${property}]:undefined;`;',
  'const prefix = `var v${i}=Object.hasOwn(raw,${property})?raw[${property}]:undefined;`;'),
  'let start,first${keys.map((_, i) => `,v${i}`).join("")};', 'let start,first;');
const seeded = (text, threshold, strategy) => objectOnly(text, object => {
  const expression = strategy === 'private'
    ? 'Object.fromEntries(keys.map(key => [key, undefined]))'
    : strategy === 'clone-strip'
      ? '(() => { const copy = { ...fields }; for (const symbol of Object.getOwnPropertySymbols(copy)) delete (copy as Record<PropertyKey, unknown>)[symbol]; return copy; })()'
      : 'Object.getOwnPropertySymbols(fields).length ? undefined : fields';
  object = replace(object, '  const mode = options.unknownKeys ?? "strip";',
    `  const template = keys.length >= ${threshold} ? ${expression} : undefined;\n  const mode = options.unknownKeys ?? "strip";`);
  object = replace(object, 'const output: Record<string, unknown> = {};', 'const output: Record<string, unknown> = template ? { ...template } : {};');
  return replace(object, '        else output[key] = result.value;\n      }\n    }',
    '        else output[key] = result.value;\n      } else delete output[key];\n    }');
});
for (const threshold of [8, 16, 32, 64]) variants['preseed-private-'+threshold] = seeded(source, threshold, 'private');
variants['preseed-clone-strip-32'] = seeded(source, 32, 'clone-strip');
variants['preseed-symbol-fallback-32'] = seeded(source, 32, 'fallback');
for (const threshold of [16, 64, 128]) variants['preseed-public-'+threshold] = preseed(source,true).replace('keys.length >= 32', 'keys.length >= '+threshold);
const opaque = text => replace(text,
  '      return `${prefix}if(!(${compiledCheck(plans[i], `v${i}`)})){start=${i};break fast;}`;',
  `      if (compiledCheck(plans[i], \`v\${i}\`) === "false") return \`\${prefix}const r\${i}=validators[\${i}](v\${i});
if(r\${i}.issues||r\${i}.value===undefined){first=r\${i};start=\${i};break fast;}
v\${i}=r\${i}.value;\`;
      return \`\${prefix}if(!(\${compiledCheck(plans[i], \`v\${i}\`)})){start=\${i};break fast;}\`;`);
variants['compile-opaque-continue'] = opaque(source);
variants['compile-opaque-captured-own'] = opaque(variants['compile-captured-own']);
const noDeleteAfterIssue = text => {
  const start=text.indexOf('function compiledRemainder('),end=text.indexOf('function compileArray(',start);
  return text.slice(0,start)+replace(text.slice(start,end),'else delete output[key];','else if (!issues) delete output[key];')+text.slice(end);
};
variants['compile-no-delete-after-issue'] = noDeleteAfterIssue(source);
variants['compile-opaque-no-delete'] = noDeleteAfterIssue(variants['compile-opaque-continue']);
const exactOpaque = text => {
  const start = text.indexOf('function compiledRemainder('), end = text.indexOf('function compileArray(',start);
  let helper = text.slice(start,end);
  helper = replace(helper, '  first?: Result<any>,', '  first?: Result<any>,\n  firstRead?: { readonly issues?: readonly Issue[]; readonly value: unknown },');
  helper = replace(helper, '    if (result.issues) issues = appendCompiledIssues(issues, result.issues, key);', '    if (i === start && firstRead ? firstRead.issues : result.issues) issues = appendCompiledIssues(issues, result.issues!, key);');
  helper = replace(helper, '    else if (result.value !== undefined || own(raw, key)) output[key] = result.value;', '    else if ((i === start && firstRead ? firstRead.value : result.value) !== undefined || own(raw, key)) output[key] = result.value;');
  text = text.slice(0,start) + helper + text.slice(end);
  text = replace(text, 'let start,first${keys.map((_, i) => `,v${i}`).join("")};', 'let start,first,firstRead${keys.map((_, i) => `,v${i}`).join("")};');
  text = replace(text, 'return remainder(raw,start,{${properties}},keys,validators,first);', 'return remainder(raw,start,{${properties}},keys,validators,first,firstRead);');
  return replace(text,
    '      return `${prefix}if(!(${compiledCheck(plans[i], `v${i}`)})){start=${i};break fast;}`;',
    `      if (compiledCheck(plans[i], \`v\${i}\`) === "false") return \`\${prefix}const r\${i}=validators[\${i}](v\${i});
const e\${i}=r\${i}.issues;
if(e\${i}){first=r\${i};firstRead={issues:e\${i},value:undefined};start=\${i};break fast;}
const o\${i}=r\${i}.value;
if(o\${i}===undefined){first=r\${i};firstRead={issues:undefined,value:o\${i}};start=\${i};break fast;}
v\${i}=r\${i}.value;\`;
      return \`\${prefix}if(!(\${compiledCheck(plans[i], \`v\${i}\`)})){start=\${i};break fast;}\`;`);
};
variants['compile-opaque-exact-reads'] = exactOpaque(source);
variants['compile-opaque-exact-captured-own'] = exactOpaque(variants['compile-captured-own']);
const scalarElision = (text, kind) => objectOnly(text, object => replace(object,
  '      const result = validators[i]!(own(raw, key) ? raw[key] : undefined);',
  `      const inputValue = own(raw, key) ? raw[key] : undefined;
      const validator = validators[i]!;
      ${kind === 'boolean-native' ? `if (typeof inputValue === "boolean" && validator === validateBoolean) {
        if (key === "__proto__") Object.defineProperty(output, key, { value: inputValue, enumerable: true, writable: true, configurable: true });
        else output[key] = inputValue;
        continue;
      }` : kind === 'boolean-coercion' ? `if (validator === validateBoolean && (typeof inputValue === "boolean" || inputValue === "true" || inputValue === "false" || inputValue === "1" || inputValue === "0")) {
        const value = typeof inputValue === "boolean" ? inputValue : inputValue === "true" || inputValue === "1";
        if (key === "__proto__") Object.defineProperty(output, key, { value, enumerable: true, writable: true, configurable: true });
        else output[key] = value;
        continue;
      }` : `const plan = (validator as PlannedValidate)[fieldPlan];
      if (typeof inputValue === "number" && plan?.kind === "number" && Number.isFinite(inputValue) &&
          (!plan.integer || Number.isSafeInteger(inputValue)) &&
          (plan.gt === undefined || typeof plan.gt === "number" && !(inputValue <= plan.gt)) &&
          (plan.gte === undefined || typeof plan.gte === "number" && !(inputValue < plan.gte)) &&
          (plan.lt === undefined || typeof plan.lt === "number" && !(inputValue >= plan.lt)) &&
          (plan.lte === undefined || typeof plan.lte === "number" && !(inputValue > plan.lte))) {
        if (key === "__proto__") Object.defineProperty(output, key, { value: inputValue, enumerable: true, writable: true, configurable: true });
        else output[key] = inputValue;
        continue;
      }`}
      const result = validators[i]!(inputValue);`));
variants['boolean-native-elision'] = scalarElision(source, 'boolean-native');
variants['boolean-coercion-elision'] = scalarElision(source, 'boolean-coercion');
variants['number-native-elision'] = scalarElision(source, 'number-native');
const shareBasics = (text, standard) => {
  let globals='\nconst basicStringMeta = /* @__PURE__ */ Object.freeze({ kind: "string" as const, description: undefined });\nconst basicBooleanMeta = /* @__PURE__ */ Object.freeze({ kind: "boolean" as const, description: undefined });\n';
  if (standard) globals += 'const basicStringStandard = /* @__PURE__ */ Object.freeze({version: 1 as const, vendor: "loculus" as const, validate: validateString});\nconst basicBooleanStandard = /* @__PURE__ */ Object.freeze({version: 1 as const, vendor: "loculus" as const, validate: validateBoolean});\n';
  text=replace(text,'const own = Object.hasOwn;','const own = Object.hasOwn;'+globals);
  for (const [kind,type] of [['String','StringOptions & FieldOptions<string>'],['Boolean','FieldOptions<boolean>']]) {
    const marker=kind==='Boolean'?'export function boolean(options: FieldOptions<boolean> = emptyOptions): Field<any, any, boolean> {':`export function ${kind.toLowerCase()}(\n  options: ${type} = emptyOptions,\n): Field<any, any, boolean> {`;
    const body=standard?`{meta:basic${kind}Meta,"~standard":basic${kind}Standard,field:true} as Field<any,any,boolean>`:`field(basic${kind}Meta,validate${kind})`;
    text=replace(text,marker,marker+`\n  if (options === emptyOptions) return ${body};`);
  }
  return text;
};
variants['shared-basic-meta'] = shareBasics(source,false);
variants['shared-basic-meta-standard'] = shareBasics(source,true);
const manifest = {
  date: new Date().toISOString(),
  baselineHash: createHash('sha256').update(source).digest('hex'),
  candidates: Object.entries(variants).map(([name, contents]) => {
    writeFileSync(new URL(name + '.ts.txt', dir), contents);
    return { name, sourceHash: createHash('sha256').update(contents).digest('hex') };
  }),
};
writeFileSync(new URL('manifest.json', dir), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest));
