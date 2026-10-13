# Single-use and reused schema comparison

v24.13.0, Apple M3, Zod 4.6.5, Valibot 1.5.0.

## Single use: schema construction + compilation + normalization + first validation (microseconds)

15 fresh processes per cell; medians.

| Case | loculus | loculus-compiled | zod | zod-compiled | valibot |
|---|---:|---:|---:|---:|---:|
| cli/valid | 370.87 | 552.21 | 2831.08 | 3286.58 | 537.25 |
| cli/invalid | 386.46 | 651.96 | 3012.71 | 4126.00 | 583.21 |
| form/valid | 417.75 | 838.46 | 2927.75 | 3031.21 | 431.37 |
| form/invalid | 430.29 | 887.67 | 3080.79 | 4469.71 | 483.00 |
| url/valid | 459.29 | 659.67 | 3123.79 | 3723.17 | 647.00 |
| url/invalid | 473.46 | 794.04 | 3320.04 | 4584.46 | 704.71 |

## Single use including library import (milliseconds)

| Case | loculus | loculus-compiled | zod | zod-compiled | valibot |
|---|---:|---:|---:|---:|---:|
| cli/valid | 0.77 | 0.95 | 24.90 | 24.91 | 2.97 |
| cli/invalid | 0.80 | 1.05 | 25.25 | 26.06 | 3.06 |
| form/valid | 0.93 | 1.33 | 25.50 | 26.15 | 3.12 |
| form/invalid | 0.97 | 1.41 | 26.37 | 28.11 | 3.20 |
| url/valid | 0.89 | 1.09 | 25.97 | 26.94 | 3.27 |
| url/invalid | 0.90 | 1.22 | 26.44 | 27.74 | 3.36 |

## Reused schema: validation only (nanoseconds)

Three fresh processes, seven rounds per process after warmup; median of 21 round means.

| Case | loculus | loculus-compiled | zod | zod-compiled | valibot |
|---|---:|---:|---:|---:|---:|
| cli/valid | 128.76 | 50.62 | 337.68 | 47.51 | 305.72 |
| cli/invalid | 240.81 | 261.00 | 1888.23 | 1911.89 | 669.82 |
| form/valid | 647.51 | 272.91 | 1203.29 | 145.17 | 1512.03 |
| form/invalid | 1072.49 | 277.23 | 1420.95 | 1487.20 | 1815.95 |
| url/valid | 143.32 | 63.02 | 384.63 | 79.32 | 336.25 |
| url/invalid | 177.14 | 181.05 | 1709.07 | 1769.62 | 682.95 |

## Reused schema: input normalization + validation (nanoseconds)

| Case | loculus | loculus-compiled | zod | zod-compiled | valibot |
|---|---:|---:|---:|---:|---:|
| cli/valid | 130.36 | 52.13 | 339.12 | 48.35 | 302.10 |
| cli/invalid | 239.30 | 259.79 | 1931.57 | 1889.42 | 657.68 |
| form/valid | 1583.42 | 1206.59 | 2171.16 | 1005.20 | 2446.54 |
| form/invalid | 1969.00 | 1225.62 | 2411.75 | 2490.45 | 2714.09 |
| url/valid | 610.55 | 510.22 | 834.03 | 514.21 | 807.41 |
| url/invalid | 561.63 | 557.63 | 2134.36 | 2164.50 | 1061.76 |

[Protocol and cases](LIFECYCLE.md). [Raw samples](lifecycle-results.json).
