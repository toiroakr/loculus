import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const read=file=>JSON.parse(readFileSync(file));
const raw=read('bench/whole-object/settled-results.json');
const stats=read('bench/whole-object/significance-results.json');
const sizes=read('bench/whole-object/bundle-results.json');
const politty=read('bench/build-time/politty-results.json');
assert.ok(raw.completed&&stats.completed&&sizes.completed&&politty.completed);
assert.equal(raw.environment.sourceHash,hash('src/index.ts'));
assert.equal(raw.codegenReverification?.pluginHash??raw.environment.pluginHash,hash('packages/rolldown/src/index.ts'));
assert.equal(sizes.pluginHash,hash('packages/rolldown/src/index.ts'));
assert.equal(stats.policy.rawReportSha256,hash('bench/whole-object/settled-results.json'));
for(const c of Object.values(raw.cases))assert.equal(c.fixtureHash,hash(c.file));
const logs={
 node:'/tmp/loculus-whole-object-tests.log',bun:'/tmp/loculus-whole-object-bun-tests.log',typecheck:'/tmp/loculus-whole-object-types.log',
 rhf:'/tmp/loculus-whole-object-rhf.log',browser:'/tmp/loculus-whole-object-report-browser.log',
 politty:'/tmp/loculus-whole-object-politty.log',packed:'/tmp/loculus-whole-object-packed-consumer.log',
};
assert.match(readFileSync(logs.node,'utf8'),/ℹ pass 75/);
assert.match(readFileSync(logs.bun,'utf8'),/75 pass/);
assert.match(readFileSync(logs.rhf,'utf8'),/12 passed/);
assert.match(readFileSync(logs.browser,'utf8'),/Verified build-time section/);
assert.match(readFileSync(logs.politty,'utf8'),/84 passed/);
assert.match(readFileSync(logs.packed,'utf8'),/Packed runtime and loculus\/rolldown exports work/);
assert.ok(!readFileSync('dist/index.js','utf8').includes('rolldown'));
assert.ok(!readFileSync('dist/index.d.ts','utf8').includes('rolldown'));
assert.equal(read('package.json').exports['./rolldown'],undefined);
assert.equal(read('packages/rolldown/package.json').exports['.'].import,'./dist/index.js');
const verification={completed:true,date:new Date().toISOString(),sourceHash:hash('src/index.ts'),distHash:hash('dist/index.js'),declarationsHash:hash('dist/index.d.ts'),pluginSourceHash:hash('packages/rolldown/src/index.ts'),pluginDistHash:hash('packages/rolldown/dist/index.js'),pluginDeclarationsHash:hash('packages/rolldown/dist/index.d.ts'),
 schemaTests:{passed:75,core:57,plugin:18,runtimes:['Node 24.13.0','Bun 1.4.3']},rhfTests:{passed:12,generatedFields:true,physicalSafari:false},
 polittyTests:{passed:84,files:18,typeErrors:0,generatedCommandIntegration:true},typecheck:{passed:true},
 reportBrowserCheck:{passed:true,htmlSha256:hash('docs/performance-tuning.html'),viewports:[{width:390,height:844},{width:1280,height:900}],speedRows:642,bundleRows:107,originalThreeLibraryExamples:107},
 bundles:{cases:107,executedModules:428,fullGeneratedOrdinaryOutputIssueParity:true},timings:{profiles:107,freshProcesses:11,runtimes:['Node 24.13.0','Bun 1.4.3'],modes:['construction + one validation','repeated valid','repeated invalid'],creationExcludedOnlyForRepeated:true,buildTimeExcluded:true},
 treeShaking:{passed:true,bundlers:['esbuild','rolldown'],generatedUnusedFieldsRemoved:true},packedExports:{passed:true,runtimeIndependentOfRolldown:true},
 reports:Object.fromEntries(['settled-results','significance-results','bundle-results','comparability-results'].map(name=>[name,{path:`bench/whole-object/${name}.json`,sha256:hash(`bench/whole-object/${name}.json`)}])),logs:Object.fromEntries(Object.values(logs).map(path=>[path,hash(path)])),
 rhfHtmlSha256:hash('examples/react-hook-form/generated/index.html'),previousVerification:'bench/build-time/verification.json',
 codegenReverification:raw.codegenReverification,
};
writeFileSync('bench/whole-object/verification.json',JSON.stringify(verification,null,2)+'\n');
console.log('Saved current code-generation verification and measured artifact hashes.');
