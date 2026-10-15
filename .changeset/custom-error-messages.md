---
"loculus": minor
"@loculus/rolldown": minor
---

Add global message customization with `config({ customError })` and schema-level `error` options accepting strings or synchronous callbacks. Schema overrides take precedence; returning `undefined` falls back to global settings and then the default message. Configuration changes apply to existing schemas, Standard Schema integrations and generated validators.

Bounds now report `too_small` or `too_big` with `origin`, `min`/`max` and `inclusive` instead of `invalid_value`. String pattern failures report `invalid_format`. Consumers inspecting issue codes should update their mappings. Nested paths and explicit refinement messages are preserved.
