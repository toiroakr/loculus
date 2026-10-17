import assert from "node:assert/strict";
import { test } from "node:test";
import * as l from "../src/index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

test("unflatten nests dotted keys and keeps optional groups optional", () => {
  const schema = l.unflatten(l.object({
    name: l.string(),
    "db.host": l.string(),
    "db.port": l.number({ default: 5432 }),
    "db.pool.max": l.number({ optional: true }),
    "log.level": l.enum(["info", "debug"], { optional: true }),
  }));
  const value = l.parse(schema, { name: "api", "db.host": "localhost", "db.pool.max": "4" });
  const exact: Equal<typeof value, {
    name: string;
    db: { host: string; port: number; pool?: { max?: number } };
    log?: { level?: "info" | "debug" };
  }> = true;
  void exact;
  assert.deepEqual(value, { name: "api", db: { host: "localhost", port: 5432, pool: { max: 4 } } });
  assert.deepEqual(l.parse(schema, { name: "api", "db.host": "localhost" }), { name: "api", db: { host: "localhost", port: 5432 } });
});

test("unflatten keeps flat inputs, metadata and issue paths", () => {
  const flat = l.object({ "db.host": l.string(), "db.port": l.number() });
  const schema = l.unflatten(flat);
  const input: l.Input<typeof schema> = { "db.host": "x", "db.port": "1" };
  void input;
  assert.equal(schema.meta.kind, "object");
  assert.equal(schema.meta.inner, flat);
  assert.deepEqual(l.safeParse(schema, { "db.port": "x" }).issues?.map(issue => issue.path), [["db.host"], ["db.port"]]);
});

test("unflatten splits kebab-case keys only at listed prefixes", () => {
  const schema = l.unflatten(l.object({
    "db-host-name": l.string(), "db-pool-max": l.number(), "dry-run": l.boolean(), "dbx-port": l.number(),
  }), { style: "kebab", prefixes: ["db", "db-pool"] });
  const value = l.parse(schema, { "db-host-name": "localhost", "db-pool-max": "4", "dry-run": "true", "dbx-port": "1" });
  const exact: Equal<typeof value, {
    db: { "host-name": string; pool: { max: number } };
    "dry-run": boolean;
    "dbx-port": number;
  }> = true;
  void exact;
  assert.deepEqual(value, { db: { "host-name": "localhost", pool: { max: 4 } }, "dry-run": true, "dbx-port": 1 });
});

test("unflatten splits camelCase keys at listed prefixes and uncapitalizes the rest", () => {
  const schema = l.unflatten(l.object({
    dbHostName: l.string(), dbPoolMax: l.number({ optional: true }), dbx: l.number(), db2: l.number(),
  }), { style: "camel", prefixes: ["db", "dbPool"] });
  const value = l.parse(schema, { dbHostName: "localhost", dbPoolMax: "4", dbx: "1", db2: "2" });
  const exact: Equal<typeof value, { db: { hostName: string; pool?: { max?: number } }; dbx: number; db2: number }> = true;
  void exact;
  assert.deepEqual(value, { db: { hostName: "localhost", pool: { max: 4 } }, dbx: 1, db2: 2 });
  const only = l.unflatten(l.object({ dbPoolMax: l.number() }), { style: "camel", prefixes: ["dbPool"] });
  assert.deepEqual(l.parse(only, { dbPoolMax: "1" }), { dbPool: { max: 1 } });
});

test("unflatten passes null and undefined through and works as a nested field", () => {
  const optional = l.unflatten(l.object({ "a.b": l.string() }, { optional: true }));
  const value = l.parse(optional, undefined);
  const exact: Equal<typeof value, { a: { b: string } } | undefined> = true;
  void exact;
  assert.equal(value, undefined);
  assert.equal(l.parse(l.unflatten(l.object({ "a.b": l.string() }, { nullable: true })), null), null);
  assert.deepEqual(l.parse(l.object({ config: optional }), { config: { "a.b": "x" } }), { config: { a: { b: "x" } } });
});

test("unflatten rejects declared keys that are both values and groups", () => {
  assert.throws(() => l.unflatten(l.object({ db: l.string(), "db.host": l.string() })), {
    name: "TypeError", message: 'Cannot unflatten "db.host": "db" is both a value and a group',
  });
  assert.throws(() => l.unflatten(l.object({ "db.host": l.string(), db: l.string() })), TypeError);
  assert.throws(() => l.unflatten(l.object({ "a.b": l.number(), "a.b.c": l.number() })), TypeError);
  assert.throws(() => l.unflatten(l.object({ dbHost: l.string(), db: l.string() }), { style: "camel", prefixes: ["db"] }), TypeError);
});

test("unflatten reports runtime key conflicts as issues", () => {
  const schema = l.unflatten(l.object({ "db.host": l.string() }, { unknownKeys: "passthrough" }));
  assert.deepEqual(l.safeParse(schema, { "db.host": "x", db: "y" }), {
    issues: [{ message: 'Cannot unflatten "db": "db" is both a value and a group', code: "invalid_key", path: ["db"] }],
  });
  const union = l.unflatten(l.union([
    l.object({ db: l.string({ optional: true }), "db.host": l.string({ optional: true }) }, { unknownKeys: "strip" }),
    l.object({ other: l.string() }),
  ]));
  const value = l.parse(union, { "db.host": "y" });
  const exact: Equal<typeof value, { db?: unknown } | { other: string }> = true;
  void exact;
  assert.deepEqual(value, { db: { host: "y" } });
  assert.equal(l.safeParse(union, { db: "x", "db.host": "y" }).issues?.[0]?.code, "invalid_key");
  l.config({ customError: issue => issue.code === "invalid_key" ? "キーが衝突しています" : undefined });
  try {
    assert.equal(l.safeParse(union, { db: "x", "db.host": "y" }).issues?.[0]?.message, "キーが衝突しています");
  } finally {
    l.config({ customError: undefined });
  }
});

test("unflatten defines own properties without touching prototypes", () => {
  const schema = l.unflatten(l.object({ "__proto__.polluted": l.boolean(), "a.__proto__": l.number() }));
  const value = l.parse(schema, { "__proto__.polluted": "true", "a.__proto__": "1" }) as Record<string, any>;
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.deepEqual(Object.keys(value), ["__proto__", "a"]);
  assert.equal(Object.hasOwn(value.a, "__proto__"), true);
});

test("unflatten types unknown keys and style unions conservatively", () => {
  const indexed = l.unflatten(l.object(Object.fromEntries([["db.host", l.string()]])));
  const indexedValue = l.parse(indexed, { "db.host": "localhost" });
  const indexedExact: Equal<typeof indexedValue, Record<string, unknown>> = true;
  void indexedExact;
  assert.deepEqual(indexedValue, { db: { host: "localhost" } });

  const options = { style: "camel", prefixes: ["db"] } as { style: "camel" | "kebab"; prefixes: ["db"] };
  const either = l.parse(l.unflatten(l.object({ dbHost: l.string() }), options), { dbHost: "x" });
  const eitherExact: Equal<typeof either, { db: { host: string } } | { dbHost: string }> = true;
  void eitherExact;
  assert.deepEqual(either, { db: { host: "x" } });
});

test("unflatten only accepts plain record outputs", () => {
  if (false) {
    // @ts-expect-error Dates are not flat records.
    l.unflatten(l.date());
    // @ts-expect-error Arrays are not flat records.
    l.unflatten(l.array(l.string()));
  }
  const date = l.unflatten(l.date() as unknown as l.Schema<string, Record<string, unknown>>);
  assert.ok(l.parse(date, "2026-01-01") instanceof Date);
  const array = l.unflatten(l.array(l.string()) as unknown as l.Schema<string[], Record<string, unknown>>);
  assert.deepEqual(l.parse(array, ["a.b"]), ["a.b"]);
});
