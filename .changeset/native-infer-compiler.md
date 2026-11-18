---
"@loculus/infer": patch
---

Use the TypeScript 7.1 beta Corsa API for type extraction and replace tinyglobby with glob and minimatch, removing ts-morph and picomatch from the package's runtime dependency graph. Preserve type equivalence, description comments, imports, exclusions, and symlink traversal. Generated union members and compiler-derived object properties may appear in a different order. Extractor instances support `using` and `dispose()` to release their native compiler session; `generate()` manages this automatically.
