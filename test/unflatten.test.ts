import assert from "node:assert/strict";
import { test } from "node:test";
import * as l from "../src/index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

test("unflatten nests dotted keys and keeps optional groups optional", () => {
  const schema = l.object({
    name: l.string(),
    "db.host": l.string(),
    "db.port": l.number({ default: 5432 }),
    "db.pool.max": l.number({ optional: true }),
    "log.level": l.enum(["info", "debug"], { optional: true }),
  });
  const value = l.unflatten(l.parse(schema, { name: "api", "db.host": "localhost", "db.pool.max": "4" }));
  const exact: Equal<typeof value, {
    name: string;
    db: { host: string; port: number; pool?: { max?: number } };
    log?: { level?: "info" | "debug" };
  }> = true;
  void exact;
  assert.deepEqual(value, { name: "api", db: { host: "localhost", port: 5432, pool: { max: 4 } } });
});

test("unflatten splits kebab-case keys only at listed prefixes", () => {
  const flat = { "db-host-name": "localhost", "db-pool-max": 4, "dry-run": true, "dbx-port": 1 };
  const value = l.unflatten(flat, { style: "kebab", prefixes: ["db", "db-pool"] });
  const exact: Equal<typeof value, {
    db: { "host-name": string; pool: { max: number } };
    "dry-run": boolean;
    "dbx-port": number;
  }> = true;
  void exact;
  assert.deepEqual(value, { db: { "host-name": "localhost", pool: { max: 4 } }, "dry-run": true, "dbx-port": 1 });
});

test("unflatten splits camelCase keys at listed prefixes and uncapitalizes the rest", () => {
  const flat = { dbHostName: "localhost", dbPoolMax: 4, dbx: 1, db2: 2 } as { dbHostName: string; dbPoolMax?: number; dbx: number; db2: number };
  const value = l.unflatten(flat, { style: "camel", prefixes: ["db", "dbPool"] });
  const exact: Equal<typeof value, { db: { hostName: string; pool?: { max?: number } }; dbx: number; db2: number }> = true;
  void exact;
  assert.deepEqual(value, { db: { hostName: "localhost", pool: { max: 4 } }, dbx: 1, db2: 2 });
  assert.deepEqual(l.unflatten({ dbPoolMax: 1 }, { style: "camel", prefixes: ["dbPool"] }), { dbPool: { max: 1 } });
});

test("unflatten omits groups whose keys are absent and works as a transform", () => {
  const schema = l.transform(l.object({ "db-host": l.string({ optional: true }) }), value =>
    l.unflatten(value, { style: "kebab", prefixes: ["db"] }));
  assert.deepEqual(l.parse(schema, {}), {});
  assert.deepEqual(l.parse(schema, { "db-host": "x" }), { db: { host: "x" } });
  const output: l.Output<typeof schema> = { db: { host: "x" } };
  void output;
});

test("unflatten rejects keys that are both values and groups", () => {
  assert.throws(() => l.unflatten({ db: "x", "db.host": "y" }), {
    name: "TypeError", message: 'Cannot unflatten "db.host": "db" is both a value and a group',
  });
  assert.throws(() => l.unflatten({ "db.host": "y", db: "x" }), TypeError);
  assert.throws(() => l.unflatten({ "a.b": 1, "a.b.c": 2 }), TypeError);
});

test("unflatten defines own properties without touching prototypes", () => {
  const value = l.unflatten(JSON.parse('{"__proto__.polluted": true, "a.__proto__": 1}')) as Record<string, any>;
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.deepEqual(Object.keys(value), ["__proto__", "a"]);
  assert.equal(Object.hasOwn(value.a, "__proto__"), true);
});

test("unflatten wraps schemas so parse returns nested values", () => {
  const dotted = l.unflatten(l.object({ "db.host": l.string(), "db.port": l.number({ default: 5432 }) }));
  const value = l.parse(dotted, { "db.host": "localhost" });
  const exact: Equal<typeof value, { db: { host: string; port: number } }> = true;
  void exact;
  assert.deepEqual(value, { db: { host: "localhost", port: 5432 } });
  assert.deepEqual(l.safeParse(dotted, { "db.port": "x" }).issues?.map(issue => issue.path), [["db.host"], ["db.port"]]);
  assert.deepEqual(dotted.meta.kind, "object");

  const camel = l.unflatten(l.object({ dbHost: l.string(), verbose: l.boolean() }), { style: "camel", prefixes: ["db"] });
  const camelValue = l.parse(camel, { dbHost: "x", verbose: "true" });
  const camelExact: Equal<typeof camelValue, { db: { host: string }; verbose: boolean }> = true;
  void camelExact;
  assert.deepEqual(camelValue, { db: { host: "x" }, verbose: true });

  const optional = l.unflatten(l.object({ "a.b": l.string() }, { optional: true }));
  const optionalValue = l.parse(optional, undefined);
  const optionalExact: Equal<typeof optionalValue, { a: { b: string } } | undefined> = true;
  void optionalExact;
  assert.equal(optionalValue, undefined);
  const nested = l.object({ config: optional });
  assert.deepEqual(l.parse(nested, { config: { "a.b": "x" } }), { config: { a: { b: "x" } } });
});
