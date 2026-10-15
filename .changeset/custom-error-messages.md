---
"loculus": minor
"@loculus/rolldown": minor
---

Add global message customization with `config({ customError })` and schema-level `error` options accepting strings or synchronous callbacks. Schema overrides take precedence; returning `undefined` falls back to global settings and then the default message. Configuration changes apply to existing schemas, Standard Schema integrations and generated validators. Runtime validation resolves custom messages on failure without wrapping every successful validation.

Bounds now report `too_small` or `too_big` with `origin`, `min`/`max` and `inclusive` instead of `invalid_value`. String pattern failures report `invalid_format`. Consumers inspecting issue codes should update their mappings. Nested paths and explicit refinement messages are preserved.

Type errors now include `expected` and the actual `received` input value, and their default messages show the received value (quoting strings). Error callbacks also expose `received` as an alias of the original input. Runtime and generated validators use the same formatting, including values that cannot be serialized as JSON.
