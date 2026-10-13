# React Hook Form example

This example uses the published `dist` entry, React Hook Form's `useFieldArray`, and `standardSchemaResolver` from `@hookform/resolvers/standard-schema`. No loculus-specific resolver or field-name parser is required. The demo build now uses Rolldown and loculus/rolldown; its three static scalar fields are generated at build time, while object and array execution uses the ordinary implementation. The build asserts that generation actually occurred.

```ts
const item = l.object({
  name: l.string({ trim: true, min: 1 }),
  quantity: l.number({ integer: true, gte: 1, lte: 99 }),
});

const form = l.object({
  title: l.string({ trim: true, min: 1 }),
  items: l.array(item, { wrapScalar: false, min: 1, max: 3 }),
});

useForm<l.Input<typeof form>, undefined, l.Output<typeof form>>({
  resolver: standardSchemaResolver(form),
  defaultValues: { title: "", items: [{ name: "", quantity: "1" }] },
});
```

`register('items.0.quantity')` refers to a nested property in RHF's values. HTML number inputs retain strings in this example; loculus converts them to numbers when the resolver succeeds. `handleSubmit` receives `Output<typeof form>`, while `register`, `append`, and `defaultValues` use the input type. Do not set the resolver's `raw: true` option when converted output is required.

Every field array row uses `field.id` as its React key. Per-field errors use `errors.items?.[index]?.quantity`. Array min/max failures use `errors.items?.root?.message ?? errors.items?.message`, covering both registered and empty collections. Nested issues retain paths such as `['items', 0, 'quantity']`.

Run the demo:

```sh
pnpm demo:rhf
```

Open <http://127.0.0.1:4177>. The generated `index.html` is standalone and can also be hosted without a server-side application. It contains bundled React, RHF, the resolver, and loculus; its size is not the loculus-only bundle size.

Run the browser checks:

```sh
pnpm test:rhf
```

Local checks use installed Google Chrome. CI installs Playwright Chromium. Desktop and an iPhone 13 viewport each run six tests:

- Required field and nested numeric errors prevent submission; corrections clear errors and produce trimmed strings and numeric output.
- Moving a row preserves its values, identity and the reassigned error paths.
- Removing an invalid middle row preserves adjacent data and reindexes errors.
- Empty and excessive arrays produce collection errors; adding or removing rows recovers.
- Reset clears errors and restores defaults; the layout does not overflow the viewport.
- Empty, fractional, and excessive quantities fail; the inclusive upper bound succeeds.

Mobile checks emulate Chromium's viewport and touch behavior, rather than running on a physical iPhone or Safari. The example typecheck compiles against the generated package declarations. `test/object-array.test.ts` also covers optional/nullish/default arrays, row object modes, nested paths, ordinary/generated scalar parity, and validator snapshot behavior.

`array(object(...))` originally widened array element types without changing the emitted runtime JS. Subsequent performance changes are measured in `bench/optimization-2/` and the latest full pass in `bench/optimization-3/`. The pre-extension JS is retained in `bench/coverage/array-object-before/`; compare it with a freshly built `dist/index.js`. The original extension retained the same flat validation and browser bundle bytes with the same dependencies and bundler. Type instantiations have a small additional cost, measured separately in `bench/coverage/array-object-type-results.json`. `verification.json` records the latest installed runtime hash and browser checks.

Direct nested object fields, arrays of arrays, circular/lazy schemas, and parsing dotted/bracketed names from native `FormData` are outside this extension. `fromEntries()` continues to preserve literal field names; it does not reconstruct nested data. Object-array fields target structured form values, not CLI token decoding. Default row arrays follow existing defaults: their elements are output values, constraints are bypassed, and the array is reused by reference.
