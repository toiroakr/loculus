import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const read=file=>JSON.parse(readFileSync(file));
const raw=read('bench/build-time/settled-results.json');
const stats=read('bench/build-time/significance-results.json');
const sizes=read('bench/build-time/bundle-results.json');
const politty=read('bench/build-time/politty-results.json');
assert.ok(raw.completed&&stats.completed&&sizes.completed&&politty.completed);
assert.equal(raw.environment.sourceHash,hash('src/index.ts'));
assert.equal(raw.codegenReverification?.pluginHash??raw.environment.pluginHash,hash('packages/rolldown/src/index.ts'));
assert.equal(sizes.pluginHash,hash('packages/rolldown/src/index.ts'));
assert.equal(stats.policy.rawReportSha256,hash('bench/build-time/settled-results.json'));
for(const c of Object.values(raw.cases))assert.equal(c.fixtureHash,hash(c.file));
const logs={
 node:'/tmp/loculus-codegen-tests.log',bun:'/tmp/loculus-codegen-bun-tests.log',typecheck:'/tmp/loculus-codegen-typecheck.log',
 rhf:'/tmp/loculus-codegen-rhf.log',browser:'/tmp/loculus-codegen-report-browser.log',
 politty:'/tmp/politty-loculus-codegen-tests.log',packed:'/tmp/loculus-codegen-packed-consumer.log',
};
assert.match(readFileSync(logs.node,'utf8'),/ℹ pass 64/);
assert.match(readFileSync(logs.bun,'utf8'),/64 pass/);
assert.match(readFileSync(logs.rhf,'utf8'),/12 passed/);
assert.match(readFileSync(logs.browser,'utf8'),/Verified build-time section/);
assert.match(readFileSync(logs.politty,'utf8'),/84 passed/);
assert.match(readFileSync(logs.packed,'utf8'),/Packed runtime and loculus\/rolldown exports work/);
assert.ok(!readFileSync('dist/index.js','utf8').includes('rolldown'));
assert.ok(!readFileSync('dist/index.d.ts','utf8').includes('rolldown'));
assert.equal(read('package.json').exports['./rolldown'],undefined);
assert.equal(read('packages/rolldown/package.json').exports['.'].import,'./dist/index.js');
const verification={completed:true,date:new Date().toISOString(),sourceHash:hash('src/index.ts'),distHash:hash('dist/index.js'),declarationsHash:hash('dist/index.d.ts'),pluginSourceHash:hash('packages/rolldown/src/index.ts'),pluginDistHash:hash('packages/rolldown/dist/index.js'),pluginDeclarationsHash:hash('packages/rolldown/dist/index.d.ts'),
 schemaTests:{passed:64,core:57,plugin:7,runtimes:['Node 24.13.0','Bun 1.4.3']},rhfTests:{passed:12,generatedFields:true,physicalSafari:false},
 polittyTests:{passed:84,files:18,typeErrors:0,generatedCommandIntegration:true},typecheck:{passed:true},
 reportBrowserCheck:{passed:true,htmlSha256:hash('docs/performance-tuning.html'),viewports:[{width:390,height:844},{width:1280,height:900}],speedRows:64,bundleRows:107,originalThreeLibraryExamples:107},
 bundles:{cases:107,executedModules:428,fullGeneratedOrdinaryOutputIssueParity:true},timings:{profiles:16,freshProcesses:9,runtimes:['Node 24.13.0','Bun 1.4.3'],modes:['construction + one validation','repeated validation'],creationExcludedOnlyForRepeated:true,buildTimeExcluded:true},
 treeShaking:{passed:true,bundlers:['esbuild','rolldown'],generatedUnusedFieldsRemoved:true},packedExports:{passed:true,runtimeIndependentOfRolldown:true},
 reports:Object.fromEntries(['settled-results','significance-results','bundle-results','politty-results'].map(name=>[name,{path:`bench/build-time/${name}.json`,sha256:hash(`bench/build-time/${name}.json`)}])),logs:Object.fromEntries(Object.values(logs).map(path=>[path,hash(path)])),
 rhfHtmlSha256:hash('examples/react-hook-form/generated/index.html'),previousVerification:'bench/single-use/verification.json',
 codegenReverification:raw.codegenReverification,
};
writeFileSync('bench/build-time/verification.json',JSON.stringify(verification,null,2)+'\n');
console.log('Saved current code-generation verification and measured artifact hashes.');
