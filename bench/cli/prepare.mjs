import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { profiles } from './fixtures.mjs';

let source = readFileSync(new URL('../coverage/prepare.mjs', import.meta.url), 'utf8');
const replace = (from, to) => {
  if (!source.includes(from)) throw Error('Missing prepare fragment: ' + from);
  source = source.replace(from, to);
};
replace("'bench/coverage/generated'+(baseline?'/before':'')", "'bench/cli/generated'+(baseline?'/before':'')");
replace("'bench/coverage/before-optimization/index.ts.txt'", "'bench/cli/baseline.ts.txt'");
replace("const sourceFile=option('--source')??(baseline?'bench/cli/baseline.ts.txt':undefined);", "const sourceFile=option('--source')??(baseline?'bench/cli/baseline.ts.txt':'src/index.ts');");
replace('const summarize=r=>r.issues?{ok:false,issueCount:r.issues.length}:{ok:true,value:clean(r.value)};', "const summarize=r=>r.issues?{ok:false,issueCount:r.issues.length,issuePaths:r.issues.map(issue=>(issue.path??[]).map(part=>part!==null&&typeof part==='object'&&'key'in part?part.key:part))}:{ok:true,value:clean(r.value)};");
replace("if(!baseline&&!option('--out-dir'))writeFileSync('bench/coverage/coverage.json',JSON.stringify(coverage,null,2)+'\\n');", '');
mkdirSync('bench/cli/generated', { recursive: true });
writeFileSync(new URL('prepare.generated.mjs', import.meta.url), source);
writeFileSync('bench/cli/fixtures.json', JSON.stringify({ profiles }, null, 2) + '\n');
console.log('Prepared isolated CLI generator.');
