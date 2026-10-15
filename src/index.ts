export interface Issue {
  readonly message: string;
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[];
  readonly code?: string;
  readonly origin?: "string" | "number" | "array";
  readonly min?: number;
  readonly max?: number;
  readonly inclusive?: boolean;
}
export interface ErrorContext extends Issue {
  readonly input: unknown;
}
export type ErrorCustomization = string | ((issue: ErrorContext) => string | { readonly message: string } | undefined);
export interface ErrorOptions {
  readonly error?: ErrorCustomization;
}
export interface Config {
  readonly customError?: ErrorCustomization;
}
let configuration: Config = {};
export function config(options?: Config): Readonly<Config> {
  if (options !== undefined) configuration = { ...configuration, ...options };
  return configuration;
}
export type Result<T> = { value: T; issues?: undefined } | { issues: readonly Issue[] };
export interface Schema<I = unknown, O = unknown> {
  readonly _input: I;
  readonly _output: O;
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: "loculus";
    readonly types?: { readonly input: I; readonly output: O };
    readonly validate: (value: unknown) => Result<O>;
  };
  readonly meta: Meta;
}
export interface Meta {
  readonly kind:
    | "string"
    | "number"
    | "boolean"
    | "array"
    | "object"
    | "union"
    | "xor"
    | "intersection"
    | "date";
  readonly optional?: boolean;
  readonly nullable?: boolean;
  readonly defaultValue?: unknown;
  readonly description?: string;
  readonly enumValues?: readonly string[];
  readonly literalValues?: readonly (string | number | boolean)[];
  readonly inner?: AnySchema;
  readonly shape?: Shape;
  readonly options?: readonly AnySchema[];
  readonly discriminator?: string;
  readonly unknownKeys?: "strip" | "strict" | "passthrough";
}
export type AnySchema = Schema<any, any>;
export type Input<S extends { readonly _input: unknown }> = S["_input"];
export type Output<S extends { readonly _output: unknown }> = S["_output"];
export interface Field<
  I = unknown,
  O = unknown,
  Optional extends boolean = undefined extends O ? true : false,
> extends Schema<I, O> {
  readonly _optional: Optional;
  readonly field: true;
}
export type Shape = Readonly<Record<string, Field<any, any, boolean>>>;
type Simplify<T> = { [K in keyof T]: T[K] };
export type ObjectOutput<S extends Shape> =
  S extends Readonly<Record<string, { readonly _optional: false }>>
    ? { [K in keyof S]: S[K]["_output"] }
    : Simplify<
        { [K in keyof S as S[K]["_optional"] extends true ? never : K]: S[K]["_output"] } & {
          [K in keyof S]?: S[K]["_output"];
        }
      >;
export type ObjectInput<S extends Shape> = {
  [K in keyof S as undefined extends S[K]["_input"] ? never : K]: S[K]["_input"];
} & { [K in keyof S]?: S[K]["_input"] };
export interface ObjectSchema<
  S extends Shape = Shape,
  I = ObjectInput<S>,
  O = ObjectOutput<S>,
  Optional extends boolean = undefined extends O ? true : false,
> extends Field<I, O, Optional> {
  readonly shape: S;
}
function schema<I, O>(meta: Meta, validate: (value: unknown) => Result<O>): Schema<I, O> {
  return { meta, "~standard": { version: 1, vendor: "loculus", validate } } as Schema<I, O>;
}
function field<I, O, Optional extends boolean = undefined extends O ? true : false>(
  meta: Meta,
  validate: (value: unknown) => Result<O>,
): Field<I, O, Optional> {
  return { meta, "~standard": { version: 1, vendor: "loculus", validate }, field: true } as Field<I, O, Optional>;
}
function fail(message: string, code = "invalid_value", details?: Omit<Issue, "message" | "code" | "path">): { issues: Issue[] } {
  return { issues: [{ message, code, ...details }] };
}
function customizeIssue(issue: Issue, input: unknown, error?: ErrorCustomization): Issue {
  if (error === undefined && configuration.customError === undefined) return issue;
  const context = { ...issue, input };
  const local = typeof error === "function" ? error(context) : error;
  const fallback = configuration.customError;
  const custom = local ?? (typeof fallback === "function" ? fallback(context) : fallback);
  if (custom === undefined) return issue;
  return { ...issue, message: typeof custom === "string" ? custom : custom.message };
}
export { customizeIssue as _resolveIssue };
function withError<O>(validate: (value: unknown) => Result<O>, error?: ErrorCustomization): (value: unknown) => Result<O> {
  return input => {
    const result = validate(input);
    if (error === undefined && configuration.customError === undefined) return result;
    return result.issues ? { issues: result.issues.map(issue =>
      issue.path?.length ? issue : customizeIssue(issue, input, error),
    ) } : result;
  };
}
export function safeParse<S extends AnySchema>(schema: S, value: unknown): Result<Output<S>> {
  return schema["~standard"].validate(value);
}
export class ValidationError extends Error {
  constructor(readonly issues: readonly Issue[]) {
    super(
      issues
        .map(
          (i) =>
            `${i.path?.map((p) => (typeof p === "object" ? String(p.key) : String(p))).join(".") ?? ""}: ${i.message}`,
        )
        .join("; "),
    );
    this.name = "ValidationError";
  }
}
export function parse<S extends AnySchema>(schema: S, value: unknown): Output<S> {
  const result = safeParse(schema, value);
  if (result.issues) throw new ValidationError(result.issues);
  return result.value;
}
export type DefaultTargets<T> =
  | { readonly nullish: T; readonly undefined?: never; readonly null?: never }
  | { readonly undefined: T; readonly null?: T; readonly nullish?: never }
  | { readonly null: T; readonly undefined?: T; readonly nullish?: never };
export interface FieldOptions<T> extends ErrorOptions {
  readonly description?: string;
  readonly optional?: boolean;
  readonly nullable?: boolean;
  readonly nullish?: boolean;
  readonly default?: T | DefaultTargets<T>;
}
type BasicPresence = ErrorOptions & { description?: string; nullable?: false; nullish?: false; default?: never };
type FlagValue<P, K extends PropertyKey> = K extends keyof P ? P[K] : never;
type DefaultFlags<P> = P extends { default: infer D }
  ? D extends undefined ? [false, false]
    : D extends readonly unknown[] | Date ? [true, false]
    : D extends { nullish: unknown } ? [true, true]
    : D extends { undefined: unknown } ? [true, D extends { null: unknown } ? true : false]
    : D extends { null: unknown } ? [false, true]
    : [true, false]
  : "default" extends keyof P ? [boolean, boolean] : [false, false];
type PresenceFlags<P> = [
  true extends FlagValue<P, "optional"> | FlagValue<P, "nullish"> | DefaultFlags<P>[0] ? true : false,
  true extends FlagValue<P, "nullable"> | FlagValue<P, "nullish"> | DefaultFlags<P>[1] ? true : false,
];
type ConfiguredInput<I, P> = I
  | (PresenceFlags<P>[0] extends true ? undefined : never)
  | (PresenceFlags<P>[1] extends true ? null : never);
type UndefinedDefault<P> = P extends { default: infer D }
  ? D extends readonly unknown[] | Date ? never
    : D extends { nullish: infer V } ? undefined extends V ? undefined : never
    : D extends object ? undefined extends D[keyof D & ("undefined" | "null")] ? undefined : never
    : never
  : never;
type ConfiguredOutput<O, P> = O | UndefinedDefault<P>
  | (PresenceFlags<P>[0] extends true ? false extends DefaultFlags<P>[0] ? undefined : never : never)
  | (PresenceFlags<P>[1] extends true ? false extends DefaultFlags<P>[1] ? null : never : never);
type ConfiguredField<I, O, P> = Field<ConfiguredInput<I, P>, ConfiguredOutput<O, P>>;
const rawValidators = new WeakMap<AnySchema, (value: unknown) => Result<any>>();
function errorField(meta: Meta, validate: (value: unknown) => Result<any>, error?: ErrorCustomization): Field<any, any, boolean> {
  const result = field(meta, withError(validate, error));
  rawValidators.set(result, validate);
  return result;
}
const emptyOptions = {};
function validateString(value: unknown): Result<string> {
  return typeof value === "string" ? { value } : fail("Expected a string", "invalid_type");
}
function configuredField<I, O>(
  meta: Meta,
  options: FieldOptions<O>,
  validate: (value: unknown) => Result<O>,
  customize = true,
): Field<any, any, boolean> {
  if (options === emptyOptions) return customize ? errorField(meta, validate) : field(meta, validate);
  const value = own(options, "default") ? options.default : undefined;
  if (options.optional || options.nullable || options.nullish || value !== undefined) {
    let defaults = 0;
    let missing: O | undefined;
    let nil: O | undefined;
    if (value !== undefined) {
      if (typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
        const keys = Object.keys(value);
        const nullish = own(value, "nullish");
        if (!keys.length || keys.some(key => key !== "undefined" && key !== "null" && key !== "nullish") || (nullish && keys.length > 1))
          throw new TypeError("Invalid default targets");
        defaults = (nullish || own(value, "undefined") ? 1 : 0) | (nullish || own(value, "null") ? 2 : 0);
        missing = nullish ? (value as DefaultTargets<O>).nullish : (value as DefaultTargets<O>).undefined;
        nil = nullish ? (value as DefaultTargets<O>).nullish : (value as DefaultTargets<O>).null;
      } else {
        defaults = 1;
        missing = value as O;
      }
    }
    const optional = !!(options.optional || options.nullish || (defaults & 1));
    const nullable = !!(options.nullable || options.nullish || (defaults & 2));
    const base = validate;
    if (optional || nullable) validate = (input: unknown): Result<any> => {
      if (input === undefined && optional) return { value: missing };
      if (input === null && nullable) return { value: defaults & 2 ? nil : null };
      return base(input);
    };
    (meta as { optional: boolean }).optional = optional;
    (meta as { nullable: boolean }).nullable = nullable;
    if (defaults & 1) (meta as { defaultValue?: O }).defaultValue = missing;
  }
  return customize ? errorField(meta, validate, options.error) : field(meta, validate);
}

export interface StringOptions extends ErrorOptions {
  readonly min?: number;
  readonly max?: number;
  readonly pattern?: RegExp;
  readonly trim?: boolean;
  readonly description?: string;
}
export function string(
  options: StringOptions & BasicPresence & { optional: true },
): Field<string | undefined, string | undefined, true>;
export function string(
  options?: StringOptions & BasicPresence & { optional?: false },
): Field<string, string, false>;
export function string(
  options: StringOptions & BasicPresence & { optional: boolean },
): Field<string | undefined, string | undefined, true>;
export function string(options: StringOptions & {
  default: { null: string; undefined: undefined; nullish?: never } | { undefined: string; null: undefined; nullish?: never };
  optional?: boolean; nullable?: boolean; nullish?: boolean;
}): Field<string | null | undefined, string | undefined, true>;
export function string(options: StringOptions & {
  nullish: true; optional?: boolean; nullable?: boolean; default?: never;
}): Field<string | null | undefined, string | null | undefined, true>;
export function string(options: StringOptions & {
  nullable: true; optional: true; nullish?: false; default?: never;
}): Field<string | null | undefined, string | null | undefined, true>;
export function string(options: StringOptions & {
  nullable: true; optional?: false; nullish?: false; default?: never;
}): Field<string | null, string | null, false>;
export function string(options: StringOptions & {
  default: string | { undefined: string; null?: never; nullish?: never };
  optional?: boolean; nullable?: false; nullish?: false;
}): Field<string | undefined, string, false>;
export function string(options: StringOptions & {
  default: string | { undefined: string; null?: never; nullish?: never };
  optional?: boolean; nullable: true; nullish?: boolean;
}): Field<string | null | undefined, string | null, false>;
export function string(options: StringOptions & {
  default: string | { undefined: string; null?: never; nullish?: never };
  optional?: boolean; nullable?: boolean; nullish: true;
}): Field<string | null | undefined, string | null, false>;
export function string(options: StringOptions & {
  default: { null: string; undefined?: never; nullish?: never };
  optional?: false; nullable?: boolean; nullish?: false;
}): Field<string | null, string, false>;
export function string(options: StringOptions & {
  default: { null: string; undefined?: never; nullish?: never };
  optional: true; nullable?: boolean; nullish?: boolean;
}): Field<string | null | undefined, string | undefined, true>;
export function string(options: StringOptions & {
  default: { null: string; undefined?: never; nullish?: never };
  optional?: boolean; nullable?: boolean; nullish: true;
}): Field<string | null | undefined, string | undefined, true>;
export function string(options: StringOptions & {
  default: { nullish: string; undefined?: never; null?: never } | { undefined: string; null: string; nullish?: never };
  optional?: boolean; nullable?: boolean; nullish?: boolean;
}): Field<string | null | undefined, string, false>;
export function string<const P extends StringOptions & FieldOptions<string>>(
  options: P,
): ConfiguredField<string, string, P>;
/* @__NO_SIDE_EFFECTS__ */
export function string(
  options: StringOptions & FieldOptions<string> = emptyOptions,
): Field<any, any, boolean> {
  if (options !== emptyOptions) options = { ...options };
  return configuredField<string, string>(
    { kind: "string", description: options.description },
    options,
    !options.trim && options.min === undefined && options.max === undefined && !options.pattern
      ? validateString
      : (value) => {
      if (typeof value !== "string") return fail("Expected a string", "invalid_type");
      const output = options.trim ? value.trim() : value;
      if (options.min !== undefined && output.length < options.min)
        return fail(`Expected at least ${options.min} characters`, "too_small", { origin: "string", min: options.min, inclusive: true });
      if (options.max !== undefined && output.length > options.max)
        return fail(`Expected at most ${options.max} characters`, "too_big", { origin: "string", max: options.max, inclusive: true });
      if (options.pattern) {
        const pattern = options.pattern;
        pattern.lastIndex = 0;
        const valid = pattern.test(output);
        if (!valid) return fail("Invalid format", "invalid_format");
      }
      return { value: output };
    },
  );
}
export interface NumberOptions extends ErrorOptions {
  readonly gt?: number;
  readonly gte?: number;
  readonly lt?: number;
  readonly lte?: number;
  readonly integer?: boolean;
  readonly description?: string;
}
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
export function number(
  options: NumberOptions & BasicPresence & { optional: true },
): Field<string | number | undefined, number | undefined, true>;
export function number(
  options?: NumberOptions & BasicPresence & { optional?: false },
): Field<string | number, number, false>;
export function number(
  options: NumberOptions & BasicPresence & { optional: boolean },
): Field<string | number | undefined, number | undefined, true>;
export function number<const P extends NumberOptions & FieldOptions<number>>(
  options: P,
): ConfiguredField<string | number, number, P>;
/* @__NO_SIDE_EFFECTS__ */
export function number(
  options: NumberOptions & FieldOptions<number> = emptyOptions,
): Field<any, any, boolean> {
  if (options !== emptyOptions) options = { ...options };
  return configuredField<string | number, number>(
    { kind: "number", description: options.description },
    options,
    (value) => {
      if (typeof value !== "number") {
        if (typeof value !== "string" || !decimal.test(value))
          return fail("Expected a decimal number", "invalid_type");
        value = Number(value);
      }
      const output = value as number;
      if (!Number.isFinite(output)) return fail("Expected a finite number");
      if (options.integer && !Number.isSafeInteger(output)) return fail("Expected a safe integer");
      if (options.gt !== undefined && !(output > options.gt))
        return fail(`Expected greater than ${options.gt}`, "too_small", { origin: "number", min: options.gt, inclusive: false });
      if (options.gte !== undefined && !(output >= options.gte))
        return fail(`Expected at least ${options.gte}`, "too_small", { origin: "number", min: options.gte, inclusive: true });
      if (options.lt !== undefined && !(output < options.lt))
        return fail(`Expected less than ${options.lt}`, "too_big", { origin: "number", max: options.lt, inclusive: false });
      if (options.lte !== undefined && !(output <= options.lte))
        return fail(`Expected at most ${options.lte}`, "too_big", { origin: "number", max: options.lte, inclusive: true });
      return { value: output };
    },
  );
}
function validateBoolean(value: unknown): Result<boolean> {
  if (value === true || value === "true" || value === "1") return { value: true };
  if (value === false || value === "false" || value === "0") return { value: false };
  return fail("Expected true, false, 1 or 0", "invalid_type");
}
export function boolean(
  options: BasicPresence & { optional: true },
): Field<string | boolean | undefined, boolean | undefined, true>;
export function boolean(
  options?: BasicPresence & { optional?: false },
): Field<string | boolean, boolean, false>;
export function boolean(
  options: BasicPresence & { optional: boolean },
): Field<string | boolean | undefined, boolean | undefined, true>;
export function boolean<const P extends FieldOptions<boolean>>(
  options: P,
): ConfiguredField<string | boolean, boolean, P>;
/* @__NO_SIDE_EFFECTS__ */
export function boolean(options: FieldOptions<boolean> = emptyOptions): Field<any, any, boolean> {
  if (options !== emptyOptions) options = { ...options };
  return configuredField<string | boolean, boolean>(
    { kind: "boolean", description: options.description },
    options,
    validateBoolean,
  );
}
class EnumMeta {
  readonly kind = "string" as const;
  declare optional?: boolean;
  declare nullable?: boolean;
  #source: string | readonly string[] | undefined;
  #choices: readonly string[] | undefined;
  constructor(source: string | readonly string[], readonly description?: string) {
    this.#source = source;
  }
  get enumValues(): readonly string[] | undefined {
    if (this.#source !== undefined) {
      this.#choices = typeof this.#source === "string" ? [this.#source] : [...this.#source];
      this.#source = undefined;
    }
    return this.#choices;
  }
  set enumValues(value: readonly string[] | undefined) {
    this.#source = undefined;
    this.#choices = value;
  }
}
export function enum_<const T extends readonly [string, ...string[]]>(
  values: T,
  options: BasicPresence & { optional: true },
): Field<T[number] | undefined, T[number] | undefined, true>;
export function enum_<const T extends readonly [string, ...string[]]>(
  values: T,
  options?: BasicPresence & { optional?: false },
): Field<T[number], T[number], false>;
export function enum_<const T extends readonly [string, ...string[]]>(
  values: T,
  options: BasicPresence & { optional: boolean },
): Field<T[number] | undefined, T[number] | undefined, true>;
export function enum_<
  const T extends readonly [string, ...string[]],
  const P extends FieldOptions<T[number]>,
>(values: T, options: P): ConfiguredField<T[number], T[number], P>;
/* @__NO_SIDE_EFFECTS__ */
export function enum_<const T extends readonly [string, ...string[]]>(
  values: T,
  options: FieldOptions<T[number]> = emptyOptions,
): Field<any, any, boolean> {
  if (options !== emptyOptions) options = { ...options };
  const allowed = [...values];
  let message: string;
  let lookup: Set<string> | undefined;
  let uses = 0;
  const contains = allowed.length === 2
    ? (value: unknown) => value === allowed[0] || value === allowed[1]
    : (value: unknown) => {
      if (!lookup && allowed.length > 8 && ++uses === 8) lookup = new Set(allowed);
      return lookup ? lookup.has(value as string) : allowed.includes(value as T[number]);
    };
  return configuredField<T[number], T[number]>(
    new EnumMeta(allowed, options.description),
    options,
    (value) => {
      return typeof value === "string" && contains(value)
        ? { value: value as T[number] }
        : fail(message ??= `Expected one of: ${allowed.join(", ")}`);
    },
  );
}
export { enum_ as enum };
type LiteralValue = string | number | boolean;
type LiteralInput<T> = T extends string ? T : T extends number ? string | number : string | boolean;
export function literal<const T extends readonly [LiteralValue, ...LiteralValue[]]>(
  values: T,
): Field<LiteralInput<T[number]>, T[number], false>;
export function literal<const T extends readonly [LiteralValue, ...LiteralValue[]], const P extends FieldOptions<T[number]>>(
  values: T,
  options: P,
): ConfiguredField<LiteralInput<T[number]>, T[number], P>;
export function literal<const T extends string | number | boolean>(value: T): Field<LiteralInput<T>, T, false>;
export function literal<const T extends string | number | boolean, const P extends FieldOptions<T>>(
  value: T,
  options: P,
): ConfiguredField<LiteralInput<T>, T, P>;
/* @__NO_SIDE_EFFECTS__ */
export function literal<const T extends LiteralValue>(
  value: T | readonly [T, ...T[]],
  options: FieldOptions<T> = emptyOptions,
): Field<any, any, boolean> {
  if (options !== emptyOptions) options = { ...options };
  if (typeof value === "object") {
    if (!value.length) throw new TypeError("Expected at least one literal value");
    const allowed = [...value] as [T, ...T[]];
    if (allowed.some(value => typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean"))
      throw new TypeError("Expected string, number or boolean literal values");
    if (allowed.every(value => typeof value === "string"))
      return enum_(allowed as [string, ...string[]], options as FieldOptions<string>);
    const branches = allowed.map(value => literal(value));
    const kind = branches[0]!.meta.kind;
    const homogeneous = branches.every(branch => branch.meta.kind === kind);
    let message: string;
    return configuredField<LiteralInput<T>, T>(
      { kind: homogeneous ? kind : "union", literalValues: allowed,
        ...(homogeneous ? {} : { options: branches }), description: options.description },
      options,
      input => {
        for (const branch of branches) {
          const result = rawValidators.get(branch)!(input);
          if (!result.issues) return result;
        }
        return fail(message ??= `Expected one of: ${allowed.join(", ")}`);
      },
    );
  }
  let message: string;
  const convert = typeof value === "number" ? rawValidators.get(number())!
    : validateBoolean;
  return configuredField<LiteralInput<T>, T>(
    typeof value === "string" ? new EnumMeta(value, options.description)
      : { kind: typeof value as "number" | "boolean", literalValues: [value], description: options.description },
    options,
    (input) => {
      if (typeof value === "string")
        return input === value ? { value } : fail(message ??= `Expected one of: ${value}`);
      const result = convert(input);
      if (result.issues) return result;
      return result.value === value ? { value } : fail(message ??= `Expected one of: ${value}`);
    },
  );
}
function validateDate(value: unknown): Result<Date> {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value))
    return fail("Expected an ISO date");
  const output = new Date(value);
  if (!Number.isFinite(output.getTime())) return fail("Invalid date");
  const year = +value.slice(0, 4);
  const month = +value.slice(5, 7);
  const day = +value.slice(8, 10);
  const days = month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : 31 - ((((1 << 4) | (1 << 6) | (1 << 9) | (1 << 11)) >> month) & 1);
  if (month < 1 || month > 12 || day < 1 || day > days) return fail("Invalid date");
  return { value: output };
}
export function date(
  options: BasicPresence & { optional: true },
): Field<string | undefined, Date | undefined, true>;
export function date(options?: BasicPresence & { optional?: false }): Field<string, Date, false>;
export function date(
  options: BasicPresence & { optional: boolean },
): Field<string | undefined, Date | undefined, true>;
export function date<const P extends FieldOptions<Date>>(
  options: P,
): ConfiguredField<string, Date, P>;
/* @__NO_SIDE_EFFECTS__ */
export function date(options: FieldOptions<Date> = emptyOptions): Field<any, any, boolean> {
  if (options !== emptyOptions) options = { ...options };
  return configuredField<string, Date>(
    { kind: "date", description: options.description },
    options,
    validateDate,
  );
}
export interface ArrayOptions<WrapScalar extends boolean | undefined = boolean> extends ErrorOptions {
  readonly min?: number;
  readonly max?: number;
  readonly wrapScalar?: WrapScalar;
}
type ArrayInput<I, WrapScalar extends boolean | undefined> = WrapScalar extends true
  ? I | readonly I[]
  : readonly I[];
type ArrayElement<I, O> = Field<I, O> | (Schema<I, O> & { readonly shape: Shape });
export function array<I, O, WrapScalar extends boolean | undefined = false>(
  s: ArrayElement<I, O>,
  options: ArrayOptions<WrapScalar> & BasicPresence & { optional: true },
): Field<ArrayInput<I, WrapScalar> | undefined, O[] | undefined, true>;
export function array<I, O, WrapScalar extends boolean | undefined = false>(
  s: ArrayElement<I, O>,
  options?: ArrayOptions<WrapScalar> & BasicPresence & { optional?: false },
): Field<ArrayInput<I, WrapScalar>, O[], false>;
export function array<I, O, WrapScalar extends boolean | undefined = false>(
  s: ArrayElement<I, O>,
  options: ArrayOptions<WrapScalar> & BasicPresence & { optional: boolean },
): Field<ArrayInput<I, WrapScalar> | undefined, O[] | undefined, true>;
export function array<I, O, const P extends ArrayOptions & FieldOptions<O[]>>(
  s: ArrayElement<I, O>,
  options: P,
): ConfiguredField<ArrayInput<I, true extends FlagValue<P, "wrapScalar"> ? true : false>, O[], P>;
/* @__NO_SIDE_EFFECTS__ */
export function array<I, O>(
  s: ArrayElement<I, O>,
  options: ArrayOptions & FieldOptions<O[]> = emptyOptions,
): Field<any, any, boolean> {
  if (options !== emptyOptions) options = { ...options };
  const innerValidate = s["~standard"].validate;
  return configuredField<I | readonly I[], O[]>(
    { kind: "array", inner: s, enumValues: s.meta.enumValues, ...(s.meta.literalValues ? { literalValues: s.meta.literalValues } : {}), description: options.description },
    options,
    (value) => {
      if (options.wrapScalar !== true && !Array.isArray(value))
        return fail("Expected an array", "invalid_type");
      const inputs = Array.isArray(value) ? value : [value];
      const output: O[] = [];
      let issues: Issue[] | undefined;
      for (let i = 0; i < inputs.length; i++) {
        const result = innerValidate(inputs[i]);
        if (result.issues)
          for (const issue of result.issues)
            (issues ??= []).push({ ...issue, path: issue.path ? [i, ...issue.path] : [i] });
        else output.push(result.value);
      }
      if (issues) return { issues };
      if (options.min !== undefined && inputs.length < options.min)
        return fail(`Expected at least ${options.min} items`, "too_small", { origin: "array", min: options.min, inclusive: true });
      if (options.max !== undefined && inputs.length > options.max)
        return fail(`Expected at most ${options.max} items`, "too_big", { origin: "array", max: options.max, inclusive: true });
      return { value: output };
    },
  );
}
export function transform<I, O, T>(s: Field<I, O>, fn: (value: O) => T): Field<I, T>;
export function transform<I, O, T>(s: Schema<I, O>, fn: (value: O) => T): Schema<I, T>;
/* @__NO_SIDE_EFFECTS__ */
export function transform<I, O, T>(s: Schema<I, O>, fn: (value: O) => T): Schema<I, T> {
  const validate = (value: unknown): Result<T> => {
    const result = s["~standard"].validate(value);
    return result.issues ? result : { value: fn(result.value) };
  };
  const meta = { ...s.meta, enumValues: s.meta.enumValues, inner: s };
  return "field" in s ? field(meta, validate) : schema(meta, validate);
}
/* @__NO_SIDE_EFFECTS__ */
export function refine<S extends AnySchema>(
  s: S,
  check: (value: Output<S>) => boolean,
  message: string,
): S {
  const validate = (value: unknown): Result<Output<S>> => {
    const result = s["~standard"].validate(value);
    return result.issues || check(result.value) ? result : fail(message, "custom");
  };
  return { ...s, "~standard": { ...s["~standard"], validate }, meta: { ...s.meta, enumValues: s.meta.enumValues, inner: s } };
}
const own = Object.hasOwn;
export interface ObjectOptions<T> extends Omit<FieldOptions<T>, "default"> {
  readonly unknownKeys?: "strip" | "strict" | "passthrough";
  readonly default?: DefaultTargets<T>;
}
function objectPresence<S extends Shape>(
  result: ObjectSchema<S>,
  options: ObjectOptions<ObjectOutput<S>>,
): ObjectSchema<S, any, any, boolean> {
  const optional = options.optional;
  const nullable = options.nullable;
  const nullish = options.nullish;
  if (!optional && !nullable && !nullish && !("default" in options)) return result;
  const defaultValue = own(options, "default") ? options.default : undefined;
  if (!optional && !nullable && !nullish && defaultValue === undefined) return result;
  return {
    ...configuredField<ObjectInput<S>, ObjectOutput<S>>(result.meta, { optional, nullable, nullish, default: defaultValue }, result["~standard"].validate, false),
    shape: result.shape,
  };
}
export function object<S extends Shape>(
  shape: S,
  options: ObjectOptions<ObjectOutput<S>> & BasicPresence & { optional: true },
): ObjectSchema<S, ObjectInput<S> | undefined, ObjectOutput<S> | undefined, true>;
export function object<S extends Shape>(
  shape: S,
  options?: ObjectOptions<ObjectOutput<S>> & BasicPresence & { optional?: false },
): ObjectSchema<S>;
export function object<S extends Shape>(
  shape: S,
  options: ObjectOptions<ObjectOutput<S>> & BasicPresence & { optional: boolean },
): ObjectSchema<S, ObjectInput<S> | undefined, ObjectOutput<S> | undefined, true>;
export function object<S extends Shape, const P extends ObjectOptions<ObjectOutput<S>>>(
  shape: S,
  options: P,
): ObjectSchema<S, ConfiguredInput<ObjectInput<S>, P>, ConfiguredOutput<ObjectOutput<S>, P>>;
/* @__NO_SIDE_EFFECTS__ */
export function object<S extends Shape>(
  shape: S,
  options: ObjectOptions<ObjectOutput<S>> = emptyOptions,
): ObjectSchema<S, any, any, boolean> {
  const error = options.error;
  const fields = { ...shape };
  const keys = Object.keys(fields);
  const validators: ((value: unknown) => Result<any>)[] = [];
  for (const key of keys) {
    const s = fields[key]!;
    if (s.field !== true && !("shape" in s)) throw new TypeError(`Expected field: ${key}`);
    validators.push(s["~standard"].validate);
  }
  const mode = options.unknownKeys ?? "strict";
  const validate = (input: unknown): Result<ObjectOutput<S>> => {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      return { issues: [customizeIssue({ message: "Expected an object", code: "invalid_type" }, input, error)] };
    const raw = input as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    let issues: Issue[] | undefined;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      if (key === "__proto__") continue;
      const result = validators[i]!(raw[key]);
      if (result.issues) {
        issues ??= [];
        for (const issue of result.issues)
          issues.push({ ...issue, path: issue.path ? [key, ...issue.path] : [key] });
      } else if (result.value !== undefined || key in raw) {
        output[key] = result.value;
      }
    }
    if (mode === "strict") {
      for (const key in raw)
        if (!own(fields, key)) {
          (issues ??= []).push(customizeIssue({ message: `Unknown key: ${key}`, code: "unrecognized_key", path: [key] }, input, error));
          break;
        }
    } else if (mode === "passthrough") {
      for (const key in raw) {
        if (key !== "__proto__" && !own(fields, key)) {
          const value = raw[key];
          if (key in output)
            Object.defineProperty(output, key, {
              value, enumerable: true, writable: true, configurable: true,
            });
          else output[key] = value;
        }
      }
    }
    return issues ? { issues } : { value: output as ObjectOutput<S> };
  };
  const result = {
    meta: { kind: "object", shape: fields, unknownKeys: mode, description: options.description },
    "~standard": { version: 1, vendor: "loculus", validate },
    shape: fields as S,
    field: true,
  } as unknown as ObjectSchema<S>;
  return options === emptyOptions ? result : objectPresence(result, options);
}
/* @__NO_SIDE_EFFECTS__ */
export function union<const S extends readonly [AnySchema, AnySchema, ...AnySchema[]]>(
  options: S,
  config: { description?: string } = {},
): Schema<Input<S[number]>, Output<S[number]>> {
  const branches = [...options];
  return schema({ kind: "union", options: branches, description: config.description }, (input) => {
    let issues: Issue[] | undefined;
    for (let i = 0; i < branches.length; i++) {
      const result = branches[i]!["~standard"].validate(input);
      if (!result.issues) return result;
      (issues ??= []).push(...result.issues);
    }
    return { issues: issues! };
  });
}
/* @__NO_SIDE_EFFECTS__ */
export function xor<const S extends readonly [AnySchema, AnySchema, ...AnySchema[]]>(
  options: S,
  config: { description?: string } = {},
): Schema<Input<S[number]>, Output<S[number]>> {
  const branches = [...options];
  return schema({ kind: "xor", options: branches, description: config.description }, (input) => {
    let success: Result<Output<S[number]>> | undefined;
    for (const s of branches) {
      const result = s["~standard"].validate(input);
      if (!result.issues) {
        if (success) return { issues: [customizeIssue({ message: "Expected exactly one matching schema", code: "invalid_value" }, input, undefined)] };
        success = result;
      }
    }
    return success ?? { issues: [customizeIssue({ message: "No matching schema", code: "invalid_value" }, input, undefined)] };
  });
}
/* @__NO_SIDE_EFFECTS__ */
export function discriminatedUnion<
  const S extends readonly [ObjectSchema, ObjectSchema, ...ObjectSchema[]],
>(
  key: string,
  options: S,
  config: { description?: string } = {},
): Schema<Input<S[number]>, Output<S[number]>> {
  const branches = [...options];
  let lookup: Map<unknown, AnySchema | null> | undefined;
  for (const option of options) {
    if (!own(option.shape, key)) throw new TypeError(`Missing discriminator field: ${key}`);
  }
  return schema(
    {
      kind: "union",
      discriminator: key,
      options: branches,
      description: config.description,
    },
    (input) => {
      if (typeof input !== "object" || input === null || Array.isArray(input))
        return { issues: [customizeIssue({ message: "Expected an object", code: "invalid_type" }, input, undefined)] };
      const value = (input as Record<string, unknown>)[key];
      if (!lookup) {
        const map = new Map<unknown, AnySchema | null>();
        for (const option of branches) {
          const meta = option.shape[key]!.meta;
          const values = meta.literalValues ?? meta.enumValues;
          if ((meta.kind !== "string" && meta.kind !== "number" && meta.kind !== "boolean" && !(meta.kind === "union" && meta.literalValues)) || !values?.length)
            throw new TypeError("Discriminator must be an enum or literal");
          const add = (value: unknown) => {
            if (map.has(value)) {
              if (value !== undefined) throw new TypeError(`Duplicate discriminator: ${String(value)}`);
              map.set(value, null);
            } else map.set(value, option);
          };
          for (const value of new Set(values)) add(value);
          if (meta.optional) add(undefined);
          if (meta.nullable) add(null);
        }
        lookup = map;
      }
      let selected = lookup.get(value);
      if (!selected && typeof value === "string") {
        for (const option of branches) {
          let discriminator: AnySchema = option.shape[key]!;
          while (discriminator.meta.inner) discriminator = discriminator.meta.inner;
          if (!(rawValidators.get(discriminator) ?? discriminator["~standard"].validate)(value).issues) {
            selected = option;
            break;
          }
        }
      }
      return selected
        ? selected["~standard"].validate(input)
        : { issues: [customizeIssue({ message: `Invalid discriminator: ${key}`, code: "invalid_value", path: [key] }, input, undefined)] };
    },
  );
}
/* @__NO_SIDE_EFFECTS__ */
export function intersection<A extends AnySchema, B extends AnySchema>(
  a: A,
  b: B,
  config: { description?: string } = {},
): Schema<Input<A> & Input<B>, Output<A> & Output<B>> {
  return schema(
    { kind: "intersection", options: [a, b], description: config.description },
    (input) => {
      const left = a["~standard"].validate(input);
      const right = b["~standard"].validate(input);
      if (left.issues || right.issues)
        return { issues: [...(left.issues ?? []), ...(right.issues ?? [])] };
      const merged = mergeOutputs(left.value, right.value);
      return merged.issues ? { issues: merged.issues.map(issue => customizeIssue(issue, input, undefined)) } : merged;
    },
  );
}
function mergeOutputs(left: any, right: any): Result<any> {
  if (left === right || (typeof left === "number" && typeof right === "number" && Number.isNaN(left) && Number.isNaN(right)))
    return { value: left };
  if (left instanceof Date && right instanceof Date && Object.is(+left, +right))
    return { value: left };
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return fail("Conflicting intersection output");
    const output = [];
    for (let i = 0; i < left.length; i++) {
      const result = mergeOutputs(left[i], right[i]);
      if (result.issues) return result;
      output.push(result.value);
    }
    return { value: output };
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftPrototype = Object.getPrototypeOf(left), rightPrototype = Object.getPrototypeOf(right);
    if ((leftPrototype === Object.prototype || leftPrototype === null) && (rightPrototype === Object.prototype || rightPrototype === null)) {
      const output = { ...left, ...right };
      if (own(output, "__proto__")) delete output.__proto__;
      for (const key of Object.keys(left)) {
        if (key !== "__proto__" && own(right, key)) {
          const result = mergeOutputs(left[key], right[key]);
          if (result.issues) return result;
          output[key] = result.value;
        }
      }
      return { value: output };
    }
  }
  return fail("Conflicting intersection output");
}
export function fromEntries(
  entries: Iterable<readonly [string, unknown]>,
): Record<string, unknown> {
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, value] of entries) {
    if (own(result, key)) {
      const current = result[key];
      if (Array.isArray(current)) current.push(value);
      else result[key] = [current, value];
    } else result[key] = value;
  }
  return result;
}
