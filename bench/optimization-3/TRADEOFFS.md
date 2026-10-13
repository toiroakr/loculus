> Historical experiment before removal of the schema compiler. Current policy and measurements: [single-use](../single-use/README.md).

# Practical performance policy (proposal)

This proposes a replacement for all-case superiority. It does not change the
public API or treat these thresholds as user-approved release gates.

## Priorities

1. Preserve input semantics, output types, Standard Schema, and RHF/Politty
   compatibility. Do not weaken ownership checks, callback/getter ordering,
   default references or freeze/copy behavior to improve a benchmark.
2. Make ordinary schemas the default for CLI, forms and HTTP. They should remain
   small, cheap to create, and free of compiled code when compile is unused.
3. Treat compile as an explicit optimization for a reusable schema with a
   demonstrated benefit on its runtime and representative good/bad inputs.
4. Judge remaining losses by absolute bytes and time as well as ratios. A
   statistically significant tiny difference does not by itself justify extra
   architecture or a public API change.

## Current ordinary tradeoff

The final source is
`4c058388e5907fd15a2ab92cfa972cc54b4c346fad0b4f0b62a5195833e2b2cf`.
Canonical96 ordinary data uses byte-identical timed workers from the earlier
measured source, with the correspondence preserved in
`ordinary-worker-equivalence.json`.

- Loculus is smaller than named-import Zod in all96 cases and smaller than
  Valibot in43. Of the53 larger Valibot comparisons,52 add at most256 gzip bytes;
  the largest adds339 bytes. A proposed ordinary-size tolerance is at most512
  extra gzip bytes against the equivalent Valibot composition in these fixtures.
- The57 significant ordinary construction losses to Valibot have a maximum
  absolute gap of1.10 microseconds (Node width100). The next largest is0.189
  microseconds. A proposed tolerance is2 microseconds per create-plus-validate
  call in the existing canonical fixtures, subject to the same feature scope.
- The only significant ordinary repeated-valid loss to Valibot is Bun width100:
  about730 versus579ns, a151ns gap. The ordinary RHF supplement wins all36 peer
  comparisons. Ordinary repeated good/bad inputs should be optimized first;
  exchanging a broad regression for one isolated win is not acceptable.
- All six typecheck groups have lower Loculus median check times, without a
  timing significance test. Preserve the current public declarations unless a
  deliberate API requirement justifies changing them.

These are measured-fixture tolerances, not guarantees for arbitrary schemas or
machines. The thresholds are proposed product priorities, not statistical facts.

## Compile evaluation: repeated validation only

Compile generates code for reuse. Its generation-plus-one-validation measurement
is excluded from evaluation. Generation completes before the timing window;
only repeated valid/invalid inputs are compared. Construction amortization counts
and one-time compiler-generation regressions are not acceptance criteria.

Ordinary schema creation plus one validation is a separate CLI-oriented metric:
calling factories such as string()/object() and then validating once. It does not
include compile. Form schemas can be reused and are not classified as inherently
one-shot. This ordinary metric uses repeated measurements of the create-plus-one
operation; it is not cold CLI startup.

The current cross-scope examples (arithmetic comparisons of separate run
medians, not independent confirmation) remain:

| Schema / runtime | Ordinary valid | Compiled valid |
| --- | ---: | ---: |
| mixed default100 / Node | 6.44 us | 1.49 us |
| mixed transform100 / Node | 6.46 us | 1.51 us |
| mixed default100 / Bun | 0.859 us | 0.678 us |
| mixed transform100 / Bun | 0.853 us | 0.695 us |
| mixed query12 / Node | 0.305 us | 0.551 us |
| mixed query12 / Bun | 0.119 us | 0.116 us |
| RHF100 rows / Node | 8.00 us | 8.13 us |

Only repeated performance, size, types and semantics should decide compiler
improvements. Prior compiler candidates rejected solely for generation cost
need reconsideration under this criterion. Runtime regressions and bundle growth
remain relevant. Historical raw construction data is retained without entering
the repeated-only comparison or multiple-testing family.

## Changes to avoid

Do not automatically select an engine-specific implementation or benchmark at
startup. Do not add a consumer option for every candidate optimization. Do not
require compilation for RHF or discard small/failed comparisons. Retain the
ordinary/compile split and the evidence for losses so future improvements can
be checked against the same inputs and semantics.
