import { test } from "node:test";
import assert from "node:assert/strict";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import * as l from "../src/index.js";

test("Standard Schema and output inference", () => {
  const s = l.object({
    name: l.string(),
    port: l.number({ integer: true, default: 80 }),
    verbose: l.boolean({ optional: true }),
  });
  const standard: StandardSchemaV1<
    { name: string; port?: string | number; verbose?: string | boolean },
    { name: string; port: number; verbose?: boolean }
  > = s;
  assert.equal(standard["~standard"].vendor, "loculus");
  const output = l.parse(s, { name: "app" });
  output.port satisfies number;
  output.verbose satisfies boolean | undefined;
  assert.deepEqual(output, { name: "app", port: 80 });
  if (false) {
    // @ts-expect-error Defaults must have the field's output type.
    l.number({ default: "80" });
  }
});

test("constructor optional flags retain precise optional output types", () => {
  const schema = l.object({ name: l.string({ optional: true, min: 1 }), id: l.string() });
  const output = l.parse(schema, { id: "id" });
  output.name satisfies string | undefined;
  output.id satisfies string;
  assert.deepEqual(output, { id: "id" });
  assert.ok(l.safeParse(schema, { id: "id", name: "" }).issues);
});

test("strict decimal numbers and safe integers", () => {
  for (const input of ["", " ", "0x10", "Infinity", Infinity, NaN, null, true, [], {}])
    assert.ok(l.safeParse(l.number(), input).issues);
  for (const [input, output] of [
    ["1e3", 1000],
    ["-.5", -0.5],
    ["+2", 2],
    [3, 3],
  ] as const)
    assert.equal(l.parse(l.number(), input), output);
  assert.ok(l.safeParse(l.number({ integer: true }), "9007199254740992").issues);
  assert.ok(l.safeParse(l.number({ gte: 1, lte: 5 }), "6").issues);
});

test("numeric bounds distinguish inclusive and exclusive endpoints", () => {
  const cases = [
    { options: { gte: 0, lte: 10 }, valid: [0, 5, 10], invalid: [-0.5, 10.5] },
    { options: { gt: 0, lt: 10 }, valid: [0.5, 5, 9.5], invalid: [0, 10] },
    { options: { gte: 0, lt: 10 }, valid: [0, 0.5, 9.5], invalid: [-0.5, 10] },
    { options: { gt: 0, lte: 10 }, valid: [0.5, 5, 10], invalid: [0, 10.5] },
  ];
  for (const { options, valid, invalid } of cases) {
    const schema = l.number(options);
    for (const value of valid) {
      assert.equal(l.parse(schema, value), value);
      assert.equal(l.parse(schema, String(value)), value);
    }
    for (const value of invalid) {
      assert.ok(l.safeParse(schema, value).issues);
      assert.ok(l.safeParse(schema, String(value)).issues);
    }
  }
  assert.equal(l.parse(l.number({ gte: 0 }), 0), 0);
  assert.ok(l.safeParse(l.number({ gt: 0 }), -0).issues);
  assert.ok(l.safeParse(l.number({ gt: 0 }), "-0").issues);
  assert.ok(l.safeParse(l.number({ gt: 0, gte: 5 }), 1).issues);
  assert.ok(l.safeParse(l.number({ lt: 10, lte: 5 }), 6).issues);
  assert.ok(l.safeParse(l.number({ gt: 5, lte: 5 }), 5).issues);
  assert.ok(l.safeParse(l.number({ optional: true, gt: 0 }), "0").issues);
  assert.equal(l.parse(l.number({ optional: true, gt: 0 }), undefined), undefined);
  if (false) {
    // @ts-expect-error Numeric bounds use explicit comparison operators.
    l.number({ min: 0 });
    // @ts-expect-error Numeric bounds use explicit comparison operators.
    l.number({ max: 10 });
  }
});

test("explicit boolean parsing", () => {
  for (const input of [true, "true", "1"]) assert.equal(l.parse(l.boolean(), input), true);
  for (const input of [false, "false", "0"]) assert.equal(l.parse(l.boolean(), input), false);
  for (const input of ["", "yes", "FALSE", 0]) assert.ok(l.safeParse(l.boolean(), input).issues);
});

test("strings, enum, repeated values and paths", () => {
  const s = l.object({
    tags: l.array(l.enum(["a", "b"])),
    name: l.string({ trim: true, min: 1, max: 3 }),
  });
  assert.deepEqual(l.parse(s, { tags: "a", name: " hi " }), { tags: ["a"], name: "hi" });
  const result = l.safeParse(s, { tags: ["a", "x"], name: "" });
  assert.deepEqual(
    result.issues?.map((i) => i.path),
    [["tags", 1], ["name"]],
  );
  const pattern = /a/g;
  pattern.lastIndex = 2;
  const str = l.string({ pattern });
  assert.equal(l.parse(str, "a"), "a");
  assert.equal(l.parse(str, "a"), "a");
  assert.equal(pattern.lastIndex, 1);
});

test("scalar wrapping can be disabled without disabling element conversion", () => {
  assert.deepEqual(l.parse(l.array(l.number()), "42"), [42]);
  assert.deepEqual(l.parse(l.array(l.number(), { wrapScalar: true }), "42"), [42]);
  const strict = l.array(l.number(), { wrapScalar: false, min: 1, max: 2 });
  assert.deepEqual(l.parse(strict, ["42", 43]), [42, 43]);
  for (const input of ["42", 42, null, undefined]) {
    assert.equal(l.safeParse(strict, input).issues?.[0]?.code, "invalid_type");
  }
  assert.ok(l.safeParse(strict, []).issues);
  assert.ok(l.safeParse(strict, [1, 2, 3]).issues);
  assert.deepEqual(l.safeParse(strict, ["42", "bad"]).issues?.[0]?.path, [1]);
  assert.deepEqual(l.parse(l.array(l.string(), { wrapScalar: false }), []), []);
  const optional = l.array(l.string(), { wrapScalar: false, optional: true });
  assert.deepEqual(l.parse(l.object({ tags: optional }), {}), {});
  assert.ok(l.safeParse(optional, "a").issues);
  const input: l.Input<typeof strict> = ["42", 43];
  input satisfies readonly (string | number)[];
  const optionalInput: l.Input<typeof optional> = undefined;
  optionalInput satisfies readonly string[] | undefined;
  const flag: boolean = Math.random() > 0.5;
  const dynamic = l.array(l.string(), { wrapScalar: flag });
  const dynamicInput: l.Input<typeof dynamic> = "a";
  dynamicInput satisfies string | readonly string[];
  if (false) {
    // @ts-expect-error Disabling scalar wrapping excludes scalar inputs.
    const scalar: l.Input<typeof strict> = "42";
    // @ts-expect-error Optional arrays still exclude scalar inputs.
    const optionalScalar: l.Input<typeof optional> = "a";
    void scalar;
    void optionalScalar;
  }
});

test("unknown keys and prototype safety", () => {
  const s = l.object({ name: l.string() }, {unknownKeys: "strip"});
  assert.deepEqual(l.parse(s, { name: "a", other: "b" }), { name: "a" });
  assert.ok(
    l.safeParse(l.object(s.shape, { unknownKeys: "strict" }), { name: "a", other: "b" }).issues,
  );
  assert.deepEqual(
    l.parse(l.object(s.shape, { unknownKeys: "passthrough" }), { name: "a", other: "b" }),
    { name: "a", other: "b" },
  );
  assert.deepEqual(l.parse(s, Object.create({ name: "inherited" })), {name: "inherited"});
  const raw = JSON.parse('{"__proto__":"safe"}');
  const proto = l.parse(l.object({ ["__proto__"]: l.string() }), raw);
  assert.equal(Object.getPrototypeOf(proto), Object.prototype);
  assert.equal(Object.hasOwn(proto, "__proto__"), false);
  const loose = l.parse(l.object({}, { unknownKeys: "passthrough" }), raw);
  assert.equal(Object.getPrototypeOf(loose), Object.prototype);
  assert.equal(Object.hasOwn(loose, "__proto__"), false);
});

test("URLSearchParams and FormData preserve duplicates and reject files", () => {
  const s = l.object({ tag: l.array(l.string()), page: l.number({ default: 1 }) });
  assert.deepEqual(l.parse(s, l.fromEntries(new URLSearchParams("tag=a&tag=b"))), {
    tag: ["a", "b"],
    page: 1,
  });
  const form = new FormData();
  form.append("tag", "a");
  form.append("tag", "b");
  assert.deepEqual(l.parse(s, l.fromEntries(form)), { tag: ["a", "b"], page: 1 });
  form.append("tag", new Blob(["file"]));
  assert.ok(l.safeParse(s, l.fromEntries(form)).issues);
  assert.ok(
    l.safeParse(l.object({ tag: l.string() }), l.fromEntries(new URLSearchParams("tag=a&tag=b")))
      .issues,
  );
});

test("transforms, refinements, dates and defaults", () => {
  assert.equal(
    l.parse(
      l.transform(l.string(), (v) => v.length),
      "abc",
    ),
    3,
  );
  const s = l.refine(
    l.object({ a: l.number(), b: l.number() }),
    (v) => v.a < v.b,
    "a must be less than b",
  );
  assert.ok(l.safeParse(s, { a: "2", b: "1" }).issues);
  assert.equal(l.parse(l.date(), "2024-02-29").toISOString(), "2024-02-29T00:00:00.000Z");
  assert.ok(l.safeParse(l.date(), "2023-02-29").issues);
  assert.equal(
    l.parse(l.date(), "2024-02-29T23:00:00-05:00").toISOString(),
    "2024-03-01T04:00:00.000Z",
  );
  assert.throws(() => l.parse(l.string(), 1), l.ValidationError);
  assert.equal(l.parse(l.number({ optional: true, default: 2 }), undefined), 2);
});

test("flat variants, union, xor and intersections", () => {
  const a = l.object({ kind: l.literal("a"), a: l.number() });
  const b = l.object({ kind: l.literal("b"), b: l.string() });
  const s = l.discriminatedUnion("kind", [a, b]);
  assert.deepEqual(l.parse(s, { kind: "a", a: "1" }), { kind: "a", a: 1 });
  assert.ok(l.safeParse(s, { kind: "c" }).issues);
  assert.throws(() => l.parse(l.discriminatedUnion("kind", [a, a]), {kind: "a", a: "1"}));
  assert.deepEqual(l.parse(l.union([a, b]), { kind: "b", b: "x" }), { kind: "b", b: "x" });
  assert.ok(
    l.safeParse(l.xor([l.object({ a: l.string() }), l.object({ b: l.string() })]), {
      a: "a",
      b: "b",
    }).issues,
  );
  assert.deepEqual(
    l.parse(l.intersection(l.object({ a: l.string() }, {unknownKeys: "strip"}), l.object({ b: l.number() }, {unknownKeys: "strip"})), {
      a: "x",
      b: "2",
    }),
    { a: "x", b: 2 },
  );
  assert.ok(
    l.safeParse(l.intersection(l.object({ a: l.number() }), l.object({ a: l.string() })), {
      a: "2",
    }).issues,
  );
});

test("native optional constructors preserve output types and validate supplied values", () => {
  const schema = l.object({
    count: l.number({ optional: true, integer: true, gte: 1 }),
    flag: l.boolean({ optional: true }),
    mode: l.enum(["dev", "prod"], { optional: true }),
    day: l.date({ optional: true }),
    tags: l.array(l.enum(["a", "b"]), { optional: true, min: 1 }),
  });
  const omitted: l.Output<typeof schema> = {};
  assert.deepEqual(l.parse(schema, {}), omitted);
  const output = l.parse(schema, {
    count: "2",
    flag: "false",
    mode: "dev",
    day: "2024-02-29",
    tags: "a",
  });
  output.count satisfies number | undefined;
  output.flag satisfies boolean | undefined;
  output.mode satisfies "dev" | "prod" | undefined;
  output.day satisfies Date | undefined;
  output.tags satisfies ("a" | "b")[] | undefined;
  assert.deepEqual(output, {
    count: 2,
    flag: false,
    mode: "dev",
    day: new Date("2024-02-29"),
    tags: ["a"],
  });
  const invalid = l.safeParse(schema, {
    count: "0",
    flag: "yes",
    mode: "other",
    day: "2023-02-29",
    tags: [],
  });
  assert.equal(invalid.issues?.length, 5);
  const flag: boolean = Math.random() > 0.5;
  const dynamic = l.object({
    text: l.string({ optional: flag }),
    count: l.number({ optional: flag }),
    flag: l.boolean({ optional: flag }),
    mode: l.enum(["a", "b"], { optional: flag }),
    tags: l.array(l.string(), { optional: flag }),
  });
  const dynamicOutput: l.Output<typeof dynamic> = {};
  assert.deepEqual(dynamicOutput, {});
});

test("enum choices are snapshotted before metadata is read or membership is warmed", () => {
  const values: [string, ...string[]] = Array.from({ length: 32 }, (_, i) => `v${i}`) as [string, ...string[]];
  const schema = l.enum(values);
  values[0] = "changed";
  for (let i = 0; i < 10; i++) {
    assert.equal(l.parse(schema, "v0"), "v0");
    assert.ok(l.safeParse(schema, "changed").issues);
  }
  const choices = schema.meta.enumValues;
  assert.equal(choices?.[0], "v0");
  assert.equal(Object.isFrozen(choices), false);
  assert.strictEqual(schema.meta.enumValues, choices);
  Object.assign(schema.meta, { enumValues: ["changed"] });
  assert.deepEqual(schema.meta.enumValues, ["changed"]);
  assert.equal(l.parse(schema, "v0"), "v0");
  assert.ok(l.safeParse(schema, "changed").issues);
});

test("literal metadata lazily exposes an empty-string choice", () => {
  const schema = l.literal("");
  assert.equal(l.parse(schema, ""), "");
  assert.deepEqual(schema.meta.enumValues, [""]);
  assert.equal(Object.isFrozen(schema.meta.enumValues), false);
  assert.strictEqual(schema.meta.enumValues, schema.meta.enumValues);
});

test("transform and refine preserve enum metadata and the Standard Schema protocol", () => {
  const choice = l.enum(["a", "b"]);
  for (const schema of [l.transform(choice, value => value), l.refine(choice, () => true, "unused")]) {
    assert.deepEqual(schema.meta.enumValues, ["a", "b"]);
    assert.equal(Object.isFrozen(schema.meta.enumValues), false);
    assert.equal(schema["~standard"].version, 1);
    assert.equal(schema["~standard"].vendor, "loculus");
    assert.equal(l.parse(l.object({ value: schema }), { value: "a" }).value, "a");
  }
});
