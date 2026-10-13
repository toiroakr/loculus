# MoonBit feasibility experiment

This directory contains an experimental MoonBit validation core, built from the same source to JavaScript and Wasm GC. It is not the shipped loculus implementation and is not included in the npm package.

## Reproduce

Requirements: the installed MoonBit toolchain recorded in `results.json`, Node 24 with Wasm GC and JS string builtins, and the repository's development dependencies.

```sh
moon -C experiments/moonbit build --release --target js
moon -C experiments/moonbit build --release --target wasm-gc
pnpm build
node experiments/moonbit/prepare.mjs
node experiments/moonbit/verify.mjs
node experiments/moonbit/bench.mjs
```

`prepare.mjs` derives the three existing string-input fixtures from `bench/run.ts`. The experiment adds a native string/boolean/number object and repeated strings. Generated code is ignored by Git.

## Architecture

- `core/core.mbt` builds reusable field descriptors and validates flat objects. The same file implements string length checks, a decimal grammar scanner, finite/safe-integer/bound checks, boolean conversions, enum membership, string arrays and presence/default handling.
- The JS backend inlines the host operations from `core/host_js.mbt`.
- The Wasm GC backend imports corresponding functions from `host.mjs` for dynamic JS value inspection, own-property access, number conversion and result construction. JS string builtins allow strings to cross directly, avoiding JSON serialization and UTF-8 buffer copying.
- `adapter.mjs` exposes synchronous Standard Schema v1 validation. Wasm compilation/instantiation is asynchronous initialization outside the timed validation loop.
- Both backends return JS output objects and issue paths, not a validity boolean. The typed `loculus` constructor API is not ported to this experiment.

The installed compiler supports the newer `foreign_library` package and `#export_name` exports. See [MoonBit FFI](https://docs.moonbitlang.com/en/stable/language/ffi.html) and [JS string builtins](https://www.moonbitlang.com/blog/js-string-builtins).

## Verification and scope

`verify.mjs` performs 586 compatibility comparisons across the two backends, covering accepted/rejected inputs, successful outputs and issue paths: undefined, null, explicit missing properties, defaults with separate null/undefined targets, inherited properties, dangerous keys, UTF-16 strings, decimal/exponent syntax, NaN/infinities, safe integers, inclusive/exclusive bounds, boolean spellings, enum choices, scalar wrapping and array errors. Every timed fixture also checks equal successful output or equal failure issue count against TypeScript.

This is a subset prototype. It does not implement the complete loculus API: regex/trim/date, arbitrary array element schemas, strict/passthrough objects, composite schemas, descriptions/Politty metadata and TypeScript inference are not provided. Error messages/codes are simplified. Therefore bundle sizes are for this subset and do not establish full-library equivalence. Type-check speed cannot be compared until a typed public binding exists. Callback support would require JS bindings; it is not measured here.

## Measurement protocol

Seven rounds of 50,000 validations after 10,000 warmups, rotating all seven candidates so each runs first once. Consume successful output keys or failed issue count. Report median/min/max and every round in `results.json`. Construct schemas and compiled parsers before runtime measurement. This follows the operation of `bench/run.ts`, not the upstream `parse` protocol.

The `native-object` fixture uses the schema shape from Zod's official object benchmark, but here uses one fixed input and Standard Schema validation with output consumption. Its times must not be compared directly with `bench/UPSTREAM-RESULTS.md`.

Candidates are normal TypeScript loculus, opt-in `l.compile`, MoonBit JS, MoonBit Wasm GC, normal Zod, `z.compile`, and Valibot. Neither compiler's initialization or generated parser construction is included in runtime latency. Zod's runtime compilation code remains in its bundle; this does not measure a separate generated AOT-only distribution.

Browser bundles use esbuild ESM/ES2022, minification and tree shaking, with schema declarations and validators exported. Wasm size includes both minified JS glue/configuration and the release Wasm binary; gzip bytes are the sum of separately compressed files. No HTTP headers, loader network latency or cache behavior is included.

`startup` records one process's JS import (including local module loading), Wasm compilation and instantiation times. Wasm binary reads and network are excluded. It is an observation, not a statistically repeated startup benchmark. `setup` records **total microseconds for 1,000 descriptor constructions**; divide by 1,000 for microseconds per construction. The separate `kernel` section only compares decimal recognition, including the JS-to-Wasm call but excluding object access and result construction. It is not full schema validation.

## Findings

In this prototype, MoonBit JS does not improve overall throughput or size over TypeScript. Wasm GC makes isolated decimal recognition faster on the measured strings, but full schema validation is slower even without string copying. The JS host operations and differences in the validation architecture remain part of the observed cost; this is not a measurement that isolates the language/compiler alone.

For the CLI's valid input, median latency is approximately 130 ns for normal TypeScript, 58 ns for compiled TypeScript, 142 ns for MoonBit JS, and 247 ns for MoonBit Wasm GC. Gzip sizes are 1,655 / 2,000 / 2,155 / 2,445 bytes respectively. The prototype has fewer features and simpler messages, yet no overall win in these cases. These results do not justify adopting it as the default backend now; they do not prove every possible MoonBit design would be slower.

The parallel TypeScript experiment produced an opt-in `compile(objectSchema)` API. Normal imports retain their original bundle size. Compiled strip-mode objects preserve callbacks, getter ordering, issue paths, shape snapshots and prototype safety. If dynamic code generation is blocked, or the schema uses strict/passthrough mode or an outer refinement, compilation returns the original schema.
