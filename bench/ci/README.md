# Benchmark CI

`Benchmarks` runs on pull requests, main pushes, and manual dispatch. It measures JavaScript on Node 24 and Bun 1.4.3, browser ESM bundles produced by Rolldown, and TypeScript input/output inference.

```sh
pnpm bench:ci
pnpm bench:ci --quick
pnpm bench:ci --prepare-only
node bench/ci/collect.mjs
```

Install Bun on PATH or set `BUN_BIN=/absolute/path/to/bun`. The quick mode verifies the complete pipeline with shorter timings and fewer repetitions; its metric-set keys differ from the full run. Outputs are under ignored `bench/ci/generated/`.

## Cases and timing

Twelve existing fixtures cover scalar strings, trim, numeric boundaries, boolean conversion, defaults, strict and wrapping arrays, strict and passthrough objects, git clone options, cf deploy options, and a ten-row form. The schemas in `bench/fixtures/` are shared with regression tests and the documentation compatibility audit.

- `construct`: create the schema and validate one valid input, including Zod's lazy JIT cost.
- `valid` / `invalid`: validate a schema created before timing. Loculus plugin generation and bundling are excluded. Zod uses its default JIT mode.
- `generated`: the optional Rolldown plugin specializes the same Loculus expression. TypeScript uses the ordinary Loculus types.

For each runtime, five fresh worker processes rotate case/library order. Each case/mode warms for 50 ms and records seven approximately 20 ms rounds. Results are consumed recursively, including output values; reported latency includes that shared consumption cost. This overhead limits resolution for very fast scalar validators. Construction always includes validation; no generated-plus-once runtime compilation case exists.

Before timing, all valid/invalid fixtures are checked, plugin results must match ordinary Loculus including issues, and successful output/acceptance of each probe must match at least one explicitly composed peer. Error messages, error codes, and the work needed to construct each library's errors differ; failure timing is descriptive rather than a promise of equivalent error representations.

## Reports

The Actions summary and PR comment have separate collapsed sections for Node latency, Bun latency, browser bundles, and TypeScript inference. They show each case with four columns: Loculus, Loculus + Rolldown, Zod, and Valibot. Runtime tables show absolute ns/op (median of process medians); bundle tables show minified/gzip bytes for all twelve cases; the type table repeats Loculus measurements in the plugin column because both share the same types. A separate collapsed octocov section tracks only Loculus and Loculus + Rolldown, grouped by scalars, arrays, objects, CLI, and forms. Each case first computes the median of process-median latencies; the domain then takes an equally weighted geometric mean in ns/op. Zod and Valibot are measured for the four-column tables but are excluded from octocov metrics on both main and PRs. Each process's rounds/checksums and machine/version metadata remain in the artifact.

Bundle metrics use a live exported schema and Standard Schema validator, with minified ESM and gzip. The side-by-side table includes all twelve consumers; octocov tracks a scalar, git, cf, and form consumer for Loculus and Loculus + Rolldown. These consumers contain the needed exports and no benchmark datasets or timing loop.

Type metrics compile twenty copies of each selected schema and infer both input/output with checked input and output assignments. Three rotated compiler processes record wall time, check time, instantiations, and memory for Loculus, Zod, and Valibot. Generated Loculus shares the ordinary type definitions. Octocov retains only the Loculus compiler measurements.

The `prepare` job builds and validates all bundles and measures type inference once, then uploads portable fixtures. A ten-job matrix (`node` / `bun` × passes 0–4) runs one worker process per runner without installing dependencies. All four libraries stay on the same runner within each pass. Each case/mode retains its 50 ms warmup and seven approximately 20 ms rounds. The `aggregate` job requires all ten shards, checks their fingerprint, pass, runtime version, platform, architecture, and sample completeness, then writes the same reports and process-median metrics. CPU and runtime metadata from each worker are retained in `results.json` and metric metadata. Runner CPU models may differ between passes. The aggregate job also produces the summary for fork PRs.

Every preparation clears the previous generated files so old shards and reports cannot be reused. `--prepare-only` writes `prepared.json` and `manifest.json` without runtime measurements. Each matrix job invokes its runtime with `bench/ci/worker.mjs bench/ci/generated/manifest.json bench/ci/generated/<runtime>-<pass>.json <pass>`. `collect.mjs` aggregates the prepared report and all expected worker files; it can be rerun without accumulating duplicate samples. Local `pnpm bench:ci` continues to run all workers sequentially. Changes to the harness start a new octocov series, so the first main run after this change establishes a fresh baseline.

The preparation, measurement, and aggregation jobs have read-only repository access. A separate `report` job downloads its artifact and gives octocov permission to comment on same-repository PRs. Fork PRs still get measurements/artifacts and the job summary; the privileged reporter is skipped. Raw artifacts are retained for fourteen days.

Octocov saves the default-branch metrics as `octocov-benchmarks` artifacts and compares PRs against those reports. The first PR has no stored baseline; after merging this workflow, main runs initialize it. Metric-set keys include fixture, harness, protocol, dependency, and runtime versions, so changed experiments start a new comparison series. A missing or expired baseline cannot establish a regression.

Runner CPUs, thermal state, JIT behavior, and system noise can affect even normalized ratios. There is no timing-based merge gate and no claim that CI differences are statistically significant. For a regression decision, repeat the measurements on consistent hardware and account for measurement noise. Units and lower-is-better interpretation are recorded in every custom metric set.

Octocov custom metrics and datastore behavior follow the [upstream documentation](https://github.com/k1LoW/octocov#custom-metrics).
