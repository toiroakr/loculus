---
"loculus": minor
"@loculus/rolldown": minor
---

Support finite nested object schemas and multidimensional arrays, including object container presence and explicit default targets. Preserve nested paths, per-level unknown-key policies, and scalar-wrapping controls. Keep generated object fields compatible with ordinary nested validation.

Breaking change: arrays require array inputs by default. Set `wrapScalar: true` explicitly to retain single-value wrapping; element conversion and container presence/default handling remain available.
