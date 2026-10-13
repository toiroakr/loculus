import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('experiments/perry/generated', { recursive: true });
writeFileSync('experiments/perry/generated/baseline.ts', `import {performance} from 'node:perf_hooks';
const start=performance.now();
let sink=0;
for(let i=0;i<100000;i++)sink+=i%7;
console.log(JSON.stringify({elapsedMs:performance.now()-start,sink}));
`);
const imports = {
  loculus: "import * as l from './dist/index.js';",
  zod: "import {z} from 'zod';z.config({jitless:true});",
  valibot: "import * as v from 'valibot';",
};
export const fixtures = [];
for (const library of Object.keys(imports)) {
  for (const profile of ['strings-3', 'strings-30', 'cli']) {
    let source, valid, invalid, probes;
    if (profile.startsWith('strings')) {
      const count = Number(profile.split('-')[1]);
      const item = { loculus: 'l.string({min:1,max:100})', zod: 'z.string().min(1).max(100)', valibot: 'v.pipe(v.string(),v.minLength(1),v.maxLength(100))' }[library];
      const prefix = { loculus: 'l', zod: 'z', valibot: 'v' }[library];
      source = `const schema=${prefix}.object({${Array.from({ length: count }, (_, i) => `f${i}:${item}`).join(',')}});`;
      valid = Object.fromEntries(Array.from({ length: count }, (_, i) => [`f${i}`, 'hello']));
      invalid = { ...valid, f0: '' };
      probes = [valid, invalid, {}, null, { ...valid, f0: 'a'.repeat(101) }, { ...valid, f0: 123 }, { ...valid, extra: 'strip' }, { ...valid, f0: '日本語😀' }];
    } else {
      const decimal = '/^[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?$/';
      source = {
        loculus: "const schema=l.object({name:l.string({min:1}),port:l.number({integer:true,gte:1,lte:65535,default:3000}),verbose:l.boolean({optional:true}),mode:l.enum(['dev','prod'])});",
        zod: `const decimal=${decimal};const schema=z.object({name:z.string().min(1),port:z.union([z.string().regex(decimal).transform(Number),z.number()]).pipe(z.number().int().min(1).max(65535)).default(3000),verbose:z.union([z.boolean(),z.enum(['true','false','1','0']).transform(x=>x==='true'||x==='1')]).optional(),mode:z.enum(['dev','prod'])});`,
        valibot: `const decimal=${decimal};const schema=v.object({name:v.pipe(v.string(),v.minLength(1)),port:v.optional(v.pipe(v.union([v.pipe(v.string(),v.regex(decimal),v.transform(Number)),v.number()]),v.safeInteger(),v.minValue(1),v.maxValue(65535)),3000),verbose:v.optional(v.union([v.boolean(),v.pipe(v.picklist(['true','false','1','0']),v.transform(x=>x==='true'||x==='1'))])),mode:v.picklist(['dev','prod'])});`,
      }[library];
      valid = { name: 'app', port: '8080', verbose: 'false', mode: 'prod' };
      invalid = { name: '', port: 'wrong', verbose: 'yes', mode: 'test' };
      probes = [valid, invalid, { name: 'app', mode: 'dev' }, null, { ...valid, port: '0x10' }, { ...valid, port: '1.5' }, { ...valid, port: '65536' }, { ...valid, port: '1' }, { ...valid, port: '65535' }, { ...valid, port: null }, { ...valid, extra: 'strip' }];
    }
    const name = `${library}-${profile}`;
    const harness = `
import {performance} from 'node:perf_hooks';
const validate=input=>schema['~standard'].validate(input);
const probes=${JSON.stringify(probes)};
if(process.argv[2]!=='once')for(let i=0;i<probes.length;i++){
 const result=validate(probes[i]);
 console.log(JSON.stringify({kind:'probe',index:i,ok:!result.issues,value:result.value,issueCount:result.issues?result.issues.length:0}));
}
if(process.argv[2]==='once'){
 const result=validate(${JSON.stringify(valid)});
 console.log(JSON.stringify({kind:'once',ok:!result.issues,value:result.value,sink:result.issues?result.issues.length:Object.keys(result.value).length}));
}
if(process.argv[2]!=='verify'&&process.argv[2]!=='once'){
 const dataset=process.argv[2]==='invalid'?'invalid':'valid';
 const input=dataset==='valid'?${JSON.stringify(valid)}:${JSON.stringify(invalid)};
 const iterations=${profile === 'strings-30' ? 10000 : 50000};
 let sink=0;
 for(let i=0;i<10000;i++){const r=validate(input);sink+=r.issues?r.issues.length:Object.keys(r.value).length;}
 for(let round=0;round<7;round++){
  const start=performance.now();
  for(let i=0;i<iterations;i++){const r=validate(input);sink+=r.issues?r.issues.length:Object.keys(r.value).length;}
  console.log(JSON.stringify({kind:'bench',round,iterations,elapsedMs:performance.now()-start,sink}));
 }
}`;
    const contents = imports[library] + source + harness;
    writeFileSync(`experiments/perry/generated/${name}-direct.ts`, contents.replace("'./dist/index.js'", "'../../../dist/index.js'"));
    const result = await build({ stdin: { contents, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, minify: false, treeShaking: true, format: 'esm', platform: 'node', target: 'es2022', write: false });
    writeFileSync(`experiments/perry/generated/${name}.ts`, result.outputFiles[0].text);
    writeFileSync(`experiments/perry/generated/${name}.mjs`, result.outputFiles[0].text);
    fixtures.push({ name, library, profile, probeCount: probes.length });
  }
}
writeFileSync('experiments/perry/generated/fixtures.json', JSON.stringify(fixtures, null, 2));
console.log('Prepared 9 native single-file fixtures and 9 direct-import fixtures.');
