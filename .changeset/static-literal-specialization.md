---
"@loculus/rolldown": patch
---

Generate specialized validators for static string, numeric and boolean literals, including multiple-value and mixed tuples. Inline literal comparisons in object kernels and specialize literal array elements while preserving scalar conversions, presence/default behavior, choice metadata, inherited issue handling and declaration order. Initialize literal helpers lazily for circular consumers, and retain ordinary adaptive lookup for string-only tuples with more than eight choices. Require Loculus 0.2.3 or newer within the 0.2 minor line.
