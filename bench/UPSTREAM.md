# Upstream benchmark fixtures

Run `pnpm bench:upstream`. This is an adaptation of the Zod repository's supported valid-input fixtures, not a run of its entire suite. Source is pinned to [284243fb0d6532665afdc9239188773bb624f73c](https://github.com/colinhacks/zod/tree/284243fb0d6532665afdc9239188773bb624f73c/packages/bench).

| Upstream file | Schema | Batch size |
|---|---|---:|
| string.ts | Unconstrained string | 10,000 |
| number.ts | Number | 10,000 |
| boolean.ts | Boolean | 10,000 |
| array.ts | Three random ASCII strings, each length 10 | 1,000 |
| object.ts | String, boolean and number; unknown keys stripped | 1,000 |

The data distribution, batch sizes, synchronous `parse` operation and Tinybench 2.9.0 runner match these upstream files and the default Tinybench branch of `metabench.ts`: `new Bench({ time: 1500 })`, then explicit `warmup()` and `run()`. Each task parses the whole batch; reported time divides batch latency by batch size. No output is consumed during timing, matching upstream. These results cannot be substituted for the existing Standard Schema measurements, which consume the result and include failures.

Changes from upstream:

- Use the installed Zod 4 and Valibot releases, and add loculus. Zod 3 and the upstream historical Zod 4.0.8 baseline are not measured.
- Add `z.compile(schema).parse()`, constructing compiled parsers outside timing. Compilation latency and generated bundle size are not included.
- Run three rounds and rotate library order. Report the median of round means, plus every round's relative margin of error and sample count. Small differences are not proof of superiority.
- Validate every generated input and output for all four parsers before timing. Store the exact random inputs, their SHA-256, runner SHA-256, versions, CPU and runtime in `upstream-results.json`. Inputs differ between invocations because upstream uses `Math.random()`.
- Use a common parser callback inside the batch loop for all four libraries. The upstream files directly call their respective parse functions.

Loculus also accepts decimal strings for numbers and boolean strings for booleans. These fixtures only contain native values, so they do not measure those conversions or demonstrate equivalent rejection behavior across the full input domain. The array uses `wrapScalar: false`. All fixtures are valid; exception construction and failure behavior are outside this measurement.

## Suites outside loculus's scope

- [Zod's Moltar fixture](https://github.com/colinhacks/zod/blob/284243fb0d6532665afdc9239188773bb624f73c/packages/bench/object-moltar.ts) has a `deeplyNested` object. It cannot be represented by loculus. It is not flattened or reported as a comparable result.
- [naruaway/valibot-benchmarks](https://github.com/naruaway/valibot-benchmarks/tree/967432e923a6bb036df45811296f046bcaff9919) is an unofficial suite linked from [Valibot's performance tracking issue](https://github.com/open-circle/valibot/issues/73). Its `deep`, `wide`, `many_features`, and `optional_nullable` cases require nested objects or object arrays. None are run against loculus.
- Other Zod suites involve features such as nested objects, async validation, codecs or formats that are not equivalent to loculus's API. This comparison does not claim to cover them.

## Build target

Loculus is implemented in TypeScript and built to ESM JavaScript with `tsc`. MoonBit has not been adopted. There is no Wasm implementation to benchmark. The dependency on Tinybench is development-only; loculus remains free of runtime dependencies.
