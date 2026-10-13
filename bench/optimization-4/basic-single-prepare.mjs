import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
const dir='bench/optimization-4';const variants={};
const helper=`function validateSingle(key: string, input: unknown) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { issues: [{ message: 'Expected an object', code: 'invalid_type' }] };
  const raw = input as Record<string, unknown>;
  const value = own(raw, key) ? raw[key] : undefined;
  if (typeof value !== 'string') return { issues: [{ message: 'Expected a string', code: 'invalid_type', path: [key] }] };
  const output: Record<string, string> = {};
  if (key === '__proto__') Object.defineProperty(output, key, { value, enumerable: true, writable: true, configurable: true });
  else output[key] = value;
  return { value: output };
}
`;
for(const name of ['basic-identity-shared','basic-fused-indexed-shared']){
 const s=readFileSync(dir+'/'+name+'.ts.txt','utf8');
 variants[name+'-single']=s.replace('  const validate = (input: unknown) => validateObject(keys, input);','  const first = keys[0]!;\n  const validate = keys.length === 1 ? (input: unknown) => validateSingle(first, input) : (input: unknown) => validateObject(keys, input);')+'\n'+helper;
 variants[name+'-single-bind']=s.replace('  const validate = (input: unknown) => validateObject(keys, input);','  const validate = keys.length === 1 ? validateSingle.bind(undefined, keys[0]!) : validateObject.bind(undefined, keys);')+'\n'+helper;
}
const m=JSON.parse(readFileSync(dir+'/manifest.json'));for(const[name,contents]of Object.entries(variants)){writeFileSync(dir+'/'+name+'.ts.txt',contents);m.candidates.push({name,sourceHash:createHash('sha256').update(contents).digest('hex')});}writeFileSync(dir+'/manifest.json',JSON.stringify(m,null,2)+'\n');
