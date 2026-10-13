# Benchmark CI

`Benchmarks` runs on pull requests, main pushes, and manual dispatch. It measures JavaScript on Node 24 and Bun 1.4.3, browser ESM bundles produced by Rolldown, and TypeScript input/output inference. MoonBit, WASM, and Perry experiments are outside this CI suite.

```sh
pnpm bench:ci
pnpm bench:ci --quick
```

Install Bun on PATH or set `BUN_BIN=/absolute/path/to/bun`. The quick mode verifies the complete pipeline with shorter timings and fewer repetitions; its metric-set keys differ from the full run. Outputs are under ignored `bench/ci/generated/`.

## Cases and timing

Twelve existing fixtures cover scalar strings, trim, numeric boundaries, boolean conversion, defaults, strict and wrapping arrays, strict and passthrough objects, git clone options, cf deploy options, and a ten-row form. The fixtures remain shared with the local benchmark suites.

- `construct`: create the schema and validate one valid input, including Zod's lazy JIT cost.
- `valid` / `invalid`: validate a schema created before timing. Loculus plugin generation and bundling are excluded. Zod uses its default JIT mode.
- `generated`: the optional Rolldown plugin specializes the same Loculus expression. TypeScript uses the ordinary Loculus types.

For each runtime, five fresh worker processes rotate case/library order. Each case/mode warms for 50 ms and records seven approximately 20 ms rounds. Results are consumed recursively, including output values; reported latency includes that shared consumption cost. This overhead limits resolution for very fast scalar validators. Construction always includes validation; no generated-plus-once runtime compilation case exists.

Before timing, all valid/invalid fixtures are checked, plugin results must match ordinary Loculus including issues, and successful output/acceptance of each probe must match at least one explicitly composed peer. Error messages, error codes, and the work needed to construct each library's errors differ; failure timing is descriptive rather than a promise of equivalent error representations.

## Reports

The Actions summary and octocov comment group timing by scalars, arrays, objects, CLI, and forms. Ratios below 100% favor ordinary Loculus. Each case first computes the median of paired per-process ratios; the domain then takes an equally weighted geometric mean. Absolute nanoseconds, each process's rounds/checksums, and machine/version metadata stay in the artifact.

Bundle metrics use a live exported schema and Standard Schema validator, with minified ESM and gzip. The comment includes a scalar, git, cf, and form consumer for all four library modes; the artifact contains all twelve. These consumers contain the needed exports and no benchmark datasets or timing loop.

Type metrics compile twenty copies of each selected schema and infer both input/output with checked input and output assignments. Three rotated compiler processes record wall time, check time, instantiations, and memory for Loculus, Zod, and Valibot. Generated Loculus shares the ordinary type definitions.

The `measure` job has read-only repository access. A separate `report` job downloads its artifact and gives octocov permission to comment on same-repository PRs. Fork PRs still get measurements/artifacts and the job summary; the privileged reporter is skipped. Raw artifacts are retained for fourteen days.

Octocov saves the default-branch metrics as `octocov-benchmarks` artifacts and compares PRs against those reports. The first PR has no stored baseline; after merging this workflow, main runs initialize it. Metric-set keys include fixture, harness, protocol, dependency, and runtime versions, so changed experiments start a new comparison series. A missing or expired baseline cannot establish a regression.

Runner CPUs, thermal state, JIT behavior, and system noise can affect even normalized ratios. There is no timing-based merge gate and no claim that CI differences are statistically significant. For a regression decision, rerun the dedicated local suites with their significance policy. Units and lower-is-better interpretation are recorded in every custom metric set.

Octocov custom metrics and datastore behavior follow the [upstream documentation](https://github.com/k1LoW/octocov#custom-metrics).
