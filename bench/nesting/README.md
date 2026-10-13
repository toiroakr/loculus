# Flat-input performance after nesting support

This regression check compares ordinary validation against main at `a217cfdc6b99053a76842ad07cd786887f81c632`. It does not benchmark the new nested feature against a baseline that rejects nesting.

## Reproduce

Install the workspace dependencies with pnpm 11 and cache Bun 1.4.3 at `experiments/bun/generated/tools/bun-darwin-aarch64/bun` (the existing Bun experiment uses this path). Run from the repository root:

```sh
node bench/nesting/run.mjs --base=a217cfdc6b99053a76842ad07cd786887f81c632
python3 bench/coverage/significance.py --input=bench/nesting/generated/results.json --output=bench/nesting/generated/significance.json --fixtures=bench/nesting/generated/fixtures.json --modes=construct,valid
```

The runner derives the five fixtures from `bench/single-use`, verifies acceptance and consumed outputs, then measures nine independent processes per runtime. Each process warms for 150 ms and collects seven 25 ms rounds. Construction includes schema creation and one validation. Repeated validation excludes creation. No Loculus compile or generated-validator mode is measured. As in the ordinary coverage harness, Zod is configured with `jitless: true`; these peer numbers do not measure its default JIT mode.

## Measurements before changing the array default

These measurements describe the initial nesting implementation at `89317df`, before the array default changed to `wrapScalar: false`. They are historical evidence, not a measurement of the current PR head. The reproduction command measures the checked-out source and records new hashes.

Apple M3; Node v24.13.0; Bun 1.4.3. Median nanoseconds; before → after.

| Case | Runtime | Create + validate once | Repeated validation |
| --- | --- | ---: | ---: |
| cli-cf-deploy-sparse | node | 626.9 → 631.6 | 219.2 → 220.3 |
| cli-cf-deploy-sparse | bun | 455.6 → 462.1 | 74.5 → 74.6 |
| cli-git-clone-full | node | 977.3 → 993.1 | 463.9 → 462.1 |
| cli-git-clone-full | bun | 785.4 → 772.9 | 234.9 → 233.2 |
| object-passthrough | node | 61.2 → 61.8 | 33.0 → 33.0 |
| object-passthrough | bun | 59.0 → 62.8 | 23.7 → 24.1 |
| object-strict | node | 60.4 → 61.7 | 30.2 → 30.3 |
| object-strict | bun | 53.9 → 56.8 | 17.7 → 17.5 |
| object-strip | node | 55.1 → 57.3 | 22.0 → 21.8 |
| object-strip | bun | 51.0 → 52.1 | 15.6 → 15.6 |

No selected before/after case met the combined criterion of a ≥10% slowdown and Holm-adjusted p < 0.05. Bun construction did show statistically significant smaller increases: strict +5.3%, passthrough +6.5%. This is a regression check on one machine, not a guarantee for other inputs or runtimes.

All selected repeated-valid cases were faster than both Zod and Valibot with that same combined criterion. Construction still loses to Valibot on Bun for tiny strict objects (56.8 vs 42.8 ns) and passthrough objects (62.8 vs 53.1 ns); this report does not claim universal superiority.

Statistical unit: per-process median; two-sided exact Mann–Whitney permutation test with tied ranks and Holm family correction. Raw reports and generated workers stay under ignored `generated/`; rerun to inspect them.

Source SHA-256: `1f3c79361a744d8e8218c786f87798f9cbca55b302757fff6293c1743300263c`. Baseline SHA-256: `c8463a249e686d47e17390556a9229853887bcfca453a0b207cad81925862df9`. Raw report SHA-256: `854166ec6bd32f6c8d518e640fceee37e05e554437f22b548067a10493b919e4`.

After measurement, the object result assertion was changed to pass through `unknown` for TypeScript phantom properties. esbuild emits identical JavaScript for that type-only edit. The source hash above identifies the measured source before that edit.
