import assert from 'node:assert/strict';
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';
import{build}from'esbuild';
import{resolve}from'node:path';
import{gzipSync}from'node:zlib';
import{createHash}from'node:crypto';
const folder=resolve('bench/optimization-4/generated/reachability');mkdirSync(folder,{recursive:true});
const source=readFileSync('bench/optimization-4/baseline.ts.txt','utf8');
const start=source.indexOf('function configuredField<I, O>');const end=source.indexOf('export interface StringOptions',start);
const withoutPresence=source.slice(0,start)+`function configuredField<I,O>(meta:Meta, options:FieldOptions<O>, validate:(value:unknown)=>Result<O>):Field<any,any,boolean> { return field(meta,validate); }\n`+source.slice(end);
const withoutConstraints=text=>{
 const a=text.indexOf('    !options.trim &&');const b=text.indexOf('\n  );',a);assert.ok(a>=0&&b>a);
 return text.slice(0,a)+'    validateString,'+text.slice(b);
};
const variants={loculus:source,'loculus-no-presence':withoutPresence,'loculus-no-constraints':withoutConstraints(source),'loculus-no-presence-or-constraints':withoutConstraints(withoutPresence),valibot:readFileSync('node_modules/valibot/dist/index.mjs','utf8')};
const report={date:new Date().toISOString(),purpose:'Diagnostic feature-reachability ablations; removed-feature variants do not implement the full root API and are not shipped',cases:{}};
for(const[name,code]of Object.entries(variants)){
 const output=await build({stdin:{contents:code,loader:name==='valibot'?'js':'ts'},format:'esm',target:'es2022',write:false});writeFileSync(folder+'/'+name+'.js',output.outputFiles[0].text);
 const bundle=await build({stdin:{contents:`import*as l from './${name}.js';export const schema=l.object({value:l.string()});export const validate=input=>schema['~standard'].validate(input);`,resolveDir:folder,loader:'js'},bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',write:false});
 report.cases[name]={sourceHash:createHash('sha256').update(code).digest('hex'),bytes:Buffer.byteLength(bundle.outputFiles[0].text),gzipBytes:gzipSync(bundle.outputFiles[0].text).length};writeFileSync(folder+'/'+name+'-min.js',bundle.outputFiles[0].text);
 const live=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));assert.deepEqual(live.validate({value:'ok',extra:true}).value,{value:'ok'});assert.equal(live.validate({value:42}).issues.length,1);
}
report.completed=true;writeFileSync('bench/optimization-4/bundle-reachability-results.json',JSON.stringify(report,null,2)+'\n');console.log(report.cases);
