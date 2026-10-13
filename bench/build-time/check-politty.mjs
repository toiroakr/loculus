import assert from 'node:assert/strict';
import {rolldown} from 'rolldown';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loculusPlugin} from '../../packages/rolldown/dist/index.js';
const adapter=resolve(process.argv[2]??'../../../politty/feat/loculus-adapter/packages/loculus/dist/index.js');
const entry=resolve('bench/build-time/generated/politty-consumer.ts');
const source=`import * as l from 'loculus';import {arg,defineCommand,runCommand} from ${JSON.stringify(adapter)};
export const make=()=>defineCommand({name:'serve',args:l.object({
 name:arg(l.string({min:1}),{alias:'n'}),port:arg(l.number({integer:true,gte:1,lte:65535,default:3000}),{alias:'p'}),
 cache:arg(l.boolean({default:true}),{negation:true}),tag:arg(l.array(l.string(),{wrapScalar:true,optional:true}),{alias:'t'})
}),run:args=>args});
export const run=(cmd,argv)=>runCommand(cmd,argv);`;
const outputs=[];
for(const generated of [false,true]){
 let changed=false;
 const bundle=await rolldown({input:entry,platform:'node',external:[adapter],plugins:[
 {name:'consumer',resolveId(id){if(id===entry)return entry;if(id==='loculus')return resolve('dist/index.js');},load(id){if(id===entry)return source;}},
 ...(generated?[loculusPlugin()]:[]),
 {name:'capture',transform(code,id){if(id===entry)changed=code.includes('function __loculus_');}}
 ]});
 let code;try{code=(await bundle.generate({format:'esm'})).output[0].code;}finally{await bundle.close();}
 assert.equal(changed,generated);
 const path=`bench/build-time/generated/politty-${generated?'generated':'ordinary'}.mjs`;writeFileSync(path,code);
 const m=await import(new URL('../../'+path,import.meta.url));
 const a=m.make(),b=m.make();
 const runs=[];
 for(const argv of [['-n','app'],['-n','app','-p','8080','--no-cache','-t','alpha','-t','beta'],['-n','app','-p','0']]){
  const r=await m.run(a,argv);runs.push(r.success?{success:true,value:r.result}:{success:false});
 }
 assert.deepEqual(runs,[{success:true,value:{name:'app',port:3000,cache:true}},{success:true,value:{name:'app',port:8080,cache:false,tag:['alpha','beta']}},{success:false}]);
 assert.deepEqual((await m.run(b,['-n','second','-p','9'])).result,{name:'second',port:9,cache:true});
 outputs.push(runs);
}
assert.deepEqual(outputs[0],outputs[1]);
writeFileSync('bench/build-time/politty-results.json',JSON.stringify({completed:true,date:new Date().toISOString(),adapter,adapterHash:createHash('sha256').update(readFileSync(adapter)).digest('hex'),cases:outputs[1],freshCommandIdentity:true,alias:true,negation:true,repeatedArray:true,numericDefaultAndBoundaries:true},null,2)+'\n');
console.log('Generated schemas verified through actual @politty/loculus built command execution.');
