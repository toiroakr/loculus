import assert from 'node:assert/strict';

const objects=['width-0','width-1','literal','object-strict','strict-unknown-10','width-100','cli-git-clone-full','supplement-rhf-items-10'];
const enums=['scalar-literal','scalar-enum-2','scalar-enum-32','literal','discriminated-union','enum-metadata'];
export const variants=[
  {id:'baseline',topic:0,profiles:[...new Set([...objects,...enums,'scalar-string-basic'])]},
  {id:'no-freeze',topic:1,profiles:objects},
  {id:'no-copy',topic:2,profiles:['width-0','width-1','width-100','cli-git-clone-full']},
  {id:'freeze-caller',topic:2,profiles:['width-0','width-1','width-100']},
  {id:'enum-plain-lazy',topic:3,profiles:enums},
  {id:'enum-eager',topic:3,profiles:enums},
  {id:'enum-no-setter',topic:3,profiles:enums},
  {id:'enum-no-freeze',topic:3,profiles:enums},
  {id:'shared-meta',topic:4,profiles:['scalar-string-basic','width-1','width-100']},
  {id:'shared-standard',topic:4,profiles:['scalar-string-basic','width-1','width-100']},
  {id:'shared-schema',topic:4,profiles:['scalar-string-basic','width-1','width-100']},
  {id:'literal-validator-cache',topic:4,profiles:['scalar-literal','literal','discriminated-union']},
  {id:'lazy-standard',topic:5,profiles:['scalar-string-basic','scalar-literal','width-0','width-100','discriminated-union']},
  {id:'lazy-standard-prototype',topic:5,profiles:['scalar-string-basic','scalar-literal','width-0','width-100','discriminated-union','supplement-rhf-items-10']},
  {id:'no-own',topic:6,profiles:['width-1','width-100','cli-git-clone-full','supplement-rhf-items-10']},
  {id:'no-array-root-check',topic:6,profiles:['width-0','width-1','width-100']},
  {id:'unsafe-proto-write',topic:6,profiles:['width-1','width-100','cli-git-clone-full']},
  {id:'reject-proto-schema',topic:6,profiles:['width-0','width-1','width-100']},
  {id:'mutate-issues',topic:7,profiles:['width-1','width-100','supplement-rhf-items-10']},
  {id:'fresh-generated-issues',topic:7,profiles:['width-1','width-100','object-strict','supplement-rhf-items-10']},
  {id:'first-unknown',topic:7,profiles:['object-strict','strict-unknown-10']},
  {id:'live-validators',topic:8,profiles:['width-1','width-100','cli-git-clone-full']},
  {id:'eager-input',topic:8,profiles:['width-1','width-100','cli-git-clone-full']},
  {id:'du-lazy',topic:9,profiles:['discriminated-union']},
  {id:'du-no-duplicate-check',topic:9,profiles:['discriminated-union']},
  {id:'du-static',topic:9,profiles:['discriminated-union']},
];

function replace(source,from,to,required=true){
  if(required)assert.ok(source.includes(from),from);
  return source.replaceAll(from,to);
}
export function runtimeVariant(source,id){
  if(id==='no-freeze')return replace(source,'Object.freeze({ ...shape })','{ ...shape }');
  if(id==='no-copy')return replace(source,'Object.freeze({ ...shape })','shape');
  if(id==='freeze-caller')return replace(source,'Object.freeze({ ...shape })','Object.freeze(shape)');
  if(id.startsWith('enum-')){
    const start=source.indexOf('var EnumMeta = class {'),end=source.indexOf('/* @__NO_SIDE_EFFECTS__ */\nfunction enum_',start);
    assert.ok(start>=0&&end>start);
    let body=source.slice(start,end);
    if(id==='enum-no-freeze')body=body.replace('Object.freeze(typeof this.#source === "string" ? [this.#source] : [...this.#source])','(typeof this.#source === "string" ? [this.#source] : [...this.#source])');
    if(id==='enum-no-setter')body=body.replace(/\n\tset enumValues\(value\) \{[\s\S]*?\n\t\}/,'');
    if(id==='enum-plain-lazy')body=`function EnumMeta(source,description){let choices;return {kind:"string",description,get enumValues(){if(source!==undefined){choices=Object.freeze(typeof source==="string"?[source]:[...source]);source=undefined;}return choices;},set enumValues(value){source=undefined;choices=value;}};}\n`;
    if(id==='enum-eager')body=`function EnumMeta(source,description){return {kind:"string",description,enumValues:Object.freeze(typeof source==="string"?[source]:[...source])};}\n`;
    assert.notEqual(body,source.slice(start,end));return source.slice(0,start)+body+source.slice(end);
  }
  if(id==='literal-validator-cache'){
    source='const __literalCache=new Map();function __literalValidator(value){let fn=__literalCache.get(value);if(!fn){let message;fn=input=>typeof input==="string"&&input===value?{value}:fail(message??=`Expected one of: ${value}`);__literalCache.set(value,fn);}return fn;}\n'+source;
    return replace(source,'(input) => typeof input === "string" && input === value ? { value } : fail(message ??= `Expected one of: ${value}`)','__literalValidator(value)');
  }
  if(id==='no-own')return replace(source,'own(raw, key) ? raw[key] : void 0','raw[key]');
  if(id==='no-array-root-check')return replace(source,' || Array.isArray(input)','');
  if(id==='unsafe-proto-write')return source.replace(/if \(key === "__proto__"\) Object.defineProperty\(output, key, \{[\s\S]*?\}\);\s*else output\[key\] = result.value;/,'output[key] = result.value;');
  if(id==='reject-proto-schema')return replace(source,'const fields = Object.freeze({ ...shape });','if(Object.hasOwn(shape,"__proto__"))throw new TypeError("Unsupported schema key: __proto__");\n\tconst fields = Object.freeze({ ...shape });');
  if(id==='mutate-issues')return source.replaceAll(/\{\s*\.\.\.issue,\s*path: issue.path \? \[(key|i), \.\.\.issue.path\] : \[\1\]\s*\}/g,'(issue.path = issue.path ? [$1, ...issue.path] : [$1], issue)');
  if(id==='first-unknown')return replace(source,'if (!own(fields, key) && own(raw, key)) (issues ??= []).push({','if (!own(fields, key) && own(raw, key)) { (issues ??= []).push({').replace('path: [key]\n\t\t\t});','path: [key]\n\t\t\t});break;}');
  if(id==='live-validators')return replace(source,'validators.push(s["~standard"].validate);','').replace('validators[i](own(raw, key) ? raw[key] : void 0)','fields[key]["~standard"].validate(own(raw, key) ? raw[key] : void 0)');
  if(id==='eager-input')return replace(source,'for (let i = 0; i < keys.length; i++) {\n\t\t\tconst key = keys[i];','const inputs=keys.map(key=>own(raw,key)?raw[key]:void 0);\n\t\tfor (let i = 0; i < keys.length; i++) {\n\t\t\tconst key = keys[i];').replace('validators[i](own(raw, key) ? raw[key] : void 0)','validators[i](inputs[i])');
  if(id==='du-no-duplicate-check')return replace(source,'if (lookup.has(value)) throw new TypeError(`Duplicate discriminator: ${value}`);','');
  if(id==='du-lazy'){
    source=replace(source,'const lookup = /* @__PURE__ */ new Map();\n\tfor (const option of options) {','let lookup;const branches=Object.freeze([...options]);const initialize=()=>{lookup=new Map();\n\tfor (const option of branches) {');
    source=replace(source,'\treturn schema({\n\t\tkind: "union",\n\t\tdiscriminator: key,','};\n\treturn schema({\n\t\tkind: "union",\n\t\tdiscriminator: key,');
    source=replace(source,'discriminator: key,\n\t\toptions: Object.freeze([...options]),','discriminator: key,\n\t\toptions: branches,');
    return replace(source,'const selected = lookup.get(input[key]);','if(!lookup)initialize();\n\t\tconst selected = lookup.get(input[key]);');
  }
  return source;
}

function walk(node,visit){if(!node||typeof node!=='object')return;if(typeof node.type==='string')visit(node);for(const[k,v]of Object.entries(node)){if(k==='parent')continue;if(Array.isArray(v))for(const x of v)walk(x,visit);else if(v&&typeof v==='object')walk(v,visit);}}
export function transformedVariant(source,id,parse){
  if(id==='du-static')return source;
  if(!source.includes('__loculus_')&& !['lazy-standard','lazy-standard-prototype','shared-meta','shared-standard','shared-schema'].includes(id))return source;
  if(id==='no-freeze')source=source.replaceAll('Object.freeze(shape);','');
  if(id==='no-own')source=source.replace(/__loculus_\d+\(input,([^)]*)\)\?input\[([^\]]*)\]:void 0/g,'input[$2]');
  if(id==='no-array-root-check')source=source.replaceAll('||Array.isArray(input)','');
  if(id==='first-unknown')source=source.replace(/(\(issues\?\?=\[\]\)\.push\(\{message:[^;]*code:"unrecognized_key",path:\[key\]\}\);)/g,'{$1break;}');
  if(id==='mutate-issues')source=source.replaceAll('{...issue,path:issue.path?[key,...issue.path]:[key]}','(issue.path=issue.path?[key,...issue.path]:[key],issue)').replaceAll('{...issue,path:issue.path?[i,...issue.path]:[i]}','(issue.path=issue.path?[i,...issue.path]:[i],issue)');
  if(id==='fresh-generated-issues')source=source.replace(/return (__loculus_\d+)\(\{issues:\[\{message,code\}\]\},key,input,output,issues\);/g,'(issues??=[]).push({message,code,path:[key]});return issues;');
  if(id==='reject-proto-schema')source=source.replaceAll('Object.freeze(shape);','if(Object.hasOwn(shape,"__proto__"))throw new TypeError("Unsupported schema key: __proto__");Object.freeze(shape);');
  if(id==='unsafe-proto-write')source=source.replace(/if\(key==="__proto__"\)Object.defineProperty\(output,key,\{value:result.value,enumerable:true,writable:true,configurable:true\}\);else output\[key\]=result.value;/g,'output[key]=result.value;');
  if(['lazy-standard','lazy-standard-prototype','shared-meta','shared-standard','shared-schema'].includes(id)){
    const edits=[];const ast=parse(source);let helpers='';
    walk(ast,node=>{
      if(id==='lazy-standard-prototype'&&node.type==='ObjectExpression'&&!node.properties.some(p=>p.type==='SpreadElement')){
        const find=key=>node.properties.find(p=>(p.key?.value??p.key?.name)===key);
        const standard=find('~standard'),meta=find('meta');
        if(standard?.value.type==='ObjectExpression'&&meta){
          const validate=standard.value.properties.find(p=>(p.key?.value??p.key?.name)==='validate');
          const field=find('field'),shape=find('shape');
          if(validate){const text=p=>source.slice(p.value.start,p.value.end);edits.push({start:node.start,end:node.end,value:`new ${field?'__LazyField':shape?'__LazyObject':'__LazySchema'}(${text(meta)},${text(validate)}${shape?','+text(shape):''})`});}
        }
      }
      if(id==='shared-meta'&&node.type==='ObjectExpression'){
        const text=source.slice(node.start,node.end);
        if(/^\{\s*kind:\s*"string",\s*description:\s*(void 0|options.description)\s*\}$/.test(text))edits.push({start:node.start,end:node.end,value:text.includes('options.description')?`options.description===undefined?__sharedMeta:${text}`:'__sharedMeta'});
      }
      if(node.type!=='Property')return;const key=node.key?.value??node.key?.name;
      if(key==='~standard'&&node.value?.type==='ObjectExpression'&&id==='lazy-standard'){
        const std=source.slice(node.value.start,node.value.end);
        edits.push({start:node.start,end:node.end,value:`get "~standard"(){const value=${std};Object.defineProperty(this,"~standard",{value,enumerable:true,writable:true,configurable:true});return value;}`});
      }
      if(key==='~standard'&&node.value?.type==='ObjectExpression'&&id==='shared-standard'){
        const validate=node.value.properties.find(p=>(p.key?.value??p.key?.name)==='validate');
        assert.ok(validate);
        edits.push({start:node.value.start,end:node.value.end,value:`__shareStd(${source.slice(validate.value.start,validate.value.end)})`});
      }
    });
    if(id==='shared-meta')helpers='const __sharedMeta={kind:"string",description:undefined};\n';
    if(id==='lazy-standard-prototype')helpers='class __LazySchema{#validate;constructor(meta,validate){this.meta=meta;this.#validate=validate;}get "~standard"(){const value={version:1,vendor:"loculus",validate:this.#validate};Object.defineProperty(this,"~standard",{value,enumerable:true,writable:true,configurable:true});return value;}}class __LazyField extends __LazySchema{field=true;}class __LazyObject extends __LazySchema{constructor(meta,validate,shape){super(meta,validate);this.shape=shape;}}\n';
    if(id==='shared-standard')helpers='const __standards=new WeakMap();function __shareStd(validate){let cached=__standards.get(validate);if(!cached){cached={version:1,vendor:"loculus",validate};__standards.set(validate,cached);}return cached;}\n';
    if(id==='shared-schema'){
      walk(ast,node=>{if(node.type==='FunctionDeclaration'&&node.id?.name&&/^(__loculus_\d+|string)$/.test(node.id.name)){
        const text=source.slice(node.start,node.end);if(!text.includes('kind:"string"')&&!text.includes('kind: "string"'))return;
        if(node.params.length>0&&node.id.name!=='string')return;
        const bodyStart=node.body.start+1;
        const returns=node.body.body.filter(n=>n.type==='ReturnStatement');
        if(returns.length!==1)return;const ret=returns[0];
        if(node.id.name==='string')edits.push({start:bodyStart,end:bodyStart,value:'if(options===emptyOptions&&__sharedSchema)return __sharedSchema;'});
        else edits.push({start:bodyStart,end:bodyStart,value:'if(__sharedSchema)return __sharedSchema;'});
        edits.push({start:ret.argument.start,end:ret.argument.end,value:`${node.id.name==='string'?'options===emptyOptions?(__sharedSchema=':'(__sharedSchema='}${source.slice(ret.argument.start,ret.argument.end)})${node.id.name==='string'?':'+source.slice(ret.argument.start,ret.argument.end):''}`});
      }});helpers='let __sharedSchema;\n';
    }
    for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.value+source.slice(e.end);
    source=helpers+source;
  }
  return source;
}
