# Element-level package split experiment

The user's allowance for separate element packages was tested with unchanged
production JavaScript. `modularity.mjs` extracts declarations using Rolldown's
AST parser, groups them by element, retains one shared core for field plans and
presence handling, and publishes the prototype through Rolldown multi-entry
ESM output. Public element entries and a root barrel are compared with the
existing single-file root entry.

This is a runtime-only generated prototype. Production source, exports,
declarations and runtime behavior are not changed. No packages were published.
It tests module boundaries with the same API and code, not an alternative API
that removes optional/default support from an element.

## Validation

- All21 root public exports are present, and each element entry exports the
  same function/class identity as its root export.
- The existing57 runtime regression tests were rebuilt to import the prototype
  and passed on Node24.13.0 and Bun1.4.3.
- Ordinary96 and compiled49 schema-consumer bundles were compared with esbuild.
- Six representative ordinary consumers were also compared with Rolldown and
  Bun. All consume the schema and its Standard Schema validator.
- Nine fresh processes per runtime/profile/variant measure module loading and
  construction plus the first successful validation, with rotating variant
  order. Filesystem caches are warm; these are descriptive medians without a
  significance test. The three profiles are a string field, a decimal number
  field, and a small mixed query.

## Size results

| esbuild scope / import | Smaller | Larger | Same | Largest saving | Largest growth |
| --- | ---: | ---: | ---: | ---: | ---: |
| ordinary96 / split barrel | 38 | 32 | 26 | 7 gzip bytes | 2 gzip bytes |
| ordinary96 / direct elements | 43 | 44 | 9 | 6 gzip bytes | 7 gzip bytes |
| compiled49 / split barrel | 36 | 13 | 0 | 10 gzip bytes | 8 gzip bytes |
| compiled49 / direct elements | 7 | 40 | 2 | 5 gzip bytes | 15 gzip bytes |

For the one-string object, original/split-barrel/direct gzip sizes are
1279/1278/1283 with esbuild,1286/1285/1283 with Rolldown, and1280/1280/1287
with Bun. Rolldown's strict-array example grows from1503 to1526/1523 bytes.
Thus the other bundlers do not establish a consistent material gain either.

The existing root already lets bundlers discard unused elements and compiler
code. Repackaging unchanged implementations does not remove the shared code
supporting the selected element's options. Small name/order differences can
alter compression by a few bytes; these are not a new feature-level saving.

## Module-loading results

Node's string-only import medians are0.557ms for the original root,3.487ms for
the split barrel, and0.936ms for direct elements. For the small query they are
0.538/3.433/2.076ms. Extra modules cost more loader work in these fixtures.

Bun's string-only import is1.108/1.463/0.881ms; the complete fresh-process wall
medians are18.224/19.467/18.546ms. This small direct-import saving does not
establish a consistent end-to-end advantage. No repeated-validation speedup is
claimed; function bodies and the public API remain the same in this experiment.

## Decision

Retain one production package and the current implementation for now. Element
subpaths remain a possible organizational choice, but these measurements do not
justify adopting them as a performance optimization. Fully independent packages
would additionally need shared-core version/identity handling, declaration
distribution and release coordination, without a measured bundle benefit here.

The alternative is the proposed absolute-loss budget in `TRADEOFFS.md`: ordinary
mode by default, at most512 extra gzip bytes versus equivalent Valibot fixtures,
and at most2 microseconds extra create-plus-validate time in the existing
canonical fixtures. Treat compile as opt-in after measuring reusable good/bad
inputs. These budgets are a proposal, not a guarantee for arbitrary schemas or
an approved release gate.

## Reproduce

```sh
node bench/optimization-3/modularity.mjs
node --test bench/optimization-3/generated/modular/tests/*.mjs
experiments/bun/generated/tools/bun-darwin-aarch64/bun test bench/optimization-3/generated/modular/tests
node bench/optimization-3/modularity-cold.mjs
```

Raw results are `modularity-results.json` and `modularity-cold-results.json`.
The verification logs are `/tmp/loculus-modularity-tests-node.log` and
`/tmp/loculus-modularity-tests-bun.log`. Generated modules/tests are ignored.

## Current evaluation supersedes construction-based compiler conclusions

Compiler code generation is a reuse feature. Generation-plus-one comparisons,
amortization counts and construction-based compiler candidate rejection are
excluded from the current evaluation. Historical numbers above are retained for
provenance. Current repeated-only statistics are in the
`*-compiled-repeated-significance-results.json` reports; ordinary schema creation
plus one validation remains a separate metric. Runtime, size, type and semantic
tradeoffs still apply.
