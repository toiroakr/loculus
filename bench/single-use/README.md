# Single-use priority

The public schema compiler and its per-field preparation have been removed. Ordinary schemas remain reusable, but the primary performance metric is every field/schema factory plus one successful validation. Compilation/generation is not a current product feature or measurement mode.

The suite includes all 96 canonical profiles, 8 command-option profiles (Git log/clone and official Cloudflare cf deploy/DNS records list), and 3 RHF items schemas, for 107 total. The CLI metadata is pinned to cf 1.0.0-beta.14. The frozen `before/` source, JS and declarations capture the implementation immediately before compiler removal.

Nine independent processes per case/library/runtime, seven time-budgeted rounds after warmup, consumed outputs and rotating inputs. This is warmed construction plus first validation, not cold CLI launch latency. Node 24.13.0 and the pinned Bun 1.4.3 binary run sequentially, with no concurrent performance task. Exact Mann–Whitney with Holm correction and a 10% practical threshold; the family covers all 107 schemas and both runtimes. Valibot's non-native xor is excluded from peer inference. Untimed before/after probes compare output, issue counts and paths; all timed peer valid outputs match. Untimed peer differences are recorded, not silently treated as equivalent.

```sh
pnpm bench:single-use
node bench/coverage/types.mjs --with-scalars --output=bench/single-use/type-results.json
node bench/single-use/render.mjs
node bench/single-use/check-report.mjs
```

Bundle measurements use live schema/validator exports from production tsdown JS, esbuild browser ES2022 ESM, minify and gzip, with named Zod imports. They execute the minified modules; normalization/exception-wrapper costs are not in the size table. Type measurements use six groups, three independent compiler processes per group/library; type-check medians and instantiation counts are reported without a statistical speed claim. The group workload is the canonical fixture set, separate from the new CF/RHF schemas.

Regression tests retain defaults/nullish semantics, option snapshots, getter/callback order, frozen/shared issues, row mutations, safe properties and opaque field validators. Old compiler-specific tests now check ordinary behavior against the frozen pre-removal implementation or independent outputs. `before/` is for comparison, not shipped code. Historical compiler results are retained separately and cannot be used as evidence for a current compiler API.

## Results

Compiler removal improved 29 case/runtime comparisons by the significance/practical criteria, with no detected practical regression out of 214 before/after tests. Against Zod: 214 wins / 0 losses. Against Valibot: 120 wins / 65 losses / 25 inconclusive comparisons, excluding the two non-native xor profiles per runtime. These outcomes concern warmed creation plus one validation only.

107 live browser bundles: 96 smaller, 7 unchanged and 4 larger than before; every increase is one gzip byte. Basic string object: 1245 versus Valibot 1078 gzip bytes. Its constructor-plus-validation remains slower than Valibot. Mixed CLI and RHF cases win the measured single-use comparisons.
