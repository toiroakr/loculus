export function make(l,profile){
 if(profile==='transform-100'||profile==='default-100'){
  const shape=Object.fromEntries(Array.from({length:100},(_,i)=>['f'+i,i?l.string():profile==='transform-100'?l.transform(l.string(),value=>value+'!'):l.string({default:'fallback'})]));
  const good=Object.fromEntries(Array.from({length:100},(_,i)=>['f'+i,'v'+i]));if(profile==='default-100')delete good.f0;
  const bad={...good,f50:42};return {schema:l.object(shape),good,bad};
 }
 if(profile==='query-12'){
  const shape={page:l.number({integer:true,gte:1,default:1}),limit:l.number({integer:true,gte:1,lte:100,default:20}),q:l.string({optional:true,max:200}),sort:l.enum(['new','old']),tags:l.array(l.string(),{default:[]}),expanded:l.boolean({default:false}),locale:l.string(),category:l.string(),owner:l.string(),view:l.string(),format:l.string(),source:l.string()};
  const good={sort:'new',locale:'ja',category:'all',owner:'me',view:'list',format:'json',source:'web'};
  return {schema:l.object(shape),good,bad:{...good,limit:'999',format:42}};
 }
 throw Error('Unknown diagnostic profile: '+profile);
}
