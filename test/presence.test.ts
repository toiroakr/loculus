import { test } from "node:test";
import assert from "node:assert/strict";
import * as l from "../src/index.js";

test("presence and default combinations preserve or replace only their selected inputs", () => {
  const error = Symbol("error");
  const cases: readonly [l.AnySchema, unknown, unknown][] = [
    [l.string(), error, error],
    [l.string({ optional: true }), undefined, error],
    [l.string({ nullable: true }), error, null],
    [l.string({ nullish: true }), undefined, null],
    [l.string({ optional: true, nullable: true }), undefined, null],
    [l.string({ default: "D" }), "D", error],
    [l.string({ optional: true, default: "D" }), "D", error],
    [l.string({ nullable: true, default: "D" }), "D", null],
    [l.string({ nullish: true, default: "D" }), "D", null],
    [l.string({ default: { undefined: "U" } }), "U", error],
    [l.string({ default: { null: "N" } }), error, "N"],
    [l.string({ optional: true, default: { null: "N" } }), undefined, "N"],
    [l.string({ nullable: true, default: { undefined: "U" } }), "U", null],
    [l.string({ default: { undefined: "U", null: "N" } }), "U", "N"],
    [l.string({ default: { nullish: "D" } }), "D", "D"],
    [l.string({ nullish: true, default: { nullish: "D" } }), "D", "D"],
  ];
  for (const [schema, missing, nil] of cases) {
    for (const [input, expected] of [
      [undefined, missing],
      [null, nil],
    ]) {
      const result = l.safeParse(schema, input);
      if (expected === error) assert.ok(result.issues);
      else assert.deepEqual(result, { value: expected });
    }
    assert.equal(l.parse(schema, ""), "");
    assert.equal(l.parse(schema, "null"), "null");
    assert.ok(l.safeParse(schema, 123).issues);
  }
});

test("all field constructors support nullish values and output defaults", () => {
  const date = new Date("2026-10-11T00:00:00Z");
  const cases: readonly [l.AnySchema, unknown, unknown][] = [
    [l.string({ nullish: true, default: "" }), "a", "a"],
    [l.number({ nullable: true, default: 0 }), "42", 42],
    [l.boolean({ nullish: true, default: false }), "false", false],
    [l.enum(["a", "b"], { nullish: true, default: "a" }), "b", "b"],
    [l.date({ nullish: true, default: date }), "2026-10-11", date],
    [l.array(l.number(), { nullish: true, default: [] }), "42", [42]],
  ];
  for (const [schema, input, output] of cases) {
    assert.deepEqual(l.parse(schema, input), output);
    assert.equal(l.parse(schema, null), null);
    assert.equal(schema.meta.optional, true);
  }
  assert.equal(l.parse(l.boolean({ default: true }), undefined), true);
  assert.equal(l.parse(l.literal("a", { default: { nullish: "a" } }), null), "a");
  assert.equal(l.parse(l.boolean({ default: false }), undefined), false);
  assert.equal(l.parse(l.number({ default: 0 }), undefined), 0);
  assert.equal(l.parse(l.date({ default: { nullish: date } }), null), date);
  assert.deepEqual(l.parse(l.array(l.string(), { default: ["general"] }), undefined), ["general"]);
  const array = l.array(l.string(), {
    wrapScalar: false,
    default: { undefined: ["general"], null: [] },
  });
  assert.deepEqual(l.parse(array, undefined), ["general"]);
  assert.deepEqual(l.parse(array, null), []);
  assert.ok(l.safeParse(array, "general").issues);
  assert.ok(l.safeParse(l.array(l.string(), { nullish: true }), [null]).issues);
  assert.deepEqual(l.parse(l.array(l.string({ nullable: true })), [null]), [null]);
  assert.ok(l.safeParse(l.object({ name: l.string({ nullish: true }) }), null).issues);
});

test("defaults do not replace invalid values and precede outer transformations", () => {
  const number = l.number({ gte: 1, default: { nullish: 5 } });
  for (const input of ["", " ", "abc", "0", "Infinity"])
    assert.ok(l.safeParse(number, input).issues);
  const string = l.string({ min: 1, default: { nullish: "D" } });
  assert.ok(l.safeParse(string, "").issues);
  const transform = l.transform(l.number({ default: { nullish: 5 } }), (value) => value + 1);
  assert.equal(l.parse(transform, undefined), 6);
  assert.equal(l.parse(transform, null), 6);
  assert.equal(l.parse(l.number({ gte: 10, default: 5 }), undefined), 5);
});

test("object requiredness reflects undefined defaults, not null defaults", () => {
  const schema = l.object({
    optional: l.string({ optional: true }),
    nullable: l.string({ nullable: true }),
    nullish: l.string({ nullish: true }),
    value: l.string({ default: "D" }),
    both: l.string({ default: { nullish: "B" } }),
    nil: l.string({ default: { null: "N" } }),
    preserved: l.string({ nullable: true, default: "D" }),
  });
  assert.deepEqual(l.parse(schema, { nullable: null, nil: null, preserved: null }), {
    nullable: null,
    value: "D",
    both: "B",
    nil: "N",
    preserved: null,
  });
  const input: l.Input<typeof schema> = { nullable: null, nil: null };
  const output: l.Output<typeof schema> = {
    nullable: null,
    value: "D",
    both: "B",
    nil: "N",
    preserved: null,
  };
  output.value satisfies string;
  output.both satisfies string;
  output.nil satisfies string;
  output.preserved satisfies string | null;
  output.nullish satisfies string | null | undefined;
  assert.ok(l.safeParse(schema, {}).issues);
  assert.equal(schema.shape.nil.meta.optional, false);
  assert.equal(schema.shape.nil.meta.defaultValue, undefined);
  assert.equal(schema.shape.both.meta.defaultValue, "B");
  void input;
  if (false) {
    // @ts-expect-error Null-only defaults do not accept undefined input.
    const missing: l.Input<typeof schema> = { nullable: null };
    // @ts-expect-error Undefined defaults make output properties required.
    const incomplete: l.Output<typeof schema> = { nullable: null, nil: "N", preserved: null };
    void missing;
    void incomplete;
  }
});

test("default target conflicts and invalid default types are rejected", () => {
  assert.throws(() => l.string({ default: { nullish: "D", null: "N" } } as any), TypeError);
  assert.throws(() => l.string({ default: {} } as any), TypeError);
  if (false) {
    // @ts-expect-error Nullish defaults cannot be mixed with individual targets.
    l.string({ default: { nullish: "D", undefined: "U" } });
    // @ts-expect-error Number defaults must have the output type.
    l.number({ default: "42" });
    // @ts-expect-error Enum defaults must be an allowed choice.
    l.enum(["a", "b"], { default: "c" });
    // @ts-expect-error Date defaults are Date outputs, not string inputs.
    l.date({ default: "2026-10-11" });
    // @ts-expect-error Array defaults must be arrays of output values.
    l.array(l.number(), { default: ["42"] });
    // @ts-expect-error At least one default target is required.
    l.string({ default: {} });
    const array = l.array(l.string(), { wrapScalar: false, nullish: true });
    // @ts-expect-error Presence flags do not enable scalar wrapping.
    const input: l.Input<typeof array> = "a";
    void input;
  }
});

test("presence inference retains null and undefined only when they can reach the output", () => {
  const nullable = l.number({ nullable: true });
  const nullish = l.number({ nullish: true });
  const defaulted = l.number({ nullish: true, default: { nullish: 0 } });
  const preserved = l.number({ nullish: true, default: 0 });
  const nullableValue: l.Output<typeof nullable> = null;
  const nullishValue: l.Output<typeof nullish> = undefined;
  const nullishNull: l.Output<typeof nullish> = null;
  const preservedValue: l.Output<typeof preserved> = null;
  const defaultInput: l.Input<typeof defaulted> = null;
  const dynamicFlag: boolean = Math.random() > 0.5;
  const dynamic = l.number({ nullable: dynamicFlag });
  const dynamicValue: l.Output<typeof dynamic> = null;
  const options: l.FieldOptions<string> = { default: "D" };
  const unknownOptions = l.string(options);
  const possibleNull: l.Output<typeof unknownOptions> = null;
  assert.equal(l.parse(l.string({ default: undefined }), "a"), "a");
  assert.ok(l.safeParse(l.string({ default: undefined }), undefined).issues);
  void [
    nullableValue,
    nullishValue,
    nullishNull,
    preservedValue,
    defaultInput,
    dynamicValue,
    possibleNull,
  ];
  if (false) {
    // @ts-expect-error Nullable alone does not allow undefined output.
    const missing: l.Output<typeof nullable> = undefined;
    // @ts-expect-error Nullish defaults remove null from the output.
    const nil: l.Output<typeof defaulted> = null;
    // @ts-expect-error Nullish defaults remove undefined from the output.
    const absent: l.Output<typeof defaulted> = undefined;
    // @ts-expect-error Undefined-only defaults preserve null but remove undefined.
    const missingPreserved: l.Output<typeof preserved> = undefined;
    void [missing, nil, absent, missingPreserved];
  }
});

test("array and date defaults remain scalar values when they have target-like properties", () => {
  const tags = Object.assign(["saved"], { null: "not a target" });
  const timestamp = Object.assign(new Date("2026-10-11"), { nullish: "not a target" });
  const tagSchema = l.array(l.string(), { default: tags });
  const dateSchema = l.date({ default: timestamp });
  assert.strictEqual(l.parse(tagSchema, undefined), tags);
  assert.strictEqual(l.parse(dateSchema, undefined), timestamp);
  assert.ok(l.safeParse(tagSchema, null).issues);
  assert.ok(l.safeParse(dateSchema, null).issues);
  if (false) {
    const tagsInput: l.Input<typeof tagSchema> = undefined;
    const dateInput: l.Input<typeof dateSchema> = undefined;
    tagsInput satisfies string | readonly string[] | undefined;
    dateInput satisfies string | undefined;
    // @ts-expect-error A scalar array fallback does not accept null.
    const badTags: l.Input<typeof tagSchema> = null;
    // @ts-expect-error A scalar Date fallback does not accept null.
    const badDate: l.Input<typeof dateSchema> = null;
    void [badTags, badDate];
  }
});

test("explicit undefined target defaults expose undefined in the output type", () => {
  const text = l.string({ default: { undefined: "U", null: undefined } });
  const count = l.number({ default: { undefined: 1, null: undefined } });
  assert.equal(l.parse(text, null), undefined);
  assert.equal(l.parse(count, null), undefined);
  if (false) {
    undefined satisfies l.Output<typeof text>;
    undefined satisfies l.Output<typeof count>;
    l.parse(text, null) satisfies string | undefined;
    l.parse(count, null) satisfies number | undefined;
  }
});
