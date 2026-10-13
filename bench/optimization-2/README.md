# Regression-protected optimization

`before/` freezes the implementation immediately before this pass, after the object-array type extension. It is used by regression tests and measured workers. Do not update that snapshot to make a regression disappear.

`test/regression.test.ts` compares 96 representative profiles, 300 fixed-seed row inputs, frozen shared issues, option/shape/validator snapshots, property descriptors, callback ordering, numeric compile failures, and independent boolean compiler plans. The broader suite covers the API's public types and presence/default semantics. The RHF browser suite covers adding, removing and moving rows and recovering from nested errors.

## Reproduce

From the repository root:

```sh
pnpm typecheck
pnpm test
pnpm test:rhf
node bench/coverage/prepare.mjs --baseline --source=bench/optimization-2/before/index.ts.txt --out-dir=bench/optimization-2/generated/before
node bench/coverage/prepare.mjs --source=src/index.ts --out-dir=bench/optimization-2/generated
node bench/coverage/settled.mjs string-basic,string-trim,boolean,date,array-wrap,array-strict,array-number,object-passthrough,width-100,entry-parse,presence-default,presence-target-undefined,presence-target-nullish,scalar-boolean,scalar-date,scalar-number-decimal,scalar-enum-2,scalar-enum-32 --workers-dir=bench/optimization-2/generated --before-dir=bench/optimization-2/generated/before --baseline-source=bench/optimization-2/before/index.ts.txt --output=bench/optimization-2/settled-results.json
node bench/coverage/settled.mjs --compiled string-basic,boolean,array-wrap,array-number,width-100 --workers-dir=bench/optimization-2/generated --before-dir=bench/optimization-2/generated/before --baseline-source=bench/optimization-2/before/index.ts.txt --output=bench/optimization-2/compiled-settled-results.json
python3 bench/coverage/significance.py --input=bench/optimization-2/settled-results.json --output=bench/optimization-2/significance-results.json
python3 bench/coverage/significance.py --input=bench/optimization-2/compiled-settled-results.json --output=bench/optimization-2/compiled-significance-results.json
node bench/optimization-2/bundles.mjs
node bench/optimization-2/allocation.mjs
node bench/coverage/tree-shaking.mjs
node bench/coverage/types.mjs --with-scalars --output=bench/optimization-2/type-results.json
```

Run timing and type measurements serially, without tests/builds running concurrently. The harness uses the pinned Bun binary under `experiments/bun/generated/tools/`; prepare that runtime using the existing Bun experiment setup when starting from a clean checkout. Construction measurements include a valid validation once and do not measure CLI process startup. Three-process exploration reports are diagnostic; the nine-process confirmation reports determine significance. Ordinary and explicit compile comparisons are separate statistical families, conservatively corrected over all 96 original profiles and both runtimes within each family.

`RESEARCH.md` records primary sources, hypotheses, rejected candidates and diagnostic limits. `claude-review.md` is an independent review containing unverified suggestions, not an accepted implementation specification.

The generated HTML is `docs/performance-tuning.html`. It includes all selected performance fixtures and code for all three libraries, plus 96 before/after/peer bundle comparisons. `render.mjs` checks report source hashes and requires a completed `verification.json` from the actual final test run.

Confirmed outcome: 17 ordinary and 10 compiled before/after comparisons met the significance and practical thresholds, with zero detected practical regressions in the selected timing comparisons. Thirteen ordinary and twelve compiled peer losses remain in the selected set. These are separate comparisons, not a count of distinct APIs. The esbuild gzip delta across 96 ordinary profiles ranges from −21 to +21 bytes; 69 increased, 4 decreased and 23 were unchanged. Type instantiation counts and emitted public declarations remain unchanged.
