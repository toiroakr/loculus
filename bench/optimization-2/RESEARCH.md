# Second optimization pass

The immutable `before/` snapshot is the implementation after adding object-array types and the RHF example. It is distinct from the first optimization baseline. Generated workers are ignored; reports record source hashes and exact package/runtime versions.

## Sources and hypotheses

- [V8 fast properties](https://v8.dev/blog/fast-properties): property insertion order influences shared hidden classes. Preserve output key order and benchmark schema construction separately from repeated validation. Avoid replacing normal objects with null-prototype objects solely for speed: observable semantics would change.
- [V8 fast for-in](https://v8.dev/blog/fast-for-in): enumeration can benefit from shape caches, but prototypes and mutations matter. Passthrough must keep the existing `Object.keys()` snapshot; blindly using `for-in` would change getter/mutation behavior.
- [V8 elements kinds](https://v8.dev/blog/elements-kinds): packed and holey arrays have different optimization behavior. Preallocating validator arrays is a hypothesis, not a guaranteed improvement.
- [V8 object rest/spread](https://v8.dev/features/object-rest-spread): assignment and defining own properties differ when setters are inherited. Passthrough assignment needs prototype checks and regression coverage.
- [JavaScriptCore ES6 optimization](https://webkit.org/blog/7536/jsc-loves-es6/): lookup inlining and allocation elimination suggest testing shared scalar validators and avoiding redundant path arrays. This older article does not establish current Bun performance; Node and Bun measurements decide adoption.
- [WebKit memory debugging](https://webkit.org/blog/6425/memory-debugging-with-web-inspector/): allocation profiling has overhead. Throughput measurements run in fresh processes without a profiler attached.
- [Valibot comparison](https://valibot.dev/guides/comparison/): small composable functions are relevant to tree shaking. Inspect installed source and measure minified/gzip bundles, including isolated imports, rather than assuming engine throughput implies smaller bundles.

## Independent review

Claude Code examined the current source, behavioral constraints and known losses using a read-only prompt without tools, hooks or MCP servers. Its unverified suggestions are preserved in `claude-review.md`. Suggestions are not treated as findings until reproduced or measured. In particular, removing string guards from enum validators and changing own-property semantics are not accepted without equivalent behavior.

## Verification policy

- Compare all 96 existing profiles with frozen validation results, issues and paths.
- Compare 300 fixed-seed heterogeneous row inputs in ordinary and compiled modes.
- Explicitly protect getter/callback ordering, captured options and validators, enum snapshots, default references, passthrough descriptors and RHF row moves.
- Explore using three independent processes; confirm selected changes with nine independent processes per runtime. Each process warms for 30 ms and reports the median of seven calibrated rounds. Rotate execution order and consume outputs.
- Report construction-plus-one-validation and repeated validation separately. Do not claim construction-only or CLI startup performance from the former.
- Use the existing exact Mann–Whitney test with Holm adjustment and a 10% practical threshold. Unmeasured profiles are not asserted equivalent.

## Experiments

Results and adoption decisions are recorded after measurements complete. No universal superiority claim is made from a selected subset.

Exploration A: conditional path prepending avoids spreading a temporary empty fallback array at the source level. This does not assume that a JIT actually allocated that temporary. Share the boolean validator, and resolve its compiler plan by function identity so separately constructed presence variants cannot overwrite it.

Exploration B: share the unconstrained number validator and use guarded assignment for unknown passthrough properties. Number construction improved, but duplicating the unconstrained validator increased isolated number gzip bundles by about 29 bytes and root bundles by more; do not adopt it. Passthrough preserves `Object.keys()` snapshots and reads the unknown getter before checking inherited properties.

Exploration C: inline enum membership into one validator and replace default-key `some()` with a loop. Reject: standalone small enums slowed notably on Bun, while targeted-default construction showed no consistent improvement. Preserve the previous enum guard and lazy lookup threshold.

Exploration D: share error collection and own-property definition helpers. Throughput remained promising but root gzip bundles grew further. Reject the extra helpers.

Final candidate: conditional path prepending, shared boolean/date validators, and passthrough assignment guarded by `key in output`. Since unknown keys cannot already be known output keys, this detects inherited properties while also preserving behavior for dynamically introduced setters and read-only prototype properties. Dangerous keys use `Object.defineProperty()` with the original descriptor. No object/array types or public parsing rules change.

Additional engine references:

- [JavaScriptCore speculation and JIT tiers](https://webkit.org/blog/10308/speculation-in-javascriptcore/): allocation elimination and tier promotion depend on the executed workload. This reinforces separate construction/first-use and repeated-use measurements; warm throughput is not cold startup evidence.
- [V8 lazy parsing and contexts](https://v8.dev/blog/preparser): closures can retain contexts. Sharing noncapturing validators is a testable construction hypothesis; it does not justify assuming every local function allocates in every optimized execution.

## Allocation diagnostic

Three fresh Node processes ran 100,000 missing-input validations of a 100-field object, after 5,000 warmups. V8 `--trace-gc-nvp` allocated counters totalled approximately 2.0 GB for both versions, with 591–592 GC events. No measurable allocation reduction was found in this diagnostic. The speed gain must not be described as a proven reduction in Node heap allocations; avoiding the spread execution path remains consistent with the timing result, but its causal contribution has not been isolated. See `allocation-results.json`.
