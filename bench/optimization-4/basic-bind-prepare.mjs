import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
const dir='bench/optimization-4';const variants={};
for(const name of ['basic-identity','basic-fused-indexed']){
 const s=readFileSync(dir+'/'+name+'.ts.txt','utf8');const start=s.indexOf('  const validate = (input: unknown) => {');const end=s.indexOf('\n  };',start)+5;
 const body=s.slice(start+s.slice(start).indexOf('\n')+1,end-5);
 const helper=`function validateObject(keys: readonly string[], input: unknown) {\n${body}\n}\n`;
 variants[name+'-bind']=s.slice(0,start)+'  const validate = validateObject.bind(undefined, keys);'+s.slice(end)+'\n'+helper;
 variants[name+'-shared']=s.slice(0,start)+'  const validate = (input: unknown) => validateObject(keys, input);'+s.slice(end)+'\n'+helper;
}
const m=JSON.parse(readFileSync(dir+'/manifest.json'));for(const[name,contents]of Object.entries(variants)){writeFileSync(dir+'/'+name+'.ts.txt',contents);m.candidates.push({name,sourceHash:createHash('sha256').update(contents).digest('hex')});}writeFileSync(dir+'/manifest.json',JSON.stringify(m,null,2)+'\n');
