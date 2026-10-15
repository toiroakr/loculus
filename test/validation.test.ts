import { test } from "node:test";
import assert from "node:assert/strict";
import * as l from "../src/index.js";

test("wide objects preserve changing Result accessors and exceptions", () => {
  for (const mode of ["changing", "missing", "throw", "issues"]) {
    const run = (library: typeof l) => {
      const events: string[] = [];
      let values = 0;
      let issues = 0;
      const field = { ...library.string(), "~standard": { version: 1 as const, vendor: "loculus" as const, validate: () => ({
        get issues() { events.push(`issues ${++issues}`); return mode === "issues" ? issues === 1 ? [{ message: "bad" }] : [] : undefined; },
        get value() {
          events.push(`value ${++values}`);
          if (mode === "throw" && values === 2) throw new Error("value failed");
          return mode === "missing" || mode === "changing" && values === 2 ? undefined : "changed";
        },
      }) } };
      const tails = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`s${i}`, library.string()]));
      const schema = library.object({ first: field, ...tails }, {unknownKeys: "strip"});
      const raw = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`s${i}`, "v"]));
      const input = new Proxy(raw, {
        get(target, key, receiver) { events.push(`get ${String(key)}`); return Reflect.get(target, key, receiver); },
        getOwnPropertyDescriptor(target, key) { events.push(`own ${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key); },
      });
      try { return { result: library.safeParse(schema, input), events }; }
      catch (error) { return { error: (error as Error).message, events }; }
    };
    const actual = run(l);
    const tails = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`s${i}`, "v"]));
    if (mode === "throw") assert.equal(actual.error, "value failed");
    else assert.deepEqual(actual.result, mode === "issues" ? { issues: [] }
      : { value: mode === "changing" ? { first: undefined, ...tails } : tails }, mode);
    const prefix = mode === "issues" ? ["get first", "issues 1", "issues 2"] : mode === "missing" ? ["get first", "issues 1", "value 1"] : ["get first", "issues 1", "value 1", "value 2"];
    assert.deepEqual(actual.events, [...prefix, ...(mode === "throw" ? [] : Array.from({length: 40}, (_, i) => `get s${i}`))]);
  }
});

test("wide defaults and transforms preserve mutations and fallback paths", () => {
  for (const invalid of [false, true]) {
    const run = (library: typeof l) => {
      const events: string[] = [];
      const raw: Record<string, unknown> = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`s${i}`, "v"]));
      const schema = library.object({
        defaulted: library.string({ default: "D" }),
        changed: library.transform(library.string({ default: "source" }), value => {
          events.push("transform");
          raw.s0 = "changed";
          if (invalid) delete raw.s20;
          return value.toUpperCase();
        }),
        ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`s${i}`, library.string()])),
      }, {unknownKeys: "strip"});
      const input = new Proxy(raw, {
        get(target, key, receiver) { events.push(`get ${String(key)}`); return Reflect.get(target, key, receiver); },
        getOwnPropertyDescriptor(target, key) { events.push(`own ${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key); },
      });
      return { result: library.safeParse(schema, input), events };
    };
    const actual = run(l);
    const tails = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`s${i}`, i === 0 ? "changed" : "v"]));
    assert.deepEqual(actual.result, invalid
      ? { issues: [{ message: "Expected a string, received undefined", code: "invalid_type", expected: "string", received: undefined, path: ["s20"] }] }
      : { value: { defaulted: "D", changed: "SOURCE", ...tails } });
    assert.deepEqual(actual.events, ["get defaulted", "get changed", "transform", ...Array.from({length: 40}, (_, i) => `get s${i}`)]);
  }
});

test("object fields preserve standalone presence, conversions, bounds and issue details", () => {
  const create = (library: typeof l) => [
    library.string(), library.string({ min: 1, max: 3 }), library.string({ trim: true, pattern: /^a/g }),
    library.string({ nullish: true }), library.string({ default: { undefined: "u", null: "n" } }),
    library.string({ default: { undefined: undefined } } as any),
    library.number(), library.number({ integer: true, gt: 0, lte: 2 }),
    library.number({ gte: -Number.MAX_SAFE_INTEGER, lt: Number.MAX_SAFE_INTEGER + 1, integer: true }),
    library.number({ gt: -Number.MAX_SAFE_INTEGER, lte: Number.MAX_SAFE_INTEGER, integer: true }),
    library.number({ gt: -Infinity, gte: -Infinity, lt: Infinity, lte: Infinity }),
    library.number({ default: { nullish: 1 } }), library.boolean(), library.boolean({ optional: true }),
    library.enum(["a", "b"]), library.date(), library.transform(library.string(), () => undefined),
    library.array(library.string(), { wrapScalar: true }), library.array(library.number({ integer: true }), { wrapScalar: true }),
    library.array(library.boolean(), { wrapScalar: false, min: 1, max: 2 }),
    library.array(library.string({ min: 1 }), { wrapScalar: true, default: { nullish: ["a"] } }),
    library.array(library.string({ nullish: true }), { wrapScalar: true, nullish: true }),
    library.array(library.transform(library.string(), (value) => value.toUpperCase()), { wrapScalar: true }),
  ];
  const values = [undefined, null, "", "a", "abcd", " a ", "0", "1", "2", "9", "-0", "-1",
    "+1", "1e2", "1.", ".5", " 1", "0x1", "Infinity", "NaN", "٠", " ", true, false,
    "true", "false", "1.1", NaN, Infinity, -Infinity, -0, 2, Number.MAX_SAFE_INTEGER,
    -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, {}, [], ["a"], ["", "a"], [1, "2"]];
  const fields = create(l);
  for (const field of fields) {
    const normal = l.object({ value: field });
    for (const input of [{}, ...values.map((value) => ({ value }))]) {
      const value = "value" in input ? input.value : undefined;
      const result = l.safeParse(field, value);
      const expected = result.issues
        ? { issues: result.issues.map(issue => ({ ...issue, path: ["value", ...(issue.path ?? [])] })) }
        : { value: result.value === undefined && !("value" in input) ? {} : { value: result.value } };
      assert.deepEqual(l.safeParse(normal, input), expected);
    }
  }
});

test("field options and array validators are captured at construction", () => {
  const options = { min: 1, max: 3 };
  const bounds = { gte: 1, lte: 3, integer: true };
  const arrayOptions = { max: 2, wrapScalar: false };
  const inner = l.string();
  const normal = l.object({ value: l.string(options), count: l.number(bounds), list: l.array(inner, arrayOptions) });
  options.min = 100;
  bounds.gte = 100;
  arrayOptions.max = 0;
  Object.defineProperty(inner["~standard"], "validate", { value: () => ({ value: "changed" }) });
  const input = { value: "a", count: "2", list: ["a"] };
  assert.deepEqual(l.parse(normal, input), { value: "a", count: 2, list: ["a"] });
});

test("validation preserves reads, callbacks and key omission after mutations", () => {
  const events: string[] = [];
  const values = new Proxy(["a", "b"], {
    get(target, key, receiver) { events.push(String(key)); return Reflect.get(target, key, receiver); },
  });
  const normal = l.object({ list: l.array(l.transform(l.string(), (value) => { events.push("callback"); return value; })) });
  l.parse(normal, { list: values });
  const expected = [...events];
  events.length = 0;
  l.parse(normal, { list: values });
  assert.deepEqual(events, expected);
  for (const schema of [l.object({ value: l.string({ optional: true }) })]) {
    const input = { get value(): undefined { delete (this as { value?: undefined }).value; return undefined; } };
    assert.deepEqual(l.parse(schema, input), {});
  }
});

test("constraints cannot interpret source-like option values as code", () => {
  const options = { min: "0);throw Error('injected');//" } as unknown as l.StringOptions;
  const normal = l.object({ value: l.string(options) });
  assert.deepEqual(l.parse(normal, { value: "a" }), { value: "a" });
});

test("validation remains independent of public field metadata", () => {
  const field = l.string({ min: 1, max: 3 });
  const schema = l.object({ value: field });
  Object.assign(field.meta, { kind: "boolean", enumValues: ["other"] });
  assert.deepEqual(l.parse(schema, { value: "a" }), { value: "a" });
  for (const [value, issue] of [
    ["", { message: "Expected at least 1 characters", code: "too_small", origin: "string", min: 1, inclusive: true }],
    ["abcd", { message: "Expected at most 3 characters", code: "too_big", origin: "string", max: 3, inclusive: true }],
    [true, { message: "Expected a string, received true", code: "invalid_type", expected: "string", received: true }],
    [undefined, { message: "Expected a string, received undefined", code: "invalid_type", expected: "string", received: undefined }],
    [null, { message: "Expected a string, received null", code: "invalid_type", expected: "string", received: null }],
  ] as const) assert.deepEqual(l.safeParse(schema, { value }), { issues: [{ ...issue, path: ["value"] }] });
});

test("objects support opaque callable field validators", () => {
  const field = l.string({ min: 1 });
  const validate = new Proxy(field["~standard"].validate, {
    get() { throw new TypeError("Opaque validator"); },
  });
  const schema = l.object({ value: { ...field, "~standard": { ...field["~standard"], validate } } });
  assert.deepEqual(l.parse(schema, { value: "a" }), { value: "a" });
  assert.equal(l.safeParse(schema, { value: "" }).issues?.length, 1);
});

test("validation preserves prior array callbacks and later field reads", () => {
  const events: string[] = [];
  const normal = l.object({
    before: l.array(l.transform(l.string(), value => { events.push("array callback"); return value.toUpperCase(); })),
    count: l.number({ gte: 2 }),
    after: l.transform(l.string(), value => { events.push("last callback"); return value; }),
  });
  for (const count of ["3", "1", "q"]) {
    const input = {
      get before() { events.push("array read"); return ["a", "b"]; },
      get count() { events.push("number read"); return count; },
      get after() { events.push("last read"); return "c"; },
    };
    const result = l.safeParse(normal, input);
    const expected = [...events];
    events.length = 0;
    assert.deepEqual(l.safeParse(normal, input), result);
    assert.deepEqual(events, expected);
    events.length = 0;
  }
});
