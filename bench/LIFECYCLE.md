# Single-use and reused schemas

Run `pnpm build` and `pnpm bench:lifecycle`. Results are in `lifecycle-results.json` and `LIFECYCLE-RESULTS.md`.

This benchmark distinguishes the cost of constructing a schema and validating once from the steady-state cost of reusing that schema. Both loculus and Zod are measured with and without their explicit `compile` function. Valibot is included as a non-compiled comparison.

## Cases

- **CLI**: name (length 1–100), decimal safe-integer port (1–65,535; default 3,000), optional explicit boolean conversion, dev/prod enum. The input is the object obtained after option-token parsing; the CLI argument parser itself is outside this measurement.
- **Form**: 30 strings, each length 1–100. Input is a pre-existing Node `FormData`. Iteration and conversion to an own-property record are measured. Creating a DOM form or constructing FormData from the DOM is not measured.
- **URL**: non-empty search string, safe-integer page ≥1 (default 1), optional explicit boolean conversion, optional repeated tags. Input is a query string. `new URLSearchParams`, iteration and duplicate-key aggregation are measured.

Valid and invalid inputs are run separately. Numeric grammar and boolean spellings match loculus, using explicit Zod/Valibot compositions. These are ASCII strings; UTF-16 versus code-point length differences are outside the fixtures. Every worker checks the expected successful output or expected failure issue count after the first timed validation. See `lifecycle-fixtures.mjs` for all three libraries' schema factories and input normalization.

Input normalization is shared across candidates. This avoids measuring different duplicate-key semantics or different framework adapters. Each library returns a synchronous Standard Schema result. Successful output keys or failed issue counts are consumed in every measured operation.

## Single use

There are 15 **fresh Node processes** per library/case/validity cell. No validation warmup occurs. Library order rotates across samples. Each worker records:

1. Dynamic library import.
2. Schema construction.
3. Explicit compilation, if requested.
4. Input normalization.
5. First validation and result consumption.

`schemaAndFirstMs` covers steps 2–5. `importThroughFirstMs` covers steps 1–5. Both are the median of each worker's actual total, not a sum of independently calculated medians. Regular Zod's lazy first-use initialization is included in its first validation; explicit Zod compilation is included in compilation. This intentionally includes the work required for a single invocation.

Node startup is outside the internally timed totals. `processWallMs` separately records parent-observed cold child lifetime, including Node startup, worker imports, input-fixture construction, verification and output/IPC; it is a harness observation, not a complete application startup benchmark. Filesystem/OS caches are not cleared, so “fresh process” does not imply cold storage. The library import is the installed ESM distribution, not a browser bundle.

## Repeated use

Construct and compile once per worker, then warm up with 10,000 operations. Each worker measures seven rounds of 50,000 operations. Three independent processes per cell give 21 round means; report their median and distribution. Candidates run in separate processes to avoid sharing polymorphic call sites. Workers run serially and the order rotates between processes.

- `validation`: normalized input already exists; measures validation and result consumption only.
- `withInput`: measures input normalization, validation and result consumption for every request/submission. CLI normalization is the identity operation, so its difference is primarily harness overhead/noise.

This is the request cost after a server has initialized its schema. Schema construction, compilation and JIT warmup are outside the repeated per-request latency and remain recorded separately. The fixtures are fixed valid/invalid inputs, not a production distribution of user data or GC pressure.

`breakEven` is an **estimate**, derived from the additional median construction/compile time divided by steady-state validation-only savings. It excludes cold first-use differences and the JIT transition. It is not a directly measured crossover, and small differences/negative savings are not evidence of a precise threshold. Normalization costs are common to both candidates and reduce the percentage speedup of the full parser. Startup and runtime samples are saved so this estimate can be inspected.

## Reading the results

Use the single-use total to judge CLI startup or a one-time form submission. Use repeated `withInput` to judge a reused URL parameter parser, and validation-only to identify the validator's contribution. Compilation has a one-time setup cost; avoid comparing only warm compiled validation against a non-compiled single invocation.

The use-case labels describe the workload assumed here. A form validated on every input event can be a reused-schema workload; a query parser constructed inside every request would pay setup each time. These results cover Node 24 / V8 and do not establish browser-engine startup timings.
