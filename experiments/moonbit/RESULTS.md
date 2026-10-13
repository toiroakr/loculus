# MoonBit feasibility measurements

v24.13.0, Apple M3. Seven rotated rounds, Standard Schema validation with consumed results.

| ns / input | typescript | typescript-compiled | moonbit-js | moonbit-wasm-gc | zod | zod-compiled | valibot |
|---|---:|---:|---:|---:|---:|---:|---:|
| strings-3/valid | 67.9 | 27.0 | 80.5 | 156.9 | 115.2 | 24.3 | 139.6 |
| strings-3/invalid | 88.9 | 51.6 | 107.8 | 186.6 | 264.2 | 291.4 | 182.0 |
| strings-30/valid | 702.8 | 415.0 | 730.4 | 1199.6 | 1249.7 | 152.1 | 2321.8 |
| strings-30/invalid | 887.8 | 459.6 | 909.6 | 1384.0 | 1464.4 | 1543.5 | 2317.2 |
| cli/valid | 129.7 | 58.4 | 141.6 | 247.5 | 322.1 | 58.1 | 336.1 |
| cli/invalid | 228.3 | 213.0 | 204.6 | 305.3 | 2026.0 | 2078.4 | 705.1 |
| native-object/valid | 88.7 | 32.2 | 93.8 | 178.7 | 33.4 | 30.0 | 128.3 |
| native-object/invalid | 113.1 | 105.0 | 159.0 | 229.8 | 562.6 | 600.5 | 234.9 |
| repeated/valid | 46.2 | 32.1 | 63.0 | 134.5 | 163.4 | 38.1 | 103.5 |
| repeated/invalid | 75.8 | 67.0 | 65.4 | 127.4 | 641.7 | 696.7 | 282.1 |

| Gzip bytes (Wasm binary + JS glue) | typescript | typescript-compiled | moonbit-js | moonbit-wasm-gc | zod | zod-compiled | valibot |
|---|---:|---:|---:|---:|---:|---:|---:|
| strings-3 | 1255 | 1602 | 2101 | 2388 | 93162 | 93169 | 1290 |
| strings-30 | 1344 | 1695 | 2184 | 2470 | 93258 | 93265 | 1382 |
| cli | 1655 | 2000 | 2155 | 2445 | 93288 | 93296 | 2038 |
| native-object | 1525 | 1875 | 2099 | 2382 | 93153 | 93163 | 1148 |
| repeated | 1452 | 1795 | 2093 | 2378 | 93174 | 93181 | 1681 |

[Protocol and limitations](README.md), [raw measurements](results.json).
