import { configuration } from "./config.js";
import type { AnySchema, Meta, Schema } from "./index.js";
import { decimalPattern, isoDatePattern } from "./patterns.js";

type JsonSchema = Record<string, unknown>;
type Direction = "input" | "output";
interface Conversion {
  readonly direction: Direction;
  readonly target: "draft-2020-12" | "draft-07";
  readonly merging?: boolean;
  approximate?: true;
}
interface Options {
  readonly target: string;
  readonly libraryOptions?: Record<string, unknown> | undefined;
}

type WithJsonSchema<I, O> = {
  readonly "~standard": Schema<I, O>["~standard"] & {
    readonly jsonSchema: {
      readonly input: (options: Options) => JsonSchema;
      readonly output: (options: Options) => JsonSchema;
    };
  };
};

export function jsonSchema<I, O>(schema: Schema<I, O>): WithJsonSchema<I, O> {
  function convert(direction: Direction, { target }: Options): JsonSchema {
    if (target !== "draft-2020-12" && target !== "draft-07")
      throw new TypeError(`Unsupported JSON Schema target: ${target}`);
    return {
      $schema: target === "draft-07" ? "http://json-schema.org/draft-07/schema#" : "https://json-schema.org/draft/2020-12/schema",
      ...convertSchema(schema, { direction, target }),
    };
  }
  return {
    "~standard": {
      ...schema["~standard"],
      jsonSchema: {
        input: options => convert("input", options),
        output: options => convert("output", options),
      },
    },
  };
}

const decimalString = () => ({ type: "string", pattern: decimalPattern.source });
const booleanStrings = (value: boolean) => value ? ["true", "1"] : ["false", "0"];

function choices(values: readonly unknown[]): JsonSchema {
  const distinct = [...new Set(values)];
  return distinct.length === 1 ? { const: distinct[0] } : { enum: distinct };
}

function convertSchema(schema: AnySchema, conversion: Conversion): JsonSchema {
  const { direction } = conversion;
  const { meta } = schema;
  if (meta.wrapper) {
    if (meta.wrapper !== "refine" && direction === "input") {
      if (meta.wrapper === "unflatten") conversion.approximate = true;
      return convertSchema(meta.inner!, conversion);
    }
    throw new TypeError(`Cannot convert the ${direction} of ${meta.wrapper}() to JSON Schema`);
  }
  const alternatives = [convertBase(meta, conversion)];
  const hasNullDefault = Object.hasOwn(meta, "nullDefaultValue");
  if (direction === "input" && meta.nullable) {
    alternatives.push({ type: "null" });
    if (meta.kind === "number" && !meta.literalValues) alternatives.push({ const: "" });
  }
  if (direction === "output" && meta.nullable && !hasNullDefault) alternatives.push({ type: "null" });
  const defaultValue = meta.defaultValue === undefined ? undefined : jsonValue(meta.defaultValue);
  if (direction === "output") {
    const defaults = [defaultValue, meta.nullDefaultValue === undefined ? undefined : jsonValue(meta.nullDefaultValue)]
      .filter(value => value !== undefined);
    for (const value of defaults) {
      alternatives.push(conversion.merging ? mergeableDefault(value, conversion.target) : { const: value });
    }
  }
  return {
    ...(alternatives.length === 1 ? alternatives[0] : { anyOf: alternatives }),
    ...(meta.description === undefined ? {} : { description: meta.description }),
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
  };
}

function jsonValue(value: unknown): unknown {
  const json = JSON.stringify(value, (_, entry: unknown) => {
    if (typeof entry === "number" && !Number.isFinite(entry))
      throw new TypeError("Cannot represent a non-finite default value in JSON Schema");
    return entry;
  });
  if (json === undefined) throw new TypeError("Cannot represent the default value in JSON Schema");
  return JSON.parse(json) as unknown;
}

function mergeableDefault(value: unknown, target: Conversion["target"]): JsonSchema {
  if (Array.isArray(value)) {
    const items = value.map(item => mergeableDefault(item, target));
    return {
      type: "array", minItems: items.length, maxItems: items.length,
      ...(items.length ? { [target === "draft-07" ? "items" : "prefixItems"]: items } : {}),
    };
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    return {
      type: "object",
      properties: Object.fromEntries(entries.map(([key, item]) => [key, mergeableDefault(item, target)])),
      required: entries.map(([key]) => key),
    };
  }
  return { const: value };
}

function convertBase(meta: Meta, conversion: Conversion): JsonSchema {
  const { direction, merging, target } = conversion;
  if (meta.kind !== "array" && (meta.literalValues || meta.enumValues)) {
    const values = meta.literalValues ?? meta.enumValues!;
    if (values.some(value => typeof value === "number" && !Number.isFinite(value)))
      throw new TypeError("Cannot convert a non-finite literal to JSON Schema");
    if (direction === "output") return choices(values);
    const inputs = values.flatMap<string | number | boolean>(value => typeof value === "boolean" ? [value, ...booleanStrings(value)] : [value]);
    if (!values.some(value => typeof value === "number")) return choices(inputs);
    conversion.approximate = true;
    return { anyOf: [choices(inputs), decimalString()] };
  }
  switch (meta.kind) {
    case "string": {
      const { min, max, length, pattern, trim } = meta.stringOptions ?? {};
      const result: JsonSchema = { type: "string" };
      if (direction === "input" && trim) {
        if (min !== undefined || max !== undefined || pattern) conversion.approximate = true;
        return result;
      }
      if (min !== undefined || max !== undefined) {
        if ((min !== undefined && (min > 1 || (min > 0 && !Number.isInteger(min)))) || max !== undefined)
          conversion.approximate = true;
        if (!length && !configuration.stringLength) {
          if (min !== undefined && Number.isSafeInteger(min) && min >= 0) result.minLength = Math.ceil(min / 2);
          if (max !== undefined && Number.isSafeInteger(max) && max >= 0) result.maxLength = max;
        } else {
          conversion.approximate = true;
        }
      }
      if (pattern) {
        if (/[^dg]/.test(pattern.flags)) throw new TypeError(`Unsupported JSON Schema pattern flags: ${pattern.flags}`);
        result.pattern = pattern.source;
      }
      return result;
    }
    case "number": {
      const { integer, gt, gte, lt, lte } = meta.numberOptions ?? {};
      if (gt === Infinity || gte === Infinity || lt === -Infinity || lte === -Infinity
        || [gt, gte, lt, lte].some(Number.isNaN)) return { not: {} };
      const numeric: JsonSchema = { type: integer ? "integer" : "number" };
      if (integer) {
        numeric.minimum = Number.MIN_SAFE_INTEGER;
        numeric.maximum = Number.MAX_SAFE_INTEGER;
      }
      if (gte !== undefined && Number.isFinite(gte)) numeric.minimum = Math.max(gte, integer ? Number.MIN_SAFE_INTEGER : -Infinity);
      if (lte !== undefined && Number.isFinite(lte)) numeric.maximum = Math.min(lte, integer ? Number.MAX_SAFE_INTEGER : Infinity);
      if (gt !== undefined && Number.isFinite(gt)) numeric.exclusiveMinimum = gt;
      if (lt !== undefined && Number.isFinite(lt)) numeric.exclusiveMaximum = lt;
      if (direction === "output") return numeric;
      conversion.approximate = true;
      return { anyOf: [numeric, decimalString()] };
    }
    case "boolean":
      return direction === "input" ? choices([true, false, ...booleanStrings(true), ...booleanStrings(false)]) : { type: "boolean" };
    case "date":
      if (direction === "output") throw new TypeError("Cannot represent a Date object in JSON Schema");
      conversion.approximate = true;
      return { type: "string", pattern: isoDatePattern.source };
    case "array": {
      const { min, max, wrapScalar } = meta.arrayOptions ?? {};
      const items = convertSchema(meta.inner!, conversion);
      const array: JsonSchema = { type: "array", items };
      if (min !== undefined && Number.isSafeInteger(min) && min >= 0) array.minItems = min;
      else if (min !== undefined && min > 0) conversion.approximate = true;
      if (max !== undefined && Number.isSafeInteger(max) && max >= 0) array.maxItems = max;
      else if (max !== undefined && max < Infinity) conversion.approximate = true;
      return direction === "input" && wrapScalar && !(min !== undefined && min > 1) && !(max !== undefined && max < 1)
        ? { anyOf: [array, meta.inner!.meta.kind === "array" ? { allOf: [items, { not: { type: "array" } }] } : items] }
        : array;
    }
    case "object": {
      const fields = Object.entries(meta.shape!).filter(([key]) => key !== "__proto__");
      const properties = Object.fromEntries(fields.map(([key, field]) => [key, convertSchema(field, conversion)]));
      if (direction === "input" && Object.hasOwn(meta.shape!, "__proto__"))
        Object.defineProperty(properties, "__proto__", { value: {}, enumerable: true });
      const required = fields.filter(([, { meta: field }]) => {
        if (direction === "input") return !field.optional;
        if (Object.hasOwn(field, "nullDefaultValue") && field.nullDefaultValue === undefined) return false;
        return !field.optional || field.defaultValue !== undefined;
      });
      return {
        type: "object",
        properties,
        ...(required.length ? { required: required.map(([key]) => key) } : {}),
        additionalProperties: !!merging || meta.unknownKeys === "passthrough" || (direction === "input" && meta.unknownKeys === "strip"),
      };
    }
    case "intersection": {
      if (direction === "input") conversion.approximate = true;
      const branchConversion = direction === "output" ? { direction, target, merging: true } : conversion;
      return { allOf: meta.options!.map(branch => convertSchema(branch, branchConversion)) };
    }
    case "xor": {
      const branchConversion: Conversion = { direction, target, merging };
      const branches = meta.options!.map(branch => convertSchema(branch, branchConversion));
      if (direction === "input" && !branchConversion.approximate) return { oneOf: branches };
      conversion.approximate = true;
      return { anyOf: branches };
    }
    case "union":
      if (meta.discriminator !== undefined) conversion.approximate = true;
      return { anyOf: meta.options!.map(branch => convertSchema(branch, conversion)) };
  }
}
