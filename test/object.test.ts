import { test } from "node:test";
import assert from "node:assert/strict";
import * as l from "../src/index.js";

test("object construction identifies an unsupported schema field", () => {
  assert.throws(
    () => l.object({ nested: l.union([l.string(), l.number()]) } as never),
    { name: "TypeError", message: "Expected field: nested" },
  );
});

test("object validation preserves getter and callback ordering on success and failure", () => {
  const events: string[] = [];
  const schema = l.object({
      first: l.transform(l.string(), (value) => {
        events.push("transform");
        return value.toUpperCase();
      }),
      second: l.array(l.string()),
    });
  const input = {
    get first() {
      events.push("first");
      return "a";
    },
    get second() {
      events.push("second");
      return [1, 2];
    },
  };
  assert.deepEqual(
    l.safeParse(schema, input).issues?.map((issue) => issue.path),
    [
      ["second", 0],
      ["second", 1],
    ],
  );
  assert.deepEqual(events, ["first", "transform", "second"]);
  events.length = 0;
  assert.deepEqual(l.parse(schema, { ...input, second: ["b"] }), {
    first: "A",
    second: ["b"],
  });
  assert.deepEqual(events, ["first", "second", "transform"]);
});

test("object validation handles source-like keys and snapshots the original shape", () => {
  const keys = ["__proto__", "constructor", "a\";throw Error('injected');//", "` ${value}", "\n"];
  const shape = Object.fromEntries(keys.map((key) => [key, l.string()]));
  const schema = l.object(shape);
  const input = Object.fromEntries(keys.map((key) => [key, key]));
  shape[keys[0]!] = l.string({ min: 100 });
  assert.deepEqual(l.parse(schema, input), Object.fromEntries(keys.filter(key => key !== "__proto__").map(key => [key, key])));
  assert.equal(Object.getPrototypeOf(l.parse(schema, input)), Object.prototype);
  assert.deepEqual(
    l.safeParse(schema, {}).issues?.map((issue) => issue.path),
    keys.filter(key => key !== "__proto__").map((key) => [key]),
  );
});

test("object validation works when dynamic function construction is blocked", () => {
  const shape = {
    optional: l.string({ optional: true }),
    count: l.number({ default: 42 }),
    tags: l.array(l.string()),
    ["__proto__"]: l.string({ nullish: true }),
  };
  const expected = l.object(shape);
  const original = globalThis.Function;
  let actual: typeof expected;
  try {
    globalThis.Function = (() => {
      throw new EvalError("Dynamic code generation is blocked");
    }) as unknown as FunctionConstructor;
    actual = l.object(shape);
  } finally {
    globalThis.Function = original;
  }
  const inherited = Object.create({ optional: "inherited", count: 100 });
  inherited.tags = "a";
  for (const input of [
    { tags: "a" },
    { optional: undefined, count: "1", tags: ["a"] },
    JSON.parse('{"tags":"a","__proto__":null}'),
    { optional: "b", tags: [1, 2] },
    inherited,
    null,
    [],
  ]) {
    assert.deepEqual(l.safeParse(actual, input), l.safeParse(expected, input));
  }
});

test("object exposes Standard Schema metadata and preserves strict, passthrough and refinements", () => {
  const schema = l.object(
    { name: l.string({ optional: true }), port: l.number({ default: 80 }) },
    { description: "Options" },
  );
  assert.strictEqual(schema.meta.shape, schema.shape);
  assert.equal(schema.meta.description, "Options");
  assert.equal(schema["~standard"].version, 1);
  assert.equal(schema["~standard"].vendor, "loculus");
  const output = l.parse(schema, {});
  output.name satisfies string | undefined;
  output.port satisfies number;
  for (const mode of ["strict", "passthrough"] as const) {
    const schema = l.object({ name: l.string() }, { unknownKeys: mode });
    const result = l.safeParse(schema, { name: "x", extra: true });
    if (mode === "strict") assert.deepEqual(result.issues?.map(issue => issue.path), [["extra"]]);
    else assert.deepEqual(l.parse(schema, { name: "x", extra: true }), { name: "x", extra: true });
  }
  const refined = l.refine(schema, (value) => value.port < 10, "port too high");
  assert.ok(l.safeParse(refined, {}).issues);
});
