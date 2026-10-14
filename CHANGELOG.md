# Changelog

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
