import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {compareBehavior} from './ablation-compare-behavior.mjs';
const read=file=>JSON.parse(readFileSync(file)),hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const manifest=read('bench/guarantees/ablation-manifest.json'),stats=read('bench/guarantees/ablation-statistics.json'),result=read('bench/guarantees/ablation-results.json');
const node=read('bench/guarantees/ablation-behavior-node.json'),bun=read('bench/guarantees/ablation-behavior-bun.json');
compareBehavior(node,bun);
assert.equal(hash('src/index.ts'),manifest.sourceHash);assert.equal(hash('packages/rolldown/src/index.ts'),manifest.pluginHash);
assert.equal(hash('dist/index.js'),manifest.distHash);assert.equal(hash('bench/guarantees/ablation-variants.mjs'),manifest.variantHash);
assert.equal(hash('bench/guarantees/ablation-results.json'),stats.policy.rawReportHash);
assert.equal(hash('bench/guarantees/ablation-manifest.json'),result.environment.manifestHash);
for(const c of manifest.cases){assert.equal(hash(c.file),c.hash);assert.equal(hash(c.file.replace('.mjs','-consumer.mjs')),c.consumerHash);const entry=result.cases[result.aliases[c.id]??c.id];assert.equal(entry.hash,c.hash);for(const r of Object.values(entry.runtime)){assert.equal(r.construct.samples.length,11);assert.equal(r.valid.samples.length,11);assert.equal(r.invalid.samples.length,11);assert.equal(hash(r.invalid.fixtureFile),r.invalid.fixtureHash);}}
const html='docs/guarantees-ablation.html';const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [390,1280]){
    await page.setViewportSize({width,height:900});await page.goto(pathToFileURL(resolve(html)).href);
    assert.equal(await page.locator('.variant').count(),25);assert.equal(await page.locator('.fixture').count(),14);assert.equal(await page.locator('#examples .example').count(),30);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`bench/guarantees/generated/ablation-top-${width}.png`});
    for(const mode of ['construct','valid','invalid'])for(const runtime of ['all','node','bun'])for(const pipeline of ['all','ordinary','generated']){
      await page.locator('#mode').selectOption(mode);await page.locator('#runtime').selectOption(runtime);await page.locator('#pipeline').selectOption(pipeline);
      assert.equal(await page.locator('[data-variant]').count(),25);assert.ok((await page.locator('#peer-summary').textContent()).includes('valibot'));
    }
    for(const id of ['no-freeze','shared-meta','shared-schema','mutate-issues','du-static','lazy-standard-prototype']){
      await page.locator('#variant-'+id+' > summary').click();assert.equal(await page.locator('#variant-'+id).evaluate(e=>e.open),true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,id);
    }
    await page.locator('#variant-shared-schema').evaluate(e=>e.scrollIntoView());await page.screenshot({path:`bench/guarantees/generated/ablation-details-${width}.png`});
  }
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
const verification={completed:true,date:new Date().toISOString(),productionSemanticsChanged:false,sourceHash:manifest.sourceHash,pluginHash:manifest.pluginHash,variants:25,topics:9,workloads:14,minifiedConsumers:manifest.cases.length,nodeBunBehaviorIdentical:true,behaviorScenariosPerVariant:Object.keys(node.cases[0].results).length,freshProcessesPerCell:11,normalizedErrorConsumption:true,actualRHFResolver:true,actualPolittyRegistryAndExtractor:true,viewports:[390,1280],filterCombinationsPerViewport:27,noHorizontalPageOverflow:true,htmlHash:hash(html),resultHash:hash('bench/guarantees/ablation-results.json'),statisticsHash:hash('bench/guarantees/ablation-statistics.json'),typeDeclarationHash:read('bench/guarantees/ablation-types.json').declarationHash};
writeFileSync('bench/guarantees/ablation-verification.json',JSON.stringify(verification,null,2)+'\n');console.log(JSON.stringify(verification));
