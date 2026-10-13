# Valibot implementation and measured differences

This analysis uses the installed Valibot 1.5.0, not an assumed implementation of
a previous release. Loculus is pinned to source SHA256
`4c058388e5907fd15a2ab92cfa972cc54b4c346fad0b4f0b62a5195833e2b2cf`.
The production implementation and package exports have not changed.

## Facts from the implementation

- `string` builds a flat schema, including a fresh `~run` method, then
  `_standardSchema` eagerly attaches a fresh protocol object and validate
  closure. Its Standard Schema integration is not lazy. A shared function is
  not the reason for its constructor advantage.
- `object` stores the supplied entries by reference. It does not copy/freeze
  them or precompute keys and child functions. Parsing enumerates entries with
  `for-in` and calls each live child's `~run` method.
- The child protocol wrapper is bypassed during object parsing. Replacing a
  child's Standard Schema validate method before object construction affects
  Loculus but does not affect Valibot's object parse.
- Without user/global configuration, `getGlobalConfig` returns one cached
  `DEFAULT_CONFIG`; it does not allocate a merge object on each validation.
- A child Dataset `{value}` is still created for each object field. The source
  does not show elimination of basic child containers. In-place Dataset updates
  avoid additional containers across pipeline stages and the final protocol
  return. Loculus already fuses trim/length/pattern into one validator.
- Valibot reads inherited input properties with `in` and accepts an array with
  named properties as an object input. Loculus reads own properties and rejects
  array roots. Valibot's error helpers mutate child issue paths; Loculus clones
  opaque issues and paths, including shared/frozen issues.

`valibot-behavior.mjs` reproduces live shape changes, inherited input values,
array roots and before/after child-protocol overrides. The results are recorded
in `valibot-behavior-results.json`. The detailed source/type review is in
`agent-valibot-analysis.md`.

## Construction cost: controlled diagnostic variants

`valibot-ablation.mjs` builds the installed source into isolated worker modules.
The successful inputs rotate between `{value:'hello'}` and `{value:''}`; the failed
inputs are 42 and null. Schema creation includes both field and object factories,
then one successful validation. It is a warmed process measurement, not CLI
startup. Each variant uses nine fresh processes per runtime, 30ms warmup and seven
8ms rounds, consuming output keys/issue counts. Order rotates across passes.

The following are medians, ns per schema-create-plus-validation operation:

| Variant | Node | Bun |
| --- | ---: | ---: |
| Unmodified Valibot | 64.84 | 43.63 |
| Valibot with entries copy | 67.79 | 51.00 |
| Valibot with copy + freeze | 83.22 | 74.22 |
| Valibot with own-input checks + array rejection | 75.48 | 45.10 |
| Valibot with copy + freeze + own-input checks + array rejection | 93.58 | 61.41 |
| Valibot dispatching through child Standard Schema | 70.96 | 45.17 |
| Unmodified Loculus | 91.54 | 56.78 |
| Loculus without shape freeze | 69.44 | 48.53 |
| Loculus retaining the source shape | 65.83 | 42.81 |

The modified Valibot variants do not implement every Loculus guarantee. They do
not reproduce captured child-function semantics, opaque receiver/accessor
behavior or all prototype/issue protections. They isolate specific costs; they
are not a replacement peer benchmark or a claim that shipped Loculus beats
shipped Valibot. No variant that drops these guarantees has been adopted.

`valibot-ablation-statistics.json` uses an exact tied-rank Mann-Whitney test, Holm
correction across all 42 contrasts with each library's own unmodified baseline,
and a 10% practical threshold. Removing Loculus freeze significantly reduces
create-plus-one time on both engines. Valibot copy+freeze+own checks significantly
increase that metric on both engines. Cost deltas are not additive: changed maps,
JIT optimization and interactions affect each variant, especially on Bun.

## Bundle size: feature reachability

`bundle-reachability.mjs` uses the same consumer and bundler for all variants:
exported schema and Standard Schema validate, browser ESM, esbuild minification
and gzip. These sources intentionally remove functionality and are diagnostic.

| Variant | gzip bytes |
| --- | ---: |
| Full Loculus string/options/object | 1,280 |
| Loculus with presence/default processing removed | 994 |
| Loculus with trim/length/pattern processing removed | 1,131 |
| Loculus with both groups removed | 842 |
| Unmodified Valibot string/object | 1,078 |

Valibot's string factory does not reference optional/nullish/trim/minLength/pipe
constructors. Unused features disappear. Loculus string(options) references
presence/default and constraint code directly, so using string() still retains
those branches. File splitting and PURE annotations alone do not change this
reachability. Gzip deltas are not additive, and the smaller diagnostic variants
are not feature-equivalent to the full Loculus API.

## VM evidence and rejected approaches

V8 inlining traces for the same diagnostic workers show both libraries' string
and object constructors being inlined. Loculus configuredField and Valibot's
_standardSchema are also inlined. Thus failure to inline the constructors is not
an established explanation for this workload. Logs are ignored generated files;
`v8-inlining-results.json` records observed inlining edges. Trace execution is
separate from the reported uninstrumented timings. Source object/function counts
are not measurements of retained heap allocations.

The root-compatible candidates tested so far do not overtake Valibot. One-field
capture specialization screens around 81ns on Node versus the original 92ns, but
costs bundle bytes and retains a remaining peer gap. Frozen shared validator
vectors regress Bun parsing; non-frozen private vectors reduce construction but
still add bytes. The constructor guarantee is being reviewed before adopting a
contract-changing improvement.

The basic-entry prototypes remain isolated. No export, new runtime API or
singleton Field has been adopted. A singleton Field conflicts with Politty's
identity-keyed argument metadata registry: two arguments overwrite the same
entry. Fresh outer Fields are necessary. This is a functional constraint, not
just an allocation preference.

## Sources

- Installed `node_modules/valibot/dist/index.mjs`, `index.d.mts`, package.json.
- [Valibot object guide](https://valibot.dev/guides/objects/).
- [Valibot schema guide](https://valibot.dev/guides/schemas/).
- [V8 fast properties](https://v8.dev/blog/fast-properties).
- [V8 object spread](https://v8.dev/features/object-rest-spread).

Official descriptions motivate experiments; they do not substitute for these
installed-version source checks and measurements.
