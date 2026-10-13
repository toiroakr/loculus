# Predeclared RHF array-of-object supplement

These three profiles are separate from the canonical 96-profile comparison. Do not merge their results into existing optimization reports. Profiles are fixed before worker generation and measurement in `supplement-fixtures.mjs`:

- `supplement-rhf-items-1`
- `supplement-rhf-items-10`
- `supplement-rhf-items-100`

Schema: form title is trimmed string min1; items is a required strict array min1; each row is a stripping object with trimmed name min1 and quantity accepting a strict decimal string or number, then requiring safe integer in inclusive [1,99]. Successful quantities become numbers. Normal inputs have 1/10/100 rows, with surrounding whitespace in title/name. Invalid inputs alter the middle row to a blank name and quantity string "0", producing two paths. Array max is intentionally absent: a 101-row probe remains valid.

Prepared probes cover missing/undefined/null items, scalar items, empty array, null/numeric row, quantity empty/null/whitespace/hex/out-of-range/fractional, absent row fields, blank title/name, signed decimal, native numeric quantity, and 101 rows. Trim/min1 avoids any difference in Unicode length units at the threshold.

The separate workers pass output, issue-count and issue-path parity on both Node and Bun. Shared fixtures, manifests, and canonical reports are untouched. The common generator's input literal serialization now disables array truncation, so the 101-row probe is emitted as executable code rather than an inspect placeholder.

## Build and verify after active measurements finish

Run from the repository root:

```sh
node bench/optimization-3/prepare-supplement.mjs
node bench/optimization-3/supplement-prepare.generated.mjs --baseline --source=bench/optimization-3/before/index.ts.txt --out-dir=bench/optimization-3/supplement-generated/before
node bench/optimization-3/supplement-prepare.generated.mjs --source=src/index.ts --out-dir=bench/optimization-3/supplement-generated
node bench/optimization-3/verify-supplement.mjs --output=bench/optimization-3/supplement-semantics-node.json
node bench/optimization-3/verify-supplement.mjs --runtime=experiments/bun/generated/tools/bun-darwin-aarch64/bun --output=bench/optimization-3/supplement-semantics-bun.json
```

The isolated prepare source derives from the existing coverage generator and replaces its fixture import, default directories/source, and verify summary. Workers retain the settled-compatible harness and manifest representation. Verify summaries add normalized issue paths to the existing output/issue-count summary; Valibot's path entries become their key values. The dedicated verifier compares every generated candidate against ordinary current loculus, including before loculus, ordinary/optimized loculus, Zod jitless/implicit JIT/explicit compile, and ordinary Valibot. Any output, issue-count, issue-order, or path difference aborts verification.

## Independent settled comparisons

```sh
node bench/coverage/settled.mjs --workers-dir=bench/optimization-3/supplement-generated --before-dir=bench/optimization-3/supplement-generated/before --baseline-source=bench/optimization-3/before/index.ts.txt --source=src/index.ts --output=bench/optimization-3/supplement-settled-results.json
node bench/coverage/settled.mjs --compiled --workers-dir=bench/optimization-3/supplement-generated --before-dir=bench/optimization-3/supplement-generated/before --baseline-source=bench/optimization-3/before/index.ts.txt --source=src/index.ts --output=bench/optimization-3/supplement-compiled-settled-results.json
python3 bench/coverage/significance.py --fixtures=bench/optimization-3/supplement-fixtures.json --input=bench/optimization-3/supplement-settled-results.json --output=bench/optimization-3/supplement-significance-results.json
python3 bench/coverage/significance.py --fixtures=bench/optimization-3/supplement-fixtures.json --input=bench/optimization-3/supplement-compiled-settled-results.json --output=bench/optimization-3/supplement-compiled-significance-results.json
```

Normal selection compares before opt3/current ordinary loculus, Zod jitless, and Valibot. Compiled selection compares before opt3/current explicit loculus compile, explicit Zod compile, and ordinary Valibot. As with the canonical protocol: Node and Bun, default nine independent processes, seven timed rounds, time-based warmup/iteration calibration, rotating library order, and checksum consumption. Construction includes one valid validation. Source hashes are checked by settled. Keep the supplement source and all generated workers fixed while measuring.

The significance family is independently predeclared as these three profiles: 36 peer and 18 before/after comparisons per execution scope. It does not change the canonical 96-profile family or its claims. Nested array/object compilation may remain mostly dynamic: existing loculus compileArray specializes basic field elements, but these row elements are object validators. This supplement specifically measures that previously uncovered RHF structure.

## Final results

Ordinary mode has 36 significant wins against peers and no peer losses, across
the two engines and three operation modes. It establishes no practical
significant before/after change. At 100 rows, ordinary valid Loculus medians
are about 8.0 microseconds on Node and 5.2 microseconds on Bun, versus Valibot
19.2 and 13.7 microseconds respectively.

Compiled mode has no practical significant before/after changes and retains
10 significant peer losses: four construction comparisons against Valibot
on Node/Bun and six valid-repetition comparisons against Zod. The exact
breakdown is in `supplement-compiled-significance-results.json`; do not infer
the same wins as ordinary mode. Forms use ordinary schemas.

The ordinary report retains its original combined3 source hash and timestamp.
Every timed worker is byte-identical to the final source's generated ordinary
worker, as checked by `verify-worker-identity.mjs`. Compiled data was freshly
measured at the final source hash.

## Current evaluation supersedes construction-based compiler conclusions

Compiler code generation is a reuse feature. Generation-plus-one comparisons,
amortization counts and construction-based compiler candidate rejection are
excluded from the current evaluation. Historical numbers above are retained for
provenance. Current repeated-only statistics are in the
`*-compiled-repeated-significance-results.json` reports; ordinary schema creation
plus one validation remains a separate metric. Runtime, size, type and semantic
tradeoffs still apply.
