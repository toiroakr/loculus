# Why the remaining object cases lose

Measured current generated workers, installed Valibot 1.5.0, Node 24.13.0 and Bun 1.4.3 on Apple M3. Nine independent processes, the same retained-schema/result and recursive-checksum harness as the current build-time report. Production source and plugin are unchanged. These are causal diagnostic variants, not alternative shipping APIs.

## Strict object construction plus one valid validation

| Variant | Node ns | Bun ns |
| --- | ---: | ---: |
| Generated Loculus | 125 | 88 |
| Loculus without shape freeze | 102 | 77 |
| Loculus retaining original shape | 102 | 70 |
| Valibot | 91 | 68 |
| Valibot with entries copy/freeze | 110 | 103 |
| Valibot with copy/freeze, own-input checks and array-root rejection | 122 | 87 |

Valibot ordinarily retains live entries. Loculus copies/freeze shape, extracts keys, checks field markers and captures child validation functions. The alignment variants do not implement every Loculus guarantee, including arbitrary child validator capture and opaque issue behavior. They bring construction costs close on both engines and support the hypothesis that the small strict object's deficit is largely added guarantees/preparation. Deltas are not additive: hidden classes and JIT changes can make a combined variant faster than another variant with fewer checks.

The timed data are valid own-property objects. Valibot strictObject reports only the first unknown key whereas Loculus collects all unknown own keys, but that error-path difference cannot explain this valid-input benchmark.

## Width 100 repeated validation

| Variant | Node ns | Bun ns |
| --- | ---: | ---: |
| Generated Loculus | 11,653 | 1,202 |
| Loculus with known-field own checks removed | 10,069 | 1,067 |
| Valibot | 12,220 | 1,023 |
| Valibot with own checks and array-root rejection | 12,309 | 1,158 |
| Loculus fused fixed-object prototype, own checks retained | 2,902 | 846 |

Shape freeze happens outside repeated validation timing. It cannot explain this repeated deficit. Input ownership checks account for a substantial part of the measured Bun gap, although these variants deliberately change input semantics and cannot ship as-is.

The plugin currently generates scalar fields only. The object validator still loads keys and child functions dynamically, calls each child, handles its result container, and assigns dynamic output keys. The fixed-object prototype replaces this path with interleaved direct ownership checks, string checks and fixed-key output writes. It keeps object shape construction and freeze and checks own properties; it does not relax those guarantees. All valid/invalid/probe results in this fixture, including full issues, match the ordinary generated object on both runtimes.

The fused prototype beats Valibot for this workload on both engines. Two-sided exact Mann-Whitney with tied ranks, Holm over 28 declared contrasts, and a 10% practical threshold confirm the repeat gains (Bun adjusted p=0.0359; Node p=0.0012). It is specialized to exactly 100 required plain-string fields. It has not been generalized to defaults, other fields, callbacks, arbitrary schemas or all getter/prototype cases; production regression and size checks remain necessary before adoption.

Therefore there are both semantic costs and unexploited optimization opportunities. The own-property policy and frozen shape are not evidence of an unavoidable performance ceiling. Whole-object build-time specialization is the next concrete optimization direction.

Scripts: `diagnose-object.mjs`, `object-diagnosis-statistics.py`. Raw data: `object-diagnosis-results.json`, corrected tests: `object-diagnosis-statistics.json`. This diagnosis does not replace the published plugin benchmark or claim the prototype is already shipped.

Source checks: current `src/index.ts` object factory and installed `node_modules/valibot/dist/index.mjs`. Official [strictObject documentation](https://valibot.dev/api/strictObject/) confirms its unknown-key error policy.
