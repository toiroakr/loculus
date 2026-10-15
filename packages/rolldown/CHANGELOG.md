# Changelog

## 0.3.0

### Minor Changes

- 2d7b8aa: Add global message customization with `config({ customError })` and schema-level `error` options accepting strings or synchronous callbacks. Schema overrides take precedence; returning `undefined` falls back to global settings and then the default message. Configuration changes apply to existing schemas, Standard Schema integrations and generated validators. Runtime fields and generated validators resolve custom messages on failure without wrapping every successful validation.

  Bounds now report `too_small` or `too_big` with `origin`, `min`/`max` and `inclusive` instead of `invalid_value`. String pattern failures report `invalid_format`. Consumers inspecting issue codes should update their mappings. Nested paths and explicit refinement messages are preserved.

  Type errors now include `expected` and the actual `received` input value, and their default messages show the received value (quoting strings). Error callbacks also expose `received` as an alias of the original input. Runtime and generated validators use the same formatting, including values that cannot be serialized as JSON.

### Patch Changes

- a55eca2: Treat empty strings as null when applying number presence flags and defaults. Nullable and nullish numbers preserve an empty string as null, while null and nullish defaults replace it. Required and optional-only numbers still reject empty strings, and whitespace remains invalid. Preserve the same behavior in Rolldown-generated validators.
- 5e37a70: Support custom string length counters and application-wide defaults, with optional helpers for UTF-16 code units, Unicode code points, graphemes, display columns, UTF-8 bytes and UTF-16 bytes. Generated validators honor application defaults and field overrides.

  String length defaults share the existing `config()` settings with error customization.

- Updated dependencies [2d7b8aa]
- Updated dependencies [8b43743]
- Updated dependencies [a55eca2]
- Updated dependencies [5e37a70]
- Updated dependencies [6b8a33f]
  - loculus@0.3.0

## 0.2.3

### Patch Changes

- 84075e8: Support Node.js 22.18.0 and newer for the runtime and Rolldown plugin instead of requiring Node.js 24.
- Updated dependencies [84075e8]
  - loculus@0.2.5

## 0.2.2

### Patch Changes

- ca63915: Generate specialized validators for static string, numeric and boolean literals, including multiple-value and mixed tuples. Inline literal comparisons in object kernels and specialize literal array elements while preserving scalar conversions, presence/default behavior, choice metadata, inherited issue handling and declaration order. Initialize literal helpers lazily for circular consumers, and retain ordinary adaptive lookup for string-only tuples with more than eight choices. Require Loculus 0.2.3 or newer within the 0.2 minor line.

## 0.2.1

### Patch Changes

- 4a71ea3: Add reproducible Node/Bun benchmark CI with Loculus-only octocov main-branch comparisons, browser bundle sizes, and TypeScript inference metrics.

  Move basic generated string errors into a separate allocation function to improve failure-path execution while preserving fresh issues and schema specialization.

- Updated dependencies [4a71ea3]
  - loculus@0.2.1

## 0.2.0

### Minor Changes

- 89317df: Support finite nested object schemas and multidimensional arrays, including object container presence and explicit default targets. Preserve nested paths, per-level unknown-key policies, and scalar-wrapping controls. Keep generated object fields compatible with ordinary nested validation.

  Breaking change: arrays require array inputs by default. Set `wrapScalar: true` explicitly to retain single-value wrapping; element conversion and container presence/default handling remain available.

### Patch Changes

- Updated dependencies [89317df]
  - loculus@0.2.0

## 0.1.0

Initial release of the standalone Rolldown plugin for Loculus.
