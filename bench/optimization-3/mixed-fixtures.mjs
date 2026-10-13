export {libraries,imports,prelude} from '../coverage/fixtures.mjs';
const prefixes=['l','z','v'];
const basic=['l.string()','z.string()','v.string()'];
const profilesWide=kind=>{
 const first=kind==='transform'
  ?["l.transform(l.string(),x=>x+'!')","z.string().transform(x=>x+'!')","v.pipe(v.string(),v.transform(x=>x+'!'))"]
  :["l.string({default:'fallback'})","z.string().default('fallback')","v.optional(v.string(),'fallback')"];
 return first.map((expression,i)=>`${prefixes[i]}.object({f0:${expression},${Array.from({length:99},(_,j)=>`f${j+1}:${basic[i]}`).join(',')}})`);
};
const goodWide=kind=>{const input=Object.fromEntries(Array.from({length:100},(_,i)=>['f'+i,'v'+i]));if(kind==='default')delete input.f0;return input};
const decimalNumber=[
 'l.number({integer:true,gte:1})',
 'z.union([z.string().regex(decimal).transform(Number),z.number()]).pipe(z.number().int().gte(1))',
 'v.pipe(v.union([v.pipe(v.string(),v.regex(decimal),v.transform(Number)),v.number()]),v.finite(),v.safeInteger(),v.minValue(1))',
];
const page=["l.number({integer:true,gte:1,default:1})",`${decimalNumber[1]}.default(1)`,`v.optional(${decimalNumber[2]},1)`];
const limit=["l.number({integer:true,gte:1,lte:100,default:20})",`${decimalNumber[1]}.pipe(z.number().lte(100)).default(20)`,`v.optional(v.pipe(${decimalNumber[2]},v.maxValue(100)),20)`];
const query=["l.string({optional:true,max:200})","z.string().refine(x=>x.length<=200).optional()","v.optional(v.pipe(v.string(),v.maxLength(200)))"];
const tags=["l.array(l.string(),{default:[]})","z.union([z.array(z.string()),z.string().transform(x=>[x])]).default([])","v.optional(v.union([v.array(v.string()),v.pipe(v.string(),v.transform(x=>[x]))]),[])"];
const expanded=["l.boolean({default:false})","z.union([z.boolean(),z.enum(['true','false','1','0']).transform(x=>x==='true'||x==='1')]).default(false)","v.optional(v.union([v.boolean(),v.pipe(v.picklist(['true','false','1','0']),v.transform(x=>x==='true'||x==='1'))]),false)"];
const sort=["l.enum(['new','old'])","z.enum(['new','old'])","v.picklist(['new','old'])"];
const queryExpressions=prefixes.map((prefix,i)=>`${prefix}.object({page:${page[i]},limit:${limit[i]},q:${query[i]},sort:${sort[i]},tags:${tags[i]},expanded:${expanded[i]},${['locale','category','owner','view','format','source'].map(key=>`${key}:${basic[i]}`).join(',')}})`);
const goodQuery={sort:'new',locale:'ja',category:'all',owner:'me',view:'list',format:'json',source:'web'};
export const profiles=['transform','default'].map(kind=>{
 const good=goodWide(kind),bad={...good,f50:42};const missingLast={...good};delete missingLast.f99;
 return {id:`mixed-http-${kind}-100`,feature:'additional mixed HTTP compile schemas',expressions:profilesWide(kind),valid:[good],invalid:[bad],probes:[good,bad,{...good,f0:undefined},{...good,f0:null},{...good,f0:42,f50:42},missingLast,null,[]],note:'Additional schema measurement in the candidate-selection screen domain; separate from canonical96 and RHF3. Not an independent confirmation of universal superiority.'};
});
profiles.push({id:'mixed-http-query-12',feature:'additional mixed HTTP query schema',expressions:queryExpressions,valid:[goodQuery],invalid:[{...goodQuery,limit:'999',format:42}],probes:[goodQuery,{...goodQuery,limit:'999',format:42},{...goodQuery,page:'0'},{...goodQuery,page:''},{...goodQuery,limit:null},{...goodQuery,limit:'1.5'},{...goodQuery,q:null},{...goodQuery,q:'x'.repeat(201)},{...goodQuery,q:'😀'.repeat(101)},{...goodQuery,tags:'one',expanded:'1'},{...goodQuery,tags:null},{...goodQuery,expanded:'yes'},{...goodQuery,page:'+1',limit:100,tags:['a','b'],expanded:true},{},{...goodQuery,extra:'strip'}],note:'Additional schema measurement matching the explored 12-field domain. Strict decimal and safe-integer parity, UTF-16 query length, scalar tag wrapping, defaults and strict boolean words.'});
export const coverage={additionalMixedHTTP:profiles.map(profile=>profile.id)};
