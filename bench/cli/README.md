# Current single-use suite

The schema compiler was removed. Run [the current single-use benchmark](../single-use/README.md) for these CLI models and the other representative schemas. Prior compiled results below are historical evidence from before removal.

# Command option benchmarks

Four selected option schemas inspired by official command documentation, each measured with sparse and densely specified inputs:

| Command | Fields | Features | Reference |
| --- | ---: | --- | --- |
| git log | 6 | Optional strings for dates, formatting, encoding and output | [Git](https://git-scm.com/docs/git-log) |
| git clone | 14 | Required repository, optional strings, positive safe integers, repeated exclusions and boolean flags | [Git](https://git-scm.com/docs/git-clone) |
| cf deploy | 10 | Nine command-specific options plus mode: optional strings, rollout enum and three boolean defaults | [Cloudflare](https://developers.cloudflare.com/cf/projects/#deploy) |
| cf dns records list | 38 | 37 command-specific options plus zone: optional name/content/comment/tag filters, five enums, numeric pagination, booleans and dry-run default | [Cloudflare](https://developers.cloudflare.com/cf/get-started/resources/#list-dns-records) |

Documentation accessed on 2026-10-12. The Cloudflare command metadata comes from the official [`cf` npm package](https://www.npmjs.com/package/cf/v/1.0.0-beta.14), version `1.0.0-beta.14`. The tarball SHA512 integrity was verified against the registry. `cf-reference.json` retains the option names, types, enums, defaults, package version, tarball integrity and hashes of the original metadata files. These are Cloudflare `cf` commands; the previously substituted Wrangler cases are removed from the current suite and report. The fixture IDs, exact expressions, input records, expected output and representative command lines are in `fixtures.mjs`.

The measured input is the flat record produced after argv parsing. Numbers arrive as strings; flags can already be booleans; repeated string options can be a scalar or an array. CamelCase names are a normalization policy of this benchmark. Optional values that depend on configuration remain absent; only explicitly modeled constants receive defaults. Invalid inputs test type safety at the schema boundary. This is a selected option model, not a full reimplementation: it excludes tokenization, command startup, config merging, Git date/ref/filter resolution, CF zone/account resolution, file/network operations and cross-option constraints. String fields deliberately validate their type rather than these command-specific languages.

Ordinary `construct` timing includes every field/schema factory and one successful validation. It is a warmed operation in a fresh benchmark process, not cold CLI launch latency. Ordinary `valid` / `invalid` reuse the schema. Compiled `valid` / `invalid` exclude schema creation and code generation; there is no compiled `construct` measurement. Compiled cases are exploratory reuse benchmarks, not the expected one-shot CLI path. Zod uses jitless ordinary schemas and explicit `z.compile` for compiled cases. Valibot uses its ordinary schema in both comparisons.

Each runtime uses nine independent processes, seven time-budgeted rounds after warmup and consumed output checksums. The existing coverage harness rotates library order and input records. The baseline snapshot is identical to the current production source, solely to reuse the established measurement harness; no before/after improvement is claimed. Exact Mann–Whitney tests with Holm correction and a 10% practical threshold are applied separately to the eight-profile ordinary and repeated-compiled families. A non-significant result is inconclusive, not proof of equivalence. Peer families are 96 ordinary and 64 compiled comparisons. These are measurements on one machine and the recorded versions, not a universal guarantee.

Run from the repository root, with no other benchmark running:

```sh
node bench/cli/prepare.mjs
node bench/cli/prepare.generated.mjs
node bench/cli/prepare.generated.mjs --baseline
node bench/cli/verify.mjs
node bench/cli/bundle.mjs
```

Keep `baseline.ts.txt` as the measured snapshot; replace it deliberately when starting a new baseline. `verify.mjs` compares output, issue count and paths across Node/Bun and ordinary/compiled workers, and checks the timed outputs against independently declared fixture expectations. Bundle measurements execute the actual minified modules and verify unused Loculus compile imports disappear. Schema and validator exports remain live, so this is not an empty consumer. Named Zod imports are included alongside the namespace import. Generated worker sources and minified modules are ignored; result JSON files are retained.

`behavior-probes.mjs` adds untimed, independently expected examples for scalar/repeated arrays, boolean words, numeric pagination, malformed and fractional numbers, invalid enums, null rejection and required fields. The updated CF probes include provision/defaults, rollout choices, DNS types and sort choices, malformed numbers and pagination with no invented bounds. Every minified ordinary/compiled consumer executes these probes. They do not alter the timed inputs.

## Measured results

The corrected cf suite was remeasured after replacing the Wrangler fixtures. Results and their source/fixture hashes are saved in the JSON files.

For the two cf schemas, with sparse/full input and Node/Bun (8 comparisons per mode/peer):

- Ordinary construction plus one validation wins all 8 comparisons against Zod and all 8 against Valibot.
- Ordinary repeated valid input wins 8 against Zod; against Valibot it wins 5 with 3 inconclusive. Repeated invalid input wins 8 against Zod; against Valibot it wins 6 with 2 inconclusive. There are no significant ordinary-mode cf losses.
- Compiled repeated valid input has 1 win and 7 losses against compiled Zod, and 4 wins and 4 losses against ordinary Valibot. Compiled repeated invalid input has 4 wins and 4 losses against each peer. It remains unsuitable as a blanket performance choice.
- Ordinary gzip: cf deploy is Loculus 1728 / Valibot 1743 bytes; DNS records list is Loculus 2218 / Valibot 2185 bytes. These differences are small. Named Zod imports are 25101 / 26610 bytes respectively; no Mini comparison is claimed.

 Each sparse/full pair has the same schema and bundle size. No production implementation or public API changed in this benchmark correction. Bun runs these schema models, not the cf CLI itself; the CLI's project runtime support is outside the benchmark scope.
