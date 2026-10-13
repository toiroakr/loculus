import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dir = 'bench/optimization-4';
const source = readFileSync(dir + '/baseline.ts.txt', 'utf8');
const marker = '"~standard": { version: 1, vendor: "loculus", validate }';
const direct = `function descriptor(meta: Meta, validate: (value: unknown) => Result<any>): Meta & Schema["~standard"] {
  const standard = meta as Meta & { version: 1; vendor: "loculus"; validate: (value: unknown) => Result<any> };
  standard.version = 1;
  standard.vendor = "loculus";
  standard.validate = validate;
  return standard;
}
`;
const assigned = `function descriptor(meta: Meta, validate: (value: unknown) => Result<any>): Meta & Schema["~standard"] {
  return Object.assign(meta, { version: 1 as const, vendor: "loculus" as const, validate });
}
`;
const fused = text => text.replaceAll('return { meta, ' + marker + ', field: true }', 'return { meta, "~standard": descriptor(meta, validate), field: true }').replace('return { meta, ' + marker + ' }', 'return { meta, "~standard": descriptor(meta, validate) }');
const variants = { 'descriptor-direct': fused(source) + '\n' + direct, 'descriptor-assign': fused(source) + '\n' + assigned };
const objStart=source.indexOf('export function object<'),objEnd=source.indexOf('function appendCompiledIssues',objStart);
for(const name of Object.keys(variants)){
  let candidate=variants[name];
  const start=candidate.indexOf('export function object<'),end=candidate.indexOf('function appendCompiledIssues',start);
  const object=candidate.slice(start,end).replace('  return {\n    meta: { kind: "object", shape: fields, unknownKeys: mode, description: options.description },\n    "~standard": { version: 1, vendor: "loculus", validate },','  const meta = { kind: "object" as const, shape: fields, unknownKeys: mode, description: options.description };\n  return {\n    meta,\n    "~standard": descriptor(meta, validate),');
  variants[name+'-object']=candidate.slice(0,start)+object+candidate.slice(end);
}
const manifest=JSON.parse(readFileSync(dir+'/manifest.json'));
for(const [name,contents]of Object.entries(variants)){writeFileSync(dir+'/'+name+'.ts.txt',contents);manifest.candidates.push({name,sourceHash:createHash('sha256').update(contents).digest('hex')});}
writeFileSync(dir+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
