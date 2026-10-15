# Changelog

## 0.3.0

### Minor Changes

- 2d7b8aa: Add global message customization with `config({ customError })` and schema-level `error` options accepting strings or synchronous callbacks. Schema overrides take precedence; returning `undefined` falls back to global settings and then the default message. Configuration changes apply to existing schemas, Standard Schema integrations and generated validators. Runtime fields and generated validators resolve custom messages on failure without wrapping every successful validation.

  Bounds now report `too_small` or `too_big` with `origin`, `min`/`max` and `inclusive` instead of `invalid_value`. String pattern failures report `invalid_format`. Consumers inspecting issue codes should update their mappings. Nested paths and explicit refinement messages are preserved.

  Type errors now include `expected` and the actual `received` input value, and their default messages show the received value (quoting strings). Error callbacks also expose `received` as an alias of the original input. Runtime and generated validators use the same formatting, including values that cannot be serialized as JSON.

- 6b8a33f: Remove the redundant `configure()` alias. Use `config(options)` to update application-wide string length and error settings, and `config()` to read them. Replace existing `configure(options)` calls with `config(options)`; partial updates and explicit `undefined` resets keep their current behavior.

### Patch Changes

- 8b43743: Publish English documentation through GitHub Pages and remove archived experiments, while retaining the current benchmark suite and reproducible compatibility checks. Add browser-viewable PR previews with automatically refreshed links.

  Reject equal or reversed delivery hours in the form demo and display the actual validation schema.

  Highlight schema examples and JSON results across the documentation and form demo with Twinkleplop.

  Use the dark syntax palette for every dark code panel, including the playground schema, and verify token contrast on desktop and mobile.

  Format the comparison page's schema examples with Prettier before syntax highlighting.

- a55eca2: Treat empty strings as null when applying number presence flags and defaults. Nullable and nullish numbers preserve an empty string as null, while null and nullish defaults replace it. Required and optional-only numbers still reject empty strings, and whitespace remains invalid. Preserve the same behavior in Rolldown-generated validators.
- 5e37a70: Support custom string length counters and application-wide defaults, with optional helpers for UTF-16 code units, Unicode code points, graphemes, display columns, UTF-8 bytes and UTF-16 bytes. Generated validators honor application defaults and field overrides.

  String length defaults share the existing `config()` settings with error customization.

## 0.2.5

### Patch Changes

- 84075e8: Support Node.js 22.18.0 and newer for the runtime and Rolldown plugin instead of requiring Node.js 24.

## 0.2.4

### Patch Changes

- e70f6fb: Accept numeric and boolean string inputs when selecting discriminated union branches. Preserve exact typed matches, resolve conversion ties in branch declaration order, and retain validation and callbacks in wrapped composites.

## 0.2.3

### Patch Changes

- e766e95: Accept non-empty tuples of string, numeric and boolean values in `literal`, inferring the union of their output types. Preserve scalar conversion rules and presence/default options, and support multiple literal choices as discriminants.

## 0.2.2

### Patch Changes

- 308b77b: Support boolean and numeric literal fields with exact output inference, scalar input conversion, presence options and typed `literalValues` metadata. Discriminated unions accept typed boolean and numeric discriminants.

## 0.2.1

### Patch Changes

- 4a71ea3: Add reproducible Node/Bun benchmark CI with Loculus-only octocov main-branch comparisons, browser bundle sizes, and TypeScript inference metrics.

  Move basic generated string errors into a separate allocation function to improve failure-path execution while preserving fresh issues and schema specialization.

## 0.2.0

### Minor Changes

- 89317df: Support finite nested object schemas and multidimensional arrays, including object container presence and explicit default targets. Preserve nested paths, per-level unknown-key policies, and scalar-wrapping controls. Keep generated object fields compatible with ordinary nested validation.

  Breaking change: arrays require array inputs by default. Set `wrapScalar: true` explicitly to retain single-value wrapping; element conversion and container presence/default handling remain available.

## 0.1.0

Initial release of flat schemas for CLI options, HTTP query parameters, and text forms.

- Validate and convert strings with inferred input/output types and Standard Schema v1.
- Define presence, targeted defaults, numeric boundaries, and strict object inputs.
- Validate editable object rows with React Hook Form's Standard Schema resolver.
- Optionally specialize supported schemas at build time with the Rolldown plugin.
