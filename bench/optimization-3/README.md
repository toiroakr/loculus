> Historical experiment before removal of the schema compiler. Current policy and measurements: [single-use](../single-use/README.md).

# Full regression-protected performance pass

`before/` freezes optimization 2. Never refresh it to hide a regression. Production
is TypeScript compiled to JavaScript by tsdown; MoonBit/Wasm/Perry remain separate
experiments. All current timings use Node 24.13.0 and the pinned Bun 1.4.3 binary.

This pass covers all 96 ordinary profiles and every eligible compiled object
profile. Successful validation, failing validation, and construction plus one
successful validation are separate comparisons. The latter is a warm process
measurement, not CLI startup. Compiled fallback profiles remain included.

## Reproduce

Run measurements serially, with no tests, builds or other benchmark processes
running concurrently:

```sh
pnpm typecheck
pnpm test
pnpm test:rhf
node bench/coverage/prepare.mjs --baseline --source=bench/optimization-3/before/index.ts.txt --out-dir=bench/optimization-3/generated/before
node bench/coverage/prepare.mjs --source=src/index.ts --out-dir=bench/optimization-3/generated
node bench/coverage/settled.mjs --workers-dir=bench/optimization-3/generated --before-dir=bench/optimization-3/generated/before --baseline-source=bench/optimization-3/before/index.ts.txt --source=src/index.ts --output=bench/optimization-3/settled-results.json
python3 bench/coverage/significance.py --input=bench/optimization-3/settled-results.json --output=bench/optimization-3/significance-results.json
node bench/coverage/settled.mjs --compiled --workers-dir=bench/optimization-3/generated --before-dir=bench/optimization-3/generated/before --baseline-source=bench/optimization-3/before/index.ts.txt --source=src/index.ts --output=bench/optimization-3/compiled-settled-results.json
python3 bench/coverage/significance.py --input=bench/optimization-3/compiled-settled-results.json --output=bench/optimization-3/compiled-significance-results.json
node bench/optimization-3/bundles.mjs
node bench/optimization-3/additional-bundles.mjs
node bench/coverage/types.mjs --with-scalars --output=bench/optimization-3/type-results.json
node bench/coverage/tree-shaking.mjs
node bench/optimization-3/verify-calendar.mjs
experiments/bun/generated/tools/bun-darwin-aarch64/bun bench/optimization-3/verify-calendar.mjs
```

The settled suite uses nine independent processes per runtime and seven timed
rounds per process. The significance report uses process medians, exact tied-rank
Mann–Whitney tests, Holm correction and a 10% practical threshold. Uncertain
results do not prove equivalence. Valibot's custom xor examples are displayed but
excluded from the native peer significance tally.

`screen.mjs` is a three-process exploratory harness for candidate selection;
its reports do not support significance claims. `RESEARCH.md` records the official
sources, failed semantic checks and rejected alternatives. `claude-review.md`
contains unverified read-only suggestions, not accepted code changes.

`object-candidates/final.ts.txt` is the final production snapshot. `combine.mjs`
reconstructs the intermediate combined3 candidate, not the later wide selective
compiler improvement; do not apply it as the final version. Historical compiled
combined3 reports are under `intermediate/`.

The final change affects compile only. The retained ordinary reports were
measured at the combined3 source hash, and every timed ordinary JavaScript
worker was byte-identical when regenerated from the final source. The original
hashes and dates are preserved. `verify-worker-identity.mjs`,
`ordinary-worker-equivalence.json` and `evidence.mjs` verify this correspondence
and the report/statistics hashes. Compiled reports are freshly measured at the
final source hash. A future full rerun using the commands above needs no reuse.

`SUPPLEMENT.md` records three RHF array-form schemas and `MIXED.md` records three
mixed HTTP schemas. Each has a separate three-profile statistical family and
Node/Bun parity checks. Their comparisons are not added to canonical96 counts.

`TRADEOFFS.md` proposes practical absolute-loss budgets and when to use compile.
`MODULARITY.md` records an element-level split prototype, all96/49 esbuild size
comparisons, representative Rolldown/Bun sizes,57 regression tests in each
runtime and fresh-process module-loading measurements. The production package
remains unchanged; the split did not establish a material bundle improvement.

The final verification includes schema/type tests, the RHF desktop/mobile browser
tests and a freshly packed Loculus fixture installed in Politty. The installed
runtime and declarations must match the final Loculus build byte for byte.
`verification.json` records those hashes, logs, counts and limitations.

`render.mjs` generates `docs/performance-tuning.html` only when performance,
bundle, type and verification hashes match the final implementation. It displays
all three libraries' code and inputs, remaining peer losses and before/after
bundle increases. `check-report.mjs` checks its mobile layout, filters, code
expansion and JavaScript errors in Chrome. It does not claim physical Safari
coverage. Generated workers and screenshots are ignored; snapshots, scripts and
JSON evidence are retained.

## Revised compiler timing scope

Compiler generation-plus-one is excluded. `settled.mjs --compiled` now executes
only valid/invalid repeated validation; factories and compilation run before the
timing window. Ordinary mode keeps its separate schema-creation-plus-one metric,
which does not use compile and is not cold CLI startup.

The current statistics are `compiled-repeated-significance-results.json`,
`supplement-compiled-repeated-significance-results.json` and
`mixed-compiled-repeated-significance-results.json`. They reuse the existing
repeated timing samples without altering raw historical reports. Holm families
exclude construction (canonical760 peer/384 before-after hypotheses, each extra
family24 peer/12 before-after). The original construction-inclusive statistics
remain historical, not the current compiler evaluation.

Reproduce the revised statistics with `significance.py --modes=valid,invalid` and
these repeated filenames as outputs. The same default is inferred for compiled
reports. To reproduce historical statistics, explicitly request
`--modes=valid,invalid,construct`. `compile-vs-normal.py` also excludes
construction; its comparisons remain post-hoc across separate measurement runs.
