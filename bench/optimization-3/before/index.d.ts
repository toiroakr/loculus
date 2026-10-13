//#region src/index.d.ts
export interface Issue {
  readonly message: string;
  readonly path?: readonly (PropertyKey | {
    readonly key: PropertyKey;
  })[];
  readonly code?: string;
}
export type Result<T> = {
  value: T;
  issues?: undefined;
} | {
  issues: readonly Issue[];
};
export interface Schema<I = unknown, O = unknown> {
  readonly _input: I;
  readonly _output: O;
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: "loculus";
    readonly types?: {
      readonly input: I;
      readonly output: O;
    };
    readonly validate: (value: unknown) => Result<O>;
  };
  readonly meta: Meta;
}
export interface Meta {
  readonly kind: "string" | "number" | "boolean" | "array" | "object" | "union" | "xor" | "intersection" | "date";
  readonly optional?: boolean;
  readonly nullable?: boolean;
  readonly defaultValue?: unknown;
  readonly description?: string;
  readonly enumValues?: readonly string[];
  readonly inner?: AnySchema;
  readonly shape?: Shape;
  readonly options?: readonly AnySchema[];
  readonly discriminator?: string;
  readonly unknownKeys?: "strip" | "strict" | "passthrough";
}
export type AnySchema = Schema<any, any>;
export type Input<S extends {
  readonly _input: unknown;
}> = S["_input"];
export type Output<S extends {
  readonly _output: unknown;
}> = S["_output"];
export interface Field<I = unknown, O = unknown, Optional extends boolean = undefined extends O ? true : false> extends Schema<I, O> {
  readonly _optional: Optional;
  readonly field: true;
}
export type Shape = Readonly<Record<string, Field<any, any, boolean>>>;
type Simplify<T> = { [K in keyof T]: T[K]; };
export type ObjectOutput<S extends Shape> = S extends Readonly<Record<string, {
  readonly _optional: false;
}>> ? { [K in keyof S]: S[K]["_output"]; } : Simplify<{ [K in keyof S as S[K]["_optional"] extends true ? never : K]: S[K]["_output"]; } & { [K in keyof S]?: S[K]["_output"]; }>;
export type ObjectInput<S extends Shape> = { [K in keyof S as undefined extends S[K]["_input"] ? never : K]: S[K]["_input"]; } & { [K in keyof S]?: S[K]["_input"]; };
export interface ObjectSchema<S extends Shape = Shape> extends Schema<ObjectInput<S>, ObjectOutput<S>> {
  readonly shape: S;
}
export declare function safeParse<S extends AnySchema>(schema: S, value: unknown): Result<Output<S>>;
export declare class ValidationError extends Error {
  readonly issues: readonly Issue[];
  constructor(issues: readonly Issue[]);
}
export declare function parse<S extends AnySchema>(schema: S, value: unknown): Output<S>;
export type DefaultTargets<T> = {
  readonly nullish: T;
  readonly undefined?: never;
  readonly null?: never;
} | {
  readonly undefined: T;
  readonly null?: T;
  readonly nullish?: never;
} | {
  readonly null: T;
  readonly undefined?: T;
  readonly nullish?: never;
};
export interface FieldOptions<T> {
  readonly description?: string;
  readonly optional?: boolean;
  readonly nullable?: boolean;
  readonly nullish?: boolean;
  readonly default?: T | DefaultTargets<T>;
}
type BasicPresence = {
  description?: string;
  nullable?: false;
  nullish?: false;
  default?: never;
};
type FlagValue<P, K extends PropertyKey> = K extends keyof P ? P[K] : never;
type DefaultFlags<P> = P extends {
  default: infer D;
} ? D extends undefined ? [false, false] : D extends readonly unknown[] | Date ? [true, false] : D extends {
  nullish: unknown;
} ? [true, true] : D extends {
  undefined: unknown;
} ? [true, D extends {
  null: unknown;
} ? true : false] : D extends {
  null: unknown;
} ? [false, true] : [true, false] : "default" extends keyof P ? [boolean, boolean] : [false, false];
type PresenceFlags<P> = [true extends FlagValue<P, "optional"> | FlagValue<P, "nullish"> | DefaultFlags<P>[0] ? true : false, true extends FlagValue<P, "nullable"> | FlagValue<P, "nullish"> | DefaultFlags<P>[1] ? true : false];
type ConfiguredInput<I, P> = I | (PresenceFlags<P>[0] extends true ? undefined : never) | (PresenceFlags<P>[1] extends true ? null : never);
type UndefinedDefault<P> = P extends {
  default: infer D;
} ? D extends readonly unknown[] | Date ? never : D extends {
  nullish: infer V;
} ? undefined extends V ? undefined : never : D extends object ? undefined extends D[keyof D & ("undefined" | "null")] ? undefined : never : never : never;
type ConfiguredOutput<O, P> = O | UndefinedDefault<P> | (PresenceFlags<P>[0] extends true ? false extends DefaultFlags<P>[0] ? undefined : never : never) | (PresenceFlags<P>[1] extends true ? false extends DefaultFlags<P>[1] ? null : never : never);
type ConfiguredField<I, O, P> = Field<ConfiguredInput<I, P>, ConfiguredOutput<O, P>>;
export interface StringOptions {
  readonly min?: number;
  readonly max?: number;
  readonly pattern?: RegExp;
  readonly trim?: boolean;
  readonly description?: string;
}
export declare function string(options: StringOptions & BasicPresence & {
  optional: true;
}): Field<string | undefined, string | undefined, true>;
export declare function string(options?: StringOptions & BasicPresence & {
  optional?: false;
}): Field<string, string, false>;
export declare function string(options: StringOptions & BasicPresence & {
  optional: boolean;
}): Field<string | undefined, string | undefined, true>;
export declare function string(options: StringOptions & {
  default: {
    null: string;
    undefined: undefined;
    nullish?: never;
  } | {
    undefined: string;
    null: undefined;
    nullish?: never;
  };
  optional?: boolean;
  nullable?: boolean;
  nullish?: boolean;
}): Field<string | null | undefined, string | undefined, true>;
export declare function string(options: StringOptions & {
  nullish: true;
  optional?: boolean;
  nullable?: boolean;
  default?: never;
}): Field<string | null | undefined, string | null | undefined, true>;
export declare function string(options: StringOptions & {
  nullable: true;
  optional: true;
  nullish?: false;
  default?: never;
}): Field<string | null | undefined, string | null | undefined, true>;
export declare function string(options: StringOptions & {
  nullable: true;
  optional?: false;
  nullish?: false;
  default?: never;
}): Field<string | null, string | null, false>;
export declare function string(options: StringOptions & {
  default: string | {
    undefined: string;
    null?: never;
    nullish?: never;
  };
  optional?: boolean;
  nullable?: false;
  nullish?: false;
}): Field<string | undefined, string, false>;
export declare function string(options: StringOptions & {
  default: string | {
    undefined: string;
    null?: never;
    nullish?: never;
  };
  optional?: boolean;
  nullable: true;
  nullish?: boolean;
}): Field<string | null | undefined, string | null, false>;
export declare function string(options: StringOptions & {
  default: string | {
    undefined: string;
    null?: never;
    nullish?: never;
  };
  optional?: boolean;
  nullable?: boolean;
  nullish: true;
}): Field<string | null | undefined, string | null, false>;
export declare function string(options: StringOptions & {
  default: {
    null: string;
    undefined?: never;
    nullish?: never;
  };
  optional?: false;
  nullable?: boolean;
  nullish?: false;
}): Field<string | null, string, false>;
export declare function string(options: StringOptions & {
  default: {
    null: string;
    undefined?: never;
    nullish?: never;
  };
  optional: true;
  nullable?: boolean;
  nullish?: boolean;
}): Field<string | null | undefined, string | undefined, true>;
export declare function string(options: StringOptions & {
  default: {
    null: string;
    undefined?: never;
    nullish?: never;
  };
  optional?: boolean;
  nullable?: boolean;
  nullish: true;
}): Field<string | null | undefined, string | undefined, true>;
export declare function string(options: StringOptions & {
  default: {
    nullish: string;
    undefined?: never;
    null?: never;
  } | {
    undefined: string;
    null: string;
    nullish?: never;
  };
  optional?: boolean;
  nullable?: boolean;
  nullish?: boolean;
}): Field<string | null | undefined, string, false>;
export declare function string<const P extends StringOptions & FieldOptions<string>>(options: P): ConfiguredField<string, string, P>;
export interface NumberOptions {
  readonly gt?: number;
  readonly gte?: number;
  readonly lt?: number;
  readonly lte?: number;
  readonly integer?: boolean;
  readonly description?: string;
}
export declare function number(options: NumberOptions & BasicPresence & {
  optional: true;
}): Field<string | number | undefined, number | undefined, true>;
export declare function number(options?: NumberOptions & BasicPresence & {
  optional?: false;
}): Field<string | number, number, false>;
export declare function number(options: NumberOptions & BasicPresence & {
  optional: boolean;
}): Field<string | number | undefined, number | undefined, true>;
export declare function number<const P extends NumberOptions & FieldOptions<number>>(options: P): ConfiguredField<string | number, number, P>;
export declare function boolean(options: BasicPresence & {
  optional: true;
}): Field<string | boolean | undefined, boolean | undefined, true>;
export declare function boolean(options?: BasicPresence & {
  optional?: false;
}): Field<string | boolean, boolean, false>;
export declare function boolean(options: BasicPresence & {
  optional: boolean;
}): Field<string | boolean | undefined, boolean | undefined, true>;
export declare function boolean<const P extends FieldOptions<boolean>>(options: P): ConfiguredField<string | boolean, boolean, P>;
export declare function enum_<const T extends readonly [string, ...string[]]>(values: T, options: BasicPresence & {
  optional: true;
}): Field<T[number] | undefined, T[number] | undefined, true>;
export declare function enum_<const T extends readonly [string, ...string[]]>(values: T, options?: BasicPresence & {
  optional?: false;
}): Field<T[number], T[number], false>;
export declare function enum_<const T extends readonly [string, ...string[]]>(values: T, options: BasicPresence & {
  optional: boolean;
}): Field<T[number] | undefined, T[number] | undefined, true>;
export declare function enum_<const T extends readonly [string, ...string[]], const P extends FieldOptions<T[number]>>(values: T, options: P): ConfiguredField<T[number], T[number], P>;
export declare function literal<const T extends string>(value: T): Field<T, T, false>;
export declare function literal<const T extends string, const P extends FieldOptions<T>>(value: T, options: P): ConfiguredField<T, T, P>;
export declare function date(options: BasicPresence & {
  optional: true;
}): Field<string | undefined, Date | undefined, true>;
export declare function date(options?: BasicPresence & {
  optional?: false;
}): Field<string, Date, false>;
export declare function date(options: BasicPresence & {
  optional: boolean;
}): Field<string | undefined, Date | undefined, true>;
export declare function date<const P extends FieldOptions<Date>>(options: P): ConfiguredField<string, Date, P>;
export interface ArrayOptions<WrapScalar extends boolean = boolean> {
  readonly min?: number;
  readonly max?: number;
  readonly wrapScalar?: WrapScalar;
}
type ArrayInput<I, WrapScalar extends boolean> = WrapScalar extends false ? readonly I[] : I | readonly I[];
type ArrayElement<I, O> = Field<I, O> | (Schema<I, O> & {
  readonly shape: Shape;
});
export declare function array<I, O, WrapScalar extends boolean = true>(s: ArrayElement<I, O>, options: ArrayOptions<WrapScalar> & BasicPresence & {
  optional: true;
}): Field<ArrayInput<I, WrapScalar> | undefined, O[] | undefined, true>;
export declare function array<I, O, WrapScalar extends boolean = true>(s: ArrayElement<I, O>, options?: ArrayOptions<WrapScalar> & BasicPresence & {
  optional?: false;
}): Field<ArrayInput<I, WrapScalar>, O[], false>;
export declare function array<I, O, WrapScalar extends boolean = true>(s: ArrayElement<I, O>, options: ArrayOptions<WrapScalar> & BasicPresence & {
  optional: boolean;
}): Field<ArrayInput<I, WrapScalar> | undefined, O[] | undefined, true>;
export declare function array<I, O, const P extends ArrayOptions & FieldOptions<O[]>>(s: ArrayElement<I, O>, options: P): ConfiguredField<ArrayInput<I, P extends {
  wrapScalar: false;
} ? false : true>, O[], P>;
export declare function transform<I, O, T>(s: Field<I, O>, fn: (value: O) => T): Field<I, T>;
export declare function transform<I, O, T>(s: Schema<I, O>, fn: (value: O) => T): Schema<I, T>;
export declare function refine<S extends AnySchema>(s: S, check: (value: Output<S>) => boolean, message: string): S;
export declare function object<S extends Shape>(shape: S, options?: {
  unknownKeys?: "strip" | "strict" | "passthrough";
  description?: string;
}): ObjectSchema<S>;
export declare function compile<S extends Shape>(s: ObjectSchema<S>): ObjectSchema<S>;
export declare function union<const S extends readonly [AnySchema, AnySchema, ...AnySchema[]]>(options: S, config?: {
  description?: string;
}): Schema<Input<S[number]>, Output<S[number]>>;
export declare function xor<const S extends readonly [AnySchema, AnySchema, ...AnySchema[]]>(options: S, config?: {
  description?: string;
}): Schema<Input<S[number]>, Output<S[number]>>;
export declare function discriminatedUnion<const S extends readonly [ObjectSchema, ObjectSchema, ...ObjectSchema[]]>(key: string, options: S, config?: {
  description?: string;
}): Schema<Input<S[number]>, Output<S[number]>>;
export declare function intersection<A extends AnySchema, B extends AnySchema>(a: A, b: B, config?: {
  description?: string;
}): Schema<Input<A> & Input<B>, Output<A> & Output<B>>;
export declare function fromEntries(entries: Iterable<readonly [string, unknown]>): Record<string, unknown>;
//#endregion
export { enum_ as enum };