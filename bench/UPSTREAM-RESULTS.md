# Upstream fixture comparison

Zod official valid parse fixtures, using Tinybench 2.9.0 with 1,500 ms per task and explicit warmup. Three rounds with rotated order; median of round means, nanoseconds per parsed input (smaller is better).

Node v24.13.0, darwin/arm64, Apple M3. Zod 4.6.5, Valibot 1.5.0.

| Case | loculus | Zod | Zod compiled | Valibot |
|---|---:|---:|---:|---:|
| string | 4.1 | 4.2 | 4.5 | 4.4 |
| number | 13.3 | 24.0 | 13.6 | 15.8 |
| boolean | 18.9 | 26.2 | 15.6 | 17.8 |
| array | 22.5 | 36.8 | 16.6 | 27.8 |
| object | 88.2 | 54.2 | 21.0 | 116.6 |

See [protocol and scope](UPSTREAM.md), [runner](upstream.ts) and [raw measurements](upstream-results.json) for inputs, per-round error estimates and provenance.
