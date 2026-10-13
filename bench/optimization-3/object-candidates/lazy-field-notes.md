# Lazy Field Standard Schema candidate

Candidate: `lazy-field-class.ts.txt` / `lazy-field-class.mjs`.
Generator: `prepare-lazy-field.mjs`; dedicated manifest: `lazy-field-manifest.json`.
The shared candidate manifest and production source are untouched.

Each field owns independent `meta` and `field: true`. Its validator lives in a non-enumerable, non-configurable, non-writable private Symbol property. A prototype getter creates a fresh Standard Schema wrapper on first access and caches it as an enumerable, configurable, writable own property. A prototype setter can install an own override before that access.

`getValidator` bypasses wrapper allocation only for FieldClass instances without an own `~standard` property. Object/array constructors use it when capturing child validators. String/number/boolean/array plan attachment also uses it, since their old internal Standard access would otherwise defeat laziness. Explicit compile retains its original child Standard access and thus eagerly materializes wrappers. Ordinary schema and object output representation are unchanged.

## Verification

`node verify-lazy-field.mjs` ran 54 baseline-equivalence scenarios plus CSP identity fallback successfully. Scenarios cover own-only inputs, missing versus explicit undefined, null/default, error order/path, getters and callbacks, Proxy traps, shape snapshot/freeze, Symbol shape fields, dangerous keys, and Object.prototype setters/read-only slots. Six dedicated API checks passed, including independent mutable metadata, child laziness, cached wrapper descriptors/identity, Standard overrides both before and after caching, compile wrapper materialization, and transform/refine/default behavior. Results are in `lazy-field-semantics-results.json` and `lazy-field-api-results.json`. No timing was performed; no full project typecheck was run.

## Public representation and contract differences

| Observation | Existing plain Field | Lazy Field before access | Lazy Field after access |
| --- | --- | --- | --- |
| `Object.keys` | `meta, ~standard, field` | `meta, field` | `meta, field, ~standard` |
| `hasOwn(~standard)` | true | false | true |
| `~standard in schema` | true | true | true |
| Object prototype | `Object.prototype` | `FieldClass.prototype` | `FieldClass.prototype` |
| Own Symbols | none | one non-enumerable validator Symbol | same |
| Object spread / assign | copies Standard wrapper | omits Standard wrapper | copies Standard wrapper with different order |
| JSON serialization | includes Standard wrapper before field | omits Standard wrapper | includes Standard wrapper after field |

A copied schema produced by `{...field}` before first access is no longer a Standard Schema. This is a practical API difference, not merely presentation.

Freezing/sealing/preventing extensions before first access prevents wrapper caching: public `field['~standard']` throws TypeError. The equivalent existing schema remains usable after freezing. Accessing once before freezing avoids this difference. Object/array internal validation can still bypass a frozen field's getter, whereas compile cannot. No fallback was added because the candidate explicitly requests own wrapper caching.

Deleting the cached own Standard property exposes the prototype getter and regenerates the original validator wrapper. Deleting it from the original plain schema leaves no Standard property. A public replacement therefore does not survive deletion followed by access.

The prototype now exposes the Standard accessor. Mutating it affects public Standard access, but `getValidator` intentionally bypasses it for a class instance without an own Standard property. An accessor installed directly on a field as an own property is respected by getValidator. Proxies around fields can also observe different construction-time checks (`instanceof`, own descriptor, private Symbol get) than the original Standard-property get. These are separate from input Proxy behavior, which passed equivalence verification.

The extra Symbol is non-enumerable but discoverable through `Object.getOwnPropertySymbols` or `Reflect.ownKeys`; Symbol storage does not provide JavaScript language private-field secrecy.

This is a performance/size experiment under a changed public representation contract, not a drop-in compatible production implementation.
