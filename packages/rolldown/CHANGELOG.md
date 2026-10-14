# Changelog

## 0.2.0

### Minor Changes

- 89317df: Support finite nested object schemas and multidimensional arrays, including object container presence and explicit default targets. Preserve nested paths, per-level unknown-key policies, and scalar-wrapping controls. Keep generated object fields compatible with ordinary nested validation.
  
  Breaking change: arrays require array inputs by default. Set `wrapScalar: true` explicitly to retain single-value wrapping; element conversion and container presence/default handling remain available.

### Patch Changes

- Updated dependencies [89317df]
  - loculus@0.2.0

## 0.1.0

Initial release of the standalone Rolldown plugin for Loculus.
