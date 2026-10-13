# Measured results

Node v24.13.0, darwin/arm64. Versions: typescript 7.0.2, zod 4.6.5, valibot 1.5.0, esbuild 0.28.2.

These measurements cover the fixtures in [the protocol](README.md). Smaller is better.

| Validation (ns, median) | loculus | Zod | Valibot |
|---|---:|---:|---:|
| strings-3/valid | 71 | 111 | 142 |
| strings-3/invalid | 96 | 271 | 190 |
| strings-30/valid | 721 | 1280 | 2327 |
| strings-30/invalid | 1281 | 1416 | 2330 |
| cli/valid | 143 | 325 | 342 |
| cli/invalid | 223 | 2002 | 700 |

| Browser bundle (gzip bytes) | loculus | Zod | Valibot |
|---|---:|---:|---:|
| strings-3 | 1284 | 93162 | 1290 |
| strings-30 | 1371 | 93258 | 1382 |
| cli | 1688 | 93288 | 2038 |

| Type check (seconds, median of 5) | loculus | Zod | Valibot |
|---|---:|---:|---:|
| required-strings | 0.044 | 0.047 | 0.274 |
| optional-strings | 0.039 | 0.041 | 0.34 |
| mixed-query | 0.051 | 0.136 | 0.491 |

| Type instantiations | loculus | Zod | Valibot |
|---|---:|---:|---:|
| required-strings | 30928 | 110359 | 344991 |
| optional-strings | 31943 | 69913 | 383315 |
| mixed-query | 42679 | 78370 | 587710 |

Each type fixture declares 100 schemas with 30 fields. Optional fields use constructor flags. Timing depends on schema shape, engine, compiler and machine; this is not a universal performance guarantee.
