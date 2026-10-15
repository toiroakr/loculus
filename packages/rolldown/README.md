# @loculus/rolldown

Optional build-time schema specialization for [Loculus](https://github.com/toiroakr/loculus).
The `loculus` runtime has no dependency on this package or Rolldown.

## Installation

Requires Node.js 22.18.0 or newer, Rolldown `>=1.2.13 <2`, and Loculus `^0.2.6`.
The plugin and runtime have independent patch versions; use compatible versions
from the same Loculus minor release that satisfy the published peer range.

```sh
pnpm add loculus
pnpm add -D @loculus/rolldown rolldown
```

## Use with tsdown

If your build uses tsdown, add the plugin to its configuration:

```ts
import { defineConfig } from 'tsdown';
import { loculusPlugin } from '@loculus/rolldown';

export default defineConfig({
  entry: ['src/main.ts'],
  plugins: [loculusPlugin()],
});
```

## Use with Rolldown

The same plugin works directly with Rolldown:

```js
import { rolldown } from 'rolldown';
import { loculusPlugin } from '@loculus/rolldown';

const build = await rolldown({
  input: 'src/main.ts',
  plugins: [loculusPlugin()],
});

try {
  await build.write({ dir: 'dist', format: 'esm' });
} finally {
  await build.close();
}
```

Keep writing ordinary schemas in your application:

```ts
import * as l from 'loculus';

export const query = l.object({
  search: l.string({ trim: true, min: 1 }),
  page: l.number({ integer: true, gte: 1, default: 1 }),
  archived: l.boolean({ default: false }),
  tags: l.array(l.string(), { wrapScalar: true, optional: true }),
});

export const value = l.parse(query, { search: ' hello ', page: '2' });
```

This parses to `{ search: 'hello', page: 2, archived: false }`.
Type checking uses the original TypeScript. The plugin changes the build output
without requiring a separate schema API or a runtime compilation step.

## Supported schemas

The plugin recognizes direct named imports, aliases and namespace imports from
`loculus`. Factory calls and supported options must be statically recognizable.

| Schema | Specialized forms |
| --- | --- |
| `string` | Literal `min`, `max`, `trim`, descriptions, presence flags and primitive defaults/default targets. |
| `number` | Literal `gt`, `gte`, `lt`, `lte`, `integer`, descriptions, presence flags and primitive defaults/default targets. |
| `boolean` | Literal descriptions, presence flags and primitive defaults/default targets. |
| `literal` | Static string, numeric and boolean choices, including non-empty mixed tuples, with descriptions and presence/default options. All-string tuples with more than eight choices retain ordinary adaptive lookup. |
| `array` | Direct static scalar children, with literal `min`, `max`, `wrapScalar` and `description` options. |
| `object` | Static shapes with recognized factory calls, literal `unknownKeys` and `description` options. |

Arrays require array inputs by default. Set `wrapScalar: true` to accept a single
value as a one-element array. Array element errors are collected before length
constraints, which run only after successful element validation.

Generated objects can capture ordinary `enum`, dynamic `literal`, `date`, `transform` and
`refine` fields. Those fields keep their runtime validators. Object validation
defaults to `unknownKeys: 'strict'`; `strip` and `passthrough` are also supported.

Dynamic options, regular expressions, custom fields, dynamic shapes, getters,
spreads and directly nested object fields retain ordinary validation where the
plugin cannot specialize them. Array outer presence/default options and dynamic
or object children also retain ordinary array construction. Eligible children
can still be specialized inside an ordinary container.

Literal specialization includes the numeric and boolean literals added in Loculus 0.2.2
and the multiple-value tuples added in 0.2.3. Static choices and presence/default options
generate shared validators; object fields inline their comparisons, and literal array
elements use generated validators. Mixed choices preserve declaration order and scalar
conversion rules, including typed discriminator metadata. Dynamic choices, spreads,
side effects and unsupported values retain ordinary literal construction.
String-only tuples with more than eight choices also retain ordinary construction
so repeated validation can use the runtime's adaptive `Set` lookup.

## Plugin options

`loculusPlugin()` accepts an optional configuration object:

| Option | Default | Purpose |
| --- | --- | --- |
| `objects` | `'auto'` | Choose how generated objects validate consecutive fields with identical scalar validators. |
| `modules` | `['loculus']` | Match exact import specifier strings for the Loculus runtime. |
| `include` | All eligible files | Predicate receiving a module ID; return `false` to skip that module. |

### Object strategies

| `objects` | Behavior |
| --- | --- |
| `'auto'` | Loop over identical runs of at least three fields; split runs of at least 32 into helper functions of eight fixed keys. |
| `'loop'` | Loop over identical runs of at least two fields, favoring smaller output. |
| `'unroll'` | Emit each field at a fixed key. |
| `'chunked'` | Split identical runs of at least eight fields into helper functions of eight fixed keys; shorter runs can use loops. |
| `false` | Keep ordinary object validation while still specializing eligible scalars and arrays. |

Use `loculusPlugin({ objects: 'loop' })` to favor smaller generated objects.
No strategy guarantees the fastest or smallest result for every schema or
JavaScript engine. Compare your actual build output and validation workload.

### Import paths and file selection

For a custom runtime import path, set `modules` to the specifier used in source:

```ts
loculusPlugin({
  modules: ['loculus', '../../dist/index.js'],
  include: id => /\/schemas\/[^?]+\.[cm]?[jt]sx?(?:\?|$)/.test(id),
});
```

`modules` replaces the default list; include `'loculus'` if both paths are used.
It matches import text, not resolved filesystem paths, and should only name
modules exposing the compatible Loculus API.

The plugin processes JavaScript/TypeScript files, including JSX/TSX and module
IDs with query suffixes. Files in `node_modules` are always skipped. `include`
narrows this selection; it does not enable other file types or dependencies.

## Validation behavior and limitations

Identical generated validators are shared within a module. Each schema factory
still returns fresh schema, metadata and Standard Schema objects. Definition
snapshots, captured validators, inherited input values, omitted undefined
properties, issue paths and unknown-key policies retain ordinary behavior.

The plugin uses Rolldown's parser and source-map support. It does not execute
user schemas during the build and introduces no runtime `compile`, `eval` or
`new Function`. Shadowed imports, local built-in names and unsafe syntax are
conservatively skipped. Modules containing direct `eval` calls are skipped.

Function identity and source text can change across optimized builds. Treat
schemas and their introspection metadata as immutable after construction.

If a schema remains unspecialized, check its import specifier, module ID,
`include` predicate and whether its factory/options are static. Ordinary
validation is the fallback for unsupported definitions.

See the [runtime README](https://github.com/toiroakr/loculus#readme) for the full
schema API and the [React Hook Form example](https://github.com/toiroakr/loculus/tree/main/examples/react-hook-form)
for a working application using this plugin. The
[measurement protocol](https://github.com/toiroakr/loculus/blob/main/bench/ci/README.md)
describes the performance comparisons and their limitations.

String bounds honor the current application-wide `configure({ stringLength })`
default at validation time. An explicit `string({ length: counter })` uses the
ordinary runtime validator, including inside generated objects and arrays.
