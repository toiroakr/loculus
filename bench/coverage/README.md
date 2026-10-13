# Full API comparison

This extends the original three-case comparison to 96 representative profiles (57 object/composite and 39 standalone fields), covering every exported runtime constructor/helper and all 16 tested string presence/default combinations. `coverage.json` maps API names to profiles. It does not enumerate every possible option combination, input value or user callback.

```sh
pnpm build
node bench/coverage/prepare.mjs
node bench/coverage/run.mjs
node bench/coverage/run.mjs --only-scalars
node bench/coverage/types.mjs --with-scalars
node bench/coverage/semantics.mjs
node bench/coverage/tree-shaking.mjs
node bench/coverage/cold.mjs
```

Use `BUN_BIN` to select Bun. The default is the verified local Bun 1.4.3 binary from the previous experiment. The prepared, identical-byte ESM is executed in Node and Bun. Ordinary Zod has `jitless:true`; optimized Zod enables JIT. All plain loculus object profiles also have explicit `compile` candidates. Strict and passthrough compilation intentionally falls back to the ordinary schema. Outer refinement/transformation and composites are compared as ordinary schemas.

Before timing, all candidates must match loculus's successful values and accept/reject results for all probes, and must accept every designated valid input and reject every designated invalid input. Missing properties and explicit undefined are tested separately; date outputs and undefined values are preserved by the comparison encoder. Native issue structures and issue counts can differ and are retained in JSON. Error text is not normalized into artificial equality.

All three bundlers (Bun, esbuild, Rolldown) produce minified browser ESM exporting the schema, factory and Standard Schema validation function. The factory remains live because construction is part of this suite; sizes therefore include the public factory export, unlike the earlier schema-only consumer fixtures. Every bundle is executed against all probes. Raw and default-zlib gzip sizes are recorded. No relative-size threshold is assumed for newly covered schemas.

Timing starts after all bundle builds/compression. Candidates run serially, with rotated order, in three fresh processes per Node/Bun candidate. Each process measures seven rounds for valid, invalid and schema construction plus one valid validation. Warmup is 3,000 / 100 for validation / construction; round sizes are 5,000 / 500. Inputs cycle over the valid/invalid datasets rather than selecting only a favorable branch. Successful output key counts and failure issue counts are consumed; checksums must remain stable. Import and process startup are outside these measurements.

URLSearchParams/FormData objects are prepared outside timing, while duplicate-preserving `fromEntries` normalization is inside validation timing. Zod and Valibot use the same manual normalization loop because they do not provide loculus's helper. This compares validation plus normalization, not DOM or URL constructor speed.

The native API difference report is separate. Zod 4.6.5 counts string length in Unicode code points; loculus and Valibot use UTF-16 units, so the trim/length comparison uses an explicit Zod UTF-16 refinement. Valibot nullable(optional()) does not accept a missing object key, so the equivalent profile uses nullish(). Valibot optional() validates its fallback through its wrapped schema; its date comparison uses an ISO string input fallback before transformation. These adjustments and all library code are visible in the fixtures and HTML.

Valibot has no native xor export. Its xor examples use custom compositions, and their numbers must not be interpreted as native xor comparisons. XOR is excluded from the type-speed benchmark. Type-speed fixtures use 20 copies of each included profile in six feature groups (with --with-scalars), infer both input and output, and check a valid output assignment. Three fresh strict TypeScript processes per group/library rotate order; extended diagnostics record actual check time, instantiations and memory. This workload does not prove universal type safety or speed.

MoonBit remains a subset prototype. The coverage table must identify unavailable regex/trim/date, arbitrary element schemas, callbacks, object modes, composites and typed public bindings rather than fabricate MoonBit results for them. The npm implementation is TypeScript/JavaScript.

## Explicit Zod compilation

```sh
node bench/coverage/run.mjs --only-compiled
node bench/coverage/run.mjs --only-compiled --only-scalars
```

Preparation also generates `z.compile(schema)` for all 96 profiles, separately from Zod's default object JIT. `compiled-results.json` / `compiled-scalar-results.json` retain these results or the actual constructor error if compilation is unsupported. The ordinary comparison remains in `results.json`.

## Additional backends

```sh
node bench/coverage/perry.mjs
node bench/coverage/perry-reference.mjs
node bench/coverage/perry.mjs --only-scalars
node bench/coverage/perry-reference.mjs --only-scalars
node bench/coverage/moonbit.mjs
```

Run performance commands sequentially. Perry builds feature-group programs for each library, with both direct imports and monolithic ESM. Each profile is selected at process launch. Identical-byte Node executions must match the original golden probes. Per-profile native throughput is recorded only after matching output; failed builds or execution/semantic differences retain diagnostics. Grouped binary sizes include all cases in the group and the runtime/harness. A failure in a grouped program is not proof that the same isolated schema can never compile; grouped compilation itself is a tested usage context. Perry's dynamic generated validators are not benchmarked as native AOT counterparts.

MoonBit reuses the existing kernel and adds configurations for all 37 supported profiles. JS and Wasm GC are checked in Node and Bun; browser JS bundles and Wasm/glue pairs also execute against the probes under Node (a local byte response replaces the network fetch during verification). Unsupported features are listed individually. Three fresh processes × seven rounds per supported runtime/backend measure the same datasets and iteration counts. Wasm compilation/instantiation is outside timed validation. Its type constructors and public metadata are still unavailable. These subset sizes must not be presented as equivalent full-library implementations.

## Cold launch and HTML

`cold-results.json` covers all 482 Node/Bun candidates, with five fresh launches each. Input construction, imports, schema construction/compile, one successful validation, JSON printing and exit are included; builds are excluded. The first valid input per profile is used, so this complements the branch-cycling warmed measurements rather than representing every branch in a fresh process.

After all reports complete, run `python3 bench/coverage/render.py` to update the mobile-friendly HTML in `docs/review.html`. Each profile includes all library code, inputs, Node/Bun repeated validation, construction plus one validation, cold launch, three-bundler sizes and supported Perry/MoonBit results. Native semantics and all-library tree-shaking comparisons are separate. The default-array identity probe records that loculus reuses the mutable default array while Zod and Valibot return copies. The blocked-Function probe simulates an environment restriction; it is not a real browser CSP-header test, and it awaits any Standard Schema Promise before interpreting the result.

The backend experiments require the existing MoonBit release builds and the Perry runtime archive prepared in their own experiment directories. See `experiments/moonbit/README.md` and `experiments/perry/README.md`. Do not treat unavailable native results as zero latency.

## Optimization pass

The pre-optimization implementation and JSON reports are preserved in `before-optimization/`. Rebuild its standalone workers with `node bench/coverage/prepare.mjs --baseline`; the script writes only under the ignored generated directory. `tune.mjs` is a short exploration tool, not a significance test.

`node bench/coverage/settled.mjs <comma-separated-profile-ids>` compares that baseline with the current JavaScript implementation and both peers, using the same fixtures and consumption. Nine independent fresh processes per runtime/implementation each warm up for at least 30 ms and measure seven rounds. The round size is calibrated to approximately 8 ms, with a cap of one million operations. Every before/after fixture must first produce identical probe results. Schema construction includes one valid validation; import/startup does not.

`python3 bench/coverage/significance.py` uses each process median as one observation, rather than treating rounds from the same process as independent. It performs an exact two-sided Mann–Whitney permutation test, including tied ranks, and Holm adjustment. The predeclared competitor family contains all 1,140 native comparisons across the original 96 profiles, Node/Bun, three modes and two peers. Unmeasured tests count as p=1; they are not claimed equivalent. Before/after tests use a separate family of 576. A remaining loss requires adjusted p≤0.05 and at least 10% slower median. Selection uses the previous exploration run, not the confirmatory samples. The HTML distinguishes exploratory medians from this confirmation. These repeated processes cannot remove systematic environmental or harness bias.

The optimized implementation shares unconstrained string validators, delays large-enum Sets and enum metadata until used, caches enum/literal failure messages, separates compiler plans from fields that cannot use them, delays union error storage and resumes compiled validation at the first fallback field. Presence/default type inference is simplified, with concrete string overloads for common configurations. Absent false metadata flags may be omitted; adapters must interpret `meta.optional` and `meta.nullable` as optional boolean flags.

All remaining statistically supported deficits and deterministic bundle-size losses stay visible. The own-property policy and immutable shape snapshots are retained, even where competitors have different semantics or lower construction costs. Browser consumers that keep a generic options-based factory also retain support for its presence/default options; this affects especially small schemas.
