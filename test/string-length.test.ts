import assert from "node:assert/strict";
import { test } from "node:test";
import * as l from "../src/index.js";
import { codeUnits, codePoints, graphemes, displayWidth, utf8Bytes, utf16Bytes } from "../src/length.js";

test("length counters distinguish encoding, code points, graphemes and display columns", () => {
  for (const [value, expected] of [
    ["", [0, 0, 0, 0, 0, 0]],
    ["Aあｱ", [3, 3, 3, 4, 7, 6]],
    ["😀", [2, 1, 1, 2, 4, 4]],
    ["e\u0301", [2, 2, 1, 1, 3, 4]],
    ["👨‍👩‍👧‍👦", [11, 7, 1, 2, 25, 22]],
    ["🇯🇵", [4, 2, 1, 2, 8, 8]],
    ["\ud800", [1, 1, 1, 0, 3, 2]],
  ] as const) {
    assert.deepEqual([codeUnits, codePoints, graphemes, displayWidth, utf8Bytes, utf16Bytes].map(count => count(value)), expected, value);
  }
  assert.equal(displayWidth("\u001b[31mあ\u001b[0m"), 2);
  assert.equal(displayWidth("a\n\tb"), 2);
});

test("string bounds use the selected counter after trimming", () => {
  for (const [length, value, count] of [
    [codeUnits, "😀", 2], [codePoints, "😀", 1], [graphemes, "👨‍👩‍👧‍👦", 1],
    [displayWidth, "あ", 2], [utf8Bytes, "あ", 3], [utf16Bytes, "あ", 2],
  ] as const) {
    assert.equal(l.parse(l.string({ length, trim: true, min: count, max: count }), ` ${value} `), value);
    assert.ok(l.safeParse(l.string({ length, min: count + 1 }), value).issues);
    assert.ok(l.safeParse(l.string({ length, max: count - 1 }), value).issues);
  }
  assert.ok(l.safeParse(l.string({ max: 1 }), "😀").issues);
  let calls = 0;
  const length = (value: string) => { calls++; return value.replaceAll(" ", "").length; };
  assert.equal(l.parse(l.string({ length, min: 2, max: 2 }), "a b"), "a b");
  assert.equal(calls, 1);
  const optional = l.string({ length, optional: true });
  assert.equal(l.parse(optional, undefined), undefined);
  assert.equal(l.parse(optional, "anything"), "anything");
  assert.equal(calls, 1);
});

test("application defaults affect existing schemas and explicit counters take precedence", () => {
  const schema = l.object({ text: l.string({ max: 1 }), rows: l.array(l.string({ max: 1 })) });
  const explicit = l.string({ length: codeUnits, max: 1 });
  try {
    l.config({ stringLength: graphemes });
    l.config({});
    assert.deepEqual(l.parse(schema, { text: "👨‍👩‍👧‍👦", rows: ["e\u0301"] }), { text: "👨‍👩‍👧‍👦", rows: ["e\u0301"] });
    assert.ok(l.safeParse(explicit, "😀").issues);
    assert.equal(l.countString("e\u0301"), 1);
    l.config({ stringLength: utf8Bytes });
    assert.ok(l.safeParse(schema, { text: "あ", rows: [] }).issues);
    assert.equal(l.countString("あ"), 3);
    l.config({ stringLength: undefined });
    assert.equal(l.countString("😀"), 2);
    assert.ok(l.safeParse(schema, { text: "😀", rows: [] }).issues);
  } finally {
    l.config({ stringLength: undefined });
  }
});

test("invalid custom counts fail clearly and missing values bypass the counter", () => {
  for (const count of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => l.parse(l.string({ length: () => count, max: 1 }), "x"), RangeError);
  }
  const length = () => { throw new Error("counter called"); };
  assert.equal(l.parse(l.string({ length, max: 1, default: "guest" }), undefined), "guest");
  assert.equal(l.parse(l.string({ length, max: 1, nullable: true }), null), null);
  assert.ok(l.safeParse(l.string({ length, max: 1 }), 1).issues);
  assert.throws(() => l.config({ stringLength: "bad" as unknown as l.StringLength }), TypeError);
});

test("string length defaults compose with error configuration", () => {
  const previous = l.config();
  const schema = l.string({ max: 1 });
  try {
    l.config({ stringLength: graphemes, customError: issue => `Limit: ${issue.max}` });
    assert.equal(l.parse(schema, "👨‍👩‍👧‍👦"), "👨‍👩‍👧‍👦");
    assert.equal(l.safeParse(schema, "ab").issues?.[0]?.message, "Limit: 1");
    l.config({ customError: undefined });
    assert.equal(l.parse(schema, "👨‍👩‍👧‍👦"), "👨‍👩‍👧‍👦");
    l.config({ stringLength: undefined });
    assert.equal(l.config().stringLength, undefined);
    assert.ok(l.safeParse(schema, "😀").issues);
  } finally {
    l.config({ stringLength: previous.stringLength, customError: previous.customError });
  }
});
