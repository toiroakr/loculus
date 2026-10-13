import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {standardSchemaResolver} from '@hookform/resolvers/standard-schema';
import {arg,getArgMeta} from '/Users/toiroakr/workspace/politty/feat/loculus-adapter/packages/core/src/core/arg-registry.ts';
import {extractLoculusFields} from '/Users/toiroakr/workspace/politty/feat/loculus-adapter/packages/loculus/src/adapter.ts';

const manifest=JSON.parse(readFileSync('bench/guarantees/ablation-manifest.json'));
const normalize=value=>JSON.parse(JSON.stringify(value,(_,v)=>v===undefined?{$undefined:true}:typeof v==='symbol'?String(v):v));
const cases=[];
for(const item of manifest.modules){
  let l;let scenario=0;const fresh=async()=>{const file=item.file.replace('.mjs',`.scenario-${scenario++}.mjs`);copyFileSync(item.file,file);l=(await import(pathToFileURL(resolve(file)))).l;};
  const capture=async fn=>{await fresh();try{return normalize(fn());}catch(e){return {error:e.name,message:e.message};}};
  const run=(s,x)=>l.safeParse(s,x);
  const results={};
  results.shapeOriginal=await capture(()=>{const shape={name:l.string()},s=l.object(shape);let mutation;try{shape.name=l.number();mutation='applied';}catch(e){mutation=e.name;}return {same:s.shape===shape,frozen:Object.isFrozen(shape),mutation,metaKind:s.shape.name.meta.kind,string:run(s,{name:'a'}),number:run(s,{name:1})};});
  results.shapeExposed=await capture(()=>{const s=l.object({name:l.string()});let mutation;try{s.shape.name=l.number();mutation='applied';}catch(e){mutation=e.name;}return {mutation,metaKind:s.shape.name.meta.kind,string:run(s,{name:'a'}),number:run(s,{name:1})};});
  results.enum=await capture(()=>{const s=l.literal('ready'),meta=s.meta;const before={own:Object.hasOwn(meta,'enumValues'),enumerable:Object.keys(meta).includes('enumValues')};const values=meta.enumValues;let push;try{values.push('other');push='applied';}catch(e){push=e.name;}const set=Reflect.set(meta,'enumValues',['override']);return {before,push,set,metadata:meta.enumValues,ready:run(s,'ready'),other:run(s,'other')};});
  results.sharing=await capture(()=>{const a=l.string(),b=l.string(),before=Object.getOwnPropertyDescriptor(a,'~standard');const std=a['~standard'];a.meta.description='leaked';const prior=std.validate;std.validate=()=>({value:'replacement'});const other=run(b,'original');std.validate=prior;return {schemaSame:a===b,metaSame:a.meta===b.meta,standardSame:std===b['~standard'],ownBefore:!!before,getterBefore:!!before?.get,standardStable:std===a['~standard'],descriptionB:b.meta.description,other};});
  results.politty=await capture(()=>{const a=arg(l.string(),{description:'First',alias:'a'});const b=arg(l.string(),{description:'Second',alias:'b'});return {same:a===b,first:getArgMeta(a),second:getArgMeta(b)};});
  results.presenceMetadata=await capture(()=>{const required=l.string();const optional=l.string({optional:true});const defaulted=l.string({default:'fallback'});return {sameRequiredOptional:required.meta===optional.meta,sameRequiredDefault:required.meta===defaulted.meta,requiredMeta:required.meta,requiredMissing:run(required,undefined),optionalMeta:optional.meta,defaultMeta:defaulted.meta};});
  results.polittyExtraction=await capture(()=>{const required=l.string();l.string({default:'fallback'});const s=l.object({name:required});const f=extractLoculusFields(s).fields[0];return {required:f.required,defaultValue:f.defaultValue,missing:run(s,{})};});
  results.inherited=await capture(()=>run(l.object({name:l.string()}),Object.create({name:'inherited'})));
  results.arrayRoot=await capture(()=>run(l.object({}),[]));
  results.proto=await capture(()=>{const s=l.object({['__proto__']:l.transform(l.string(),()=>({isAdmin:true}))});const r=run(s,JSON.parse('{"__proto__":"value"}'));return {result:r,own:r.value?Object.hasOwn(r.value,'__proto__'):null,prototypeUnchanged:r.value?Object.getPrototypeOf(r.value)===Object.prototype:null,isAdmin:r.value?.isAdmin};});
  results.frozenIssue=await capture(()=>{const issue=Object.freeze({message:'shared',code:'custom',extra:42,path:Object.freeze([{key:'leaf'}])});const child=l.string();child['~standard'].validate=()=>({issues:Object.freeze([issue])});return {result:run(l.object({left:child,right:child}),{left:'a',right:'b'}),original:issue};});
  results.reusedIssue=await capture(()=>{const issue={message:'shared',code:'custom',extra:42,path:['leaf']};const child=l.string();child['~standard'].validate=()=>({issues:[issue]});return {result:run(l.object({left:child,right:child}),{left:'a',right:'b'}),original:issue};});
  results.unknown=await capture(()=>run(l.object({name:l.string()},{unknownKeys:'strict'}),{name:'a',extra1:1,extra2:2}));
  results.child=await capture(()=>{const child=l.string(),s=l.object({name:child});child['~standard'].validate=()=>({value:'replacement'});return run(s,{name:'a'});});
  results.order=await capture(()=>{const raw={a:'a',b:'before'};const child=l.transform(l.string(),x=>{raw.b='after';return x;});return run(l.object({a:child,b:l.string()}),raw);});
  results.duplicate=await capture(()=>{let s;try{s=l.discriminatedUnion('kind',[l.object({kind:l.literal('x')}),l.object({kind:l.literal('x')})]);}catch(e){return {stage:'construction',error:e.name,message:e.message};}try{return {stage:'validation',result:run(s,{kind:'x'})};}catch(e){return {stage:'validation',error:e.name,message:e.message};}});
  await fresh();
  const s=l.object({title:l.string({min:1}),items:l.array(l.object({name:l.string({min:1}),quantity:l.number({integer:true,gte:1})}),{wrapScalar:false})});
  results.rhf=normalize(await standardSchemaResolver(s)({title:'Order',items:[{name:'A',quantity:'2'}]},undefined,{criteriaMode:'all',fields:{},shouldUseNativeValidation:false}));
  results.rhfErrors=normalize(await standardSchemaResolver(s)({title:'',items:[{name:'',quantity:'0'}]},undefined,{criteriaMode:'all',fields:{},shouldUseNativeValidation:false}));
  cases.push({variant:item.variant,results});
}
const baseline=cases[0].results;
assert.equal(baseline.shapeExposed.mutation,'TypeError');
assert.equal(baseline.proto.prototypeUnchanged,true);
assert.equal(baseline.politty.same,false);
assert.equal(cases.find(c=>c.variant==='shared-schema').results.politty.same,true);
assert.equal(cases.find(c=>c.variant==='shared-schema').results.politty.first.alias,'b');
assert.equal(cases.find(c=>c.variant==='shared-meta').results.presenceMetadata.requiredMeta.defaultValue,'fallback');
assert.equal(cases.find(c=>c.variant==='shared-meta').results.polittyExtraction.required,false);
assert.equal(baseline.polittyExtraction.required,true);
assert.deepEqual(baseline.frozenIssue.original.path,[{key:'leaf'}]);
assert.equal(cases.find(c=>c.variant==='mutate-issues').results.frozenIssue.error,'TypeError');
assert.equal(cases.find(c=>c.variant==='unsafe-proto-write').results.proto.isAdmin,true);
assert.equal(cases.find(c=>c.variant==='eager-input').results.order.value.b,'before');
for(const c of cases){c.differences=Object.keys(baseline).filter(k=>JSON.stringify(c.results[k])!==JSON.stringify(baseline[k]));assert.deepEqual(c.results.rhf,baseline.rhf,c.variant+' RHF values');assert.deepEqual(c.results.rhfErrors,baseline.rhfErrors,c.variant+' RHF errors');}
const generatedChecks=[];
for(const item of manifest.cases.filter(c=>c.profile==='discriminated-union'&&['ordinary','generated'].includes(c.pipeline))){
  const consumer=await import(pathToFileURL(resolve(item.file.replace('.mjs','-consumer.mjs'))));
  let reads=0;const input={count:'2'};Object.defineProperty(input,'kind',{enumerable:true,get(){return ++reads<=2?'b':'a';}});
  const actual=consumer.validate(input);assert.deepEqual(actual,{value:{kind:'b',count:2}},item.id);assert.equal(reads,2,item.id+' discriminator read count');
  generatedChecks.push({id:item.id,reads,result:actual});
}
const report={completed:true,runtime:process.versions.bun?'Bun '+process.versions.bun:'Node '+process.version,scope:'26 isolated runtime variants; actual RHF standard-schema resolver and Politty arg/WeakMap registry and field extraction; mutation probes are deliberate adversarial inputs. All ordinary/generated DU consumers checked for discriminator getter order.',cases,generatedChecks};
writeFileSync(process.argv[2]??'bench/guarantees/ablation-behavior-node.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(cases.map(c=>({variant:c.variant,differences:c.differences}))));
