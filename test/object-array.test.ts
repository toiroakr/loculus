import { test } from "node:test";
import assert from "node:assert/strict";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import * as l from "../src/index.js";
import * as before from "../bench/single-use/before/index.js";

const item = l.object({
  name: l.string({ min: 1 }),
  quantity: l.number({ integer: true, gte: 1 }),
  note: l.string({ optional: true }),
  tags: l.array(l.string({ min: 1 }), { wrapScalar: false, default: [] }),
});

test("object arrays infer row inputs and converted outputs", () => {
  const form = l.object({ title: l.string(), items: l.array(item, { wrapScalar: false, min: 1 }) });
  type RowInput = l.Input<typeof form>["items"][number];
  type RowOutput = l.Output<typeof form>["items"][number];
  const input: RowInput = { name: "apple", quantity: "2" };
  const standard: StandardSchemaV1<l.Input<typeof form>, l.Output<typeof form>> = form;
  const result = l.parse(form, { title: "Order", items: [input] });
  result.items[0]!.quantity satisfies number;
  result.items[0]!.note satisfies string | undefined;
  result.items[0]!.tags satisfies string[];
  assert.deepEqual(result, { title: "Order", items: [{ name: "apple", quantity: 2, tags: [] }] });
  assert.deepEqual(standard["~standard"].validate({ title: "Order", items: [input] }), { value: result });
  if (false) {
    // @ts-expect-error Converted quantities are numbers.
    const invalidOutput: RowOutput = { name: "apple", quantity: "2", tags: [] };
    // @ts-expect-error Strict arrays require an array input.
    const invalidInput: l.Input<typeof form> = { title: "Order", items: input };
    // @ts-expect-error Rows retain their declared fields.
    const invalidRow: RowInput = { quantity: "2" };
    void [invalidOutput, invalidInput, invalidRow];
  }
});

test("object arrays retain nested paths, bounds and row object modes", () => {
  const strictItem = l.object(item.shape, { unknownKeys: "strict" });
  const form = l.object({ items: l.array(strictItem, { wrapScalar: false, min: 1, max: 2 }) });
  assert.deepEqual(l.safeParse(form, { items: [
    { name: "", quantity: "0", tags: [""] },
    { name: "pear", quantity: "2", extra: "x" },
  ] }).issues?.map(issue => issue.path), [
    ["items", 0, "name"], ["items", 0, "quantity"], ["items", 0, "tags", 0], ["items", 1, "extra"],
  ]);
  for (const items of [[], [{}, {}, {}], {}, null, undefined, [null], ["apple"], [undefined]])
    assert.ok(l.safeParse(form, { items }).issues);
  const inherited = Object.create({ name: "apple", quantity: "2" });
  assert.deepEqual(l.parse(form, { items: [inherited] }), {items: [{name: "apple", quantity: 2, tags: []}]});
  const passthrough = l.array(l.object({ name: l.string() }, { unknownKeys: "passthrough" }), { wrapScalar: false });
  assert.deepEqual(l.parse(passthrough, [{ name: "apple", extra: 1 }]), [{ name: "apple", extra: 1 }]);
});

test("object arrays preserve explicit wrapping and presence defaults", () => {
  const row = { name: "apple", quantity: "2" };
  assert.deepEqual(l.parse(l.array(item, { wrapScalar: true }), row), [{ name: "apple", quantity: 2, tags: [] }]);
  const optional = l.object({ items: l.array(item, { optional: true, wrapScalar: false }) });
  const output = l.parse(optional, {});
  output.items satisfies l.Output<typeof item>[] | undefined;
  assert.deepEqual(output, {});
  const nullable = l.array(item, { nullish: true, wrapScalar: false });
  assert.equal(l.parse(nullable, null), null);
  assert.equal(l.parse(nullable, undefined), undefined);
  const fallback: l.Output<typeof item>[] = [{ name: "apple", quantity: 2, tags: [] }];
  const defaulted = l.array(item, { wrapScalar: false, min: 1, default: { nullish: fallback } });
  const defaultOutput: l.Output<typeof item>[] = l.parse(defaulted, undefined);
  assert.strictEqual(defaultOutput, fallback);
  assert.strictEqual(l.parse(defaulted, null), fallback);
  if (false) {
    // @ts-expect-error Row defaults use converted outputs.
    l.array(item, { default: [row] });
  }
});

test("object arrays preserve row callbacks and results from before compiler removal", () => {
  const create = (library: Omit<typeof before, "compile" | "discriminatedUnion">, events: string[]) => {
    const row = library.refine(library.object({ name: library.transform(library.string(), value => {
      events.push("transform");
      return value.toUpperCase();
    }), quantity: library.number({ gte: 1 }) }), value => value.name !== "FORBIDDEN", "Forbidden item");
    return library.object({ items: library.array(row, { wrapScalar: false }), after: library.string({ min: 1 }) });
  };
  const events: string[] = [];
  const expectedEvents: string[] = [];
  const form = create(l, events);
  const reference = create(before, expectedEvents);
  for (const input of [
    { items: [{ name: "apple", quantity: "2" }], after: "x" },
    { items: [{ name: "apple", quantity: "0" }, { name: "forbidden", quantity: "2" }], after: "" },
    { items: null, after: "" },
  ]) {
    events.length = 0;
    expectedEvents.length = 0;
    assert.deepEqual(l.safeParse(form, input), before.safeParse(reference, input));
    assert.deepEqual(events, expectedEvents);
  }
  const original = globalThis.Function;
  try {
    globalThis.Function = (() => { throw new EvalError("Blocked"); }) as unknown as FunctionConstructor;
    const schema = create(l, []);
    assert.deepEqual(l.parse(schema, { items: [{ name: "a", quantity: "2" }], after: "x" }), { items: [{ name: "A", quantity: 2 }], after: "x" });
  } finally {
    globalThis.Function = original;
  }
});
