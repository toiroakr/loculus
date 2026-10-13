import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {build} from 'esbuild';
import {rolldown} from 'rolldown';
const bun=process.env.BUN_BIN??resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun');
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const report={date:new Date().toISOString(),sourceHash:hash('src/index.ts'),distHash:hash('dist/index.js'),scope:'minified browser ESM, live one-string schema + Standard Schema validate export; unannotated and PURE unused construction',cases:{},completed:false};
for(const lib of ['loculus','zod','valibot']){
 const alias=lib==='loculus'?'l':lib==='zod'?'z':'v';const pkg=lib==='loculus'?'./dist/index.js':lib;
 const ns=lib==='zod'?`import{z}from'zod';`:`import*as ${alias} from '${pkg}';`;
 const base=`export const schema=${alias}.object({name:${alias}.string()});export const validate=input=>schema['~standard'].validate(input);`;
 const sources={base:ns+base,unusedPackage:ns+'export const value=1;',empty:'export const value=1;',unusedConstruct:ns+`const unused=${alias}.date();`+base,pureUnusedConstruct:ns+`const unused=/*@__PURE__*/${alias}.date();`+base,unusedObject:ns+`const unused=${alias}.object({date:${alias}.date()});`+base,pureUnusedObject:ns+`const unused=/*@__PURE__*/${alias}.object({date:/*@__PURE__*/${alias}.date()});`+base,pureArgumentEffect:ns+`const effect=()=>{globalThis.__coverageEffect=1;return ${alias}.date();};const unused=/*@__PURE__*/${alias}.object({date:effect()});export const observed=globalThis.__coverageEffect;`+base};
 for(const [name,source]of Object.entries(sources))for(const bundler of ['bun','esbuild','rolldown']){
  const input=resolve('bench/coverage/generated/tree.ts');writeFileSync(input,source.replace("'./dist/index.js'","'../../../dist/index.js'"));let code;
  if(bundler==='bun'){const output=resolve('bench/coverage/generated/tree.js');const r=spawnSync(bun,['build','--target','browser','--format','esm','--minify',input,'--outfile',output],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);code=readFileSync(output,'utf8');}
  else if(bundler==='esbuild')code=(await build({entryPoints:[input],bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',write:false})).outputFiles[0].text;
  else{const b=await rolldown({input,platform:'browser'});try{code=(await b.generate({format:'esm',minify:true})).output[0].code;}finally{await b.close();}}
  delete globalThis.__coverageEffect;const module=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${lib}-${name}-${bundler}`);
  if(name==='empty'||name==='unusedPackage')assert.equal(module.value,1);else{assert.deepEqual(module.validate({name:'a'}).value,{name:'a'});assert.ok(module.validate({name:1}).issues);}
  if(name==='pureArgumentEffect')assert.equal(module.observed,1);
  report.cases[lib+'/'+bundler+'/'+name]={bytes:Buffer.byteLength(code),gzipBytes:gzipSync(code).length,code};
 }
 for(const bundler of ['bun','esbuild','rolldown'])assert.equal(report.cases[lib+'/'+bundler+'/unusedPackage'].bytes,report.cases[lib+'/'+bundler+'/empty'].bytes);
}
for(const value of Object.values(report.cases))delete value.code;
assert.equal(hash('src/index.ts'),report.sourceHash);assert.equal(hash('dist/index.js'),report.distHash);
report.completed=true;writeFileSync('bench/coverage/tree-shaking-results.json',JSON.stringify(report,null,2)+'\n');console.log('All-library tree-shaking behavior verified.');
