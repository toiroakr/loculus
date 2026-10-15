---
"loculus": patch
"@loculus/rolldown": patch
---

Treat empty strings as null when applying number presence flags and defaults. Nullable and nullish numbers preserve an empty string as null, while null and nullish defaults replace it. Required and optional-only numbers still reject empty strings, and whitespace remains invalid. Preserve the same behavior in Rolldown-generated validators.
