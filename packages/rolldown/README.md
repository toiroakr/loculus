# @loculus/rolldown

Optional build-time schema specialization for [Loculus](https://github.com/toiroakr/loculus).
The `loculus` runtime has no dependency on this package or Rolldown.

```sh
pnpm add loculus
pnpm add -D @loculus/rolldown rolldown
```

```ts
import { defineConfig } from 'tsdown';
import { loculusPlugin } from '@loculus/rolldown';

export default defineConfig({
  entry: ['src/main.ts'],
  plugins: [loculusPlugin()],
});
```

Requires Node 24 or newer, Rolldown 1.2.13 or newer within version 1, and the matching Loculus minor version.
Static imported string, number, boolean, supported scalar arrays, and static object
schemas can be specialized. Arrays require arrays by default; `wrapScalar: true` opts into single-value wrapping. Unsupported or dynamic definitions use ordinary validation.
The plugin does not execute user schemas during the build and introduces no runtime
`compile`, `eval`, or `new Function`.

Use `loculusPlugin({ objects: 'loop' })` to favor smaller generated objects.
Other strategies are `auto` (default), `unroll`, `chunked`, or `false` to keep ordinary
object validation. No strategy guarantees the fastest or smallest result for every
schema or JavaScript engine. Type checking uses the original TypeScript.

For custom runtime import paths, set `modules`, for example
`loculusPlugin({ modules: ['../../dist/index.js'] })`.
See the [runtime README](https://github.com/toiroakr/loculus#readme) for the supported contract and limitations.
