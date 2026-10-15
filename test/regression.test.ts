import { test } from "node:test";
import assert from "node:assert/strict";
import * as l from "../src/index.js";
import * as v from "valibot";
import {z} from "zod";
import {isDeepStrictEqual} from "node:util";
import { profiles, prelude, type Profile } from "../bench/fixtures/schemas.mjs";

test("invalid ISO calendar input returns issues instead of throwing RangeError", () => {
  const schema = l.date();
  for (const input of ["0001-01-00", "0001-01-32", "0001-02-00", "0001-12-32"]) {
    let result: l.Result<Date> | undefined;
    assert.doesNotThrow(() => { result = l.safeParse(schema, input); });
    assert.deepEqual(result, { issues: [{ message: "Invalid date", code: "invalid_value" }] });
  }
});

test("date validation handles leap centuries, early years and timezone day rollover", () => {
  const schema = l.date();
  for (const [input, iso] of [
    ["0000-02-29", "0000-02-29T00:00:00.000Z"],
    ["0400-02-29", "0400-02-29T00:00:00.000Z"],
    ["2000-02-29", "2000-02-29T00:00:00.000Z"],
    ["2024-02-29T00:30:00+14:00", "2024-02-28T10:30:00.000Z"],
    ["2024-02-29T23:30:00-12:00", "2024-03-01T11:30:00.000Z"],
    ["9999-12-31", "9999-12-31T00:00:00.000Z"],
  ] as const) assert.equal(l.parse(schema, input).toISOString(), iso);
  for (const input of ["0100-02-29", "1900-02-29", "2100-02-29", "2026-04-31", "2026-06-31", "2026-09-31", "2026-11-31"])
    assert.deepEqual(l.safeParse(schema, input), { issues: [{ message: "Invalid date", code: "invalid_value" }] });
});

test("copied and frozen fields retain usable independent Standard Schema metadata", () => {
  for (const create of [() => l.string(), () => l.boolean(), () => l.number()]) {
    const first = create();
    const second = create();
    assert.notEqual(first.meta, second.meta);
    assert.notEqual(first["~standard"], second["~standard"]);
    const copied = { ...first };
    Object.freeze(first);
    Object.freeze(first["~standard"].validate);
    assert.equal(copied["~standard"].version, 1);
    assert.equal(copied["~standard"].vendor, "loculus");
    assert.deepEqual(copied["~standard"].validate("1"), first["~standard"].validate("1"));
    assert.deepEqual(create()["~standard"].validate("1"), second["~standard"].validate("1"));
  }
});

function inputFor(profile: Profile, input: unknown): unknown {
  if (!profile.format) return input;
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(input as Record<string, string | string[]>))
    for (const item of Array.isArray(value) ? value : [value]) entries.push([key, item]);
  if (profile.format === "url") return l.fromEntries(new URLSearchParams(entries));
  const form = new FormData();
  for (const [key, value] of entries) form.append(key, value);
  return l.fromEntries(form);
}

test("representative API profiles match at least one equivalent peer configuration", () => {
  for (const profile of profiles) {
    const create = new Function("l", prelude + "\nreturn " + profile.expressions[0]) as
      (library: typeof l) => l.AnySchema;
    const current = create(l);
    const peers = profile.expressions.slice(1).map(expression => new Function("z", "v", prelude + "\nreturn " + expression)(z, v));
    const variants = [current];
    for (const input of profile.probes) {
      const normalized = inputFor(profile, input);
      for (const schema of variants) {
        const actual = l.safeParse(schema, normalized);
        assert.ok(peers.some(peer => {
          const result = peer["~standard"].validate(normalized);
          return actual.issues ? !!result.issues : !result.issues && isDeepStrictEqual(actual.value, result.value);
        }), profile.id);
        assert.deepEqual(schema["~standard"].validate(normalized), actual, profile.id);
        if (actual.issues) {
          assert.throws(() => l.parse(schema, normalized), error => error instanceof l.ValidationError &&
            assert.deepEqual(error.issues, actual.issues) === undefined);
        } else {
          assert.deepEqual(l.parse(schema, normalized), actual.value, profile.id);
        }
      }
    }
  }
});

test("seeded heterogeneous rows preserve values, issue order and paths", () => {
  const create = (library: typeof l) => library.object({
    title: library.string({ trim: true, min: 1 }),
    items: library.array(library.object({
      name: library.string({ min: 1 }),
      count: library.number({ integer: true, gte: 1, lte: 99 }),
      tags: library.array(library.string({ min: 1 }), { wrapScalar: false, optional: true }),
      note: library.string({ nullish: true, default: { undefined: "missing", null: "cleared" } }),
    }, { unknownKeys: "strict" }), { wrapScalar: false, min: 1, max: 5 }),
  });
  const numeric = v.pipe(v.union([v.number(), v.pipe(v.string(), v.regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/), v.toNumber())]), v.finite(), v.safeInteger(), v.minValue(1), v.maxValue(99));
  const expected = v.object({
    title: v.pipe(v.string(), v.trim(), v.minLength(1)),
    items: v.pipe(v.array(v.strictObject({
      name: v.pipe(v.string(), v.minLength(1)), count: numeric,
      tags: v.optional(v.array(v.pipe(v.string(), v.minLength(1)))),
      note: v.optional(v.nullable(v.string(), "cleared"), "missing"),
    })), v.minLength(1), v.maxLength(5)),
  });
  const current = create(l);
  const values = [undefined, null, "", "ok", "2", 2, "0", "100", "1.5", "1e2", true, [], ["x"], ["", 2]];
  let seed = 0x10c0105;
  const choose = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return values[seed % values.length];
  };
  for (let run = 0; run < 300; run++) {
    const rows = Array.from({ length: run % 7 }, () => ({ name: choose(), count: choose(), tags: choose(), note: choose() }));
    const input = { title: choose(), items: run % 17 ? rows : choose() };
    const result = v.safeParse(expected, input, {abortPipeEarly: true});
    const actual = l.safeParse(current, input);
    assert.equal(!actual.issues, result.success, `normal/${run}`);
    if (actual.issues && result.issues)
      assert.deepEqual(actual.issues.map(issue => issue.path), result.issues.map(issue => issue.path?.map(item => item.key)), `paths/${run}`);
    else if (!actual.issues && result.success) assert.deepEqual(actual.value, result.output, `values/${run}`);
  }
});

test("shape enumeration and validator snapshots preserve accessors and symbol fields", () => {
  const events: string[] = [];
  const key = Symbol("ignored");
  const field = l.string();
  const shape = {
    get value() { events.push("shape"); return field; },
    [key]: field,
  };
  const schema = l.object(shape);
  assert.deepEqual(events, ["shape"]);
  assert.equal(schema.shape[key], field);
  assert.equal(Object.isFrozen(schema.shape), false);
  Object.defineProperty(field["~standard"], "validate", { value: () => ({ value: "changed" }) });
  assert.deepEqual(l.parse(schema, { value: "original" }), { value: "original" });
  assert.deepEqual(l.parse(schema, { value: "original", [key]: "ignored" }), { value: "original" });
  assert.deepEqual(events, ["shape"]);
});

test("passthrough preserves enumerable traversal, unknown getters and safe property descriptors", () => {
  {
    const events: string[] = [];
    const input: Record<string, unknown> = {
      get name() { events.push("known read"); return "x"; },
      get first() { events.push("first read"); delete input.second; input.third = 3; return 1; },
      second: 2,
    };
    const schema = l.object({ name: l.transform(l.string(), value => { events.push("callback"); return value; }) }, { unknownKeys: "passthrough" });
    const output = l.parse(schema, input) as Record<string, unknown>;
    assert.deepEqual(events, ["known read", "callback", "first read"]);
    assert.deepEqual(output, { name: "x", first: 1 });
    assert.equal(Object.hasOwn(output, "second"), false);
    const dangerous = JSON.parse('{"name":"x","__proto__":{"polluted":true},"constructor":42}');
    const safe = l.parse(schema, dangerous);
    assert.deepEqual(safe, {name: "x", constructor: 42});
    assert.equal(Object.getPrototypeOf(safe), Object.prototype);
    assert.equal(Object.hasOwn(safe, "__proto__"), false);
  }
});

test("presence target values and option getters are captured once before validation", () => {
  const events: string[] = [];
  const targets = { undefined: "U", null: "N" };
  const schema = l.string({
    get default() { events.push("default"); return targets; },
    get optional() { events.push("optional"); return true; },
  });
  targets.undefined = "changed";
  targets.null = "changed";
  assert.equal(l.parse(schema, undefined), "U");
  assert.equal(l.parse(schema, null), "N");
  assert.deepEqual(events, ["default", "optional"]);
  for (const invalid of [{}, { nullish: "D", null: "N" }, { undefined: "U", extra: "x" }])
    assert.throws(() => l.string({ default: invalid } as never), { message: "Invalid default targets" });
  const inherited = Object.create({ nullish: "inherited" });
  inherited.undefined = "own";
  assert.equal(l.parse(l.string({ default: inherited }), undefined), "own");
});

test("enum metadata and membership remain stable before and after the lazy lookup threshold", () => {
  const values = Array.from({ length: 32 }, (_, i) => `v${i}`) as [string, ...string[]];
  const schema = l.enum(values);
  values.fill("changed");
  for (let pass = 0; pass < 40; pass++) {
    assert.equal(l.parse(schema, "v31"), "v31");
    assert.ok(l.safeParse(schema, "changed").issues);
    assert.ok(l.safeParse(schema, 31).issues);
  }
  assert.deepEqual(schema.meta.enumValues, Array.from({ length: 32 }, (_, i) => `v${i}`));
  assert.equal(Object.isFrozen(schema.meta.enumValues), false);
});

test("shared frozen issues retain extra properties and structured paths without mutation", () => {
  const token = Symbol("detail");
  const path = Object.freeze([{ key: token }, "leaf"]);
  const issue = Object.freeze({ message: "shared", code: "custom", path, detail: 42 });
  const issues = Object.freeze([issue]);
  const field = l.string();
  Object.assign(field["~standard"], { validate: () => ({ issues }) });
  const schema = l.object({ rows: l.array(l.object({ value: field }), { wrapScalar: false }) });
  for (const variant of [schema]) {
    for (let pass = 0; pass < 2; pass++) {
      const result = l.safeParse(variant, { rows: [{ value: "a" }, { value: "b" }] });
      assert.deepEqual(result.issues, [
        { ...issue, path: ["rows", 0, "value", ...path] },
        { ...issue, path: ["rows", 1, "value", ...path] },
      ]);
      assert.notEqual(result.issues?.[0], issue);
    }
  }
  assert.deepEqual(issue.path, [{ key: token }, "leaf"]);
  assert.equal(issues[0], issue);
});

test("independent boolean schemas preserve presence when configured variants are constructed", () => {
  const required = l.object({ value: l.boolean() });
  l.boolean({ default: true });
  l.boolean({ nullable: true });
  assert.deepEqual(l.parse(required, { value: "true" }), { value: true });
  assert.deepEqual(l.parse(required, { value: "0" }), { value: false });
  for (const input of [{}, { value: null }, { value: "other" }])
    assert.deepEqual(l.safeParse(required, input), { issues: [
      { message: "Expected true, false, 1 or 0", code: "invalid_type", path: ["value"] },
    ] });
});

test("passthrough defines unknown properties without invoking inherited setters", () => {
  const key = "loculusRegressionSetter";
  let setterCalls = 0;
  Object.defineProperty(Object.prototype, key, {
    configurable: true,
    set() { setterCalls++; },
  });
  try {
    const input = { name: "x", [key]: "own", toString: "text", constructor: 7 };
    const schema = l.object({ name: l.string() }, { unknownKeys: "passthrough" });
    const output = l.parse(schema, input);
    assert.deepEqual(output, input);
    assert.equal(setterCalls, 0);
    assert.deepEqual(Object.getOwnPropertyDescriptor(output, key), {
      value: "own", enumerable: true, configurable: true, writable: true,
    });
  } finally { delete (Object.prototype as Record<string, unknown>)[key]; }
});

test("passthrough checks inherited setters after reading each unknown getter", () => {
  const key = "loculusRegressionDynamicSetter";
  let setterCalls = 0;
  const input = {
    name: "x",
    get [key]() {
      Object.defineProperty(Object.prototype, key, {
        configurable: true,
        set() { setterCalls++; },
      });
      return "own";
    },
  };
  try {
    const schema = l.object({ name: l.string() }, { unknownKeys: "passthrough" });
    const output = l.parse(schema, input) as Record<string, unknown>;
    assert.equal(output[key], "own");
    assert.equal(setterCalls, 0);
    assert.ok(Object.hasOwn(output, key));
  } finally { delete (Object.prototype as Record<string, unknown>)[key]; }
});

test("numeric failures retain raw coercion semantics and field order", () => {
  const create = (library: typeof l) => library.object({
    first: library.number({ integer: true, gt: 0, lte: 99 }),
    second: library.number({ gte: 1, lt: 100 }),
    optional: library.string({ optional: true }),
  });
  const current = create(l);
  const failures = [
    ...["1e309", NaN, Infinity, -Infinity].map(value => ({ value, messages: ["Expected a finite number", "Expected a finite number"], code: "invalid_value" })),
    ...["NaN", "Infinity", "0x10", " 2 ", "", null, undefined].map(value => ({ value, messages: ["Expected a decimal number", "Expected a decimal number"], code: "invalid_type" })),
    { value: "-0", messages: ["Expected greater than 0", "Expected at least 1"], code: "invalid_value" },
    { value: "99.5", messages: ["Expected a safe integer"], code: "invalid_value" },
    { value: "1e2", messages: ["Expected at most 99", "Expected less than 100"], code: "invalid_value" },
  ];
  for (const { value, messages, code } of failures) {
    const input = { first: value, second: value };
    assert.deepEqual(l.safeParse(current, input), { issues: messages.map((message, index) => ({
      message, code, path: [index === 0 ? "first" : "second"],
    })) });
  }
  assert.deepEqual(l.parse(current, { first: "2", second: "3" }), { first: 2, second: 3 });
  const result = l.parse(current, { second: "3", first: "2", optional: undefined });
  assert.deepEqual(result, { first: 2, second: 3, optional: undefined });
  assert.deepEqual(Object.keys(result), ["first", "second", "optional"]);
});

test("passthrough retains non-enumerable known inputs and ignores unknown symbol properties", () => {
  const key = "loculusRegressionReadonly";
  const symbol = Symbol("unknown");
  Object.defineProperty(Object.prototype, key, { value: "inherited", configurable: true });
  try {
    const input = { [key]: "own", [symbol]: 1 };
    Object.defineProperty(input, "name", { value: "known", enumerable: false });
    const schema = l.object({ name: l.string() }, { unknownKeys: "passthrough" });
    const output = l.parse(schema, input);
    assert.deepEqual(output, { name: "known", [key]: "own" });
    assert.deepEqual(Reflect.ownKeys(output), ["name", key]);
    assert.equal(Object.getPrototypeOf(output), Object.prototype);
  } finally { delete (Object.prototype as Record<string, unknown>)[key]; }
});

test("boolean arrays do not share presence configuration between schemas", () => {
  const create = (library: typeof l) => library.object({
    required: library.array(library.boolean(), { wrapScalar: false }),
    optional: library.array(library.boolean({ nullish: true }), { wrapScalar: true, optional: true }),
  });
  const schema = create(l);
  l.boolean({ default: false });
  assert.deepEqual(l.parse(schema, {
    required: ["true", "0", true], optional: [null, undefined, "false"],
  }), { required: [true, false, true], optional: [null, undefined, false] });
  assert.deepEqual(l.parse(schema, { required: [] }), { required: [] });
  assert.deepEqual(l.safeParse(schema, { required: [null, "other"], optional: ["1", "other"] }), {
    issues: [["required", 0], ["required", 1], ["optional", 1]].map(path => ({
      message: "Expected true, false, 1 or 0", code: "invalid_type", path,
    })),
  });
  assert.deepEqual(l.safeParse(schema, { required: "true", optional: null }), {
    issues: [{ message: "Expected an array", code: "invalid_type", path: ["required"] }],
  });
});
