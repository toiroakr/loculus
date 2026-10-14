import {test} from "node:test";
import assert from "node:assert/strict";
import {benchmarkSummary} from "../bench/ci/summary.mjs";

test("benchmark report aligns four libraries and keeps runtime, size, and shared type measurements distinct", () => {
  const libraries = ["loculus", "generated", "zod", "valibot"];
  const runtime = Object.fromEntries(libraries.map((library, index) => [library, {
    valid: [99, 1, 2].map(value => ({median: value * (index + 1)})),
  }]));
  const summary = benchmarkSummary({
    protocol: {modes: ["valid"]},
    cases: [{id: "example", runtime: {node: runtime, bun: runtime}, bundle: Object.fromEntries(
      libraries.map((library, index) => [library, {bytes: (index + 1) * 100, gzipBytes: (index + 1) * 50}]),
    )}],
    types: Object.fromEntries(["loculus", "zod", "valibot"].map((library, index) => [library, [{
      wallMs: index + 1, checkSeconds: (index + 1) / 10, instantiations: (index + 1) * 10, memoryKiB: (index + 1) * 100,
    }]])),
  });
  assert.equal(summary.match(/<details>/g)?.length, 4);
  assert.equal(summary.match(/<\/details>/g)?.length, 4);
  for (const title of ["Node latency (ns/op)", "Bun latency (ns/op)", "Browser ESM bundles (bytes)", "TypeScript input/output inference"]) {
    assert.ok(summary.includes(`<details>\n<summary>${title}</summary>\n\n|`));
  }
  assert.equal(summary.match(/Loculus \| Loculus \+ Rolldown \| Zod \| Valibot/g)?.length, 4);
  assert.equal(summary.match(/\| example \| valid \| 2\.0 \| 4\.0 \| 6\.0 \| 8\.0 \|/g)?.length, 2);
  assert.ok(summary.includes("| example | minified | 100 | 200 | 300 | 400 |"));
  assert.ok(summary.includes("| example | gzip | 50 | 100 | 150 | 200 |"));
  assert.ok(summary.includes("| Check time (s) | 0.100 | 0.100 | 0.200 | 0.300 |"));
  assert.ok(summary.includes("rather than a separate compiler run"));
});
