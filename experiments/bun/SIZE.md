# Bundle size follow-up

Measured minified browser ESM consumer bundles; bytes.

Case | Bundler | loculus raw | loculus gzip | Valibot raw | Valibot gzip | Zod raw | Zod gzip
--- | --- | --- | --- | --- | --- | --- | ---
文字列3項目 | bun | 2860 | 1296 | 3454 | 1309 | 81205 | 23174
文字列3項目 | esbuild | 2815 | 1291 | 3377 | 1292 | 453194 | 93178
文字列3項目 | rolldown | 2905 | 1301 | 3753 | 1309 | 82559 | 22600
文字列30項目 | bun | 3474 | 1383 | 4068 | 1398 | 81847 | 23258
文字列30項目 | esbuild | 3429 | 1378 | 3991 | 1384 | 454033 | 93274
文字列30項目 | rolldown | 3951 | 1395 | 6095 | 1412 | 83201 | 22690
CLI 4項目 | bun | 4130 | 1696 | 6144 | 2054 | 87141 | 24699
CLI 4項目 | esbuild | 3988 | 1694 | 5991 | 2041 | 453443 | 93305
CLI 4項目 | rolldown | 4177 | 1698 | 6955 | 2037 | 88797 | 24078

All nine raw/gzip comparisons against Valibot pass. Smallest gzip margin: one byte. This is a measured-case regression assertion, not a universal schema guarantee. All 27 bundles verify behavior against the previous snapshot. Construction samples and hashes: size-performance-results.json. Full repeated validation results: results.json.
