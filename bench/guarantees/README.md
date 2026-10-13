# Guarantee ablations

The ablation matrix below is a historical snapshot of the implementation before the compatibility changes. Its saved hashes and generated consumers identify that baseline; applying its patches to the current runtime is not supported. Its timing conclusions are not current-performance claims.

The current compatibility audit is `compatibility-audit.mjs` with results in `compatibility-audit.json` and `compatibility-audit-bun.json`. It compares acceptance and successful outputs in the 96 existing composed profiles with Zod JIT enabled and disabled. Native boundary cases and issue paths are covered by `test/compatibility.test.ts`; `test/rolldown.test.ts` also covers all four generation strategies. `parity-probe.mjs` includes diagnostic schema mutations, which are not supported APIs. `compatibility-integrations.mjs` exercises the current published entry with the actual Politty checkout and RHF resolver. The mobile report is `docs/compatibility.html`.

```sh
pnpm test
pnpm typecheck
pnpm test:rhf
node bench/guarantees/compatibility-audit.mjs
experiments/bun/generated/tools/bun-darwin-aarch64/bun bench/guarantees/compatibility-audit.mjs bench/guarantees/compatibility-audit-bun.json
node --import tsx bench/guarantees/compatibility-integrations.mjs /path/to/politty
node bench/guarantees/render-compatibility.mjs
```

Run the audit after the build finishes; do not run it concurrently with a build that cleans `dist`.

These experiments do not modify production sources or declarations. They compare isolated runtime patches and build-time patches with the current runtime and Rolldown plugin. The report is `docs/guarantees-ablation.html`.

Nine topics cover shape freezing, caller ownership, enum representation, sharing, Standard Schema allocation, input boundaries, issue handling, validator capture/read order, and discriminated union initialization. The matrix contains 25 runtime changes plus the baseline, fourteen workloads, both ordinary/generated implementations, and Node/Bun. Peer consumers use installed Zod (JIT disabled) and Valibot. Metadata access has no peer speed comparison because the exposed representations differ.

```sh
pnpm build
node bench/guarantees/ablation-prepare.mjs
node --import tsx bench/guarantees/ablation-behavior.mjs
experiments/bun/generated/tools/bun-darwin-aarch64/bun bench/guarantees/ablation-behavior.mjs bench/guarantees/ablation-behavior-bun.json
node bench/guarantees/ablation-run.mjs
node bench/guarantees/ablation-errors.mjs
node bench/guarantees/ablation-cold.mjs
node bench/guarantees/ablation-types.mjs
node bench/guarantees/ablation-tree-shaking.mjs
python3 bench/guarantees/ablation-statistics.py
node bench/guarantees/ablation-render.mjs
node bench/guarantees/check-report.mjs --ablation
```

Run benchmarks sequentially without other builds, tests, or benchmarks. Preparation and verification are outside timing. Each cell has eleven fresh processes, seven rounds, 30 ms warmup (500 ms for width 100), and 8 ms rounds. Schema construction plus one validation includes all field/object construction. Repeated validation excludes construction. Build/generation is excluded in both cases. Thirty-two schemas/results are retained; all output values are consumed. Identical executable hashes share their measured samples and do not count as independent evidence.

Error timing uses full retained results but consumes only Standard Schema message/path. Traversing Valibot-specific dataset/input context would measure a different consumer operation. The initial full-context error samples are retained as historical data; final invalid timings and fixture hashes are in `ablation-errors.json`. First-unknown changes reduce the information returned and the consumer's work, so their benefit is explicitly paired with this disadvantage.

Behavior probes isolate each scenario in a fresh module instance. They include actual RHF resolver calls and Politty's actual argument registry and field extractor. The Politty worktree import currently uses this machine's checkout path; update it when reproducing elsewhere. Mutation diagnostics deliberately include operations rejected by public readonly types. Such observations do not automatically imply that every mutation must remain supported. Reusing a readonly custom issue, normal default configuration, and independent Politty registrations require separate consideration.

`ablation-refresh.mjs` records the incremental measurement used in this run: the prototype-shared lazy Standard Schema implementation was added, and the static union prototype was repaired to read its discriminator once. All discriminated-union variants and peers were remeasured together. Other original worker hashes/samples were retained. `*.initial.json` and the archived initial union workers preserve that history. A clean rerun with the commands above builds the final versions directly and does not need refresh.

The static union prototype supports only the measured, statically known a/b pair. It is not a general plugin feature. Runtime fallback retains duplicate detection for dynamic definitions. Generic compile-time duplicate diagnostics remain implementation work before adopting this optimization.

The metadata-sharing prototype applies to description-free strings and has a demonstrated internal optional/default metadata leak. Its timing workloads use basic strings; do not extrapolate to a corrected, narrower implementation. Schema sharing demonstrates an actual Politty WeakMap collision. Issue mutation demonstrates frozen-issue exceptions and reused-path corruption. Freeze-caller demonstrates an inconsistency with the retained purity annotation after tree shaking. These are experimental patches, not ready-to-ship implementations.

Cold literal-cache tests use 25,000 distinct values, two timed 10,000-value batches after warmup, explicit GC, and only 32 retained schemas. The unbounded Map's entry count is instrumented independently of the timing matrix. Heap counters measure observed retained JS heap, not RSS, and are not comparable across runtimes.

The declaration experiment changes only `ObjectSchema.shape` from `S` to `Readonly<S>`. A previously permitted same-type field replacement becomes TS2540. Input/output inference, output assignments, and shape member reads are checked with 100 copies of each workload and eleven compiler processes. Runtime-only changes use the same public declaration; they do not count as type-checking improvements.

Statistical inference uses exact two-sided Mann–Whitney tests with ties, process medians as units, and Holm correction over the full declared families. Practical thresholds are 1.1x faster/slower with adjusted p <= .05. Non-significance is not an equivalence result. Results describe this machine, toolchain, fixtures, and harness.
