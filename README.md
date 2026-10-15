# loculus

Flat schemas for CLI options, HTTP query parameters and text form fields. No runtime dependencies. ESM with TypeScript declarations and [Standard Schema v1](https://standardschema.dev/) validation.

[Documentation and interactive examples](https://toiroakr.github.io/loculus/).

```ts
import * as l from 'loculus';

const query = l.object({
  search: l.string({ trim: true, min: 1 }),
  page: l.number({ integer: true, gte: 1, default: 1 }),
  archived: l.boolean({ default: false }),
  tag: l.array(l.enum(['docs', 'code']), { wrapScalar: true, optional: true }),
});

const params = new URLSearchParams('search=hello&page=2&archived=false&tag=docs');
const value = l.parse(query, l.fromEntries(params));
// value: { search: string; page: number; archived: boolean; tag?: ('docs' | 'code')[] }
```

Use `l.fromEntries(formData)` for FormData. Repeated keys become arrays. Scalar fields reject repeated values, and text fields reject File objects. Values are not silently dropped.

Requires Node.js 22.18.0 or newer.

## API

- `string({ min, max, pattern, trim, description, optional })`
- `number({ gt, gte, lt, lte, integer, description, optional })`: strings containing decimal numbers, or finite numbers. Empty strings are treated as `null` for presence and defaults: `nullable` / `nullish` preserve them as `null`, and `null` / `nullish` defaults replace them. Otherwise they are rejected. Whitespace, hexadecimal and Infinity are rejected. `integer` requires safe integers. `gt` / `lt` exclude the boundary; `gte` / `lte` include it. Multiple bounds are combined with AND.
- `boolean({ optional })`: accepts true/false booleans and the strings `"true"`, `"false"`, `"1"`, `"0"`.
- `enum(values, { optional })`: string choices.
- `literal(value, options)`: a string, boolean or numeric literal with its exact output type (`literal(true)` outputs `true`, `literal(42)` outputs `42`). String literals require an exact string match. Boolean literals use the `boolean` conversion rules above; numeric literals use the `number` rules above, then require equality to the literal. For example, `literal(true)` accepts `true`, `"true"` and `"1"`, but rejects `false`, numeric `1` and `"TRUE"`; `literal(42)` accepts `42`, `"42"` and `"4.2e1"`, but rejects `41`, whitespace and hexadecimal strings. Non-finite numbers never validate; `0` and `-0` compare equal. Presence and defaults use the same options as other fields. Unlike `number`, numeric literals do not treat empty strings as `null`.
- `literal([value, ...], options)`: a non-empty tuple of string, numeric or boolean choices, including mixed types. Outputs infer the union of the choices: `literal([200, 201, 204])` outputs `200 | 201 | 204`. Each choice uses the conversion rules above; the first matching choice in declaration order determines the output. For example, `literal(["1", 1])` parses `"1"` as a string, while `literal([1, "1"])` parses it as numeric `1`. Choice arrays are copied at construction. Presence and defaults use the same options as single literals.
- `date({ optional })`: ISO calendar dates or ISO date-time strings. Returns a Date. Date-time strings permit local time, `Z`, or a colon-separated UTC offset. Hours are 00–23; `24:00` and offsets such as `+0900` are rejected, matching Zod's ISO schemas.
- `array(fieldOrObject, { min, max, optional, wrapScalar })`: requires arrays by default; element conversion still applies. Object schemas can describe rows in a form, and nested arrays are supported. Set `wrapScalar: true` explicitly to wrap one value as an array.
- `{ optional: true }` is supported by string, number, boolean, enum, date, array and object constructors. Omitted optional object keys are omitted from the output.
- All field constructors, including `literal(value, options)`, support `nullable`, `nullish` and `default`. `nullable: true` preserves null, `optional: true` preserves undefined, and `nullish: true` permits both. Null is never implicitly treated as missing.
- `description` is available in all field constructor options, object options and the final options argument of union, xor, discriminatedUnion and intersection.
- `transform(schema, fn)`, `refine(schema, predicate, message)`.
- Field constructors snapshot their options and array element validators when the schema is created. Later changes to the supplied options do not change an existing schema; referenced regular expressions and default values retain their own identity. Pattern validation resets `lastIndex` before each check, matching Zod; the regular expression retains the cursor left by that check.

Build with `pnpm build` using tsdown (Rolldown), producing ES2022 ESM and bundled declarations. Schema factories carry `@__NO_SIDE_EFFECTS__` annotations. With Rolldown minification, unused schema construction can disappear without consumer annotations, including nested object fields. This permits skipping construction-time option getters and errors when the schema is unused; do not rely on unused schema construction for side effects. Validation calls (`parse`, `safeParse`, and Standard Schema validation) are not marked pure. `pnpm test` checks the published entry with both esbuild and Rolldown; esbuild still requires call-site `@__PURE__` annotations to remove unused construction. Rolldown without minification retains unannotated construction in the tested cases. Used schemas retain the factories they need.
- `object(shape, { unknownKeys, description, optional, nullable, nullish, default })`: `strict` by default, rejecting extra keys and reporting the first unknown key like Valibot's `strictObject`. Set `unknownKeys: 'strip'` to discard extra keys or `unknownKeys: 'passthrough'` to retain enumerable extra keys, including inherited ones, like Zod's `looseObject`. Declared fields read ordinary JavaScript properties, including inherited values. Finite nested objects are supported, with independent unknown-key policies at each level. Like Zod, declared `__proto__` fields are skipped and that key is excluded from passthrough output; an undeclared `__proto__` is still an error in strict mode. Outputs are ordinary objects, not objects with a null prototype. Array row objects use the same strict default. When intersecting objects with disjoint fields, explicitly use `unknownKeys: 'strip'` on each branch and row that should discard the other branch's fields.
- Object shapes, enum choices and branch arrays are not frozen at runtime. Treat schemas and their introspection metadata as immutable after creation, as Valibot documents. Create another schema when definitions change; directly replacing fields, validators or choices is unsupported and can make metadata disagree with validation. Runtime and build-time validation may capture their definitions. Shape copies still isolate caller-owned definitions.

For forms with editable rows, compose an object schema inside an array:

```ts
const item = l.object({ name: l.string({ min: 1 }), quantity: l.number({ integer: true, gte: 1 }) });
const form = l.object({ title: l.string(), items: l.array(item, { wrapScalar: false, min: 1 }) });
```

Use `standardSchemaResolver(form)` with React Hook Form, and distinguish `Input<typeof form>` from the converted `Output<typeof form>`. See the [working React Hook Form example](examples/react-hook-form/README.md), including `useFieldArray`, nested errors, browser tests, and a standalone mobile demo. Native `FormData` field-name parsing is separate; `fromEntries()` does not interpret dotted names.
- `union([a, b, ...], options)`, `xor([a, b, ...], options)`, `discriminatedUnion(key, [a, b, ...], options)`, `intersection(a, b, options)`: compose flat object variants. Intersections merge compatible primitive, Date, array and plain-object outputs recursively; incompatible outputs return issues, matching Valibot. Inherited discriminators, optional/nullable discriminator fields and discriminator defaults are supported. Duplicate discriminator values are rejected at validation, matching Zod; ambiguous undefined discriminators match no branch. Missing discriminator fields are rejected at construction.
- `safeParse(schema, unknown)`: `{ value }` or `{ issues }`; `parse` throws `ValidationError`. Issues carry paths, including repeated-value indices.
- `Input<typeof schema>` and `Output<typeof schema>` infer types. `_input`, `_output`, and `_optional` are type-only markers, absent at runtime.

Custom transforms and refinements are synchronous. Exceptions from user callbacks propagate to the caller. Default objects, arrays and Dates are shared references; use a transform to produce a fresh value when needed.

Non-string literals expose `meta.kind` as `"number"` or `"boolean"` and their typed choices in `meta.literalValues` (for example, `[42]` or `[true]`). Mixed-type literals expose `meta.kind: "union"`, their choices in `meta.literalValues`, and the individual literal schemas in `meta.options`. String literals and enums retain `meta.enumValues: readonly string[]`. Arrays propagate the child choices; transforms and refinements retain input metadata. CLI adapters can use the input kind for conversion and inspect `literalValues` for non-string choices.

`discriminatedUnion` supports boolean and numeric literal discriminants. Exact typed matches take precedence: numeric `42` and string `"42"` select distinct branches. When no exact match exists, string inputs use the discriminator fields' scalar conversions (for example, `"42.0"` to `42` or `"true"` to `true`). If multiple branches accept the converted input, the first declared branch wins. The selected branch performs ordinary validation; a failure does not retry other branches. Inputs shared by enclosing union, xor or intersection branches are not mutated.

## Build-time code generation

`@loculus/rolldown` is a separate, optional package for Rolldown 1.2.13 and tsdown. The `loculus` runtime does not include the plugin or declare a Rolldown peer dependency.

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

Keep writing ordinary schemas and type-checking their original TypeScript. The plugin specializes direct imported `string`, `number`, `boolean`, `literal`, static scalar-element `array` and static `object` calls. Static `literal` choices include strings, numbers, booleans and non-empty mixed tuples; declaration order, scalar conversions, presence/default options and typed choice metadata are preserved. All-string tuples with more than eight choices retain ordinary adaptive lookup. Literal options include string `min`/`max`/`trim`, numeric boundaries and `integer`, descriptions, presence flags, and primitive defaults or default targets. Identical validators are shared within a module; each factory still returns fresh fields, metadata and Standard Schema objects.

Static object shapes preserve definition snapshots and captured validators while avoiding shape copies, key/validator arrays, and per-field success wrappers. Reads, validation and writes remain interleaved in `Object.keys` order. Inherited field values, omitted undefined values, issue cloning, `__proto__` exclusion, getters, setters and callback behavior match the ordinary implementation. Static literal fields inline their comparisons in object kernels. Arrays with direct static scalar children, including literals, share validators and omit option copies and per-schema validator closures. Array `min`/`max`/`wrapScalar`/`description` literals are supported. Element errors are collected before length constraints; constraints run only after successful element validation, like Valibot pipelines configured with `abortPipeEarly: true`. Outer presence/default options and dynamic or object children retain ordinary array construction. Native enum, dynamic literal, date, transform and refine fields can be captured inside generated objects. Unknown/custom fields, dynamic shapes, getters, spreads and directly nested object fields keep ordinary object construction and validation.

The `objects` option controls the size/speed tradeoff:

- `'auto'` (default): loop over identical runs of at least three fields; split runs of at least 32 fields into functions of eight fixed keys.
- `'loop'`: loop over identical runs of at least two fields, favoring smaller output.
- `'unroll'`: emit each field at a fixed key.
- `'chunked'`: split identical runs of at least eight fields into groups of eight fixed keys.
- `false`: specialize fields (scalars and eligible arrays) without generating object validation.

Use `loculusPlugin({objects: 'loop'})` to prioritize size. No strategy guarantees the fastest result for every engine and input. Dynamic scalar options, regular expressions and unsupported factories retain ordinary validation. Shadowed imports, local built-in names, `eval`, and unsafe syntax are conservatively skipped. The plugin uses Rolldown's native parser and source-map support. It does not execute user schemas during the build. Function identity and source text can change across optimized builds.

There is no runtime `compile`, `eval`, or `new Function` in generated validation code. Fresh and reusable schemas use the same generated output. See [benchmark CI](bench/ci/README.md) for the measurement protocol and limitations. The React Hook Form demo uses this plugin.

## Presence and defaults

```ts
l.string({ nullable: true }); // string | null; undefined is rejected
l.string({ nullish: true }); // string | null | undefined
l.string({ default: 'guest' }); // undefined -> 'guest'; null is rejected
l.string({ nullable: true, default: 'guest' }); // undefined -> 'guest'; null stays null
l.string({ default: { null: 'guest' } }); // null -> 'guest'; undefined is rejected
l.string({ default: { nullish: 'guest' } }); // undefined and null -> 'guest'
l.string({ default: { undefined: 'guest', null: 'anonymous' } });
l.array(l.string(), { default: ['general'] });
```

Defaults take precedence over presence flags and apply before conversion. They are output values and bypass the field's constraints, outer transforms/refinements still run. Invalid non-nullish inputs never trigger a default. For `number`, an empty string is treated as `null`, so it triggers `null` / `nullish` defaults but not an undefined-only default. Empty strings do not trigger defaults for other field types. `nullish` default targets cannot be combined with `undefined` or `null` targets; conflicting configurations are rejected by types and at construction.

```ts
l.parse(l.number({ nullish: true }), undefined); // undefined
l.parse(l.number({ nullish: true }), null); // null
l.parse(l.number({ nullish: true }), ''); // null
l.parse(l.number({ default: { null: 10 } }), ''); // 10
```

An undefined default makes an object property optional on input and required on output. A null-only default still requires the property on input. Defaults remove null/undefined from the output type only for the targets they replace. Omitting optional/nullish object properties omits them from the output; explicit null is preserved unless a null default replaces it. Array element presence is configured on the element schema separately.

## Nested form values

Objects can be fields in other objects, and arrays can contain other arrays:

```ts
const form = l.object({
  address: l.object({ zip: l.string({ min: 3 }) }, { optional: true }),
  windows: l.array(l.array(l.number({ integer: true, gte: 0, lte: 23 }), {
    min: 2, max: 2,
  })),
});
```

`address` may be omitted, but a supplied address must contain `zip`. A nested
failure has a full path such as `['windows', 0, 1]`. Each array layer independently
controls scalar wrapping and requires an array by default. `array(array(number()))`
rejects `['1', '2']`; `array(array(number(), { wrapScalar: true }), { wrapScalar: true })`
turns it into `[[1], [2]]`.

Migrating from 0.1: add `wrapScalar: true` to any array that accepts a single CLI,
query, or FormData value. `fromEntries()` returns a string for one occurrence and
an array for repeated keys; it does not normalize singleton values into arrays.

Object defaults require explicit targets: `object(shape, { default: { undefined:
{ count: 1 } } })` or `{ default: { nullish: { count: 1 } } }`. This avoids confusing
object fields named `undefined`, `null`, or `nullish` with default targets. Defaults
are output values, bypass child constraints, and retain the same object reference.
Use an outer transform when a fresh object is needed. Optional, nullable, and
default settings on the parent are independent of settings on its children.

Self-recursive/lazy schemas and native FormData dotted/bracketed field-name decoding
are not supported. RHF supplies structured nested values directly. Nested object
containers, multidimensional arrays, and object presence options use normal runtime
validation when the build-time plugin cannot specialize them; eligible children
can still be optimized.

## politty

Use `@politty/loculus` with the same core API as `@politty/zod`:

```ts
import * as l from 'loculus';
import { arg, defineCommand, runMain } from '@politty/loculus';

const serve = defineCommand({
  name: 'serve',
  args: l.object({
    port: arg(l.number({ integer: true, gte: 1, lte: 65535, default: 3000 }), {
      alias: 'p', env: 'PORT', description: 'Listen port',
    }),
    cache: arg(l.boolean({ default: true }), { negation: true }),
  }),
  run: ({ port, cache }) => console.log({ port, cache }),
});
await runMain(serve);
```

## Development

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm test:rhf
```

`pnpm test` checks runtime behavior, generated validation, package consumers,
and tree shaking with esbuild and Rolldown. `pnpm test:rhf` exercises the form
example in desktop and mobile browsers.

## Documentation

[The public site](https://toiroakr.github.io/loculus/) includes an interactive
query playground, the working form, and a compatibility comparison.
Run `pnpm docs:build` with Bun on PATH to rebuild the site and its Node/Bun
compatibility evidence. See [site development and deployment](docs/home.md).

The compatibility audit compares acceptance and successful outputs in 96
composed API profiles against Zod and Valibot, with Zod JIT enabled and disabled.
It checks the current implementation; it does not establish equivalence for
all inputs, error wording, vendor-specific codes, or union error structures.
Constraints stop at the first error within a field, corresponding to Valibot's
`abortPipeEarly: true`; sibling fields still collect their errors.

## Benchmarks

`Benchmarks` runs Node/Bun latency, browser bundle, and TypeScript inference
measurements on pull requests and main. Octocov groups results into scalars,
arrays, objects, CLI, and forms. Raw results remain in Actions artifacts.
Construction includes one validation; repeated validation excludes construction
and build-time generation.

Run `pnpm bench:ci` with Bun on PATH, or `pnpm bench:ci --quick` to verify the
pipeline. See [benchmark CI](bench/ci/README.md) for the protocol, reporting
permissions, and limitations of comparisons across CI machines. Performance
results apply only to the measured inputs, build settings, and runtimes.

## Releases

Library changes use `pnpm changeset`. After merge, the release workflow creates a
version PR; merging it publishes to npm through trusted publishing. See the
[release guide](docs/releasing.md) for initial GitHub App and npm setup.
