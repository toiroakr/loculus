# Exploratory mixed object compile continuation

Production/canonical reports are untouched. The dedicated snapshot `mixed-compile-baseline3.ts.txt` has combined3 hash `25a54b1c230cf21a20920b068711dc64b0506c628264a18be3b13ec358e00b95`.

Candidates and hashes are in `mixed-compile-manifest.json`:

- `mixed-compile-exact-all`: every non-array scalar check failure invokes the original captured validator and continues generated code if its first Result.value read is defined.
- `mixed-compile-exact-4`: applies the continuation only where at least four later fields have specializable compiled checks (including compiled arrays). Other failures retain the original break/remainder behavior.

This extends the earlier opaque-only candidate: defaults generally have a valid compiled string/number check, so undefined fails a non-opaque check and needs the same continuation. A transform normally has no private plan and an always-false check.

Successful continuation reads Result.issues once and Result.value twice, exactly as the original remainder for defined values; the second value can differ, including undefined. Getter exceptions propagate. Truthy issues retain the first issues read so remainder performs only the original second read. Undefined first values always fall back, with their first value read saved; own checks stay in remainder rather than being performed twice. Optional-missing inputs therefore receive no suffix acceleration through that field. Result getters may add/remove later input fields, which generated own/read operations observe in the original order.

The private remainder signature gets `firstRead?: {issues?, value}`. No public signature changes. Arrays keep their current generated path and fallback behavior. Compiled check strings are built once after compiled-array validators, in the original per-key check order; the threshold heuristic reuses those strings rather than rereading plan getters. CSP/new Function failures retain identity fallback.

Fallback still constructs the same full output literal with unprocessed undefined variables and uses the existing remainder writes/deletions. Prototype setter/readonly and receiver keys scenarios are prepared, alongside existing input getter/Proxy/error/Symbol cases. After continuing through an opaque success, a later fallback begins at that later field rather than the original opaque field; values previously processed are included in the output literal with the original values.

## Prepared verification and diagnostics

Nothing has been built, imported, validated, timed, or fully typechecked yet. Run only after the parent's current formal measurements finish:

```sh
node bench/optimization-3/object-candidates/verify-mixed-compile.mjs
node bench/optimization-3/object-candidates/bench-mixed-compile.mjs mixed-compile-baseline3 transform-100 valid
node bench/optimization-3/object-candidates/bench-mixed-compile.mjs mixed-compile-exact-all transform-100 valid
node bench/optimization-3/object-candidates/bench-mixed-compile.mjs mixed-compile-exact-4 transform-100 valid
```

The verifier transpiles the three snapshots to local `.mjs` files. It applies existing 54 scenarios/CSP, six fixture cases, four Result getter/throw cases, two prototype hook cases, and one input mutation case. The Result accessor cases record issues/value counts/order and raw own/get Proxy traps. These explicitly include a first defined value followed by a second undefined value and changing issues arrays.

Diagnostic profiles: `transform-100`, `default-100`, `query-12`. Modes: `valid`, `invalid`, `construct`. Run separately under Node/Bun, with each process isolated from other CPU measurements. Construction measures fixture+object+explicit compile; parse profiles consume output fields and issue text. Samples, iteration counts, runtime, and checksum are emitted as JSON marked `exploratory:true`. These additional fixtures must not be mixed into the formal 96-case comparison.

## Size and performance risks

The firstRead remainder logic and check-string array increase static code. Generated continuation code adds validator calls and result inspection to each eligible field's failure branch; the always variant may enlarge every specialized scalar statement even when all inputs satisfy native checks. Threshold4 avoids late-field continuation code but adds generation-time suffix slice/filter allocations and counting. Compile construction and generated source size may regress, even if opaque-first valid parsing improves. No measured improvement is claimed. If the added private signature/cached reads costs exceed the mixed-profile gain, retain the current implementation.

## Final wide opaque/presence-only candidate

`mixed-compile-wide-presence` is appended to the dedicated manifest. Width<32 retains the original scalar statement generation, including the original start/first declaration and remainder argument list. Wide shapes cache check strings once and compute right-to-left counts in O(n), replacing suffix slice/filter scans. A continuation is emitted only for a check==false opaque field or a plan with optional/nullable/nullish/default presence, and only with four or more later specializable fields. Pure basic fields retain the exact original failure branch. The cached array marker replaces the original statement kind test, avoiding an extra plan.kind read.

The shared cached-read remainder helper still adds optional cache checks to fallback processing, even when width<32 passes no cache. Static package size can still grow because this helper supports firstRead. Wide construction adds two arrays and one reverse loop, and private presence-plan inspection; it does not allocate suffix slices/callbacks per field. Public child Standard getters and validator callbacks remain at their original capture/validation points. Private presence inspection reads immutable option snapshots, rather than public meta or Standard wrappers.

The dedicated semantic verifier now tests Result getter changes/throws with both 8- and 40-field suffixes, so the final candidate's wide activation is covered as well as the untouched narrow path. This is still source preparation only: no build, semantic verification, or timing was run by this agent for the final candidate. If the mixed exploration still loses, retain the existing production compile implementation.

## Selective generated cache support

`mixed-compile-wide-selective` changes only wide-presence's generator cache declaration/argument selection. A construction-local `continuing=false` is set to true only when an eligible continuation statement is emitted. `firstRead` is declared/passed only in that case. This keeps the generated function body identical by construction for widths below32 and pure-basic wide objects: original checks/statements, `let start,first;`, and original remainder argument list. The shared cached-read remainder helper still differs from baseline, so this is generated-function identity, not full module/parse identity. Generator classification work on pure wide shapes is unchanged.

Existing all/4/wide-presence snapshots keep their previous hashes. Dedicated manifest/verifier automatically include the appended candidate. No build, semantic comparison, generated-source capture, or timing has been run for selective by this agent; generated byte identity remains for the parent's gate to verify.

## Parent validation and adoption

The preparation notes above describe the handoff state. The parent subsequently
built and tested all candidates. The all/4 versions were rejected for Bun
construction and query regressions. The selective wide version was adopted,
with TypeScript casts in the shared remainder to avoid extra Result accessor
reads. `final.ts.txt` freezes the actual production source; candidate hashes are
left unchanged.

The dedicated verifier passed 88 semantic scenarios on both Node and Bun.
Production regression tests add wide changing Result accessors, throwing
getters, Proxy own/get ordering and defaults/transforms that mutate later
fields. The complete production suite has 57 tests. Mixed formal measurements
are recorded separately in `../MIXED.md`: eight significant gains and two Bun
construction regressions. Ordinary byte identity is recorded in
`../ordinary-worker-equivalence.json`. Generated function identity for pure
basic/narrow objects does not imply shared fallback-helper identity, so the
canonical compiled suite is freshly measured on the production source.
