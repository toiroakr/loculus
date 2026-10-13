const [name='baseline',profile='width-100',mode='valid',optimized='plain']=process.argv.slice(2);
const l=await import(new URL(name+'.mjs',import.meta.url));
const opaque=profile.startsWith('opaque-width-');
const width=profile.startsWith('width-')?+profile.slice(6):opaque?+profile.slice(13):undefined;
const create=()=>{
 let shape,input;
 if(width!==undefined){
  shape=Object.fromEntries(Array.from({length:width},(_,i)=>['f'+i,opaque&&i===0?l.transform(l.string(),x=>x+'!'):l.string()]));
 }else if(profile==='mixed'){
  shape={name:l.string({min:1}),port:l.number({integer:true,gte:1,lte:65535,default:3000}),verbose:l.boolean({optional:true}),mode:l.enum(['dev','prod'])};
 }else if(profile==='optional'){
  shape={a:l.string({optional:true}),b:l.string({optional:true}),c:l.string({optional:true})};
 }else throw Error('Unknown profile');
 const base=l.object(shape);
 return optimized==='compiled'?l.compile(base):base;
};
const good=width!==undefined?Object.fromEntries(Array.from({length:width},(_,i)=>['f'+i,'hello'])):profile==='mixed'?{name:'app',port:'8080',mode:'prod'}:{};
const bad=width!==undefined?{}:profile==='mixed'?{name:42,port:'bad',mode:'invalid'}:{a:42,b:42,c:42};
const data=mode==='invalid'?bad:good;
const schema=create();const constructing=mode==='construct';
const iterations=constructing?1000:20000,warmup=constructing?500:10000;
let checksum=0;
const run=()=>{const result=(constructing?create():schema)['~standard'].validate(data);checksum+=result.issues?result.issues.length:Object.keys(result.value).length;};
for(let i=0;i<warmup;i++)run();
const samples=[];
for(let round=0;round<9;round++){
 const start=performance.now();for(let i=0;i<iterations;i++)run();samples.push((performance.now()-start)*1e6/iterations);
}
console.log(JSON.stringify({name,profile,mode,optimized,runtime:process.versions,iterations,warmup,samples,checksum}));
