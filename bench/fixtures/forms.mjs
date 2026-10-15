const numbers=[
 'l.number({integer:true,gte:1,lte:99})',
 'z.union([z.string().regex(decimal).transform(Number),z.number()]).pipe(z.number().int().gte(1).lte(99))',
 'v.pipe(v.union([v.pipe(v.string(),v.regex(decimal),v.transform(Number)),v.number()]),v.finite(),v.safeInteger(),v.minValue(1),v.maxValue(99))',
];
const expressions=[
 `l.object({title:l.string({trim:true,min:1}),items:l.array(l.object({name:l.string({trim:true,min:1}),quantity:${numbers[0]}}),{wrapScalar:false,min:1})})`,
 `z.object({title:z.string().trim().min(1),items:z.array(z.object({name:z.string().trim().min(1),quantity:${numbers[1]}})).min(1)})`,
 `v.object({title:v.pipe(v.string(),v.trim(),v.minLength(1)),items:v.pipe(v.array(v.object({name:v.pipe(v.string(),v.trim(),v.minLength(1)),quantity:${numbers[2]}})),v.minLength(1))})`,
];
const valid=rows=>({title:'  Order  ',items:Array.from({length:rows},(_,i)=>({name:`  Item ${i+1}  `,quantity:String(i%99+1)}))});
const probes=[
 {title:'Order'},
 {title:'Order',items:null},
 {title:'Order',items:undefined},
 {title:'Order',items:{name:'Item',quantity:'1'}},
 {title:'Order',items:[]},
 {title:'Order',items:[null]},
 {title:'Order',items:[42]},
 {title:'Order',items:[{name:'Item',quantity:''}]},
 {title:'Order',items:[{name:'Item',quantity:null}]},
 {title:'Order',items:[{name:'Item',quantity:' 1 '}]},
 {title:'Order',items:[{name:'Item',quantity:'0x10'}]},
 {title:'Order',items:[{name:'Item',quantity:'100'}]},
 {title:'Order',items:[{name:'Item',quantity:'1.5'}]},
 {title:'Order',items:[{}]},
 {title:' ',items:[{name:' ',quantity:'0'}]},
 {title:'Order',items:[{name:'Item',quantity:'+1'},{name:'Other',quantity:99}]},
 valid(101),
];
export const profiles=[1,10,100].map(rows=>{
 const good=valid(rows);const bad=structuredClone(good);bad.items[Math.floor(rows/2)]={name:' ',quantity:'0'};
 return {id:`supplement-rhf-items-${rows}`,feature:'RHF array(object) supplement',expressions,valid:[good],invalid:[bad],probes:[good,bad,...probes],note:`Predeclared supplement: ${rows} rows. Not part of the canonical 96 profiles. Trimmed strings; strict decimal quantity; strict array min1. Invalid middle row has two issues.`};
});
for(const profile of profiles){profile.expressions[1]=profile.expressions[1].replaceAll('z.object(','z.strictObject(');profile.expressions[2]=profile.expressions[2].replaceAll('v.object(','v.strictObject(');}
