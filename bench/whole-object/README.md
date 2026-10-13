# Whole-object build-time generation

This extends the earlier [scalar-only experiment](../build-time/README.md). Its results are historical: `before/` preserves the old plugin, root runtime, measurements and bundle sizes. The current root runtime is unchanged; the plugin now generates complete static object validators as well as scalar factories.

## Measurement

All 107 profiles are measured, including Git log/clone, Cloudflare `cf deploy` and DNS records list, and RHF object arrays with 1/10/100 rows. Each library uses the same fixtures. Four consumers are bundled with Rolldown 1.2.13: ordinary Loculus, generated Loculus, Zod with jitless configuration, and Valibot. Export retention is identical. Minified consumers execute to verify outputs; generated/ordinary full values, issues and paths are compared for valid, invalid and probe inputs.

- Construction: all field/schema construction plus one valid validation.
- Repeated valid and repeated invalid: previously constructed schemas; no creation or code generation cost.
- Eleven fresh processes per condition, seven rounds targeting 8ms after 30ms warmup.
- Width 100 uses 500ms warmup for every library. This was chosen after strategy diagnostics showed large JSC variation at 30ms and 200ms, before the final full run.
- The latest 32 schemas and results are retained. Parsed values are recursively consumed, including nested arrays, booleans, numbers and dates, to prevent measuring unused work.
- Processes/libraries/profiles rotate in deterministic order; CPU benchmarks run sequentially without tests/builds in parallel.
- Exact two-sided Mann–Whitney permutation tests on independent process medians, tied ranks handled exactly; Holm family includes every measured profile, both engines and all three modes. Practical claims require significance and a difference of at least 10%.

Eleven processes permit useful exact p-values with the conservative full-family correction. No single best run is used. Uncertain does not mean equivalent. Cold process startup, parser/CLI startup, network, RHF rendering and build generation are outside these runtime timings. The report states invalid-workload incompatibilities separately where rejection outcomes differ across libraries.

The retained-result harness differs from historical key-count benchmarks. Its nanosecond values cannot be directly compared to older tables. Consumer exports also differ from older esbuild size measurements. Type checking still uses original TypeScript; this plugin does not improve the type checker itself.

## Optimizations and evidence

Static object generation removes runtime shape copying, key enumeration and validator-array preparation while retaining a fresh frozen shape. Inline scalar checks omit per-field successful result objects. Identical field runs use loops; long runs can use eight fixed keys per helper to avoid one enormous function. Error collection remains shared, including issue cloning and inherited `issues` accessors. Unsupported shapes/custom fields retain ordinary factories.

`strategy-results.json` and `chunk-results.json` are exploratory three-process comparisons of full unrolling, loops, scalar-only generation and groups of eight. `isolation-results.json` separately compares width 100 with 500ms warmup and no preceding construction mode. These diagnostics are not full statistical claims. `screening-results.json` is the earlier three-process screening before the final long-run strategy was selected. `probe-results.json` did not establish a benefit for removing empty-object allocation in the inherited-issue check, so that change was rejected.

Primary references informed experiments: [V8 property representation](https://v8.dev/blog/fast-properties), [JavaScriptCore speculation](https://webkit.org/blog/10308/speculation-in-javascriptcore/), [WebKit inlining and code size](https://webkit.org/blog/2826/unusual-speed-boost-size-matters/), and [Rolldown transformations](https://rolldown.rs/apis/plugin-api/transformations). These explain potential mechanisms; measured differences do not establish a specific VM-internal cause without profiling.

`objects: 'auto' | 'loop' | 'unroll' | 'chunked' | false` exposes the tradeoff. Whole-object code may be larger than the ordinary runtime in wide/complex consumers. Metadata identities, shape freezing, snapshots, own-property checks, callback/getter/setter order and full error behavior are retained instead of removed to improve a benchmark.

## Reproduction

```sh
pnpm build
node bench/whole-object/prepare.mjs
node bench/whole-object/prepare.generated.mjs
node bench/whole-object/run.mjs --processes=11
python3 bench/whole-object/significance.py
node bench/whole-object/render.mjs
```

The local Bun 1.4.3 executable is pinned in `experiments/bun/generated/tools/bun-darwin-aarch64/bun`. Raw files retain source/plugin hashes, consumer hashes, versions, per-process samples, checksums and environment. Run unit/tree-shaking, type checking, RHF browser, Politty adapter and packed-consumer verification before claiming a new final result.

Static scalar-element arrays now share validation functions and omit literal-option copies and validator closures. Parent object generation calls these private validators directly. Outer presence/default options and dynamic/object children fall back to ordinary arrays. Ten changed profiles were remeasured with eleven fresh processes per condition on both engines; the other 388 workers and their consumers remained byte-identical. `initial-*` preserves the first whole-object run, while `candidate-*` preserves the final array run. `codegenReverification` and per-condition measured hashes record the merge. Candidate worker region filenames are the only non-code difference from current worker files.

The empty-shape preventExtensions experiment retained frozen semantics but showed only a small construction change, so the original freeze was retained. Literal metadata keeps the original lazy frozen choices and setter; unbounded literal-validator caching and a duplicate metadata class were rejected rather than weakening cold-start/memory behavior or class identity. The final report explicitly retains remaining literal/empty-object/discriminated-union construction deficits and ordinary-versus-generated scalar reuse regressions.
