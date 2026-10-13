# Optimization 3: evidence and rejected alternatives

The baseline is the implementation after RHF support and optimization 2. Its
source, built JavaScript, declarations and previous reports are frozen in
`before/`. Exploratory timings are hypotheses, not significance claims. Final
claims come from `settled-results.json` and the corresponding significance files.

## Sources consulted

- [V8 fast properties](https://v8.dev/blog/fast-properties): output shapes and
  dictionary properties suggested pre-seeding wide output objects. The guarded
  candidate preserves setter behavior but made invalid input and construction
  substantially slower. Neither unguarded nor guarded pre-seeding was adopted.
- [V8 fast for-in](https://v8.dev/blog/fast-for-in): enumeration and ownership are
  different operations. Replacing ownership checks with an input-key snapshot
  changes observable Proxy/getter order. Loculus still reads own properties only.
- [V8 Maglev](https://v8.dev/blog/maglev),
  [React cliff](https://v8.dev/blog/react-cliff), and
  [preparser](https://v8.dev/blog/preparser): generated function length and parser
  work motivated compile experiments. Per-field declarations reduced construction
  cost in screening; the final suite also measures repeated validation separately.
- [V8 spread elements](https://v8.dev/blog/spread-elements) and
  [object rest/spread](https://v8.dev/features/object-rest-spread): fast paths depend
  on syntax and observable behavior. Results for array spread in leading position
  do not establish equivalent improvements for `[key, ...path]`.
- [JavaScriptCore speculation](https://webkit.org/blog/10308/speculation-in-javascriptcore/)
  and [GC](https://webkit.org/blog/12967/understanding-gc-in-jsc-from-scratch/):
  Node improvements are not evidence of Bun improvements. All screened performance
  candidates were measured on both engines. Source-level allocation removal is not
  reported as a measured reduction in heap allocations.
- [esbuild pure calls](https://esbuild.github.io/api/#pure): the annotation applies
  to a call, not its arguments. A pure `Object.assign(fn, {[symbol]: value})` can
  retain the computed argument and function. A pure IIFE around the initializer
  allows unrelated code to disappear. The tested numeric initializer still had a
  size/performance tradeoff, so it was not adopted.
- [Standard Schema](https://standardschema.dev/): structural compliance permits
  alternate representations, but it does not make changing existing copy/freeze
  behavior harmless. The lazy prototype getter candidate was rejected.

Claude Code reviewed a source snapshot without tools, hooks or write access.
Its suggestions were tested independently; `claude-review.md` is not a benchmark.

The compiler now captures the module's ownership helper, matching ordinary
validation. Replacing global `Object.hasOwn` after module evaluation therefore
does not alter compiled ownership checks. The former generated function used a
global lookup. No compatibility claim is made for monkey-patching that intrinsic;
input getters, Proxy descriptor traps and output prototype setters remain covered.

## Candidate decisions

| Family | Observation | Decision |
| --- | --- | --- |
| Redundant number/array plan guards | Kept a string validator in numeric bundles | Remove guards that are always true |
| Direct field literals | Small bundle reduction without an extra representation | Inline the existing literal in configuredField |
| Gregorian calendar check | Removes date-only Date/ISO roundtrip; catches malformed early years without throwing | Adopt after full 400-year cycle comparison |
| Capture own in generated functions | Wide Bun repeated validation improved in screening | Adopt and verify in the full suite |
| Per-field generated var | Bun compile construction improved in screening; generated bundles smaller | Adopt and verify in the full suite |
| Object output pre-seeding | Unguarded copies can leak Symbols or bypass inherited setters/readonly properties | Reject |
| Guarded output pre-seeding | 64 semantic scenarios pass; wide invalid/construction roughly doubled on Bun; all object bundles grew around 100 gzip bytes | Reject |
| Bound hasOwnProperty | Bun substantially slower, especially compiled wide objects | Reject |
| Prototype-call ownership | No consistent Bun gain and extra bytes | Reject |
| Pre-sized validators | Small Node gain, Bun construction loss and extra bytes | Reject |
| Basic validation/result elision | Bun wide construction became slower | Reject |
| Dedicated string-only object loop | Five candidates pass 96 semantic scenarios; wide Bun validation improves around 9%, construction becomes 1.7–1.8× slower, object bundles grow 156–220 gzip bytes | Reject |
| Boolean-only result elision | Small or inconsistent gains and 34–120 extra gzip bytes across screened profiles | Reject |
| Native numeric result elision | Reads a private plan on opaque callable Proxy validators before apply; new get trap or exception | Reject before timing |
| Shared metadata or Standard Schema object | Freezing/mutation/identity couples independent fields | Reject |
| Lazy Field class | Copying loses Standard Schema before first access; freezing/sealing can throw | Reject |
| Shared numeric validators/plans | Some construction gains; size grows, or frozen shared functions break future construction | Reject |
| Single digit numeric fast path | Node array-number improved but Bun slowed, with extra bytes | Reject |
| Presence flags/specialized wrappers | Inconsistent cross-engine improvements, more bytes | Reject |
| Generic plannedField helper | Adds bytes without reliable speed improvement | Reject |
| Validator map / early basic field returns | Cross-engine construction or invalid-input regressions | Reject |
| Date regex hoisting | No consistent gain, extra bytes | Reject |
| Imperative ValidationError formatter | Sparse arrays and messages differ; small engine-specific gain | Reject |
| Compiled opaque-field continuation, every field | Repeated-input gains, but Bun construction and small query regressions | Reject broad versions |
| Selective wide continuation | Eight significant mixed-schema gains, two Bun construction regressions; cached Result reads preserve accessor ordering | Adopt for reusable HTTP compile; ordinary mode unchanged |
| Suppress compiled deletes after first issue | Negligible gains, more bytes | Reject |

Candidate sources and JSON results are retained, including rejected candidates.
Not every generated candidate was timed: candidates that changed observable API
behavior or failed equivalence were rejected before performance measurement.

## Date correctness

The old implementation can throw `RangeError` for early-year malformed ISO dates
because permissive native parsing accepts the first Date while the canonical
date-only Date is invalid. A regression test first reproduced the exception,
then a finite check fixed it. The performance candidate subsequently replaced
canonical formatting with explicit Gregorian month/day validation.

`verify-calendar.mjs` compares a complete 1600–1999 Gregorian cycle plus boundary
years, month/day overflows, timezone day rollovers and trailing newlines on Node
and Bun. The only allowed baseline differences are the recorded RangeError cases,
which now return `Invalid date` issues. Public Date output remains a Date parsed
from the original string, including its timezone.

## Measurement scope

The full ordinary suite has 96 profiles. Compiled measurements include all
eligible object profiles, including documented fallback paths for schemas the
compiler does not specialize. Both modes use nine fresh processes per runtime,
seven settled rounds per process, rotating inputs and consumed outputs.
Construction includes one valid validation. It is not CLI process startup.

Exact two-sided Mann–Whitney tests use process medians, handle ties, apply Holm
correction over the original full comparison families and require a 10% practical
difference. These results describe the machine, versions, fixtures and harness;
they are not a claim that every possible input or runtime is faster.

Bundle comparisons consume both the schema and its Standard Schema validator,
use the actual tsdown output, and cover all 96 profiles with esbuild. Separate
esbuild/Rolldown/Bun checks exercise unused exports and scalar/object entrypoints.
Declarations are compared byte for byte, and type fixtures are rechecked in three
fresh processes. Browser checks use Chromium with a mobile viewport, not an
actual iPhone or Safari.

## Full-suite results

The final 96-profile ordinary comparison found 20 practical significant gains
against the frozen baseline and no practical significant losses. The 49-profile
compiled comparison found 10 gains and no losses. The detected improvements are
date profiles; the ownership/declaration compiler changes did not independently
establish a significant wide-object gain in the corrected full-suite test.

Ordinary valid date validation improved from roughly 697 ns to 199 ns on Node
and 305 ns to 148 ns on Bun. Ordinary Valibot comparisons retain 58 significant
losses: 57 construction-plus-validation comparisons and Bun width-100 valid
validation. Explicit compiled comparison retains 15 losses to Zod and 97 to
ordinary Valibot, across both engines and all three operation modes. These counts
are case × engine × operation comparisons, not distinct API features.

The actual tsdown-output size comparison shrank 79 of 96 gzip bundles, grew 13,
and left four unchanged. Loculus was smaller than the ordinary Zod namespace entry in all
96 and smaller than Valibot in 43. Six typecheck groups had lower Loculus median
check times, without a timing significance test; public declarations are
byte-identical to the baseline. These results do not meet an all-case superiority
claim. The report exposes remaining losses instead of dropping their profiles.

The ordinary reports retain the combined3 measured hash and date, backed by
byte-identical timed-worker proof for the final source. Canonical compiled49,
RHF compiled3 and mixed ordinary/compiled3 were measured at the final source.
RHF ordinary3 has 36 peer wins and no losses; its compiled3 has 10 peer losses.
Mixed compiled3 has eight before/after gains and two Bun construction losses.
This is an accepted reuse tradeoff, not a zero-regression claim across every
operation. See `SUPPLEMENT.md` and `MIXED.md` for separate families and probes.

Additional six-schema bundles grow by 257–288 gzip bytes in compiled mode.
The one-string import check shows 93,150 gzip bytes for Zod `{ z }`, 24,837 for
root/v4 named imports, and 4,421 for Mini named imports. Loculus is 1,280 and
Valibot 1,078 bytes. Thus the namespace bundle comparison is not the smallest
available Zod consumer; all96 root named-import bundles are recorded separately
in `additional-bundle-results.json`. Mini was only checked for this single
size/validation example, not the complete performance or type suite.

All96 named-import Zod bundles are still larger than Loculus on this machine.
These additional sizes leave the original namespace measurements intact rather
than retroactively relabeling them as named imports.

## Current evaluation supersedes construction-based compiler conclusions

Compiler code generation is a reuse feature. Generation-plus-one comparisons,
amortization counts and construction-based compiler candidate rejection are
excluded from the current evaluation. Historical numbers above are retained for
provenance. Current repeated-only statistics are in the
`*-compiled-repeated-significance-results.json` reports; ordinary schema creation
plus one validation remains a separate metric. Runtime, size, type and semantic
tradeoffs still apply.
