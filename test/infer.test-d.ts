import { describe, expectTypeOf, test } from "vitest";
import type * as l from "../src/index.js";
import type * as t from "./fixtures/infer/__generated__/schemas.types.js";
import type { Money } from "./fixtures/infer/money.js";
import type * as s from "./fixtures/infer/schemas.js";

// The generated module is a snapshot checked by test/infer.test.ts.
// Loculus spells inferred object types as intersections such as `{ a: A } & { a?: A }`, which
// toEqualTypeOf treats as different from the equivalent flat object. Flatten both sides the
// same way, keeping optional and readonly modifiers, before comparing them strictly.
type Flat<T> = T extends Date | URL
  ? T
  : T extends readonly unknown[]
    ? T extends unknown[]
      ? Flat<T[number]>[]
      : readonly Flat<T[number]>[]
    : T extends object
      ? { [K in keyof T]: Flat<T[K]> }
      : T;
describe("@loculus/infer generated types equal inferred types", () => {
  test("Input", () => {
    expectTypeOf<Flat<t.QueryInput>>().toEqualTypeOf<Flat<l.Input<typeof s.QuerySchema>>>();
    expectTypeOf<Flat<t.SameInput>>().toEqualTypeOf<Flat<l.Input<typeof s.SameSchema>>>();
    expectTypeOf<Flat<t.LinksInput>>().toEqualTypeOf<Flat<l.Input<typeof s.LinksSchema>>>();
    expectTypeOf<Flat<t.EventInput>>().toEqualTypeOf<Flat<l.Input<typeof s.EventSchema>>>();
    expectTypeOf<Flat<t.OrderInput>>().toEqualTypeOf<Flat<l.Input<typeof s.OrderSchema>>>();
    expectTypeOf<Flat<t.FlatInput>>().toEqualTypeOf<Flat<l.Input<typeof s.FlatSchema>>>();
    expectTypeOf<Flat<t.WrapInput>>().toEqualTypeOf<Flat<l.Input<typeof s.WrapSchema>>>();
    expectTypeOf<Flat<t.BrandInput>>().toEqualTypeOf<Flat<l.Input<typeof s.BrandSchema>>>();
    expectTypeOf<Flat<t.PresenceInput>>().toEqualTypeOf<Flat<l.Input<typeof s.PresenceSchema>>>();
    expectTypeOf<Flat<t.LiteralInput>>().toEqualTypeOf<Flat<l.Input<typeof s.LiteralSchema>>>();
    expectTypeOf<Flat<t.CombinedInput>>().toEqualTypeOf<Flat<l.Input<typeof s.CombinedSchema>>>();
    expectTypeOf<Flat<t.ChoiceInput>>().toEqualTypeOf<Flat<l.Input<typeof s.ChoiceSchema>>>();
    expectTypeOf<Flat<t.RefinedInput>>().toEqualTypeOf<Flat<l.Input<typeof s.RefinedSchema>>>();
    expectTypeOf<Flat<t.ReadonlyShapeInput>>().toEqualTypeOf<Flat<l.Input<typeof s.ReadonlyShapeSchema>>>();
    expectTypeOf<Flat<t.ReturnInput>>().toEqualTypeOf<Flat<l.Input<typeof s.ReturnSchema>>>();
  });

  test("Output", () => {
    expectTypeOf<Flat<t.QueryOutput>>().toEqualTypeOf<Flat<l.Output<typeof s.QuerySchema>>>();
    expectTypeOf<Flat<t.SameOutput>>().toEqualTypeOf<Flat<l.Output<typeof s.SameSchema>>>();
    expectTypeOf<Flat<t.LinksOutput>>().toEqualTypeOf<Flat<l.Output<typeof s.LinksSchema>>>();
    expectTypeOf<Flat<t.EventOutput>>().toEqualTypeOf<Flat<l.Output<typeof s.EventSchema>>>();
    expectTypeOf<Flat<t.OrderOutput>>().toEqualTypeOf<Flat<l.Output<typeof s.OrderSchema>>>();
    expectTypeOf<Flat<t.FlatOutput>>().toEqualTypeOf<Flat<l.Output<typeof s.FlatSchema>>>();
    expectTypeOf<Flat<t.WrapOutput>>().toEqualTypeOf<Flat<l.Output<typeof s.WrapSchema>>>();
    expectTypeOf<Flat<t.BrandOutput>>().toEqualTypeOf<Flat<l.Output<typeof s.BrandSchema>>>();
    expectTypeOf<Flat<t.PresenceOutput>>().toEqualTypeOf<Flat<l.Output<typeof s.PresenceSchema>>>();
    expectTypeOf<Flat<t.LiteralOutput>>().toEqualTypeOf<Flat<l.Output<typeof s.LiteralSchema>>>();
    expectTypeOf<Flat<t.CombinedOutput>>().toEqualTypeOf<Flat<l.Output<typeof s.CombinedSchema>>>();
    expectTypeOf<Flat<t.ChoiceOutput>>().toEqualTypeOf<Flat<l.Output<typeof s.ChoiceSchema>>>();
    expectTypeOf<Flat<t.RefinedOutput>>().toEqualTypeOf<Flat<l.Output<typeof s.RefinedSchema>>>();
    expectTypeOf<Flat<t.ReadonlyShapeOutput>>().toEqualTypeOf<Flat<l.Output<typeof s.ReadonlyShapeSchema>>>();
    expectTypeOf<t.ReturnOutput>().toEqualTypeOf<l.Output<typeof s.ReturnSchema>>();
  });
});

describe("@loculus/infer generated types match the documented behavior", () => {
  test("scalars, presence and defaults", () => {
    expectTypeOf<t.QueryInput>().toEqualTypeOf<{
      search: string;
      page?: string | number | undefined;
      archived?: string | boolean | undefined;
      tag?: "docs" | "code" | readonly ("docs" | "code")[] | undefined;
      at?: string | null | undefined;
    }>();
    expectTypeOf<t.QueryOutput>().toEqualTypeOf<{
      search: string;
      page: number;
      archived: boolean;
      tag?: ("docs" | "code")[] | undefined;
      at?: Date | null | undefined;
    }>();
    expectTypeOf<t.PresenceInput>().toEqualTypeOf<{
      nullable: string | null;
      nullish?: string | number | null | undefined;
      fallback?: string | number | null | undefined;
      nested?: { deep: string | boolean } | undefined;
      matrix: readonly (readonly (string | number)[])[];
    }>();
    expectTypeOf<t.PresenceOutput>().toEqualTypeOf<{
      nullable: string | null;
      nullish?: number | null | undefined;
      fallback: number;
      nested?: { deep: boolean } | undefined;
      matrix: number[][];
    }>();
  });

  test("literals, transforms and brands", () => {
    expectTypeOf<t.LiteralOutput>().toEqualTypeOf<{ on: true; answer: 42; mode: "auto" | 1 | false }>();
    expectTypeOf<t.LiteralInput>().toEqualTypeOf<{ on: string | boolean; answer: string | number; mode: string | number | boolean }>();
    expectTypeOf<t.LinksOutput>().toEqualTypeOf<{ home: URL; price: Money; tag: s.Tag; "status-code": 200 | 201 }>();
    expectTypeOf<t.BrandOutput>().toEqualTypeOf<{ id: string & { readonly brand: "Id" } }>();
    expectTypeOf<t.WrapInput>().toEqualTypeOf<{ value: string | readonly string[] }>();
  });

  test("readonly shapes, mapped modifiers, signatures and symbol keys", () => {
    expectTypeOf<t.ReadonlyShapeOutput>().toEqualTypeOf<{ readonly a: string; readonly b?: string | undefined }>();
    // ObjectOutput keeps the readonly modifiers of an `as const` shape.
    expectTypeOf<l.Output<typeof s.ReadonlyShapeSchema>>().toEqualTypeOf<{ readonly a: string; readonly b?: string | undefined }>();
    expectTypeOf<t.ReadonlyShapeInput>().toEqualTypeOf<{ readonly a: string; readonly b?: string | undefined }>();
    expectTypeOf<t.ReturnOutput>().toEqualTypeOf<{
      frozen: { readonly name: string };
      handler: s.Handler;
      factory: s.Factory;
      constructor: typeof s.Model;
      tagged: { [s.tag]: string };
    }>();
  });

  test("composition", () => {
    expectTypeOf<t.EventOutput>().toEqualTypeOf<{ type: "a"; a: string } | { type: "b"; b: number }>();
    expectTypeOf<t.ChoiceOutput>().toEqualTypeOf<{ x: string } | { y: Date }>();
    expectTypeOf<t.CombinedOutput>().toEqualTypeOf<{ a: string; b?: number | undefined }>();
    expectTypeOf<t.RefinedOutput>().toEqualTypeOf<{ min: number; max: number }>();
    expectTypeOf<t.OrderOutput>().toEqualTypeOf<{ title: string; items: { name: string; quantity: number }[] }>();
    expectTypeOf<t.FlatInput>().toEqualTypeOf<{ "user.name": string; "user.age": string | number }>();
    expectTypeOf<t.FlatOutput>().toEqualTypeOf<{ user: { name: string; age: number } }>();
  });
});
