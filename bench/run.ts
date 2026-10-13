import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import * as v from "valibot";
import * as l from "../src/index.js";

const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const lnum = () => l.number({ integer: true, gte: 1, lte: 65535 });
const znum = () =>
  z
    .union([z.string().regex(decimal).transform(Number), z.number()])
    .pipe(z.number().int().min(1).max(65535));
const vnum = () =>
  v.pipe(
    v.union([v.pipe(v.string(), v.regex(decimal), v.transform(Number)), v.number()]),
    v.safeInteger(),
    v.minValue(1),
    v.maxValue(65535),
  );
const lbool = () => l.boolean();
const zbool = () =>
  z.union([
    z.boolean(),
    z.enum(["true", "false", "1", "0"]).transform((x) => x === "true" || x === "1"),
  ]);
const vbool = () =>
  v.union([
    v.boolean(),
    v.pipe(
      v.picklist(["true", "false", "1", "0"]),
      v.transform((x) => x === "true" || x === "1"),
    ),
  ]);
const names = ["loculus", "zod", "valibot"] as const;
const cases: Record<
  string,
  {
    schemas: any[];
    valid: Record<string, unknown>;
    invalid: Record<string, unknown>;
    sources: string[];
  }
> = {};
for (const count of [3, 30]) {
  const shapes: Record<string, any>[] = [{}, {}, {}];
  const valid: Record<string, unknown> = {};
  for (let i = 0; i < count; i++) {
    shapes[0]![`f${i}`] = l.string({ min: 1, max: 100 });
    shapes[1]![`f${i}`] = z.string().min(1).max(100);
    shapes[2]![`f${i}`] = v.pipe(v.string(), v.minLength(1), v.maxLength(100));
    valid[`f${i}`] = "hello";
  }
  const expressions = [
    "l.string({min:1,max:100})",
    "z.string().min(1).max(100)",
    "v.pipe(v.string(),v.minLength(1),v.maxLength(100))",
  ];
  cases[`strings-${count}`] = {
    schemas: [l.object(shapes[0]!), z.object(shapes[1]!), v.object(shapes[2]!)],
    valid,
    invalid: { ...valid, f0: "" },
    sources: expressions.map(
      (expr, index) =>
        `export const schema=${["l", "z", "v"][index]}.object({${Array.from({ length: count }, (_, i) => `f${i}:${expr}`).join(",")}});`,
    ),
  };
}
cases.cli = {
  schemas: [
    l.object({
      name: l.string({ min: 1 }),
      port: l.number({ integer: true, gte: 1, lte: 65535, default: 3000 }),
      verbose: l.boolean({ optional: true }),
      mode: l.enum(["dev", "prod"]),
    }),
    z.object({
      name: z.string().min(1),
      port: znum().default(3000),
      verbose: zbool().optional(),
      mode: z.enum(["dev", "prod"]),
    }),
    v.object({
      name: v.pipe(v.string(), v.minLength(1)),
      port: v.optional(vnum(), 3000),
      verbose: v.optional(vbool()),
      mode: v.picklist(["dev", "prod"]),
    }),
  ],
  valid: { name: "app", port: "8080", verbose: "false", mode: "prod" },
  invalid: { name: "", port: "wrong", verbose: "yes", mode: "test" },
  sources: [
    "export const schema=l.object({name:l.string({min:1}),port:l.number({integer:true,gte:1,lte:65535,default:3000}),verbose:l.boolean({optional:true}),mode:l.enum(['dev','prod'])});",
    `const decimal=${decimal}; export const schema=z.object({name:z.string().min(1),port:z.union([z.string().regex(decimal).transform(Number),z.number()]).pipe(z.number().int().min(1).max(65535)).default(3000),verbose:z.union([z.boolean(),z.enum(['true','false','1','0']).transform(x=>x==='true'||x==='1')]).optional(),mode:z.enum(['dev','prod'])});`,
    `const decimal=${decimal}; export const schema=v.object({name:v.pipe(v.string(),v.minLength(1)),port:v.optional(v.pipe(v.union([v.pipe(v.string(),v.regex(decimal),v.transform(Number)),v.number()]),v.safeInteger(),v.minValue(1),v.maxValue(65535)),3000),verbose:v.optional(v.union([v.boolean(),v.pipe(v.picklist(['true','false','1','0']),v.transform(x=>x==='true'||x==='1'))])),mode:v.picklist(['dev','prod'])});`,
  ],
};
const imports = [
  "import * as l from './dist/index.js';",
  "import {z} from 'zod';",
  "import * as v from 'valibot';",
];
const report: any = {
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    versions: Object.fromEntries(
      ["typescript", "zod", "valibot", "esbuild"].map((name) => [
        name,
        JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8")).version,
      ]),
    ),
    date: new Date().toISOString(),
  },
  runtime: {},
  bundle: {},
  typecheck: {},
};
let sink = 0;
for (const [caseName, c] of Object.entries(cases)) {
  for (const dataset of ["valid", "invalid"] as const) {
    const input = c[dataset];
    report.runtime[`${caseName}/${dataset}`] = {};
    for (let j = 0; j < 3; j++) {
      const validate = c.schemas[j]["~standard"].validate;
      const sample = validate(input);
      if (Boolean(sample.issues) !== (dataset === "invalid")) throw Error("Semantic mismatch");
      if (
        dataset === "valid" &&
        JSON.stringify(sample.value) !==
          JSON.stringify(c.schemas[0]["~standard"].validate(input).value)
      )
        throw Error("Output mismatch");
      for (let i = 0; i < 10000; i++) {
        const r = validate(input);
        sink += r.issues ? r.issues.length : Object.keys(r.value).length;
      }
      const durations: number[] = [];
      for (let round = 0; round < 7; round++) {
        const start = performance.now();
        for (let i = 0; i < 50000; i++) {
          const r = validate(input);
          sink += r.issues ? r.issues.length : Object.keys(r.value).length;
        }
        durations.push(((performance.now() - start) * 1e6) / 50000);
      }
      durations.sort((a, b) => a - b);
      report.runtime[`${caseName}/${dataset}`][names[j]!] = {
        medianNs: Math.round(durations[3]!),
        minNs: Math.round(durations[0]!),
        maxNs: Math.round(durations[6]!),
      };
    }
  }
  report.bundle[caseName] = {};
  for (let j = 0; j < 3; j++) {
    const bundle = await build({
      stdin: {
        contents:
          imports[j]! +
          c.sources[j]! +
          "export const validate=(input)=>schema['~standard'].validate(input);",
        resolveDir: process.cwd(),
        loader: "ts",
      },
      bundle: true,
      minify: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false,
    });
    const bytes = bundle.outputFiles![0]!.contents;
    report.bundle[caseName][names[j]!] = { bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
  }
}
mkdirSync("bench/generated", { recursive: true });
const stringRequired = [
  "l.string({min:1})",
  "z.string().min(1)",
  "v.pipe(v.string(),v.minLength(1))",
];
const stringOptional = [
  "l.string({min:1,optional:true})",
  "z.string().min(1).optional()",
  "v.optional(v.pipe(v.string(),v.minLength(1)))",
];
const mixedExpressions = [
  [
    stringRequired[0]!,
    "l.number({optional:true,integer:true,gte:1,lte:65535})",
    "l.boolean({optional:true})",
    "l.enum(['dev','prod'],{optional:true})",
    "l.array(l.string(),{wrapScalar:true,optional:true})",
  ],
  [
    stringRequired[1]!,
    "z.union([z.string().regex(decimal).transform(Number),z.number()]).pipe(z.number().int().min(1).max(65535)).optional()",
    "z.union([z.boolean(),z.enum(['true','false','1','0']).transform(x=>x==='true'||x==='1')]).optional()",
    "z.enum(['dev','prod']).optional()",
    "z.union([z.array(z.string()),z.string().transform(x=>[x])]).optional()",
  ],
  [
    stringRequired[2]!,
    "v.optional(v.pipe(v.union([v.pipe(v.string(),v.regex(decimal),v.transform(Number)),v.number()]),v.safeInteger(),v.minValue(1),v.maxValue(65535)))",
    "v.optional(v.union([v.boolean(),v.pipe(v.picklist(['true','false','1','0']),v.transform(x=>x==='true'||x==='1'))]))",
    "v.optional(v.picklist(['dev','prod']))",
    "v.optional(v.union([v.array(v.string()),v.pipe(v.string(),v.transform(x=>[x]))]))",
  ],
];
const profiles = ["required-strings", "optional-strings", "mixed-query"] as const;
report.typecheckCases = {};
for (const profile of profiles) {
  report.typecheckCases[profile] = {};
  for (let j = 0; j < 3; j++) {
    const name = names[j]!;
    const filename = `${profile}-${name}`;
    let source = imports[j]!.replace("./dist", "../../dist") + `const decimal=${decimal};`;
    const expressions =
      profile === "mixed-query"
        ? mixedExpressions[j]!
        : [profile === "required-strings" ? stringRequired[j]! : stringOptional[j]!];
    const fields = Array.from(
      { length: 30 },
      (_, i) => `f${i}:${expressions[i % expressions.length]}`,
    ).join(",");
    const output =
      profile === "required-strings"
        ? Array.from({ length: 30 }, (_, i) => `f${i}:'hello'`).join(",")
        : profile === "mixed-query"
          ? Array.from({ length: 6 }, (_, i) => `f${i * 5}:'hello'`).join(",")
          : "f0:'hello'";
    for (let k = 0; k < 100; k++)
      source += `\nconst s${k}=${["l", "z", "v"][j]}.object({${fields}}); export type O${k}=${j === 0 ? `l.Output<typeof s${k}>` : j === 1 ? `z.infer<typeof s${k}>` : `v.InferOutput<typeof s${k}>`}; export const value${k}:O${k}={${output}};`;
    writeFileSync(`bench/generated/${filename}.ts`, source);
    writeFileSync(
      `bench/generated/${filename}.json`,
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: [],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          target: "ES2022",
        },
        files: [`./${filename}.ts`],
      }),
    );
    report.typecheckCases[profile][name] = [];
  }
  for (let round = 0; round < 5; round++)
    for (let offset = 0; offset < 3; offset++) {
      const name = names[(round + offset) % 3]!;
      const output = execFileSync(
        fileURLToPath(new URL("../node_modules/.bin/tsc", import.meta.url)),
        ["-p", `bench/generated/${profile}-${name}.json`, "--extendedDiagnostics"],
        { encoding: "utf8" },
      );
      const metrics: Record<string, string> = {};
      for (const line of output.split("\n")) {
        const split = line.indexOf(":");
        if (split > 0) metrics[line.slice(0, split)] = line.slice(split + 1).trim();
      }
      report.typecheckCases[profile][name].push(metrics);
    }
}
report.typecheck = report.typecheckCases["optional-strings"];
report.sink = sink;
writeFileSync("bench/results.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const lines = [
  "# Measured results",
  "",
  `Node ${report.environment.node}, ${report.environment.platform}/${report.environment.arch}. Versions: ${Object.entries(
    report.environment.versions,
  )
    .map(([name, version]) => `${name} ${version}`)
    .join(", ")}.`,
  "",
  "These measurements cover the fixtures in [the protocol](README.md). Smaller is better.",
  "",
  "| Validation (ns, median) | loculus | Zod | Valibot |",
  "|---|---:|---:|---:|",
];
for (const [name, values] of Object.entries(report.runtime))
  lines.push(
    `| ${name} | ${names.map((library) => (values as any)[library].medianNs).join(" | ")} |`,
  );
lines.push("", "| Browser bundle (gzip bytes) | loculus | Zod | Valibot |", "|---|---:|---:|---:|");
for (const [name, values] of Object.entries(report.bundle))
  lines.push(
    `| ${name} | ${names.map((library) => (values as any)[library].gzipBytes).join(" | ")} |`,
  );
lines.push(
  "",
  "| Type check (seconds, median of 5) | loculus | Zod | Valibot |",
  "|---|---:|---:|---:|",
);
for (const profile of profiles)
  lines.push(
    `| ${profile} | ${names.map((library) => median(report.typecheckCases[profile][library].map((sample: any) => parseFloat(sample["Check time"])))).join(" | ")} |`,
  );
lines.push("", "| Type instantiations | loculus | Zod | Valibot |", "|---|---:|---:|---:|");
for (const profile of profiles)
  lines.push(
    `| ${profile} | ${names.map((library) => report.typecheckCases[profile][library][0].Instantiations).join(" | ")} |`,
  );
lines.push(
  "",
  "Each type fixture declares 100 schemas with 30 fields. Optional fields use constructor flags. Timing depends on schema shape, engine, compiler and machine; this is not a universal performance guarantee.",
  "",
);
writeFileSync("bench/RESULTS.md", lines.join("\n"));
