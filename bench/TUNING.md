# Compiler tuning

Scalar success paths are emitted directly; failed validations and callbacks keep the original validator. Field options and array element validators are captured at construction. Compiler metadata remains in ordinary bundles even when code generation is unused.

The lifecycle benchmark captures source and built-module hashes before measurement, and rejects changes during its run. [Current protocol](LIFECYCLE.md), [current samples](lifecycle-results.json), [previous samples](lifecycle-before-tuning.json).

## Additional URL confirmation

Run `node bench/url-confirmation.mjs` after `pnpm build`. It runs ten fresh processes per compiled library in alternating order, with the same valid URL fixture and shared normalization as the lifecycle benchmark. Each has 10,000 warmup operations and seven rounds of 50,000 operations. Both round-level summaries and medians across process medians are saved; rounds in one process are correlated. See [the samples](url-confirmation-results.json).

The validation-only reduction is clear in these measurements. The full-parser difference is small and its distributions overlap. The fixed fixture is not a production input distribution. No validation-result memoization is used.

The URL schema bundles to 1,828 gzip bytes without compilation and 3,096 gzip bytes with compilation (esbuild 0.28.2, browser ESM, ES2022, minified, schema plus Standard Schema validation export). Compilation adds 1,268 gzip bytes in this fixture. It is an explicit runtime/size tradeoff.
