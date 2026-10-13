import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir=new URL('./',import.meta.url);
const source=readFileSync(new URL('mixed-compile-baseline3.ts.txt',dir),'utf8');
const replace=(text,from,to)=>{if(!text.includes(from))throw Error('Missing '+from);return text.replace(from,to)};
const variants={};
for(const threshold of [0,4]){
 let candidate=source;
 const start=candidate.indexOf('function compiledRemainder('),end=candidate.indexOf('function compileArray(',start);
 let remainder=candidate.slice(start,end);
 remainder=replace(remainder,'  first?: Result<any>,','  first?: Result<any>,\n  firstRead?: { readonly issues?: readonly Issue[]; readonly value: unknown },');
 remainder=replace(remainder,'    if (result.issues) issues = appendCompiledIssues(issues, result.issues, key);','    if (i === start && firstRead ? firstRead.issues : result.issues) issues = appendCompiledIssues(issues, result.issues!, key);');
 remainder=replace(remainder,'    else if (result.value !== undefined || own(raw, key)) output[key] = result.value;','    else if ((i === start && firstRead ? firstRead.value : result.value) !== undefined || own(raw, key)) output[key] = result.value;');
 candidate=candidate.slice(0,start)+remainder+candidate.slice(end);
 candidate=replace(candidate,'    const statements = keys.map((key, i) => {','    const checks = plans.map((plan, i) => plan?.kind === "array" ? "array" : compiledCheck(plan, `v${i}`));\n    const statements = keys.map((key, i) => {');
 candidate=replace(candidate,'      if (plans[i]?.kind === "array") return','      if (checks[i] === "array") return');
 const original='      return `${prefix}if(!(${compiledCheck(plans[i], `v${i}`)})){start=${i};break fast;}`;';
 const continuation=readFileSync(new URL('mixed-compile-continuation.txt',dir),'utf8').trimEnd();
 candidate=replace(candidate,original,continuation.replace('ELIGIBLE',threshold?'checks.slice(i + 1).filter(check => check !== "false").length >= 4':'true'));
 candidate=replace(candidate,'let start,first;','let start,first,firstRead;');
 candidate=replace(candidate,'return remainder(raw,start,{${properties}},keys,validators,first);','return remainder(raw,start,{${properties}},keys,validators,first,firstRead);');
 const name='mixed-compile-exact-'+(threshold||'all');variants[name]=candidate;
}
{
 let candidate=variants['mixed-compile-exact-all'];
 candidate=replace(candidate,'    const checks = plans.map((plan, i) => plan?.kind === "array" ? "array" : compiledCheck(plan, `v${i}`));',`    const wide = keys.length >= 32;
    const checks = wide ? plans.map((plan, i) => plan?.kind === "array" ? "array" : compiledCheck(plan, \`v\${i}\`)) : undefined;
    const suffix = checks ? new Array<number>(keys.length + 1) : undefined;
    if (suffix && checks) {
      suffix[keys.length] = 0;
      for (let i = keys.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1]! + (checks[i] !== "false" ? 1 : 0);
    }`);
 candidate=replace(candidate,'      if (checks[i] === "array") return','      if (checks ? checks[i] === "array" : plans[i]?.kind === "array") return');
 candidate=replace(candidate,'      const check = checks[i]!;','      const check = checks ? checks[i]! : compiledCheck(plans[i], `v${i}`);');
 candidate=replace(candidate,'      if (true) {',`      const plan = plans[i];
      if (checks && suffix![i + 1]! >= 4 && (check === "false" || plan && (plan.optional || plan.nullable || plan.nullish || own(plan, "default")))) {`);
 candidate=replace(candidate,'let start,first,firstRead;','\${wide ? "let start,first,firstRead;" : "let start,first;"}');
 candidate=replace(candidate,'keys,validators,first,firstRead);','keys,validators,first\${wide ? ",firstRead" : ""});');
 variants['mixed-compile-wide-presence']=candidate;
}
{
 let candidate=variants['mixed-compile-wide-presence'];
 candidate=replace(candidate,'    const statements = keys.map((key, i) => {','    let continuing = false;\n    const statements = keys.map((key, i) => {');
 candidate=replace(candidate,'        const fallback =','        continuing = true;\n        const fallback =');
 candidate=replace(candidate,'wide ? "let start,first,firstRead;"','continuing ? "let start,first,firstRead;"');
 candidate=replace(candidate,'wide ? ",firstRead"','continuing ? ",firstRead"');
 variants['mixed-compile-wide-selective']=candidate;
}
const hash=s=>createHash('sha256').update(s).digest('hex');
const manifest={baselineHash:hash(source),candidates:Object.entries(variants).map(([name,contents])=>{writeFileSync(new URL(name+'.ts.txt',dir),contents);return {name,sourceHash:hash(contents)}})};
writeFileSync(new URL('mixed-compile-manifest.json',dir),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest));
