import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { cpus } from "node:os";
import { createHash } from "node:crypto";
import { Bench } from "tinybench";
import { z } from "zod";
import * as v from "valibot";
import * as l from "../src/index.js";

const source =
  "https://github.com/colinhacks/zod/blob/284243fb0d6532665afdc9239188773bb624f73c/packages/bench/";
const cases = [
  {
    name: "string",
    batch: 10000,
    data: () => `${Math.random()}`,
    loculus: l.string(),
    zod: z.string(),
    valibot: v.string(),
    code: ["l.string()", "z.string()", "v.string()"],
  },
  {
    name: "number",
    batch: 10000,
    data: () => Math.random(),
    loculus: l.number(),
    zod: z.number(),
    valibot: v.number(),
    code: ["l.number()", "z.number()", "v.number()"],
  },
  {
    name: "boolean",
    batch: 10000,
    data: () => Math.random() > 0.5,
    loculus: l.boolean(),
    zod: z.boolean(),
    valibot: v.boolean(),
    code: ["l.boolean()", "z.boolean()", "v.boolean()"],
  },
  {
    name: "array",
    batch: 1000,
    data: () => Array.from({ length: 3 }, () => randomString(10)),
    loculus: l.array(l.string(), { wrapScalar: false }),
    zod: z.array(z.string()),
    valibot: v.array(v.string()),
    code: [
      "l.array(l.string(), { wrapScalar: false })",
      "z.array(z.string())",
      "v.array(v.string())",
    ],
  },
  {
    name: "object",
    batch: 1000,
    data: () =>
      Object.freeze({
        number: Math.random(),
        string: `${Math.random()}`,
        boolean: Math.random() > 0.5,
      }),
    loculus: l.object({ string: l.string(), boolean: l.boolean(), number: l.number() }),
    zod: z.object({ string: z.string(), boolean: z.boolean(), number: z.number() }),
    valibot: v.object({ string: v.string(), boolean: v.boolean(), number: v.number() }),
    code: [
      "l.object({ string: l.string(), boolean: l.boolean(), number: l.number() })",
      "z.object({ string: z.string(), boolean: z.boolean(), number: z.number() })",
      "v.object({ string: v.string(), boolean: v.boolean(), number: v.number() })",
    ],
  },
];
function randomString(length: number): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, () =>
    characters.charAt(Math.floor(Math.random() * characters.length)),
  ).join("");
}
const libraries = ["loculus", "zod", "zod-compiled", "valibot"] as const;
type Library = (typeof libraries)[number];
interface Measurement {
  meanNs: number;
  rmePercent: number;
  samples: number;
}
const results: Record<string, Record<Library, Measurement[]>> = {};
const fixtures: Record<string, unknown[]> = {};
for (const c of cases) fixtures[c.name] = Array.from({ length: c.batch }, () => c.data());
for (const c of cases) {
  const compiled = z.compile(c.zod);
  const parsers: Record<Library, (input: unknown) => unknown> = {
    loculus: (input) => l.parse(c.loculus, input),
    zod: (input) => c.zod.parse(input),
    "zod-compiled": (input) => compiled.parse(input),
    valibot: (input) => v.parse(c.valibot, input),
  };
  const data = fixtures[c.name]!;
  for (const input of data)
    for (const lib of libraries) assert.deepStrictEqual(parsers[lib](input), input);
  results[c.name] = { loculus: [], zod: [], "zod-compiled": [], valibot: [] };
  for (let round = 0; round < 3; round++) {
    const bench = new Bench({ time: 1500 });
    const order = [...libraries.slice(round), ...libraries.slice(0, round)];
    for (const lib of order) {
      const parse = parsers[lib];
      bench.add(lib, () => {
        for (const input of data) parse(input);
      });
    }
    await bench.warmup();
    await bench.run();
    for (const task of bench.tasks) {
      const r = task.result;
      if (!r || r.error) throw r?.error ?? new Error("Missing benchmark result");
      results[c.name]![task.name as Library].push({
        meanNs: (r.mean * 1e6) / c.batch,
        rmePercent: r.rme,
        samples: r.samples.length,
      });
    }
    console.log(`${c.name}: round ${round + 1}/3 complete`);
  }
}
function version(name: string): string {
  return JSON.parse(
    readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), "utf8"),
  ).version;
}
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const summary = Object.fromEntries(
  Object.entries(results).map(([name, libs]) => [
    name,
    Object.fromEntries(
      libraries.map((lib) => [
        lib,
        { medianNs: median(libs[lib].map((r) => r.meanNs)), rounds: libs[lib] },
      ]),
    ),
  ]),
);
const report = {
  timestamp: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
    versions: Object.fromEntries(
      ["zod", "valibot", "tinybench"].map((name) => [name, version(name)]),
    ),
  },
  source,
  protocol: {
    timeMs: 1500,
    rounds: 3,
    warmup: "Tinybench 2.9 defaults; explicit warmup before run",
    operation: "parse valid data; no output consumption, matching upstream",
    compiled: "z.compile once outside timing",
    order: "rotate library order per round",
    sourceSha256: createHash("sha256")
      .update(readFileSync(new URL(import.meta.url)))
      .digest("hex"),
    fixtureSha256: createHash("sha256").update(JSON.stringify(fixtures)).digest("hex"),
  },
  fixtures,
  cases: cases.map((c) => ({
    name: c.name,
    batch: c.batch,
    source: `${source}${c.name}.ts`,
    input: c.data.toString(),
    code: c.code,
  })),
  results: summary,
};
writeFileSync(
  new URL("upstream-results.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
const rows = cases.map(
  (c) =>
    `| ${c.name} | ${libraries.map((lib) => summary[c.name]![lib]!.medianNs.toFixed(1)).join(" | ")} |`,
);
writeFileSync(
  new URL("UPSTREAM-RESULTS.md", import.meta.url),
  `# Upstream fixture comparison\n\nZod official valid parse fixtures, using Tinybench 2.9.0 with 1,500 ms per task and explicit warmup. Three rounds with rotated order; median of round means, nanoseconds per parsed input (smaller is better).\n\nNode ${process.version}, ${process.platform}/${process.arch}, ${cpus()[0]?.model}. Zod ${version("zod")}, Valibot ${version("valibot")}.\n\n| Case | loculus | Zod | Zod compiled | Valibot |\n|---|---:|---:|---:|---:|\n${rows.join("\n")}\n\nSee [protocol and scope](UPSTREAM.md), [runner](upstream.ts) and [raw measurements](upstream-results.json) for inputs, per-round error estimates and provenance.\n`,
);
console.table(
  Object.fromEntries(
    cases.map((c) => [
      c.name,
      Object.fromEntries(libraries.map((lib) => [lib, summary[c.name]![lib]!.medianNs.toFixed(1)])),
    ]),
  ),
);
