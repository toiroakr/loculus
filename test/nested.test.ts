import assert from "node:assert/strict";
import { test } from "node:test";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import * as l from "../src/index.js";
import { z } from "zod";
import * as v from "valibot";

test("nested objects infer inputs, transformed outputs and required containers", () => {
  const schema = l.object({
    address: l.object({ zip: l.string({ trim: true, min: 1 }), floor: l.number({ default: 1 }) }),
    note: l.object({ text: l.string() }, { optional: true }),
  });
  const input: l.Input<typeof schema> = { address: { zip: " 100 " } };
  const output: l.Output<typeof schema> = { address: { zip: "100", floor: 1 } };
  const standard: StandardSchemaV1<l.Input<typeof schema>, l.Output<typeof schema>> = schema;
  assert.deepEqual(l.parse(schema, input), output);
  assert.deepEqual(standard["~standard"].validate(input), { value: output });
  assert.deepEqual(l.safeParse(schema, {}).issues?.map(i => i.path), [["address"]]);
  assert.deepEqual(l.safeParse(schema, { address: {} }).issues?.map(i => i.path), [["address", "zip"]]);
  if (false) {
    // @ts-expect-error Address is required on input.
    const missing: l.Input<typeof schema> = {};
    // @ts-expect-error Floors are numbers on output.
    const unconverted: l.Output<typeof schema> = { address: { zip: "100", floor: "1" } };
    void [missing, unconverted];
  }
});

test("nested object presence and targeted defaults apply to the whole container", () => {
  const shape = { count: l.number({ gte: 1, default: 2 }) };
  const optional = l.object(shape, { optional: true });
  const nullable = l.object(shape, { nullable: true });
  const nullish = l.object(shape, { nullish: true });
  assert.equal(l.parse(optional, undefined), undefined);
  assert.ok(l.safeParse(optional, null).issues);
  assert.equal(l.parse(nullable, null), null);
  assert.ok(l.safeParse(nullable, undefined).issues);
  assert.equal(l.parse(nullish, undefined), undefined);
  assert.equal(l.parse(nullish, null), null);
  assert.deepEqual(l.parse(nullish, {}), { count: 2 });
  const fallback = { count: 0 };
  const defaulted = l.object(shape, { default: { undefined: fallback, null: { count: 3 } } });
  const result: { count: number } = l.parse(defaulted, undefined);
  assert.strictEqual(result, fallback);
  assert.deepEqual(l.parse(defaulted, null), { count: 3 });
  assert.ok(l.safeParse(defaulted, { count: "bad" }).issues);
  const same = l.object(shape, { default: { nullish: fallback } });
  assert.strictEqual(l.parse(same, null), l.parse(same, undefined));
  const nullDefault = l.object(shape, { default: { null: fallback } });
  const parent = l.object({ child: nullDefault });
  const preserved = l.object(shape, { nullable: true, default: { undefined: fallback } });
  const nil: { count: number } | null = l.parse(preserved, null);
  assert.equal(nil, null);
  assert.ok(l.safeParse(nullDefault, undefined).issues);
  assert.deepEqual(l.parse(l.object({ child: optional }), {}), {});
  assert.deepEqual(l.parse(l.object({ child: optional }), { child: undefined }), { child: undefined });
  assert.deepEqual(l.parse(l.object({ child: defaulted }), {}), { child: fallback });
  if (false) {
    // @ts-expect-error Whole-object defaults require explicit input targets.
    l.object(shape, { default: { count: 1 } });
    // @ts-expect-error Defaults use output values, not coercible input values.
    l.object(shape, { default: { undefined: { count: "1" } } });
    // @ts-expect-error Null-only defaults do not make the parent optional on input.
    const input: l.Input<typeof parent> = {};
    void input;
  }
});

test("nested objects retain independent unknown-key policies and inherited fields", () => {
  const schema = l.object({
    strict: l.object({ value: l.string() }),
    strip: l.object({ value: l.string() }, { unknownKeys: "strip" }),
    loose: l.object({ value: l.string() }, { unknownKeys: "passthrough" }),
  });
  const strict = Object.create({ value: "inherited" });
  const input = { strict, strip: { value: "a", extra: 1 }, loose: { value: "b", extra: 2 } };
  assert.deepEqual(l.parse(schema, input), { strict: { value: "inherited" }, strip: { value: "a" }, loose: { value: "b", extra: 2 } });
  assert.deepEqual(l.safeParse(schema, { ...input, strict: { value: "", extra: 1 }, extra: 2 }).issues?.map(i => i.path), [["strict", "extra"], ["extra"]]);
  const special = l.object({ child: l.object({ ["__proto__"]: l.string(), nullish: l.string() }) });
  assert.deepEqual(l.parse(special, JSON.parse('{"child":{"__proto__":"x","nullish":"value"}}')), { child: { nullish: "value" } });
  const targets = l.object({ undefined: l.string(), null: l.string() }, { default: { undefined: { undefined: "u", null: "n" } } });
  assert.deepEqual(l.parse(targets, undefined), { undefined: "u", null: "n" });
});

test("multidimensional arrays preserve per-level wrapping, bounds and indexed paths", () => {
  const row = l.array(l.number({ gte: 1 }), { wrapScalar: false, min: 1, max: 2 });
  const matrix = l.array(row, { wrapScalar: false, min: 1 });
  const input: l.Input<typeof matrix> = [["1", "2"], [3]] as const;
  const output: number[][] = l.parse(matrix, input);
  assert.deepEqual(output, [[1, 2], [3]]);
  assert.deepEqual(l.safeParse(matrix, [["bad", "0"], []]).issues?.map(i => i.path), [[0, 0], [0, 1], [1]]);
  assert.deepEqual(l.safeParse(matrix, [["bad", 1, 2]]).issues?.map(i => i.path), [[0, 0]]);
  assert.deepEqual(l.safeParse(matrix, [[1, 2, 3]]).issues?.map(i => i.path), [[0]]);
  for (const value of ["1", ["1", "2"], [], null, undefined]) assert.ok(l.safeParse(matrix, value).issues);
  assert.deepEqual(l.parse(l.array(l.array(l.number())), ["1", "2"]), [[1], [2]]);
  assert.deepEqual(l.parse(l.array(l.array(l.number())), "1"), [[1]]);
  assert.deepEqual(l.parse(l.array(l.array(l.number(), { wrapScalar: false })), [["1"]]), [[1]]);
  const nested = l.object({ rows: l.array(l.array(l.object({ count: l.number() }), { wrapScalar: false }), { wrapScalar: false }) });
  assert.deepEqual(l.safeParse(nested, { rows: [[{ count: "bad" }]] }).issues?.map(i => i.path), [["rows", 0, 0, "count"]]);
  if (false) {
    // @ts-expect-error Strict rows require arrays, not scalar inputs.
    const invalid: l.Input<typeof matrix> = ["1"];
    void invalid;
  }
});

test("nested objects preserve validator snapshots, callback order and container transforms", () => {
  const events: string[] = [];
  const child = l.object({ value: l.transform(l.string(), value => { events.push("transform"); return value.toUpperCase(); }) });
  const schema = l.object({ child, after: l.string() });
  Object.defineProperty(child, "~standard", { value: { ...child["~standard"], validate: () => ({ value: { value: "replaced" } }) } });
  const input = { get child() { events.push("child"); return { get value() { events.push("value"); return "a"; } }; }, get after() { events.push("after"); return "b"; } };
  assert.deepEqual(l.parse(schema, input), { child: { value: "A" }, after: "b" });
  assert.deepEqual(events, ["child", "value", "transform", "after"]);
  const transformed = l.object({ child: l.transform(l.object({ count: l.number() }), value => value.count + 1) });
  assert.deepEqual(l.parse(transformed, { child: { count: "2" } }), { child: 3 });
  const refined = l.refine(l.object({ count: l.number() }, { default: { undefined: { count: 0 } } }), value => value.count > 0, "Positive count required");
  assert.ok(l.safeParse(l.object({ child: refined }), {}).issues);
});

test("nested structured inputs agree with Zod and Valibot acceptance and outputs", () => {
  const schema = l.object({ address: l.object({ zip: l.string({ min: 1 }) }, { optional: true }), rows: l.array(l.array(l.number({ gte: 1 }), { wrapScalar: false }), { wrapScalar: false }) });
  const peers = [
    z.strictObject({ address: z.strictObject({ zip: z.string().min(1) }).optional(), rows: z.array(z.array(z.number().min(1))) }),
    v.strictObject({ address: v.optional(v.strictObject({ zip: v.pipe(v.string(), v.minLength(1)) })), rows: v.array(v.array(v.pipe(v.number(), v.minValue(1)))) }),
  ];
  for (const input of [{ rows: [[1, 2], [3]] }, { address: { zip: "100" }, rows: [] }, { address: {}, rows: [[0]] }, { address: null, rows: [] }, { address: { zip: "100", extra: 1 }, rows: [] }, { rows: [1, 2] }, null, []]) {
    const actual = l.safeParse(schema, input);
    for (const peer of peers) {
      const expected = peer["~standard"].validate(input);
      assert.ok(!(expected instanceof Promise));
      assert.equal(!!actual.issues, !!expected.issues);
      if (!actual.issues && !expected.issues) assert.deepEqual(actual.value, expected.value);
    }
  }
});

test("objects accept nested schemas produced by the previous plugin", () => {
  const current = l.object({ count: l.number() });
  const { field: _, ...legacy } = current;
  const schema = l.object({ child: legacy as typeof current });
  assert.deepEqual(l.parse(schema, { child: { count: "2" } }), { child: { count: 2 } });
  assert.deepEqual(l.safeParse(schema, { child: {} }).issues?.map(i => i.path), [["child", "count"]]);
});

test("object settings retain inherited modes and capture recognized presence getters once", () => {
  const events: string[] = [];
  const options = Object.create({ unknownKeys: "strip" }, {
    optional: { enumerable: true, get() { events.push("optional"); return true; } },
  });
  Object.defineProperty(options, "default", { enumerable: true, get() { events.push("default"); return { undefined: { count: 1 } }; } });
  Object.defineProperty(options, "ignored", { enumerable: true, get() { throw new Error("Unrelated option read"); } });
  events.length = 0;
  const schema = l.object({ count: l.number() }, options);
  assert.deepEqual(events, ["optional", "default"]);
  assert.deepEqual(l.parse(schema, undefined), { count: 1 });
  assert.deepEqual(l.parse(schema, { count: "2", extra: true }), { count: 2 });
  assert.deepEqual(events, ["optional", "default"]);
  assert.throws(() => l.object({ count: l.number() }, { default: { nullish: { count: 1 }, null: { count: 2 } } } as never), /Invalid default targets/);
});
