# Changelog

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
