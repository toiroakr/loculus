# Full API comparison

Scope: 57 object/composite profiles and 39 standalone field profiles. Not every possible input/option combination.

Range | Cases | Bun valid vs Valibot | Bun invalid | Bun construction | Bun gzip
--- | --- | --- | --- | --- | ---
object / composite | 57 | 53 / 55 | 54 / 55 | 25 / 55 | 20 / 55
単体フィールド | 39 | 34 / 39 | 39 / 39 | 22 / 39 | 27 / 39

Counts exclude custom Valibot xor; medians are not a statistical significance test. All three-dimensional superiority remains unachieved. Detailed code, every case, native differences and backend limitations are in docs/review.html.

## Confirmatory optimization comparison

Nine independent processes per implementation/runtime, with settled warmup; exact two-sided Mann–Whitney and Holm adjustment, plus a 10% practical threshold.
Confirmed improvements vs baseline: 135 mode/runtime comparisons. Remaining confirmed competitor losses: 50.

Case | Runtime | Mode | loculus ns | Peer | Peer ns | Ratio | Holm p
--- | --- | --- | --- | --- | --- | --- | ---
presence-target-undefined | node | construct | 149.92 | valibot | 77.58 | 1.93 | 0.0469
width-0 | node | construct | 76.19 | valibot | 40.95 | 1.86 | 0.0469
presence-nullish-target-nullish | node | construct | 141.66 | valibot | 78.35 | 1.81 | 0.0469
presence-target-nullish | node | construct | 139.79 | valibot | 78.42 | 1.78 | 0.0469
width-0 | bun | construct | 48.32 | valibot | 27.11 | 1.78 | 0.0469
presence-required | bun | construct | 75.32 | valibot | 44.57 | 1.69 | 0.0469
presence-optional-default | node | construct | 129.38 | valibot | 77.65 | 1.67 | 0.0469
scalar-presence-required | bun | construct | 27.29 | valibot | 16.54 | 1.65 | 0.0469
presence-target-null | bun | construct | 97.5 | valibot | 59.11 | 1.65 | 0.0469
presence-target-null | node | construct | 147.65 | valibot | 89.57 | 1.65 | 0.0469
presence-nullish-target-nullish | bun | construct | 105.16 | valibot | 64.2 | 1.64 | 0.0469
presence-optional-target-null | node | construct | 156.3 | valibot | 97.82 | 1.6 | 0.0469
presence-target-nullish | bun | construct | 101.64 | valibot | 64.08 | 1.59 | 0.0469
presence-required | node | construct | 103.47 | valibot | 66.19 | 1.56 | 0.0469
scalar-presence-nullish-target-nullish | bun | construct | 50.18 | valibot | 32.23 | 1.56 | 0.0469
presence-optional-nullable | node | construct | 132.11 | valibot | 85.44 | 1.55 | 0.0469
width-1 | node | construct | 92.27 | valibot | 60.26 | 1.53 | 0.0469
literal | node | construct | 100.24 | valibot | 68.24 | 1.47 | 0.0469
presence-optional-nullable | bun | construct | 86.73 | valibot | 59.28 | 1.46 | 0.0469
entry-parse | node | construct | 103.94 | valibot | 72.16 | 1.44 | 0.0469
presence-nullish | bun | construct | 83.64 | valibot | 58.5 | 1.43 | 0.0469
scalar-presence-target-nullish | bun | construct | 46.32 | valibot | 32.55 | 1.42 | 0.0469
string-basic | node | construct | 92.16 | valibot | 64.94 | 1.42 | 0.0469
literal | bun | construct | 65.89 | valibot | 46.78 | 1.41 | 0.0469
width-1 | bun | construct | 58.62 | valibot | 41.67 | 1.41 | 0.0469
presence-optional-default | bun | construct | 87.84 | valibot | 62.87 | 1.4 | 0.0469
presence-target-both | node | construct | 153.17 | valibot | 111.16 | 1.38 | 0.0469
presence-nullable | node | construct | 121.72 | valibot | 88.52 | 1.37 | 0.0469
presence-target-both | bun | construct | 103.69 | valibot | 75.43 | 1.37 | 0.0469
entry-parse | bun | construct | 65.11 | valibot | 47.87 | 1.36 | 0.0469
presence-nullable | bun | construct | 76.67 | valibot | 57.72 | 1.33 | 0.0469
presence-optional | bun | construct | 78.18 | valibot | 59.12 | 1.32 | 0.0469
string-basic | bun | construct | 58.59 | valibot | 44.34 | 1.32 | 0.0469
object-strict | bun | construct | 63.13 | valibot | 48.23 | 1.31 | 0.0469
presence-default | bun | construct | 81.38 | valibot | 62.36 | 1.31 | 0.0469
array-default | node | construct | 184.6 | valibot | 142.59 | 1.29 | 0.0469
scalar-presence-target-null | bun | construct | 45.33 | valibot | 35.27 | 1.29 | 0.0469
object-passthrough | node | valid | 78.11 | zod | 61.41 | 1.27 | 0.0469
array-default | bun | construct | 134.9 | valibot | 106.14 | 1.27 | 0.0469
scalar-presence-target-undefined | node | construct | 63.66 | valibot | 50.3 | 1.27 | 0.0469
width-100 | bun | valid | 729.25 | valibot | 576.71 | 1.26 | 0.0469
object-passthrough | bun | construct | 72.26 | valibot | 57.59 | 1.25 | 0.0469
entry-safeParse | node | construct | 92.79 | valibot | 73.98 | 1.25 | 0.0469
scalar-presence-target-null | node | construct | 61.34 | valibot | 50.25 | 1.22 | 0.0469
scalar-array-strict | bun | construct | 76.59 | valibot | 64.57 | 1.19 | 0.0469
width-100 | node | construct | 8489.5 | valibot | 7392.6 | 1.15 | 0.0469
entry-parse | bun | invalid | 377.49 | valibot | 329.42 | 1.15 | 0.0469
object-strip | bun | construct | 59.15 | valibot | 52.06 | 1.14 | 0.0469
scalar-presence-nullish-target-nullish | node | construct | 55.54 | valibot | 50.09 | 1.11 | 0.0469
scalar-presence-nullable-target-undefined | bun | construct | 51.07 | valibot | 46.34 | 1.1 | 0.0469

## Confirmed regressions vs baseline

Case | Runtime | Mode | Before ns | After ns | Ratio | Holm p
--- | --- | --- | --- | --- | --- | ---
scalar-enum-32 | bun | valid | 5.87 | 8.45 | 1.44 | 0.0237
scalar-presence-target-undefined | bun | construct | 44.21 | 48.72 | 1.1 | 0.0237
