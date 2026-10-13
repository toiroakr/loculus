# Bun comparison

Bun 1.4.3 is the latest stable GitHub release checked on 2026-10-11. The official macOS ARM64 download and checksum are recorded in `compiler.json`. No global installation was changed.

```sh
BUN_BIN=/absolute/path/to/bun pnpm bench:bun
BUN_BIN=/absolute/path/to/bun node experiments/bun/tree-shaking.mjs
node experiments/bun/summarize.mjs
```

The preparation step reuses the Perry experiment's schema definitions and probes. It produces identical prebuilt ESM for Node and Bun, then adds schema-construction measurements and explicit optimized variants. The base Zod mode uses `jitless:true`; the optimized mode enables JIT. The base loculus mode uses `object()`, and the optimized mode uses `compile(object())`. Valibot uses `object()`. Browser bundles and standalone executables cover the three base libraries; optimized variants are measured under Node and Bun JS.

Profiles are three required strings, thirty required strings (each min 1 / max 100, UTF-16), and four CLI fields: name, decimal safe integer port with inclusive bounds and undefined default, optional strict boolean, and enum. Invalid data is one empty string or four invalid CLI fields. Probes include missing fields, null, wrong types, excess length, unknown-key stripping, Unicode, defaults, decimal syntax and integer boundaries. Each runtime must match Node's values, success status and issue count before timing. Error text is not compared.

All builds and compression finish before timing. Candidates run sequentially in rotated order. Repeated validation has 10,000 warmups and 7 rounds in each of 3 fresh processes (21 samples). Each round performs 50,000 validations, or 10,000 for thirty strings. Outputs are consumed through key counts or issue counts and checksums are asserted.

Construction measurements recreate the schema for every valid validation, with 100 warmups and 500 iterations per round. Module imports are already initialized. Optimized measurements include compilation/JIT construction costs. They are separate from repeated validation and do not represent a cold CPU or process.

Cold execution uses 15 new processes per candidate. It includes process launch, imports and module initialization, schema construction, one valid validation, JSON printing and exit. This also includes fixture initialization. Build time is excluded. No `--bytecode` flag is used.

Browser bundle sizes use `bun build --target browser --format esm --minify`, exporting schema and Standard Schema validate, without the timing harness. Bundled behavior is checked. Standalone sizes use `bun build --compile --minify` and include Bun's runtime/JavaScript engine and the measurement application. They are not library-only sizes or Perry-style ahead-of-time machine code. The no-library baseline includes the same timer/JSON dependencies but a simple arithmetic loop. Gzip uses Node zlib defaults. MB denotes 1,000,000 bytes.

Tree-shaking checks reuse the existing fixtures, verifying unused package/import removal, namespace imports, unused constructors with and without call-site PURE annotations, argument side effects, and compiled validation. Factory annotation support is reported separately rather than assumed.

Results are specific to this machine and these cases; full samples and source hashes are in `results.json`. Generated bundles and executables are ignored by Git.

## Construction optimization follow-up

`results-before-construction.json` preserves the first Bun comparison. `construction-results.json` is a separate rotated comparison of the previous implementation, the final implementation, and Valibot under both Node and Bun: 9 fresh processes × 7 rounds, 100 warmups and 500 constructions plus valid validations per round. All before/after probes and consumed outputs must match. The fixtures are identical except for the implementation bundled into the loculus cases. It does not reuse cached schemas or validation results.

```sh
BASELINE_DIR=/absolute/path/to/previous-generated-fixtures \
BUN_BIN=/absolute/path/to/bun node experiments/bun/construction-check.mjs
```

To regenerate previous fixtures, save the current `src/index.ts`, apply `construction-before.patch` (current to previous), build and run the two preparation scripts, then copy the generated `.mjs` fixtures to a separate baseline directory. Restore the saved source, build and prepare again, then run the check with that baseline directory. The inverse patch records the source difference so that the previous measurement is reproducible without an existing commit.

The changes remove intermediate schema object spreads, avoid default/presence setup for required fields, and retain private compiler information on validator functions using an internal Symbol rather than eagerly registering each function in a WeakMap. Compiler constraints capture kind and enum information separately from public mutable metadata. Object construction snapshots and freezes its shape and captures validators as before. Own-key checks use ES2022 `Object.hasOwn`.

Ordinary JS speed and browser bundle sizes are measured together. The size follow-up now measures smaller raw and gzip output than Valibot for all three profiles under Bun, esbuild and Rolldown. These are measured consumer cases; the smallest margin is one gzip byte, rather than a universal guarantee for arbitrary schemas. Earlier MoonBit/Perry reports describe the implementation snapshot measured at their recorded hashes, not a rerun of this follow-up.

## Bundle size follow-up

```sh
BUN_BIN=/absolute/path/to/bun node experiments/bun/bundles.mjs
```

`bundle-results.json` records 27 minified browser ESM bundles (three libraries, three profiles, three bundlers), versions, source hashes and verified semantic probes. The script asserts that loculus has smaller raw and gzip output than Valibot in all nine measured comparisons. All bundles export the schema and Standard Schema validate and exclude the timing harness. Compression uses Node zlib defaults. Bun uses its browser target; esbuild targets ES2022; Rolldown uses browser/ESM minification.

`results-before-size.json` preserves the previous full run. `size-performance-results.json` compares that previous implementation with the final implementation and Valibot, with 9 processes × 7 rounds. Regenerate the previous fixtures using the inverse `size-before.patch`, following the construction baseline instructions above. Public schema API and validation results are preserved. Unsupported nested object construction now reports the field key in its TypeError.

The changes create metadata with its complete shape immediately, simplify private compiler plans, use a boolean enum marker, and avoid a temporary array when checking default target keys. Required fields continue to bypass optional/default setup. Tree-shaking checks remain separate from relative bundle-size assertions.
