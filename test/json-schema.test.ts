import assert from "node:assert/strict";
import { test } from "node:test";
import type { StandardJSONSchemaV1, StandardSchemaV1 } from "@standard-schema/spec";
import * as l from "../src/index.js";
import { jsonSchema } from "../src/json-schema.js";

const draft07 = { target: "draft-07" };
const draft2020 = { target: "draft-2020-12" };

test("the adapter retains validation and describes required input and output fields", () => {
  const schema = l.object({
    name: l.string({ min: 1, pattern: /^\w+$/ }),
    count: l.number({ integer: true, gte: 1, default: 1 }),
    enabled: l.boolean({ optional: true }),
    label: l.string({ default: { null: "unset" } }),
  }, { description: "Query", unknownKeys: "strip" });
  const standard = jsonSchema(schema) satisfies StandardSchemaV1<l.Input<typeof schema>, l.Output<typeof schema>>
    & StandardJSONSchemaV1<l.Input<typeof schema>, l.Output<typeof schema>>;
  const { validate, jsonSchema: converter } = standard["~standard"];

  const input = converter.input(draft2020);
  assert.equal(input.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(input.description, "Query");
  assert.deepEqual(input.required, ["name", "label"]);
  assert.equal(input.additionalProperties, true);
  const output = converter.output(draft07);
  assert.equal(output.$schema, "http://json-schema.org/draft-07/schema#");
  assert.deepEqual(output.required, ["name", "count", "label"]);
  assert.equal(output.additionalProperties, false);
  const { name, count, enabled, label } = output.properties as Record<string, unknown>;
  assert.deepEqual(name, { type: "string", minLength: 1, pattern: "^\\w+$" });
  assert.deepEqual(count, { anyOf: [
    { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    { const: 1 },
  ], default: 1 });
  assert.deepEqual(enabled, { type: "boolean" });
  assert.deepEqual(label, { anyOf: [{ type: "string" }, { const: "unset" }] });
  assert.deepEqual(validate({ name: "loculus", count: "2", label: null }), {
    value: { name: "loculus", count: 2, label: "unset" },
  });
  assert.equal("jsonSchema" in schema["~standard"], false);
});

test("array inputs can wrap a single value when one item satisfies the bounds", () => {
  const { input, output } = jsonSchema(l.array(l.literal(true), {
    wrapScalar: true, min: 1, max: 2, description: "Flags",
  }))["~standard"].jsonSchema;
  assert.deepEqual(input(draft07).anyOf, [
    { type: "array", items: { enum: [true, "true", "1"] }, minItems: 1, maxItems: 2 },
    { enum: [true, "true", "1"] },
  ]);
  assert.deepEqual(output(draft07), {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "array", items: { const: true }, minItems: 1, maxItems: 2, description: "Flags",
  });
  const multiple = jsonSchema(l.array(l.string(), { wrapScalar: true, min: 2 }));
  assert.equal(multiple["~standard"].jsonSchema.input(draft07).anyOf, undefined);
});

test("conversion errors are deferred until a converter is called", () => {
  let calls = 0;
  const transformed = jsonSchema(l.transform(l.number(), value => {
    calls++;
    return String(value);
  }))["~standard"];
  assert.ok(transformed.jsonSchema.input(draft07).anyOf);
  assert.throws(() => transformed.jsonSchema.output(draft07), /transform/);
  assert.throws(() => transformed.jsonSchema.input({ target: "openapi-3.0" }), /Unsupported JSON Schema target/);
  assert.equal(calls, 0);
  assert.deepEqual(transformed.validate("2"), { value: "2" });

  const date = jsonSchema(l.date())["~standard"].jsonSchema;
  assert.equal(date.input(draft2020).type, "string");
  assert.throws(() => date.output(draft2020), /Date/);
});

test("approximate branches keep valid XOR inputs and Unicode strings representable", () => {
  const exact = jsonSchema(l.xor([l.literal("a"), l.literal("b")]))["~standard"].jsonSchema.input(draft07);
  assert.deepEqual(exact.oneOf, [{ const: "a" }, { const: "b" }]);

  const numbers = jsonSchema(l.xor([l.number({ gte: 0 }), l.number({ lt: 0 })]))["~standard"];
  assert.deepEqual(numbers.validate("1"), { value: 1 });
  const input = numbers.jsonSchema.input(draft07);
  assert.ok(input.anyOf);
  assert.equal(input.oneOf, undefined);

  const text = jsonSchema(l.string({ min: 2, max: 3 }))["~standard"];
  assert.deepEqual(text.validate("🦊"), { value: "🦊" });
  for (const convert of [text.jsonSchema.input, text.jsonSchema.output]) {
    assert.equal(convert(draft07).minLength, 1);
    assert.equal(convert(draft07).maxLength, 3);
  }
});

test("an unrepresentable default is reported instead of being serialized as null", () => {
  const standard = jsonSchema(l.number({ default: Infinity }))["~standard"];
  assert.deepEqual(standard.validate(undefined), { value: Infinity });
  assert.throws(() => standard.jsonSchema.input(draft07), /non-finite default/);
  assert.throws(() => standard.jsonSchema.output(draft07), /non-finite default/);
});

test("intersection output preserves merged defaults that bypass field validation", () => {
  const left = l.object({
    row: l.array(l.object({ a: l.string({ pattern: /^x/ }) })),
  }, { default: { null: { row: [{ a: "sentinel" }] } } });
  const right = l.object({
    row: l.array(l.object({ b: l.string() })),
  }, { default: { null: { row: [{ b: "b" }] } } });
  const standard = jsonSchema(l.intersection(left, right))["~standard"];
  assert.deepEqual(standard.validate(null), { value: { row: [{ a: "sentinel", b: "b" }] } });
  for (const [options, tupleKeyword] of [[draft07, "items"], [draft2020, "prefixItems"]] as const) {
    const output = standard.jsonSchema.output(options);
    const [leftOutput] = output.allOf as { anyOf: unknown[] }[];
    assert.deepEqual(leftOutput!.anyOf[1], {
      type: "object", required: ["row"], properties: {
        row: {
          type: "array", minItems: 1, maxItems: 1,
          [tupleKeyword]: [{ type: "object", required: ["a"], properties: { a: { const: "sentinel" } } }],
        },
      },
    });
  }
});

test("impossible numeric bounds reject numeric values and strings", () => {
  for (const bounds of [{ gte: Infinity }, { lt: -Infinity }, { gt: NaN }]) {
    const standard = jsonSchema(l.number(bounds))["~standard"];
    assert.ok(standard.validate("1").issues);
    assert.deepEqual(standard.jsonSchema.input(draft07).not, {});
    assert.deepEqual(standard.jsonSchema.output(draft07).not, {});
  }
});

test("undefined entries in array and object defaults cannot be serialized", () => {
  const array = l.array(l.string({ optional: true }), { default: [undefined] });
  const object = l.object({ label: l.string({ optional: true }) }, { default: { undefined: { label: undefined } } });
  for (const schema of [array, object]) {
    const { input, output } = jsonSchema<unknown, unknown>(schema)["~standard"].jsonSchema;
    assert.throws(() => input(draft07), /Cannot represent the default value/);
    assert.throws(() => output(draft07), /Cannot represent the default value/);
  }
});

test("impossible string and array length bounds exclude all base values", () => {
  for (const bounds of [{ min: Infinity }, { max: -1 }, { min: 1.5, max: 1.9 }]) {
    const string = jsonSchema(l.string({ ...bounds, trim: true }))["~standard"];
    const array = jsonSchema(l.array(l.string(), { ...bounds, wrapScalar: true }))["~standard"];
    assert.ok(string.validate("x").issues);
    assert.ok(array.validate(["x"]).issues);
    for (const converter of [string.jsonSchema, array.jsonSchema]) {
      assert.deepEqual(converter.input(draft07).not, {});
      assert.deepEqual(converter.output(draft2020).not, {});
    }
  }
});

test("passthrough objects accept but omit the own prototype key", () => {
  const schema = l.object({}, { unknownKeys: "passthrough" });
  const standard = jsonSchema(schema)["~standard"];
  const input: unknown = JSON.parse('{"__proto__":{"hello":true}}');
  assert.deepEqual(standard.validate(input), { value: {} });
  assert.equal(standard.jsonSchema.input(draft07).propertyNames, undefined);
  assert.deepEqual(standard.jsonSchema.output(draft07).propertyNames, { not: { const: "__proto__" } });
});

test("intersection output retains strict fields that the other branch cannot merge", () => {
  const left = l.object({ unshared: l.object({ x: l.string() }) }, { unknownKeys: "strip" });
  const right = l.object({ y: l.string() }, { unknownKeys: "strip" });
  const standard = jsonSchema(l.intersection(left, right))["~standard"];
  assert.deepEqual(standard.validate({ unshared: { x: "x" }, y: "y" }), { value: { unshared: { x: "x" }, y: "y" } });
  const output = standard.jsonSchema.output(draft07);
  const [leftOutput, rightOutput] = output.allOf as {
    additionalProperties: boolean;
    properties: Record<string, { additionalProperties?: boolean }>;
  }[];
  assert.equal(leftOutput!.properties.unshared!.additionalProperties, false);
  assert.equal(leftOutput!.additionalProperties, false);
  assert.equal(rightOutput!.additionalProperties, false);
  assert.deepEqual(leftOutput!.properties.y, {});
  assert.deepEqual(rightOutput!.properties.unshared, {});
});

test("all configured defaults are checked for JSON representability", () => {
  const invalid = jsonSchema(l.number({ default: { null: Infinity } }))["~standard"].jsonSchema;
  assert.throws(() => invalid.input(draft07), /non-finite default/);
  assert.throws(() => invalid.output(draft2020), /non-finite default/);

  const valid = jsonSchema(l.number({ default: { null: 1 } }))["~standard"].jsonSchema;
  assert.ok(valid.input(draft07).anyOf);
  assert.ok(valid.output(draft2020).anyOf);
});

test("patterns that cannot preserve Unicode semantics are rejected", () => {
  const schema = l.string({ pattern: /^..$/ });
  assert.deepEqual(l.safeParse(schema, "🦊"), { value: "🦊" });
  const { input, output } = jsonSchema(schema)["~standard"].jsonSchema;
  assert.throws(() => input(draft07), /Unicode matching semantics/);
  assert.throws(() => output(draft2020), /Unicode matching semantics/);

  for (const pattern of [/^\w+$/, /^[.]+$/, /^\.$/, /^\u0041$/]) {
    const standard = jsonSchema(l.string({ pattern }))["~standard"];
    assert.equal(standard.jsonSchema.input(draft2020).pattern, pattern.source);
  }
});

test("intersection output keeps closed branches closed when both have defaults", () => {
  const left = l.object({ a: l.string() }, { default: { null: { a: "a" } } });
  const right = l.object({ b: l.string() }, { default: { null: { b: "b" } } });
  const standard = jsonSchema(l.intersection(left, right))["~standard"];
  assert.deepEqual(standard.validate(null), { value: { a: "a", b: "b" } });
  const output = standard.jsonSchema.output(draft07);
  assert.equal(output.additionalProperties, false);
  assert.deepEqual(output.properties, { a: {}, b: {} });
});

test("an optional intersection field can be supplied by the other branch", () => {
  const left = l.object({ shared: l.number({ default: 1 }) });
  const right = l.object({ shared: l.string({ optional: true }) });
  const standard = jsonSchema(l.intersection(left, right))["~standard"];
  assert.deepEqual(standard.validate({}), { value: { shared: 1 } });
  const [, other] = standard.jsonSchema.output(draft07).allOf as { properties: Record<string, unknown> }[];
  assert.deepEqual(other!.properties.shared, {});
});
