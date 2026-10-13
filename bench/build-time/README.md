# Build-time scalar code generation

`pnpm bench:build-time` bundles the same 107 cases used by the single-use suite through Rolldown 1.2.13, with and without `loculus/rolldown`, plus ordinary Zod and Valibot. All 428 minified consumers are executed. Generated versus ordinary Loculus values, full issues and paths are compared for every valid, invalid and probe input. Valid peer outputs are compared independently. Sizes include the live schema, createSchema export and public invocation helper; they are not directly comparable to the older esbuild size table.

16 profiles were selected before timing: plain and constrained strings, optional and dual defaults, decimal/integer conversion, booleans, a regex fallback, arrays, strict objects, width 100, Git clone, cf deploy and DNS records list, RHF 1 and 100 rows. Only these profiles receive runtime performance claims. Each condition runs in nine fresh processes on Node 24.13.0 and Bun 1.4.3, with 30ms warmup and seven adaptive rounds targeting 8ms.

`construct` includes every schema/field construction and one valid validation. `valid` reuses a schema created before timing. Build and code generation are excluded from both; there is no runtime generation or generation-plus-one measurement. Zod uses jitless ordinary schemas. This is a warmed operation benchmark, not CLI process startup. Input sets rotate. Every converted value contributes to a recursive checksum. The latest 32 produced schemas and results are retained in exported arrays, making allocations observable and preventing unused-schema elimination. Retaining and consuming values adds the same harness work to each library. These timings cannot be compared numerically with the older key-count-only harness.

The first exploratory harness counted only output keys/types; V8 could eliminate transient schemas and values and produced single-digit-nanosecond results. That run was interrupted and excluded. The final harness retains actual schemas/results and reads their contents. No timing result is selected from the exploratory run.

Use the existing two-sided exact Mann–Whitney test with tied ranks and Holm correction across all preselected profiles, both runtimes, both modes and both peers; 10% practical threshold. Before/after comparisons have a separate family. Uncertain results do not prove equivalence. Runtime source and generated worker hashes are saved; timings are rerun when emitted worker code changes.

The plugin specializes scalar validators; it does not generate an object/array execution kernel. Wide objects and repeated validation can therefore remain slower than Valibot. Unsupported factories remain ordinary. Build-only plugin dependencies are not part of browser/runtime imports. Type-checking runs on original TypeScript, so the plugin does not promise faster type checking. Function identity or Function.toString are not stable across optimized builds.

References: [Rolldown TypeScript-aware plugin API](https://rolldown.rs/apis/plugin-api), [source map guidance](https://rolldown.rs/apis/plugin-api/transformations). The implementation uses the host parser and native MagicString rather than compiling JavaScript at runtime.

## Results

Across 107 minified Rolldown consumers, 92 generated variants are smaller in gzip and raw bytes; 15 are unchanged. None grows. The generated variants are smaller than Valibot in gzip in 97 cases. Bare string: ordinary 864 B, generated 264 B, Valibot 750 B, named Zod 18,897 B (gzip). Export sets and bundler differ from older esbuild measurements.

Runtime claims cover only the 16 preselected profiles, both runtimes and both modes. Compared with ordinary Loculus, 21/32 construction-plus-one comparisons and 3/32 repeated comparisons show statistically significant improvements of at least 10%; none meets the regression threshold. Compared with Valibot, construction: 28 wins, 2 losses, 2 uncertain; repeated: 23 wins, 1 loss, 8 uncertain. Generated Loculus wins all 64 measured comparisons against ordinary jitless Zod. Remaining Valibot losses: strict object construction on Node/Bun; width 100 repeated validation on Bun.

Bare string construction: Node generated 17.20 ns / ordinary 17.64 / Valibot 23.18; Bun generated 15.52 / ordinary 20.71 / Valibot 23.47. The Node generated-versus-ordinary change is uncertain. Bare string repeated validation wins against Valibot on Node; on Bun its statistically detectable difference is below the practical 10% threshold. This harness consumes and retains actual data, and cannot be compared numerically with earlier timings.

After timing, filename-based TS language detection and current-source parsing/map handling were corrected. The corrected plugin reproduced byte-identical code for all 428 consumers and 64 timed workers. The raw report retains the original measured plugin hash and records re-verification separately. No numeric timing was rewritten.
