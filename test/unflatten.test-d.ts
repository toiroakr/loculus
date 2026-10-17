import { describe, expectTypeOf, test } from "vitest";
import * as l from "../src/index.js";

describe("unflatten output types", () => {
  test("dotted keys nest, and a group is optional when all its keys are optional", () => {
    const schema = l.unflatten(l.object({
      name: l.string(),
      "db.host": l.string(),
      "db.port": l.number({ default: 5432 }),
      "db.pool.max": l.number({ optional: true }),
      "log.level": l.enum(["info", "debug"], { optional: true }),
    }));
    expectTypeOf<l.Output<typeof schema>>().toEqualTypeOf<{
      name: string;
      db: { host: string; port: number; pool?: { max?: number } };
      log?: { level?: "info" | "debug" };
    }>();
  });

  test("inputs stay flat", () => {
    const flat = l.object({ "db.host": l.string(), "db.port": l.number() });
    const schema = l.unflatten(flat);
    expectTypeOf<l.Input<typeof schema>>().toEqualTypeOf<l.Input<typeof flat>>();
    expectTypeOf<l.Input<typeof schema>>().toExtend<{ "db.host": string; "db.port": string | number }>();
  });

  test("kebab-case keys split only at listed prefixes", () => {
    const schema = l.unflatten(l.object({
      "db-host-name": l.string(), "db-pool-max": l.number(), "dry-run": l.boolean(), "dbx-port": l.number(),
    }), { style: "kebab", prefixes: ["db", "db-pool"] });
    expectTypeOf<l.Output<typeof schema>>().toEqualTypeOf<{
      db: { "host-name": string; pool: { max: number } };
      "dry-run": boolean;
      "dbx-port": number;
    }>();
  });

  test("camelCase keys split at listed prefixes and uncapitalize the rest", () => {
    const schema = l.unflatten(l.object({
      dbHostName: l.string(), dbPoolMax: l.number({ optional: true }), dbx: l.number(), db2: l.number(),
    }), { style: "camel", prefixes: ["db", "dbPool"] });
    expectTypeOf<l.Output<typeof schema>>().toEqualTypeOf<{
      db: { hostName: string; pool?: { max?: number } };
      dbx: number;
      db2: number;
    }>();
    const only = l.unflatten(l.object({ dbPoolMax: l.number() }), { style: "camel", prefixes: ["dbPool"] });
    expectTypeOf<l.Output<typeof only>>().toEqualTypeOf<{ dbPool: { max: number } }>();
  });

  test("empty prefixes leave keys unchanged", () => {
    const schema = l.unflatten(l.object({ dbHost: l.string() }), { style: "camel", prefixes: [] });
    expectTypeOf<l.Output<typeof schema>>().toEqualTypeOf<{ dbHost: string }>();
  });

  test("optional, nullable and nullish objects keep their presence", () => {
    const optional = l.unflatten(l.object({ "a.b": l.string() }, { optional: true }));
    expectTypeOf<l.Output<typeof optional>>().toEqualTypeOf<{ a: { b: string } } | undefined>();
    const nullable = l.unflatten(l.object({ "a.b": l.string() }, { nullable: true }));
    expectTypeOf<l.Output<typeof nullable>>().toEqualTypeOf<{ a: { b: string } } | null>();
    const nullish = l.unflatten(l.object({ "a.b": l.string() }, { nullish: true }));
    expectTypeOf<l.Output<typeof nullish>>().toEqualTypeOf<{ a: { b: string } } | null | undefined>();
  });

  test("wrapped fields keep working as object fields", () => {
    const optional = l.unflatten(l.object({ "a.b": l.string() }, { optional: true }));
    expectTypeOf(optional).toExtend<l.Field<{ "a.b": string } | undefined, { a: { b: string } } | undefined, true>>();
    const parent = l.object({ config: optional });
    expectTypeOf<l.Output<typeof parent>>().toEqualTypeOf<{ config?: { a: { b: string } } }>();
  });

  test("union and intersection outputs are unflattened per member", () => {
    const union = l.unflatten(l.union([l.object({ "a.x": l.string() }), l.object({ "b.y": l.number() })]));
    expectTypeOf<l.Output<typeof union>>().toEqualTypeOf<{ a: { x: string } } | { b: { y: number } }>();
    const intersection = l.unflatten(l.intersection(
      l.object({ "a.x": l.string() }, { unknownKeys: "strip" }),
      l.object({ "a.y": l.number() }, { unknownKeys: "strip" }),
    ));
    expectTypeOf<l.Output<typeof intersection>>().toEqualTypeOf<{ a: { x: string; y: number } }>();
  });

  test("passthrough objects type only their declared keys, like object", () => {
    const schema = l.unflatten(l.object({ "a.x": l.string() }, { unknownKeys: "passthrough" }));
    expectTypeOf<l.Output<typeof schema>>().toEqualTypeOf<{ a: { x: string } }>();
  });

  test("string index signatures fall back to Record<string, unknown>", () => {
    const schema = l.unflatten(l.object(Object.fromEntries([["db.host", l.string()]])));
    expectTypeOf<l.Output<typeof schema>>().toEqualTypeOf<Record<string, unknown>>();
  });

  test("unknown prefixes fall back to Record<string, unknown>", () => {
    const prefixes: string[] = ["db"];
    const schema = l.unflatten(l.object({ dbHost: l.string() }), { style: "camel", prefixes });
    expectTypeOf<l.Output<typeof schema>>().toEqualTypeOf<Record<string, unknown>>();
  });

  test("non-tuple prefix arrays fall back to Record<string, unknown>", () => {
    const prefixes: "db"[] = [];
    const schema = l.unflatten(l.object({ dbHost: l.string() }), { style: "camel", prefixes });
    expectTypeOf<l.Output<typeof schema>>().toEqualTypeOf<Record<string, unknown>>();
    const readonlyTuple = ["db"] as const;
    const tuple = l.unflatten(l.object({ dbHost: l.string() }), { style: "camel", prefixes: readonlyTuple });
    expectTypeOf<l.Output<typeof tuple>>().toEqualTypeOf<{ db: { host: string } }>();
  });

  test("variable-length prefix arrays fall back even when some prefixes are possible", () => {
    const prefixes: ("db" | "log")[] = ["log"];
    const schema = l.unflatten(l.object({ dbHost: l.string() }), { style: "camel", prefixes });
    expectTypeOf<l.Output<typeof schema>>().toEqualTypeOf<Record<string, unknown>>();
  });

  test("alternative prefix tuples produce a union of output shapes", () => {
    const prefixes = [] as ["db"] | [];
    const schema = l.unflatten(l.object({ dbHost: l.string() }), { style: "camel", prefixes });
    expectTypeOf<l.Output<typeof schema>>().toEqualTypeOf<{ db: { host: string } } | { dbHost: string }>();
  });

  test("prefix tuples with union elements fall back to Record<string, unknown>", () => {
    const prefixes: readonly ["db" | "log"] = ["log"];
    const schema = l.unflatten(l.object({ dbHost: l.string() }), { style: "camel", prefixes });
    expectTypeOf<l.Output<typeof schema>>().toEqualTypeOf<Record<string, unknown>>();
  });

  test("numeric keys are split like their string form", () => {
    const schema = l.unflatten(l.object({ 1.5: l.string(), 2: l.number() }));
    expectTypeOf<l.Output<typeof schema>>().toEqualTypeOf<{ "1": { "5": string }; "2": number }>();
  });

  test("numeric index signatures fall back to Record<string, unknown>", () => {
    const schema = l.unflatten(l.transform(l.object({ a: l.string() }), value => value as unknown as Record<number, string>));
    expectTypeOf<l.Output<typeof schema>>().toEqualTypeOf<Record<string, unknown>>();
  });

  test("symbol keys are not part of the output", () => {
    const tag = Symbol("tag");
    const schema = l.unflatten(l.transform(l.object({ "a.b": l.string() }), value => ({ ...value, [tag]: "x" })));
    expectTypeOf<l.Output<typeof schema>>().toEqualTypeOf<{ a: { b: string } }>();
  });

  test("style unions produce a union of output shapes", () => {
    const options = { style: "camel", prefixes: ["db"] } as { style: "camel" | "kebab"; prefixes: ["db"] };
    const schema = l.unflatten(l.object({ dbHost: l.string() }), options);
    expectTypeOf<l.Output<typeof schema>>().toEqualTypeOf<{ db: { host: string } } | { dbHost: string }>();
  });

  test("options typed as UnflattenOptions cover both branches", () => {
    const options = {} as l.UnflattenOptions;
    const schema = l.unflatten(l.object({ "a.x": l.string() }), options);
    expectTypeOf<l.Output<typeof schema>>().toEqualTypeOf<{ a: { x: string } } | Record<string, unknown>>();
  });

  test("names that are both a value and a group are unknown", () => {
    const union = l.unflatten(l.union([
      l.object({ db: l.string({ optional: true }), "db.host": l.string({ optional: true }) }, { unknownKeys: "strip" }),
      l.object({ other: l.string() }),
    ]));
    expectTypeOf<l.Output<typeof union>>().toEqualTypeOf<{ db?: unknown } | { other: string }>();
  });

  test("Date and array schemas are rejected", () => {
    // @ts-expect-error Dates are not flat records.
    l.unflatten(l.date());
    // @ts-expect-error Arrays are not flat records.
    l.unflatten(l.array(l.string()));
    // @ts-expect-error Strings are not flat records.
    l.unflatten(l.string());
  });

  test("kebab and camel styles require prefixes", () => {
    // @ts-expect-error Prefixes are required for kebab-case.
    l.unflatten(l.object({ "db-host": l.string() }), { style: "kebab" });
    // @ts-expect-error Prefixes are required for camelCase.
    l.unflatten(l.object({ dbHost: l.string() }), { style: "camel" });
  });
});
