# Measurement protocol

Run `pnpm build && pnpm bench`. `results.json` records the versions, machine architecture and measurements.

Runtime uses each library's synchronous Standard Schema validator. Each schema is constructed once. There are 10,000 warmup iterations and seven rounds of 50,000 validations. Successful results are consumed by counting output keys; failed results by counting issues. Thus timings include this common observation cost. The report contains median, minimum and maximum nanoseconds per iteration. The libraries run serially on one process. No cross-machine threshold is claimed.

The fixtures cover 3 and 30 required string fields with length constraints, plus a CLI with a required name, bounded integer conversion and default, optional boolean conversion, and an enum. Both successful and failing inputs are measured. All libraries produce equal values for the successful fixture and reject the failing fixture. Their detailed issue messages differ.

The CLI fixtures use the same decimal syntax and integer range. The boolean fixtures accept precisely booleans and the strings `true`, `false`, `1`, `0`. Zod and Valibot use their native composition APIs to express these constraints.

Bundle measurements use esbuild with browser platform, ESM, ES2022, minification and tree shaking. The exported schema and Standard Schema validation function remain live. Sizes include the schema declaration, validator and bundler glue. Gzip uses Node's default gzip compression. Imports are `loculus`'s built ESM, `zod`, and `valibot`.

The bundle fixtures are three required strings and thirty required strings (each with min 1 / max 100), plus four CLI fields: a nonempty name, decimal/integer port with inclusive bounds 1–65535 and default 3000, an optional boolean, and a dev/prod enum. They do not include argument parsing, a server, DOM handling, or input normalization. These fixtures do not call `compile`.

Run `pnpm check:tree-shaking` to build the published ESM entry and check its consumer bundles with esbuild, both with and without minification. The check exercises named/namespace imports, unused API imports, an entirely unused package, and opt-in compilation, and executes every resulting bundle against valid/invalid inputs. It asserts that unused imports do not increase bundle size, unused compiler and field constructors disappear, and compilation remains available when called. Results are saved in `tree-shaking-results.json`.

This is a regression check for the tested browser ESM / ES2022 / esbuild configuration, not a guarantee for every bundler or configuration. With esbuild, an unused `const unused = date()` still retains construction code unless the consumer adds a call-site PURE annotation. Shared presence/default handling and the small internal compiler field plans remain in ordinary bundles. For the one-string consumer, named and namespace imports both measure 2646 bytes / 1271 gzip bytes; adding unused API imports has the same raw size. Calling `compile` measures 6673 bytes / 2657 gzip bytes after the tsdown build migration. These figures use a validator-only export and are separate from the schema-plus-validator benchmark fixtures above.

Call-site `/* @__PURE__ */` annotations can remove unused construction: adding an unused annotated `date()` or an annotated `object({ created: /* @__PURE__ */ date() })` keeps the raw bundle at 2646 bytes (1272 gzip bytes due to minified identifier differences). Both cases are covered by the regression check. Nested construction needs its own annotation; annotating the outer call does not declare its argument expressions removable. The argument-effect fixture also verifies that a supplied function still runs. Annotations permit skipping construction-time work (including option getters and errors) when the result is unused. A separate probe of `/* @__NO_SIDE_EFFECTS__ */` on the exported `date` declaration did not remove its unannotated consumer call with the installed esbuild; function-declaration annotations should not be confused with call-site annotations.

Type-check measurements use the same TypeScript compiler, strict mode, no emit, skipLibCheck and no ambient type packages. Three profiles each declare 100 distinct 30-field object schemas, infer their outputs and check an output assignment:

- Required constrained strings.
- Optional constrained strings using constructor flags in loculus.
- Mixed query fields: required strings and optional bounded integers, booleans, enums and repeated strings.

Zod and Valibot express the same inputs and outputs with their native composition APIs. Each profile runs five fresh compiler processes per library, rotating library order between rounds. `Check time`, instantiations and memory come from extended diagnostics; they exclude compiler startup timings. Small fixtures have substantial timing noise, so also inspect instantiation counts. These fixtures do not establish universal superiority for other schema compositions.

## Upstream fixtures

Run `pnpm bench:upstream` for supported cases from Zod's official benchmark suite, including normal and compiled Zod. See [scope and protocol](UPSTREAM.md) and [results](UPSTREAM-RESULTS.md). This is a separate `parse` benchmark, not the Standard Schema protocol above.

## Single-use and reused schemas

Run `pnpm build` and `pnpm bench:lifecycle`. [Protocol](LIFECYCLE.md) separates fresh-process schema construction/compile/first validation from repeated validation, including query/FormData normalization. [Results](LIFECYCLE-RESULTS.md).

The library now builds with tsdown 0.23.1 / Rolldown 1.2.13. Its 15 schema factory implementations carry `@__NO_SIDE_EFFECTS__`, preserved in the built entry. `check:tree-shaking` also runs `tree-shaking-rolldown.mjs` and saves `tree-shaking-rolldown-results.json`. In minified Rolldown output, the one-string fixture measures 2724 raw / 1290 gzip bytes whether or not an unannotated unused `date()` or nested `object({created:date()})` is present. Compiled output is 6754 raw / 2661 gzip bytes. Without minification, unannotated unused construction remains. No `manualPureFunctions` override or relaxed property side-effect settings are used. Unused construction can skip option getters and construction-time exceptions; validation entry points remain unannotated. Existing runtime/type/lifecycle reports predate this build migration and retain their original source and dist hashes.
