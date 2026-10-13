# Perry comparison

The compiler is Perry 0.5.1520, the GitHub `latest` release checked on 2026-10-11. The installed compiler reports the same version. `compiler.json` records the release URL, publication date, library versions, and the verified official macOS ARM64 runtime archive checksum.

The experiment compares loculus, Zod, and Valibot on the same three schema profiles as the bundle benchmark: three strings, thirty strings (min 1 / max 100), and four CLI fields (name, decimal/integer port with default and bounds, optional boolean, and enum). It uses the synchronous Standard Schema API. Zod has `jitless: true`; neither loculus nor Zod calls opt-in schema compilation. Native dynamic code generation is a separate capability from compiling the program with Perry.

Two Perry inputs are tested:

- `single-file-native`: esbuild bundles the built loculus ESM or the installed Zod/Valibot entry into one unminified `.ts` file. It contains no package JavaScript imports. An identical-byte `.mjs` copy is executed by Node as the reference, so Node does not pay TypeScript stripping costs at startup.
- `direct-import`: the equivalent TypeScript program imports the package normally. Compiler diagnostics capture the resolution/linking behavior instead of assuming this uses a JavaScript engine.

Each program checks success/output/issue count for normal, invalid, missing, null, long, nonstring, unknown-key, and Unicode inputs. CLI additionally checks defaults, numeric endpoints, nondecimal input, fractions, overflow, and a null port. The native probe output must match Node exactly before speed is recorded. Failed builds or differing/crashing executables have no speed result. Separate `unicode.mjs` checks the UTF-16 max-length boundary with 50 versus 51 emoji for loculus and Valibot.

Steady-state measurements use three fresh processes per candidate/dataset, 10,000 warmup validations, and seven timed rounds per process. Each round uses 50,000 iterations for strings-3/CLI and 10,000 for strings-30, with identical counts across candidates. `performance.now()` comes from `node:perf_hooks`, supported by both runtimes. Output key count or issue count is consumed and checked. Candidates rotate order; timing starts after all builds finish and runs sequentially. The report retains all rounds and reports their median/min/max in ns per validation. There is no result caching.

One-shot measurements use fifteen process launches and report wall-clock milliseconds through process exit. They include process startup, imports/module initialization, schema construction, one valid validation, JSON output, and exit. This is an executable/CLI-style one-shot comparison, not just the duration of the validator. It does not include build time; build durations are separate diagnostic values and depend on Perry cache state.

Sizes are raw and gzip-compressed **standalone Mach-O executables including the prebuilt Perry runtime and the benchmark/probe harness**. They are not the size of a JavaScript library. The compiler reports that its workspace source is unavailable, so automatic runtime size optimization cannot rebuild a smaller feature-selected runtime. A no-library timer/checksum program records the linked-runtime size floor; subtraction is not an isolated measurement of library code. These are the tested installation's output sizes, not claims about the smallest achievable Perry binary. The binaries require macOS system libraries; `otool -L` output is saved. Do not compare these numbers directly with the earlier browser ESM schema/validator bundle sizes.

The native Zod build's runtime error is recorded at the `Error.captureStackTrace` availability check. A trivial standalone `Error` check succeeds in both runtimes (`error-constructor-results.json`), so this does not establish that Perry universally lacks the Error constructor; the failure depends on the compiled Zod program. Direct-import linker diagnostics are saved separately. No library source or error handling is patched to obtain benchmark numbers.

## Reproduce

Install the compiler version from `compiler.json`. Fetch its matching runtime into `experiments/perry/generated/runtime` (or point `PERRY_RUNTIME_DIR` to an existing matching runtime). For the recorded macOS ARM64 release:

```sh
mkdir -p experiments/perry/generated/runtime
curl -fL https://github.com/PerryTS/perry/releases/download/v0.5.1520/perry-cross-aarch64-apple-darwin.tar.gz -o /tmp/perry-runtime.tar.gz
curl -fL https://github.com/PerryTS/perry/releases/download/v0.5.1520/perry-cross-aarch64-apple-darwin.tar.gz.sha256 -o /tmp/perry-runtime.sha256
```

Check the downloaded archive's SHA-256 against `compiler.json` / the official checksum before extracting, then:

```sh
tar -xzf /tmp/perry-runtime.tar.gz -C experiments/perry/generated/runtime
pnpm bench:perry
node experiments/perry/unicode.mjs
node experiments/perry/summarize.mjs
```

The generator preserves equivalent consumer code for all libraries. `results.json` contains compilation commands/diagnostics, binary and source hashes, semantic probes, build status, raw samples, cold-start values, and sizes. `RESULTS.md` contains the readable tables. Generated inputs, executables, static libraries and full build logs are ignored by Git; retained diagnostics are in JSON. A runtime timeout is reported as a failed measurement rather than a valid speed result.
