import assert from "node:assert/strict";
import { test } from "node:test";
import * as l from "../src/index.js";

test("discriminated unions accept numeric strings supported by their literal fields", () => {
  const schema = l.discriminatedUnion("edition", [
    l.object({ edition: l.literal(1), value: l.string() }, { unknownKeys: "strip" }),
    l.object({ edition: l.literal(2), value: l.string() }, { unknownKeys: "strip" }),
  ]);
  for (const edition of [2, "2", "2.0", "2e0", "+2"]) {
    const input = { edition, value: "hello" };
    assert.deepEqual(schema["~standard"].validate(input), { value: { edition: 2, value: "hello" } });
    assert.deepEqual(input, { edition, value: "hello" });
  }
});

test("discriminated unions accept boolean strings and reject unsupported scalar inputs", () => {
  const schema = l.discriminatedUnion("enabled", [
    l.object({ enabled: l.literal(true), value: l.string() }),
    l.object({ enabled: l.literal(false), value: l.string() }),
  ]);
  for (const [enabled, expected] of [["true", true], ["1", true], ["false", false], ["0", false]] as const)
    assert.deepEqual(l.parse(schema, { enabled, value: "hello" }), { enabled: expected, value: "hello" });
  for (const enabled of [1, 0, "TRUE", "", null, undefined, [], {}])
    assert.deepEqual(l.safeParse(schema, { enabled, value: "hello" }).issues?.[0]?.path, ["enabled"]);
  const numeric = l.discriminatedUnion("edition", [
    l.object({ edition: l.literal(1) }), l.object({ edition: l.literal(2) }),
  ]);
  for (const edition of ["3", " 2", "0x2", "1e999", "", true, NaN, Infinity])
    assert.deepEqual(l.safeParse(numeric, { edition }).issues?.[0]?.path, ["edition"]);
});

test("exact discriminator matches take precedence and converted ties follow branch order", () => {
  const numeric = l.object({ kind: l.literal(1), value: l.literal("number") });
  const boolean = l.object({ kind: l.literal(true), value: l.literal("boolean") });
  const string = l.object({ kind: l.literal("1"), value: l.literal("string") });
  for (const branches of [[numeric, boolean, string], [string, boolean, numeric]] as const) {
    const schema = l.discriminatedUnion("kind", branches);
    for (const [kind, value] of [[1, "number"], [true, "boolean"], ["1", "string"]] as const)
      assert.deepEqual(l.parse(schema, { kind, value }), { kind, value });
    assert.deepEqual(l.safeParse(schema, { kind: "1", value: "number" }).issues?.[0]?.path, ["value"]);
  }
  assert.deepEqual(l.parse(l.discriminatedUnion("kind", [numeric, boolean]), { kind: "1", value: "number" }),
    { kind: 1, value: "number" });
  const booleanFirst = l.discriminatedUnion("kind", [boolean, numeric]);
  assert.deepEqual(l.parse(booleanFirst, { kind: "1", value: "boolean" }), { kind: true, value: "boolean" });
  assert.deepEqual(l.safeParse(booleanFirst, { kind: "1", value: "number" }).issues?.[0]?.path, ["value"]);
});

test("wrapped composites convert discriminators and preserve refinement and transform callbacks", () => {
  const numeric = l.discriminatedUnion("edition", [
    l.object({ edition: l.literal(1), value: l.string() }, { unknownKeys: "strip" }),
    l.object({ edition: l.literal(2), value: l.string() }, { unknownKeys: "strip" }),
  ]);
  const other = l.object({ other: l.string() });
  for (const composite of [l.union([numeric, other]), l.xor([numeric, other]), l.intersection(numeric, l.object({ extra: l.string() }, { unknownKeys: "strip" }))]) {
    let refinements = 0, transforms = 0;
    const wrapped = l.transform(l.refine(composite, value => {
      refinements++;
      return !("value" in value) || value.value !== "bad";
    }, "Bad value"), value => {
      transforms++;
      return { ...value, transformed: true };
    });
    const input = { edition: "2.0", value: "hello", extra: "kept" };
    const expected = composite.meta.kind === "intersection"
      ? { edition: 2, value: "hello", extra: "kept", transformed: true }
      : { edition: 2, value: "hello", transformed: true };
    assert.deepEqual(wrapped["~standard"].validate(input), { value: expected });
    assert.equal(refinements, 1);
    assert.equal(transforms, 1);
    assert.equal(input.edition, "2.0");
    assert.equal(l.safeParse(wrapped, { ...input, value: "bad" }).issues?.[0]?.message, "Bad value");
    assert.equal(refinements, 2);
    assert.equal(transforms, 1);
    assert.ok(l.safeParse(wrapped, { ...input, edition: "3" }).issues);
    assert.equal(refinements, 2);
  }
});

test("composite branches retain their own discriminator types without mutating shared inputs", () => {
  const numeric = l.discriminatedUnion("kind", [l.object({ kind: l.literal(1) }), l.object({ kind: l.literal(2) })]);
  const string = l.object({ kind: l.literal("2.0") });
  const input = Object.freeze({ kind: "2.0" });
  assert.deepEqual(l.parse(l.union([string, numeric]), input), { kind: "2.0" });
  assert.deepEqual(l.parse(l.union([numeric, string]), input), { kind: 2 });
  assert.ok(l.safeParse(l.xor([numeric, string]), input).issues);
  assert.ok(l.safeParse(l.intersection(numeric, string), input).issues);
  assert.equal(input.kind, "2.0");
});

test("discriminator callbacks run only during selected branch validation", () => {
  let transforms = 0, refinements = 0;
  const schema = l.discriminatedUnion("kind", [
    l.object({ kind: l.transform(l.literal(1), value => { transforms++; return value; }) }),
    l.object({ kind: l.refine(l.literal(true), () => { refinements++; return true; }, "Rejected") }),
  ]);
  assert.deepEqual(l.parse(schema, { kind: "1" }), { kind: 1 });
  assert.equal(transforms, 1);
  assert.equal(refinements, 0);
  const rejected = l.discriminatedUnion("kind", [
    l.object({ kind: l.refine(l.literal(1), () => false, "Rejected") }),
    l.object({ kind: l.literal(true) }),
  ]);
  assert.equal(l.safeParse(rejected, { kind: "1" }).issues?.[0]?.message, "Rejected");
});
