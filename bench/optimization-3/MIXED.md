# Additional mixed HTTP schema measurements

This is an additional three-schema measurement, separate from canonical96 and RHF3. The transform/default100/query12 domain was explored during candidate selection. Results therefore describe these additional schemas on the measured machine; they are not independent evidence that every schema is faster, nor a claim of universal superiority. Keep ordinary and compiled output files separate from existing reports.

Profiles in `mixed-fixtures.mjs`:

- `mixed-http-transform-100`: first string transformed by appending "!", then99 basic strings.
- `mixed-http-default-100`: first string defaults to "fallback" and is missing in the normal input, then99 basic strings.
- `mixed-http-query-12`: page/limit safe decimal integers with defaults, optional UTF-16-length-limited query, sort enum, scalar-wrapping string tags with default[], strict boolean words with defaultfalse, and six basic string fields.

Normal/invalid inputs match the candidate-selection screen's domain. Wide invalid input changes f50 to a number. Query invalid input has limit999 and numeric format. Probes include explicit undefined/null, missing last field, root input types, default versus null rejection, invalid page/limit decimal values, absent optional query, null/overlong query, UTF-16 length parity, wrapped/array tags, boolean words, native values, unknown stripping and missing required fields. Zod query length uses an explicit UTF-16 refine rather than its native code-point max. All three libraries accept strict decimal strings or native numeric values and reject numeric empty strings/null. Page/limit constraints use safe integers and inclusive boundaries.

Source files: `prepare-mixed.mjs`, `mixed-prepare.generated.mjs`, `verify-mixed.mjs`, `mixed-family3.json`. The final implementation was measured in nine fresh processes per runtime, in both ordinary and compiled modes. Output and issue paths were checked on Node and Bun before timing.

## Build and parity checks

Run from the repository root after the parent's active measurements finish:

```sh
node bench/optimization-3/prepare-mixed.mjs
node bench/optimization-3/mixed-prepare.generated.mjs --baseline --source=bench/optimization-3/before/index.ts.txt --out-dir=bench/optimization-3/mixed-generated/before
node bench/optimization-3/mixed-prepare.generated.mjs --source=src/index.ts --out-dir=bench/optimization-3/mixed-generated
node bench/optimization-3/verify-mixed.mjs --output=bench/optimization-3/mixed-semantics-node.json
node bench/optimization-3/verify-mixed.mjs --runtime=experiments/bun/generated/tools/bun-darwin-aarch64/bun --output=bench/optimization-3/mixed-semantics-bun.json
```

Before is opt3before (`bench/optimization-3/before/index.ts.txt`, source hash beginning77754cfa); after is current src. Timed inputs match normalized output, issue counts and issue paths/order. Untimed root-array probes produce per-field missing issues in Valibot versus a root type issue in Loculus/Zod. Untimed null tags produce an item-0 path after Loculus scalar wrapping versus a tags union path in peers. The verifier asserts those specific differences and records them in `errorGranularityDifferences`; it does not ignore arbitrary mismatches. Messages themselves are library-specific and intentionally not compared. The verifier records current source/fixture hashes and asserts source stability.

## Formal comparisons and separate family3 statistics

```sh
BENCH_PROCESSES=9 node bench/coverage/settled.mjs --workers-dir=bench/optimization-3/mixed-generated --before-dir=bench/optimization-3/mixed-generated/before --baseline-source=bench/optimization-3/before/index.ts.txt --source=src/index.ts --output=bench/optimization-3/mixed-settled-results.json
BENCH_PROCESSES=9 node bench/coverage/settled.mjs --compiled --workers-dir=bench/optimization-3/mixed-generated --before-dir=bench/optimization-3/mixed-generated/before --baseline-source=bench/optimization-3/before/index.ts.txt --source=src/index.ts --output=bench/optimization-3/mixed-compiled-settled-results.json
python3 bench/coverage/significance.py --input=bench/optimization-3/mixed-settled-results.json --fixtures=bench/optimization-3/mixed-family3.json --source=src/index.ts --output=bench/optimization-3/mixed-significance-results.json
python3 bench/coverage/significance.py --input=bench/optimization-3/mixed-compiled-settled-results.json --fixtures=bench/optimization-3/mixed-family3.json --source=src/index.ts --output=bench/optimization-3/mixed-compiled-significance-results.json
```

Normal compares before/current ordinary loculus, Zod jitless, and Valibot. Compiled compares before/current explicit loculus compile, explicit Zod compile, and ordinary Valibot. Workers also include implicit Zod JIT for parity verification. Existing coverage settled runs Node/Bun,9 fresh processes per runtime,7 timed rounds,30ms warmup and8ms calibration, rotating library/version order and output checksum consumption. Construction includes a valid validation. Formal9-process files use the existing source hash checks and independent three-profile statistical family. Do not overwrite canonical or RHF outputs or combine their hypotheses/results with this family.

Report gains/losses for these three schemas with the measured scope, engine, source versions and construction tradeoffs. Candidate-selection overlap and the additional-schema status should remain visible wherever these measurements are summarized.

## Final results and accepted tradeoff

Ordinary mode has no practical significant before/after changes. Compiled mode
has eight practical significant improvements and two regressions. For the two
100-field schemas, Node valid repetition falls from about 4.4 microseconds to
1.5 microseconds; Bun improves by about 14% for transform and 23% for default.
Invalid repetition also improves in both engines. Bun construction plus one
validation rises from 23.4 to 32.9 microseconds for transform (+41%), and 23.5 to
30.8 microseconds for default (+31%). The 12-field query does not establish a
practical significant before/after change.

This tradeoff is accepted for HTTP schemas compiled once and reused. CLI and
form callers use ordinary mode, whose timed worker JavaScript remains identical
to the earlier ordinary measurement. These schemas still retain 14 significant
peer losses in compiled mode, including much faster Zod valid repetition and
Valibot construction. They do not establish universal superiority.

## Current evaluation supersedes construction-based compiler conclusions

Compiler code generation is a reuse feature. Generation-plus-one comparisons,
amortization counts and construction-based compiler candidate rejection are
excluded from the current evaluation. Historical numbers above are retained for
provenance. Current repeated-only statistics are in the
`*-compiled-repeated-significance-results.json` reports; ordinary schema creation
plus one validation remains a separate metric. Runtime, size, type and semantic
tradeoffs still apply.
