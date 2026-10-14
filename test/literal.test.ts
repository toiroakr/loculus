import assert from "node:assert/strict";
import { test } from "node:test";
import * as l from "../src/index.js";
import { z } from "zod";

test("multiple string literals infer choices and match Zod", () => {
  const schema = l.literal(["draft", "published"]);
  const peer = z.literal(["draft", "published"]);
  const standard: import("@standard-schema/spec").StandardSchemaV1<"draft" | "published", "draft" | "published"> = schema;
  assert.equal(standard["~standard"].vendor, "loculus");
  for (const input of ["draft", "published", "other", 1, true, null, undefined, []]) {
    const result = l.safeParse(schema, input);
    const expected = peer.safeParse(input);
    assert.equal(!result.issues, expected.success);
    if (!result.issues && expected.success) assert.equal(result.value, expected.data);
  }
  assert.deepEqual(schema.meta.enumValues, ["draft", "published"]);
  assert.equal(l.parse(l.literal(["only"]), "only"), "only");
});

test("multiple numeric and boolean literals retain scalar conversions", () => {
  const numbers = l.literal([200, 201, 204]);
  const output: 200 | 201 | 204 = l.parse(numbers, "2.01e2");
  assert.equal(output, 201);
  assert.equal(numbers.meta.kind, "number");
  assert.deepEqual(numbers.meta.literalValues, [200, 201, 204]);
  for (const input of [202, "202", "", " 200", "0xc8", Infinity, NaN, true])
    assert.ok(l.safeParse(numbers, input).issues);
  const flags = l.literal([true, false]);
  for (const input of [true, "true", "1"]) assert.equal(l.parse(flags, input), true);
  for (const input of [false, "false", "0"]) assert.equal(l.parse(flags, input), false);
  for (const input of [1, 0, "TRUE", "", null]) assert.ok(l.safeParse(flags, input).issues);
  assert.equal(flags.meta.kind, "boolean");
  assert.deepEqual(flags.meta.literalValues, [true, false]);
  assert.equal(l.parse(l.literal([0, 1]), "-0"), 0);
  for (const input of [NaN, Infinity, -Infinity])
    assert.ok(l.safeParse(l.literal([NaN, Infinity, -Infinity]), input).issues);
});

test("mixed literal choices resolve conversions in declaration order", () => {
  const schema = l.literal(["auto", 1, false]);
  const standard: import("@standard-schema/spec").StandardSchemaV1<string | number | boolean, "auto" | 1 | false> = schema;
  assert.deepEqual(standard["~standard"].validate("auto"), { value: "auto" });
  assert.equal(l.parse(schema, "1"), 1);
  assert.equal(l.parse(schema, "0"), false);
  assert.equal(l.parse(schema, false), false);
  assert.ok(l.safeParse(schema, true).issues);
  assert.equal(schema.meta.kind, "union");
  assert.deepEqual(schema.meta.literalValues, ["auto", 1, false]);
  assert.deepEqual(schema.meta.options?.map(branch => branch.meta.kind), ["string", "number", "boolean"]);
  assert.equal(l.parse(l.literal(["1", 1, true]), "1"), "1");
  assert.equal(l.parse(l.literal([1, "1", true]), "1"), 1);
  assert.equal(l.parse(l.literal([true, 1, "1"]), "1"), true);
});

test("multiple literals preserve presence, defaults and definition snapshots", () => {
  const values: ["a" | "b", "a" | "b"] = ["a", "b"];
  const options = { default: "b" as const, description: "Choices" };
  const schema = l.literal(values, options);
  values[0] = "b";
  options.description = "Changed";
  const output: "a" | "b" = l.parse(schema, undefined);
  assert.equal(output, "b");
  assert.equal(l.parse(schema, "a"), "a");
  assert.deepEqual(schema.meta.enumValues, ["a", "b"]);
  assert.equal(schema.meta.description, "Choices");
  const mixedValues: ["auto" | "changed", 1, false] = ["auto", 1, false];
  const mixed = l.literal(mixedValues);
  mixedValues[0] = "changed";
  assert.equal(l.parse(mixed, "auto"), "auto");
  assert.ok(l.safeParse(mixed, "changed").issues);
  assert.deepEqual(mixed.meta.literalValues, ["auto", 1, false]);
  const nullable: 1 | 2 | null = l.parse(l.literal([1, 2], { nullable: true }), null);
  assert.equal(nullable, null);
  const optional: true | false | undefined = l.parse(l.literal([true, false], { optional: true }), undefined);
  assert.equal(optional, undefined);
  const defaults = l.literal([1, 2], { default: { null: 1, undefined: 2 } });
  assert.equal(l.parse(defaults, null), 1);
  assert.equal(l.parse(defaults, undefined), 2);
  assert.equal(l.parse(l.literal([true, false], { nullish: true }), null), null);
  assert.equal(l.parse(l.literal([true, false], { nullish: true }), undefined), undefined);
  assert.throws(() => Reflect.apply(l.literal, undefined, [[]]), /at least one literal/);
  assert.throws(() => Reflect.apply(l.literal, undefined, [["a", {}]]), /string, number or boolean/);
  const choices = l.literal(["a", "b"] as const);
  if (false) {
    // @ts-expect-error Literal choices cannot be empty.
    l.literal([]);
    // @ts-expect-error Defaults must be among the literal choices.
    l.literal([1, 2], { default: 3 });
    // @ts-expect-error Null is a presence option, not a literal choice.
    l.literal(["a", null]);
    // @ts-expect-error String literal inputs must be among the choices.
    const input: l.Input<typeof choices> = "c";
  }
});

test("multiple literals compose with arrays and discriminated object variants", () => {
  const schema = l.object({ values: l.array(l.literal([1, 2])), optional: l.literal(["a", "b"], { optional: true }) });
  const output: { values: (1 | 2)[]; optional?: "a" | "b" } = l.parse(schema, { values: [1, "2"] });
  assert.deepEqual(output, { values: [1, 2] });
  assert.deepEqual(l.safeParse(schema, { values: [1, 3] }).issues?.[0]?.path, ["values", 1]);
  assert.deepEqual(schema.shape.values.meta.literalValues, [1, 2]);
  const variants = l.discriminatedUnion("kind", [
    l.object({ kind: l.literal(["a", "b", "a"]), value: l.literal(1) }),
    l.object({ kind: l.literal([2, true, 2]), value: l.literal(2) }),
  ]);
  for (const kind of ["a", "b"]) assert.deepEqual(l.parse(variants, { kind, value: "1" }), { kind, value: 1 });
  for (const kind of [2, true]) assert.deepEqual(l.parse(variants, { kind, value: "2" }), { kind, value: 2 });
  assert.ok(l.safeParse(variants, { kind: "2", value: 2 }).issues);
  const duplicate = l.discriminatedUnion("kind", [
    l.object({ kind: l.literal(["a", "b"]) }), l.object({ kind: l.literal(["b", "c"]) }),
  ]);
  assert.throws(() => l.parse(duplicate, { kind: "a" }), /Duplicate discriminator/);
});

test("boolean literals accept matching booleans and boolean string forms", () => {
  const schema = l.literal(true);
  const output: true = l.parse(schema, true);
  assert.equal(output, true);
  assert.equal(l.parse(schema, "true"), true);
  assert.equal(l.parse(schema, "1"), true);
  for (const input of [false, "false", "0", 1, 0, "TRUE", "", null, undefined])
    assert.ok(l.safeParse(schema, input).issues);
});

test("false and numeric literals retain outputs and scalar conversion rules", () => {
  const off = l.literal(false);
  const disabled: false = l.parse(off, "0");
  assert.equal(disabled, false);
  assert.equal(l.parse(off, "false"), false);
  assert.ok(l.safeParse(off, true).issues);
  const count = l.literal(42);
  const output: 42 = l.parse(count, "42");
  const input: l.Input<typeof count> = 42;
  assert.equal(output, input);
  for (const value of [42, "42", "+42", "42.0", "4.2e1"])
    assert.equal(l.parse(count, value), 42);
  for (const value of [41, "41", "", " ", " 42", "0x2a", "Infinity", "1e999", NaN, Infinity, true, [], {}])
    assert.ok(l.safeParse(count, value).issues);
  assert.equal(l.parse(l.literal(-0.5), "-.5"), -0.5);
  assert.equal(l.parse(l.literal(0), "-0"), 0);
  for (const value of [NaN, Infinity, -Infinity])
    assert.ok(l.safeParse(l.literal(value), value).issues);
});

test("literal fields preserve presence, defaults, descriptions and Standard Schema types", () => {
  const enabled = l.literal(true, { optional: true, description: "Enabled" });
  const optional: true | undefined = l.parse(enabled, undefined);
  assert.equal(optional, undefined);
  assert.equal(enabled.meta.description, "Enabled");
  assert.deepEqual(enabled.meta.literalValues, [true]);
  assert.equal(enabled.meta.kind, "boolean");
  assert.equal(l.literal(42).meta.kind, "number");
  assert.deepEqual(l.literal(42).meta.literalValues, [42]);
  assert.deepEqual(l.literal("a").meta.enumValues, ["a"]);
  const nullable = l.literal(42, { nullable: true });
  const nil: 42 | null = l.parse(nullable, null);
  assert.equal(nil, null);
  assert.ok(l.safeParse(nullable, undefined).issues);
  const nullish = l.literal(false, { nullish: true });
  const absent: false | null | undefined = l.parse(nullish, null);
  assert.equal(absent, null);
  assert.equal(l.parse(nullish, undefined), undefined);
  const defaulted = l.literal(false, { default: false });
  const defaultOutput: false = l.parse(defaulted, undefined);
  assert.equal(defaultOutput, false);
  assert.equal(defaulted.meta.defaultValue, false);
  assert.ok(l.safeParse(defaulted, null).issues);
  assert.equal(l.parse(l.literal(42, { default: { nullish: 42 } }), null), 42);
  assert.equal(l.parse(l.literal(42, { default: { null: 42 } }), null), 42);
  const standard: import("@standard-schema/spec").StandardSchemaV1<string | boolean, true> = l.literal(true);
  assert.deepEqual(standard["~standard"].validate("1"), { value: true });
  const options = { default: false as const, description: "original" };
  const captured = l.literal(false, options);
  Object.assign(options, { default: true, description: "changed" });
  assert.equal(l.parse(captured, undefined), false);
  assert.equal(captured.meta.description, "original");
  if (false) {
    // @ts-expect-error A boolean literal default must match its output.
    l.literal(true, { default: false });
    // @ts-expect-error A numeric literal default must match its output.
    l.literal(42, { default: 43 });
  }
});

test("non-string literals compose with objects, arrays, transforms and refinements", () => {
  const flag = l.literal(true);
  const items = l.array(l.literal(42));
  assert.deepEqual(items.meta.literalValues, [42]);
  const schema = l.object({ flag, items, optional: l.literal(false, { optional: true }) });
  const output: { flag: true; items: 42[]; optional?: false } = l.parse(schema, { flag: "1", items: ["42", 42] });
  assert.deepEqual(output, { flag: true, items: [42, 42] });
  assert.deepEqual(l.safeParse(schema, { flag: false, items: [42, 43] }).issues?.map(issue => issue.path), [["flag"], ["items", 1]]);
  const transformed = l.transform(flag, value => value ? "yes" as const : "no" as const);
  assert.equal(l.parse(transformed, "true"), "yes");
  assert.deepEqual(transformed.meta.literalValues, [true]);
  assert.deepEqual(l.safeParse(transformed, false).issues, l.safeParse(flag, false).issues);
  const refined = l.refine(l.literal(42), value => value < 40, "Too large");
  assert.deepEqual(refined.meta.literalValues, [42]);
  assert.deepEqual(l.safeParse(refined, "42"), { issues: [{ message: "Too large", code: "custom" }] });
  Object.assign(flag.meta, { literalValues: [false] });
  assert.equal(l.parse(flag, true), true);
});

test("discriminated unions select typed boolean and numeric literals", () => {
  const schema = l.discriminatedUnion("kind", [
    l.object({ kind: l.literal(true), count: l.literal(42) }),
    l.object({ kind: l.literal(false), count: l.literal(0) }),
    l.object({ kind: l.literal(42), count: l.literal(1) }),
    l.object({ kind: l.literal("42"), count: l.literal(2) }),
  ]);
  assert.deepEqual(l.parse(schema, { kind: true, count: "42" }), { kind: true, count: 42 });
  assert.deepEqual(l.parse(schema, { kind: false, count: 0 }), { kind: false, count: 0 });
  assert.deepEqual(l.parse(schema, { kind: 42, count: "1" }), { kind: 42, count: 1 });
  assert.deepEqual(l.parse(schema, { kind: "42", count: "2" }), { kind: "42", count: 2 });
  assert.deepEqual(l.safeParse(schema, { kind: "true", count: 42 }).issues?.[0]?.path, ["kind"]);
  assert.deepEqual(l.safeParse(schema, { kind: true, count: 0 }).issues?.[0]?.path, ["count"]);
  const presence = l.discriminatedUnion("kind", [
    l.object({ kind: l.literal(true, { default: true }) }),
    l.object({ kind: l.literal(false, { nullable: true }) }),
  ]);
  assert.deepEqual(l.parse(presence, {}), { kind: true });
  assert.deepEqual(l.parse(presence, { kind: null }), { kind: null });
  const duplicate = l.discriminatedUnion("kind", [l.object({ kind: l.literal(true) }), l.object({ kind: l.literal(true) })]);
  assert.throws(() => l.parse(duplicate, { kind: true }), /Duplicate discriminator/);
});
