# Benchmarks and bundle checks

The maintained performance suite lives in [ci/](ci/README.md). It measures
construction plus validation, repeated validation, bundle sizes, and TypeScript
inference for representative schemas. Results are generated under
`bench/ci/generated/` and retained as GitHub Actions artifacts.

```sh
pnpm bench:ci --quick
pnpm bench:ci
```

Shared schemas live in `fixtures/`. They are also used by regression tests and
the documentation compatibility audit. `cf-reference.json` pins the Cloudflare
command metadata used to build the CLI fixtures; it is fixture input, not a
benchmark result.

`pnpm check:tree-shaking` checks published packages with esbuild and Rolldown.
Its diagnostic reports are generated under ignored `bench/generated/`.
