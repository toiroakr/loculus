# Object optimization candidates

These are isolated candidate snapshots. `manifest.json` pins the baseline hash and each candidate's source hash. TypeScript snapshots use `.ts.txt` so the main project's typecheck does not load duplicate implementations. `verify.mjs` performs a small esbuild transpilation and semantic checks, generating `.mjs` files here. The parent measured multiple candidates in the `../*-screen-results.json` files; the canonical full suite measures the accepted combination. Candidate generation does not modify production source.

## Candidates

| Candidate | Hypothesis | Costs / caveats |
|---|---|---|
| own-prototype-call | Compare direct `hasOwnProperty.call` with `Object.hasOwn` | Identical own lookup and Proxy descriptor traps in the tested inputs. The prototype method remains a dynamic lookup, unlike captured `Object.hasOwn`. |
| own-bound-call | Bound native own-property function may inline differently in V8 / JSC | Adds a once-per-module bind and potential bundle bytes. |
| output-preseed | Clone the frozen schema shape for each output, then overwrite validated fields, avoiding a hundred incremental shape transitions | One spread copy per input; omitted properties must be deleted. Small objects may regress. No extra construction-time template. |
| output-preseed-wide | Use preseed only at width >= 32 | Same hypothesis with a constant-per-schema width branch. |
| basic-allocation-elision | Inline successful unconstrained string fields; skip validator call and intermediate Result allocation | Adds bundle bytes and a validator-identity comparison. Failed/custom fields retain the original validator receiver and call order. |
| preseed-wide-basic | Combine spread output shape reuse and Result allocation removal | May improve width-100 execution with little extra schema construction, but must earn its bundle cost. |
| compile-captured-own | Pass module-captured own function into new Function, removing repeated Object.hasOwn global/member lookups | Own checks stay per field and precede each getter; no input key/prototype pre-scan. |
| validators-presized | Allocate validator array at final length and assign by index | Reduces repeated push capacity growth; holey-array representation may hurt execution. |
| compile-captured-bound-own | Combine captured-own compiler with bound native predicate | Isolates binding/inlining effects in generated code. |
| compile-per-field-var | Declare function-scoped field temporaries immediately at their use site | Future variables still read undefined in the remainder object; removes lexical initialization boilerplate. Likely small or no effect, but tests a distinct generated-code shape. |

## Semantics

`node bench/optimization-3/object-candidates/verify.mjs` passed 38 checks per candidate, plus CSP fallback identity. Both normal and compiled parsing were checked. Inputs cover widths 0/1/3/30/100, invalid values, missing/explicit undefined/null/default, getters modifying later properties, callback order and throws, Proxy get/descriptor/ownKeys/has traps, snapshot mutation/freeze, hostile property names, output key ordering/prototype, and passthrough getters deleting later unknown properties.

These checks are a limited local equivalence test, not a full contract proof. The expanded 54-check results are in `semantics-results.json`; failures disqualify unchanged-semantics adoption. Public copy/freeze compatibility is checked separately for representation-changing candidates.

## Measurement

Do not run concurrently with the parent agent's measurements. After permission, fresh-process examples are:

```
node bench/optimization-3/object-candidates/bench-one.mjs baseline width-100 valid plain
node bench/optimization-3/object-candidates/bench-one.mjs output-preseed-wide width-100 valid plain
bun bench/optimization-3/object-candidates/bench-one.mjs compile-captured-own width-100 valid compiled
```

The convenience runner consumes output key counts or issue counts, warms up, and reports nine round samples. Schema construction mode includes validation, matching the lifecycle comparison's combined creation/use scope. It creates a fresh shape using Object.fromEntries; therefore construction timings must not be substituted directly for the coverage runner's literal-shape timings. For canonical comparison, use the candidate `.ts.txt` file as `bench/coverage/prepare.mjs --source=... --out-dir=...` and preserve the established sequential process protocol.

## Source comparison and rejected shortcuts

Installed Zod 4.6.5 `src/v4/core/compile.ts:generateObjectCheck` caches `input[key]`, emits primitive checks, and commonly omits an own-property check for required fields. Loculus must do an own check for each key immediately before its getter to exclude inherited values and preserve later-key mutation and Proxy ordering. Width-100 compiled timings include this semantic difference.

Input key/prototype pre-scans, unchecked `in`, reference-preserving mutable shape, dropping freeze, returning the original input, and invalid-input fallback that rereads prior getters or reruns callbacks are excluded. Singleton schemas and class conversions have observable identity or bundle implications and are not included here. Automatic JIT would charge all ordinary users for compilation code; the existing explicit compile API avoids that tradeoff.

## Second generation

Private templates at thresholds 8/16/32/64 use only Object.keys-derived string fields. `preseed-clone-strip-32` instead clones fields and removes Symbol keys at construction; `preseed-symbol-fallback-32` disables preseed when any copied Symbol key exists. Public-template thresholds 16/64/128 test the width branch, but retain the known Symbol leak and are **not production eligible**.

The earlier 38-check pass did not cover enumerable Symbol fields or inherited Object.prototype setters/non-writable slots. Public spread preseed leaks Symbol schema objects; all preseed forms bypass inherited output setters/read-only behavior because fields already exist as own properties. Matching the former output-assignment behavior for arbitrary prototype mutation during input getters is incompatible with simply precreating own fields. A deliberate safe-output-write policy can make normal and preseed output consistent, but that is a behavior change and requires a concrete separate decision.

Opaque compile continuation invokes unsupported validators exactly once and resumes compiled checks after a successful non-undefined output. Undefined successes retain the remainder path. The simple version may add Result.issues/value accessor reads when falling back. `compile-opaque-exact-reads` saves the already-read fields only on fallback, allowing the remainder to preserve accessor read counts; `compile-opaque-exact-captured-own` adds the captured own function. `compile-no-delete-after-issue` suppresses deletions only once an issue already makes the output unusable, preserving all input/validator/Result reads.

`verify.mjs` includes enumerable Symbols at widths 100/129, inherited setters/read-only slots, and custom structural Field validators returning Result accessors. It records discrepancies instead of stopping at the first one. A nonempty failures array disqualifies a candidate from unchanged-semantics adoption. These expanded checks were run; public and private unguarded preseed candidates fail prototype-related scenarios, and simple opaque continuation fails Result getter scenarios.

`bench-one.mjs` additionally accepts `opaque-width-100` to expose the current first-transform-to-generic-remainder behavior.

## Further isolated variants

- `boolean-native-elision` and `boolean-coercion-elision` skip intermediate Result allocation only for the shared pure boolean validator's supported successful inputs. Other validators remain untouched.
- `number-native-elision` uses a captured FieldPlan only for native finite numbers satisfying all safe-integer/bound checks. Non-number bounds defer to the original validator to avoid duplicated coercion side effects. Its added plan lookup and code size are likely disadvantages on string-only shapes.
- `shared-basic-meta` freezes and shares metadata for no-options string/boolean, preserving distinct schema/standard wrapper identity.
- `shared-basic-meta-standard` also shares frozen Standard Schema wrappers for those pure shared validators, reducing each basic field to one new public schema object. Both sharing forms change metadata identity and freeze behavior: they are **conditional API-contract experiments**, not unchanged-semantics replacements. They comply with the public readonly types but reject JavaScript writes that the current runtime happens to allow. Schema identities remain distinct; adapters keyed by schema are unaffected. PURE annotations on freezes allow unrelated shared metadata to tree-shake.

Snapshot generation reuses `baseline.ts.txt` by default; pass `--refresh` only when intentionally replacing the pinned baseline. Not every generated candidate was timed: representation-changing candidates are rejected before performance measurement.

## Guarded preseed

`baseline3.ts.txt` freezes the accepted optimization-3 combination separately.
`preseed-safe` clones a private string-key template only for width >= 32, removes
failed/missing keys, and falls back to ordinary assignment before an inherited
setter or readonly slot is encountered. The second Result value read happens
before detecting a newly installed prototype property, preserving getter order.
The fallback deletes current/future preseeded keys so a setter observes only
already processed output keys.

The dedicated verifier passes 64 scenarios plus CSP identity fallback, including
prototype mutation from a Result getter and from an output setter. Screening
still rejects the candidate: Bun width-100 invalid input and construction become
roughly twice as slow, Node construction also worsens, and small object bundles
grow about 100 gzip bytes. Source and results are retained in
`preseed-safe-semantics-results.json` and `../preseed-safe-screen-results.json`.
