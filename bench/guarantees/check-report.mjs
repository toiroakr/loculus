import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
if(process.argv.includes('--ablation')){await import('./ablation-check-report.mjs');process.exit(0);}
const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const node=JSON.parse(readFileSync('bench/guarantees/probe-node.json'));
const bun=JSON.parse(readFileSync('bench/guarantees/probe-bun.json'));
assert.deepEqual(node.cases,bun.cases);assert.deepEqual(node.details,bun.details);
mkdirSync('bench/guarantees/generated',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:900});
  await page.goto(pathToFileURL(resolve('docs/guarantees-comparison.html')).href);
  assert.equal(await page.locator('#losses tbody tr').count(),5);
  assert.equal(await page.locator('details.case').count(),10);
  assert.equal(await page.locator('.example').count(),30);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`bench/guarantees/generated/report-top-${width}.png`});
  for(const item of node.cases){
   await page.locator(`#case-${item.id} > summary`).click();
   assert.equal(await page.locator(`#case-${item.id}`).evaluate(e=>e.open),true);
   assert.equal(await page.locator(`#case-${item.id} .example pre`).count(),3);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,item.id);
   await page.locator(`#case-${item.id} > summary`).click();
  }
  await page.locator('a[href="#case-exposed-shape-replacement"]').first().click();
  assert.equal(await page.locator('#case-exposed-shape-replacement').evaluate(e=>e.open),true);
  await page.locator('#case-exposed-shape-replacement').evaluate(e=>{document.documentElement.style.scrollBehavior='auto';e.scrollIntoView();});
  await page.screenshot({path:`bench/guarantees/generated/report-${width}.png`});
 }
 assert.deepEqual(errors,[]);
 const report={completed:true,date:new Date().toISOString(),runtimes:[node.runtime,bun.runtime],behaviorCases:10,threeLibraryExamples:30,nodeBunResultsIdentical:true,viewports:[390,1280],noHorizontalPageOverflow:true,report:'docs/guarantees-comparison.html',htmlSha256:digest('docs/guarantees-comparison.html'),probeNodeSha256:digest('bench/guarantees/probe-node.json'),probeBunSha256:digest('bench/guarantees/probe-bun.json'),codeHashes:node.codeHashes,performanceRerun:false,productionSemanticsChanged:false};
 for(const [file,hash]of Object.entries(node.codeHashes))assert.equal(digest(file),hash,file);
 writeFileSync('bench/guarantees/verification.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{await browser.close();}
