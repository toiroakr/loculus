import assert from "node:assert/strict";
import { test } from "node:test";
import * as l from "../src/index.js";

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
