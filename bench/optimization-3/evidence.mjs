import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const read = path => JSON.parse(readFileSync(path));
export const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
export function performance(name, sourceHash = hash('src/index.ts')) {
  const path = `bench/optimization-3/${name}.json`;
  const report = read(path);
  assert.equal(report.completed, true, name);
  if (report.environment.sourceHash === sourceHash) return report;
  const proof = read('bench/optimization-3/ordinary-worker-equivalence.json');
  assert.equal(proof.completed, true);
  assert.equal(proof.sourceHash, sourceHash);
  const evidence = proof.reports[name.replace('significance', 'settled')];
  assert.ok(evidence, name);
  assert.equal(evidence.measuredSourceHash, report.environment.sourceHash);
  assert.equal(name.includes('significance') ? evidence.significanceHash : evidence.reportHash, hash(path));
  return report;
}
