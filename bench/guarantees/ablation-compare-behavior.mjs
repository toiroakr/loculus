import assert from 'node:assert/strict';
export function compareBehavior(node,bun){
  const normalize=report=>report.cases.map(c=>{
    const item=structuredClone(c);
    if(item.results.frozenIssue.error==='TypeError')item.results.frozenIssue.message='Runtime readonly issue assignment error';
    return item;
  });
  assert.deepEqual(normalize(node),normalize(bun));
  assert.deepEqual(node.generatedChecks,bun.generatedChecks);
}
