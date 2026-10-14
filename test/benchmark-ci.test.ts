import {test} from "node:test";
import assert from "node:assert/strict";
import {median, geometricMean, runtimeMetrics, metricSet, orderedEntries} from "../bench/ci/metrics.mjs";

test("octocov tracks only Loculus latency with equal case weights", () => {
  const samples = (values: number[]) => values.map(median => ({median}));
  const measured = (left: number[], right: number[]) => ({node: {
    loculus: {valid: samples(left)}, generated: {valid: samples(right)},
    zod: {valid: samples(right)}, valibot: {valid: samples(right)},
  }});
  const report = {protocol: {modes: ["valid"]}, cases: [
    {group: "scalars", runtime: measured([1, 2, 100], [100, 1, 2])},
    {group: "scalars", runtime: measured([1, 1, 1], [2, 2, 2])},
  ]};
  const metrics = runtimeMetrics(report, "node");
  assert.deepEqual(metrics.map(metric => metric.key), ["scalars/valid/loculus", "scalars/valid/generated"]);
  assert.deepEqual(metrics.map(metric => metric.unit), ["ns/op", "ns/op"]);
  assert.ok(Math.abs(metrics[0]!.value - Math.sqrt(2)) < 1e-10);
  assert.equal(metrics[1]!.value, 2);
  assert.equal(runtimeMetrics({...report, cases: report.cases.slice(0, 1)}, "node")[0]?.value, 2);
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

test("benchmark passes rotate both cases and peer order without dropping measurements", () => {
  const entries = ["a", "b"].flatMap(id => ["loculus", "generated", "zod", "valibot"].map(library => ({id, library})));
  const second = orderedEntries(entries, 1);
  assert.deepEqual(second.map(entry => entry.id), ["b", "b", "b", "b", "a", "a", "a", "a"]);
  assert.deepEqual(second.slice(0, 4).map(entry => entry.library), ["generated", "zod", "valibot", "loculus"]);
  for (let pass = 0; pass < 5; pass++) assert.deepEqual(new Set(orderedEntries(entries, pass)), new Set(entries));
});
