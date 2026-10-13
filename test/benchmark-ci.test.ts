import {test} from "node:test";
import assert from "node:assert/strict";
import {median, geometricMean, runtimeMetrics, metricSet} from "../bench/ci/metrics.mjs";

test("benchmark summaries use per-process paired ratios and equal case weights", () => {
  const samples = (values: number[]) => values.map(median => ({median}));
  const measured = (left: number[], right: number[]) => ({node: {
    loculus: {valid: samples(left)}, generated: {valid: samples(right)},
    zod: {valid: samples(right)}, valibot: {valid: samples(right)},
  }});
  const report = {protocol: {modes: ["valid"]}, cases: [
    {group: "scalars", runtime: measured([1, 2, 100], [100, 1, 2])},
    {group: "scalars", runtime: measured([1, 1, 1], [2, 2, 2])},
  ]};
  for (const metric of runtimeMetrics(report, "node")) assert.ok(Math.abs(metric.value - 100) < 1e-10);
  assert.equal(runtimeMetrics({...report, cases: report.cases.slice(0, 1)}, "node")[0]?.value, 200);
});

test("benchmark aggregates reject missing and invalid observations", () => {
  const values = [9, 1, 3];
  assert.equal(median(values), 3);
  assert.deepEqual(values, [9, 1, 3]);
  assert.equal(geometricMean([1, 4]), 2);
  assert.throws(() => median([]));
  assert.throws(() => median([NaN]));
  assert.throws(() => geometricMean([0]));
  assert.throws(() => metricSet("x", "X", {}, [{key: "x", value: Infinity}]));
  assert.throws(() => metricSet("x", "X", {}, [{key: "x", value: 1}, {key: "x", value: 2}]));
});
