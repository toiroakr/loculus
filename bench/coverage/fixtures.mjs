export const libraries = ['loculus', 'zod', 'valibot'];
export const imports = {loculus:"import * as l from '../../dist/index.js';",zod:"import {z} from 'zod';",valibot:"import * as v from 'valibot';"};
export const prelude = `
const decimal=/^[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?$/;
const booleanWords=['true','false','1','0'];
const iso=(value)=>/^\\d{4}-\\d{2}-\\d{2}(?:T.*)?$/.test(value)&&Number.isFinite(new Date(value).getTime())&&new Date(value.slice(0,10)+'T00:00:00.000Z').toISOString().slice(0,10)===value.slice(0,10);
`;
const number=['l.number()',"z.union([z.string().regex(decimal).transform(Number),z.number()]).pipe(z.number())","v.pipe(v.union([v.pipe(v.string(),v.regex(decimal),v.transform(Number)),v.number()]),v.finite())"];
const boolean=['l.boolean()',"z.union([z.boolean(),z.enum(['true','false','1','0']).transform(x=>x==='true'||x==='1')])","v.union([v.boolean(),v.pipe(v.picklist(['true','false','1','0']),v.transform(x=>x==='true'||x==='1'))])"];
const date=['l.date()',"z.string().refine(iso).transform(x=>new Date(x))","v.pipe(v.string(),v.check(iso),v.transform(x=>new Date(x)))"];
const fieldObject=(expressions)=>expressions.map((e,i)=>`${['l','z','v'][i]}.object({value:${e}})`);
export const profiles=[];
const add=(id,feature,expressions,valid,invalid,probes=[],config={})=>profiles.push({id,feature,expressions,valid,invalid,probes:[...valid,...invalid,...probes],...config});
const field=(id,feature,expressions,valid,invalid,probes=[],config={})=>add(id,feature,fieldObject(expressions),valid.map(value=>({value})),invalid.map(value=>({value})),probes.map(value=>({value})),config);
field('string-basic','string', ['l.string()','z.string()','v.string()'],['hello',''],[42,null],[undefined,'😀']);
field('string-trim','string.trim/min/max', ['l.string({trim:true,min:2,max:6})','z.string().trim().refine(x=>x.length>=2&&x.length<=6)','v.pipe(v.string(),v.trim(),v.minLength(2),v.maxLength(6))'],['  abc  ','abcdef'],[' a ','abcdefg'],['😀😀😀','😀😀😀😀'],{note:'Zod 4.6.5 native string min/max count Unicode code points; this parity fixture explicitly checks UTF-16 length to match loculus/Valibot.'});
field('string-pattern','string.pattern', ['l.string({pattern:/^[a-z]+$/})','z.string().regex(/^[a-z]+$/)','v.pipe(v.string(),v.regex(/^[a-z]+$/))'],['abc'],['ABC','a1'],['',null]);
field('number-decimal','number',number,['12.5','-2.5e2',12.5],['',' ','0x10','Infinity',true,NaN,Infinity],['+1','.5','1.','1e309',null]);
field('number-inclusive','number.gte/lte/integer',["l.number({integer:true,gte:1,lte:100})",`${number[1]}.pipe(z.number().int().gte(1).lte(100))`,`v.pipe(${number[2]},v.safeInteger(),v.minValue(1),v.maxValue(100))`],['1','100',50],['0','101','1.5'],['9007199254740992']);
field('number-exclusive','number.gt/lt',["l.number({gt:0,lt:1})",`${number[1]}.pipe(z.number().gt(0).lt(1))`,`v.pipe(${number[2]},v.check(x=>x>0&&x<1))`],['.5',0.5],['0','1'],['-1']);
field('boolean','boolean',boolean,['true','false','1','0',true,false],['yes','',1,null],[undefined]);
for(const count of [2,32]){
 const values=Array.from({length:count},(_,i)=>`value-${i}`);const list=JSON.stringify(values);
 field(`enum-${count}`,'enum',[`l.enum(${list})`,`z.enum(${list})`,`v.picklist(${list})`],[values[0],values.at(-1)],['missing',42],[null]);
}
field('literal','literal',["l.literal('ready')","z.literal('ready')","v.literal('ready')"],['ready'],['other',null]);
field('date','date',date,['2026-10-11','2024-02-29','2026-10-11T09:00:00+09:00'],['2026-02-30','not-date',null],['2026-13-01','2026-10-11T25:00:00Z',42]);
const presence=[
 ['required','{}','z.string()','v.string()',false,false],
 ['optional','{optional:true}','z.string().optional()','v.optional(v.string())',true,false],
 ['nullable','{nullable:true}','z.string().nullable()','v.nullable(v.string())',false,true],
 ['nullish','{nullish:true}','z.string().nullish()','v.nullish(v.string())',true,true],
 ['optional-nullable','{optional:true,nullable:true}','z.string().optional().nullable()','v.nullish(v.string())',true,true],
 ['default','{default:"D"}','z.string().default("D")','v.optional(v.string(),"D")',true,false],
 ['optional-default','{optional:true,default:"D"}','z.string().default("D")','v.optional(v.string(),"D")',true,false],
 ['nullable-default','{nullable:true,default:"D"}','z.string().nullable().default("D")','v.optional(v.nullable(v.string()),"D")',true,true],
 ['nullish-default','{nullish:true,default:"D"}','z.string().nullable().default("D")','v.optional(v.nullable(v.string()),"D")',true,true],
 ['target-undefined','{default:{undefined:"U"}}','z.string().default("U")','v.optional(v.string(),"U")',true,false],
 ['target-null','{default:{null:"N"}}','z.union([z.string(),z.null().transform(()=>"N")])','v.nullable(v.string(),"N")',false,true],
 ['optional-target-null','{optional:true,default:{null:"N"}}','z.union([z.string(),z.null().transform(()=>"N")]).optional()','v.optional(v.nullable(v.string(),"N"))',true,true],
 ['nullable-target-undefined','{nullable:true,default:{undefined:"U"}}','z.string().nullable().default("U")','v.optional(v.nullable(v.string()),"U")',true,true],
 ['target-both','{default:{undefined:"U",null:"N"}}','z.union([z.string(),z.null().transform(()=>"N")]).default("U")','v.optional(v.nullable(v.string(),"N"),"U")',true,true],
 ['target-nullish','{default:{nullish:"D"}}','z.string().nullish().transform(x=>x??"D")','v.nullish(v.string(),"D")',true,true],
 ['nullish-target-nullish','{nullish:true,default:{nullish:"D"}}','z.string().nullish().transform(x=>x??"D")','v.nullish(v.string(),"D")',true,true],
];
for(const [name,opts,z,v,u,n] of presence){
 const good=[{value:'hello'},...(u?[{}, {value:undefined}]:[]),...(n?[{value:null}]:[])];
 const bad=[{value:42},...(!u?[{}]:[]),...(!n?[{value:null}]:[])];
 add('presence-'+name,'FieldOptions presence/default',fieldObject([`l.string(${opts})`,z,v]),good,bad,[{value:''},{value:'null'}]);
}
field('number-nullish-default','number/default',["l.number({default:{nullish:0}})",`z.preprocess(x=>x===''?null:x,${number[1]}.nullish().transform(x=>x??0))`,`v.pipe(v.unknown(),v.transform(x=>x===''?null:x),v.nullish(${number[2]},0))`],['42','',null,undefined],[' ','oops']);
field('boolean-default','boolean/default',["l.boolean({default:false})",`${boolean[1]}.default(false)`,`v.optional(${boolean[2]},false)`],['true',undefined],['yes',null]);
field('enum-default','enum/default',["l.enum(['a','b'],{default:'a'})","z.enum(['a','b']).default('a')","v.optional(v.picklist(['a','b']),'a')"],['b',undefined],['c',null]);
field('date-default','date/default',["l.date({default:new Date('2026-10-11T00:00:00Z')})",`${date[1]}.default(new Date('2026-10-11T00:00:00Z'))`,`v.pipe(v.optional(v.pipe(v.string(),v.check(iso)),'2026-10-11'),v.transform(x=>new Date(x)))`],['2026-10-12',undefined],['invalid',null]);
const stringArray=['l.array(l.string(),{wrapScalar:true})',"z.union([z.array(z.string()),z.string().transform(x=>[x])])","v.union([v.array(v.string()),v.pipe(v.string(),v.transform(x=>[x]))])"];
field('array-wrap','array.wrapScalar',stringArray,['a',['a','b'],[]],[42,[1,'b']],[null,undefined]);
field('array-strict','array default (wrapScalar=false)',["l.array(l.string())","z.array(z.string())","v.array(v.string())"],[['a','b'],[]],['a',[1]],[null]);
field('array-bounds','array.min/max',["l.array(l.string(),{wrapScalar:true,min:2,max:3})",`${stringArray[1]}.pipe(z.array(z.string()).min(2).max(3))`,`v.pipe(${stringArray[2]},v.minLength(2),v.maxLength(3))`],[['a','b'],['a','b','c']],['a',[],['a','b','c','d']]);
field('array-number','array(number)',[`l.array(${number[0]},{wrapScalar:true})`,`z.union([z.array(${number[1]}),${number[1]}.transform(x=>[x])])`,`v.union([v.array(${number[2]}),v.pipe(${number[2]},v.transform(x=>[x]))])`],[['1','2'],'3'],[['bad','2'],[true]],[[]]);
field('array-inner-nullable','array/null',["l.array(l.string({nullable:true}),{wrapScalar:true})","z.union([z.array(z.string().nullable()),z.string().nullable().transform(x=>[x])])","v.union([v.array(v.nullable(v.string())),v.pipe(v.nullable(v.string()),v.transform(x=>[x]))])"],[[null,'a'],null],[42,[1]]);
field('array-default','array/default',["l.array(l.string(),{wrapScalar:false,default:{undefined:['general'],null:[]}})","z.union([z.array(z.string()),z.null().transform(()=>[])]).default(['general'])","v.optional(v.nullable(v.array(v.string()),[]),['general'])"],[["a"],undefined,null],['a',[1]]);
field('transform-field','transform(field)',["l.transform(l.string(),x=>x.toUpperCase())","z.string().transform(x=>x.toUpperCase())","v.pipe(v.string(),v.transform(x=>x.toUpperCase()))"],['hello'],[42]);
field('refine-field','refine(field)',["l.refine(l.number(),x=>x%2===0,'even')",`${number[1]}.refine(x=>x%2===0,'even')`,`v.pipe(${number[2]},v.check(x=>x%2===0,'even'))`],['2',4],['3','bad']);
for(const mode of ['strip','strict','passthrough'])add('object-'+mode,'object.unknownKeys',[`l.object({name:l.string()},{unknownKeys:'${mode}'})`,`${mode==='strict'?'z.strictObject':mode==='passthrough'?'z.looseObject':'z.object'}({name:z.string()})`,`${mode==='strict'?'v.strictObject':mode==='passthrough'?'v.looseObject':'v.object'}({name:v.string()})`],[{name:'a'},...(mode==='strict'?[]:[{name:'a',extra:'kept?'}])],[{name:42},...(mode==='strict'?[{name:'a',extra:1}]:[])],[null,[],{}]);
add('refine-object','refine(object)',["l.refine(l.object({a:l.number(),b:l.number()}),x=>x.a<x.b,'order')",`z.object({a:${number[1]},b:${number[1]}}).refine(x=>x.a<x.b,'order')`,`v.pipe(v.object({a:${number[2]},b:${number[2]}}),v.check(x=>x.a<x.b,'order'))`],[{a:'1',b:'2'}],[{a:'2',b:'1'}]);
add('transform-object','transform(object)',["l.transform(l.object({name:l.string()}),x=>({name:x.name.toUpperCase()}))","z.object({name:z.string()}).transform(x=>({name:x.name.toUpperCase()}))","v.pipe(v.object({name:v.string()}),v.transform(x=>({name:x.name.toUpperCase()})))"],[{name:'hello'}],[{name:42}]);
const branches=["[l.object({kind:l.literal('a'),name:l.string()}),l.object({kind:l.literal('b'),count:l.number()})]",`[z.object({kind:z.literal('a'),name:z.string()}),z.object({kind:z.literal('b'),count:${number[1]}})]`,`[v.object({kind:v.literal('a'),name:v.string()}),v.object({kind:v.literal('b'),count:${number[2]}})]`];
for(const [id,good]of [['first',{kind:'a',name:'hello'}],['last',{kind:'b',count:'3'}]])add('union-'+id,'union',branches.map((b,i)=>`${['l.union','z.union','v.union'][i]}(${b})`),[good],[{kind:'c'}, {kind:'b',count:'bad'}]);
add('discriminated-union','discriminatedUnion',branches.map((b,i)=>`${['l.discriminatedUnion','z.discriminatedUnion','v.variant'][i]}('kind',${b})`),[{kind:'a',name:'hello'},{kind:'b',count:'3'}],[{kind:'c'}, {kind:'b',count:'bad'}],[{}]);
add('xor','xor',[`l.xor(${branches[0]})`,`z.xor(${branches[1]})`,`(()=>{const options=${branches[2]};return v.pipe(v.unknown(),v.rawTransform(({dataset,addIssue,NEVER})=>{const results=options.map(s=>v.safeParse(s,dataset.value));const matches=results.filter(r=>r.success);if(matches.length!==1){addIssue({message:'Exactly one'});return NEVER;}return matches[0].output;}));})()`],[{kind:'a',name:'hello'},{kind:'b',count:'3'}],[{kind:'c'}],[],{nativeValibot:false,note:'Valibot has no xor export; rawTransform tests prebuilt branches. Included as a composition example, not native xor performance.'});
add('xor-overlap','xor overlap',["l.xor([l.object({a:l.string({optional:true})}),l.object({b:l.string({optional:true})})])","z.xor([z.object({a:z.string().optional()}),z.object({b:z.string().optional()})])","v.pipe(v.unknown(),v.check(x=>[v.object({a:v.optional(v.string())}),v.object({b:v.optional(v.string())})].filter(s=>v.safeParse(s,x).success).length===1),v.transform(x=>v.parse(v.union([v.object({a:v.optional(v.string())}),v.object({b:v.optional(v.string())})]),x)))"],[{a:'hello',b:42}],[{}, {a:'a',b:'b'}],[],{nativeValibot:false,note:'Valibot xor uses a custom composition; no native xor export.'});
add('intersection','intersection',["l.intersection(l.object({a:l.string()}),l.object({b:l.string()}))","z.intersection(z.object({a:z.string()}),z.object({b:z.string()}))","v.intersect([v.object({a:v.string()}),v.object({b:v.string()})])"],[{a:'a',b:'b'}],[{a:42,b:42},{}]);
for(const format of ['url','form'])add('entries-'+format,'fromEntries / '+format,["l.object({search:l.string(),tag:l.array(l.string(),{wrapScalar:true,optional:true})})","z.object({search:z.string(),tag:z.union([z.array(z.string()),z.string().transform(x=>[x])]).optional()})","v.object({search:v.string(),tag:v.optional(v.union([v.array(v.string()),v.pipe(v.string(),v.transform(x=>[x]))]))})"],[{search:'hello',tag:['a','b']},{search:'hello',tag:'a'}],[{tag:['a','b']}],[],{format});
for(const method of ['safeParse','parse'])add('entry-'+method,method,["l.object({name:l.string()})","z.object({name:z.string()})","v.object({name:v.string()})"],[{name:'hello'}],[{name:42}],[],{method});
for(const count of [0,1,100])add('width-'+count,'object width',Array.from({length:3},(_,i)=>`${['l','z','v'][i]}.object({${Array.from({length:count},(_,k)=>`f${k}:${['l.string()','z.string()','v.string()'][i]}`).join(',')}})`),[Object.fromEntries(Array.from({length:count},(_,k)=>['f'+k,'hello']))],count?[{}]:[null]);
for(const p of [...profiles]){if(!p.expressions.every(e=>/^[lzv]\.object\(\{value:.*\}\)$/s.test(e)))continue;profiles.push({...p,id:'scalar-'+p.id,feature:p.feature+' / standalone field',expressions:p.expressions.map(e=>e.match(/^[lzv]\.object\(\{value:(.*)\}\)$/s)[1]),valid:p.valid.map(x=>x.value),invalid:p.invalid.map(x=>x.value),probes:p.probes.map(x=>x.value)});}
for(const profile of profiles){
 if(profile.id==='intersection')profile.expressions[0]="l.intersection(l.object({a:l.string()},{unknownKeys:'strip'}),l.object({b:l.string()},{unknownKeys:'strip'}))";
 if(!['object-strip','intersection'].includes(profile.id)){
  profile.expressions[1]=profile.expressions[1].replaceAll('z.object(','z.strictObject(');
  profile.expressions[2]=profile.expressions[2].replaceAll('v.object(','v.strictObject(');
 }
 if(profile.id==='xor-overlap'){
  profile.valid=[{a:'hello'}];profile.invalid.push({a:'hello',b:42});profile.probes=[...profile.valid,...profile.invalid];
 }
}
export const coverage = {string:['string-basic','string-trim','string-pattern'],number:['number-decimal','number-inclusive','number-exclusive'],boolean:['boolean'],enum:['enum-2','enum-32'],literal:['literal'],date:['date','date-default'],array:profiles.filter(p=>p.id.startsWith('array-')).map(p=>p.id),FieldOptions:profiles.filter(p=>p.id.startsWith('presence-')).map(p=>p.id),transform:['transform-field','transform-object'],refine:['refine-field','refine-object'],object:['object-strip','object-strict','object-passthrough','width-0','width-1','width-100'],union:['union-first','union-last'],xor:['xor','xor-overlap'],discriminatedUnion:['discriminated-union'],intersection:['intersection'],fromEntries:['entries-url','entries-form'],parse:['entry-parse'],safeParse:['entry-safeParse'],compile:'All eligible object profiles also run compile/JIT mode'};
