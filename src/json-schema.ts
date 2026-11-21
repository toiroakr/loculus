import { configuration } from "./config.js";
import type { AnySchema, Meta, Schema } from "./index.js";
import { decimalPattern, isoDatePattern } from "./patterns.js";

type JsonSchema = Record<string, unknown>;
type Direction = "input" | "output";
interface Conversion {
  readonly direction: Direction;
  readonly target: "draft-2020-12" | "draft-07";
  readonly merging?: true | AnySchema;
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
  const defaultValue = Object.hasOwn(meta, "defaultValue") ? jsonValue(meta.defaultValue) : undefined;
  const nullDefaultValue = hasNullDefault ? jsonValue(meta.nullDefaultValue) : undefined;
  if (direction === "output") {
    const defaults = [defaultValue, nullDefaultValue].filter(value => value !== undefined);
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
    if (entry === undefined || typeof entry === "function" || typeof entry === "symbol" || typeof entry === "bigint")
      throw new TypeError("Cannot represent the default value in JSON Schema");
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

function mergePeer(merging: Conversion["merging"]): Meta | undefined {
  if (!merging || merging === true) return;
  const { meta } = merging;
  if (!meta.wrapper && !Object.hasOwn(meta, "defaultValue") && !Object.hasOwn(meta, "nullDefaultValue")) return meta;
}

function closedObjectOutputKeys({ meta }: AnySchema): string[] | undefined {
  if (meta.wrapper || meta.kind !== "object" || meta.unknownKeys === "passthrough") return;
  const keys = Object.keys(meta.shape!).filter(key => key !== "__proto__");
  for (const value of [meta.defaultValue, meta.nullDefaultValue]) {
    if (value === null || value === undefined) continue;
    if (typeof value !== "object" || Array.isArray(value)) return;
    keys.push(...Object.keys(value));
  }
  return keys;
}

function lengthBounds(min: number | undefined, max: number | undefined) {
  const minimum = min !== undefined && min > 0 ? Math.ceil(min) : 0;
  const maximum = max !== undefined && max < Infinity ? Math.floor(max) : Infinity;
  return { minimum, maximum, impossible: minimum > maximum || minimum > Number.MAX_SAFE_INTEGER };
}

function convertPattern({ source, flags }: RegExp): string {
  if (/[^dg]/.test(flags)) throw new TypeError(`Unsupported JSON Schema pattern flags: ${flags}`);
  const syntax = source.replace(/\\u([\da-f]{4})|\\([\s\S])/gi, (_, code: string | undefined, escape: string | undefined) => {
    if (code) {
      const point = Number.parseInt(code, 16);
      return point > 0x7f ? String.fromCharCode(point) : "_";
    }
    return /[DSW0-9u]/.test(escape!) ? "\uD800" : "_";
  });
  const characterClass = /\[[^\]]*\]/g;
  const rangeSpansSurrogates = (syntax.match(characterClass) ?? []).some(value =>
    /[\u0000-\uD7FF]-[\uE000-\uFFFF]/.test(value.slice(1, -1)));
  if (/\[\^|[\uD800-\uDFFF]/.test(syntax) || /\./.test(syntax.replace(characterClass, "")) || rangeSpansSurrogates)
    throw new TypeError("Cannot convert a pattern with potentially different Unicode matching semantics to JSON Schema");
  try {
    new RegExp(source, "u");
  } catch (cause) {
    throw new TypeError("Cannot convert a pattern with unsupported Unicode syntax to JSON Schema", { cause });
  }
  return source;
}

function hasRequiredOutput(meta: Meta): boolean {
  return !meta.optional || meta.defaultValue !== undefined;
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
      const { minimum, maximum, impossible } = lengthBounds(min, max);
      if (impossible) return { not: {} };
      const result: JsonSchema = { type: "string" };
      if (direction === "input" && trim) {
        if (min !== undefined || max !== undefined || pattern) conversion.approximate = true;
        return result;
      }
      if (min !== undefined || max !== undefined) {
        if (!length && !configuration.stringLength) {
          if (min !== undefined && Number.isFinite(min) && min >= 0) result.minLength = Math.ceil(minimum / 2);
          if (Number.isFinite(maximum)) result.maxLength = maximum;
          if (minimum > 1 || (maximum > 0 && Number.isFinite(maximum))) conversion.approximate = true;
        } else if (minimum > 0 || Number.isFinite(maximum)) {
          conversion.approximate = true;
        }
      }
      if (pattern) result.pattern = convertPattern(pattern);
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
      const { minimum, maximum, impossible } = lengthBounds(min, max);
      if (impossible) return { not: {} };
      const peer = mergePeer(merging);
      const itemConversion = merging ? {
        ...conversion, merging: peer?.kind === "array" ? peer.inner! : true as const,
      } : conversion;
      const items = convertSchema(meta.inner!, itemConversion);
      const array: JsonSchema = { type: "array", items };
      if (min !== undefined && Number.isFinite(min) && min >= 0) array.minItems = minimum;
      if (Number.isFinite(maximum)) array.maxItems = maximum;
      return direction === "input" && wrapScalar && minimum <= 1 && maximum >= 1
        ? { anyOf: [array, meta.inner!.meta.kind === "array" ? { allOf: [items, { not: { type: "array" } }] } : items] }
        : array;
    }
    case "object": {
      const fields = Object.entries(meta.shape!).filter(([key]) => key !== "__proto__");
      const peer = mergePeer(merging);
      const peerShape = peer?.kind === "object" ? peer.shape : undefined;
      const peerAllowsUnknown = !!merging && (!peerShape || peer?.unknownKeys === "passthrough");
      const properties = Object.fromEntries(fields.map(([key, field]) => {
        const peerField = peerShape && Object.hasOwn(peerShape, key) ? peerShape[key] : undefined;
        const fieldPeer: Conversion["merging"] = peerField ?? (peerAllowsUnknown ? true : undefined);
        const fieldConversion = merging ? { ...conversion, merging: fieldPeer } : conversion;
        const value = convertSchema(field, fieldConversion);
        return [key, fieldPeer && !hasRequiredOutput(field.meta) ? {} : value];
      }));
      if (peerShape && !peerAllowsUnknown) {
        for (const key of Object.keys(peerShape)) {
          if (key !== "__proto__" && !Object.hasOwn(properties, key))
            Object.defineProperty(properties, key, { value: {}, enumerable: true });
        }
      }
      if (direction === "input" && Object.hasOwn(meta.shape!, "__proto__"))
        Object.defineProperty(properties, "__proto__", { value: {}, enumerable: true });
      const required = fields.filter(([, { meta: field }]) => direction === "input"
        ? !field.optional : hasRequiredOutput(field));
      const additionalProperties = peerAllowsUnknown || meta.unknownKeys === "passthrough"
        || (direction === "input" && meta.unknownKeys === "strip");
      return {
        type: "object",
        properties,
        ...(required.length ? { required: required.map(([key]) => key) } : {}),
        additionalProperties,
        ...(direction === "output" && additionalProperties ? { propertyNames: { not: { const: "__proto__" } } } : {}),
      };
    }
    case "intersection": {
      if (direction === "input") conversion.approximate = true;
      const [left, right] = meta.options! as readonly [AnySchema, AnySchema];
      const allOf = [
        convertSchema(left, direction === "output" ? { direction, target, merging: merging ? true : right } : conversion),
        convertSchema(right, direction === "output" ? { direction, target, merging: merging ? true : left } : conversion),
      ];
      if (direction === "input" || merging) return { allOf };
      const leftKeys = closedObjectOutputKeys(left);
      const rightKeys = closedObjectOutputKeys(right);
      if (!leftKeys || !rightKeys) return { allOf };
      return {
        properties: Object.fromEntries([...leftKeys, ...rightKeys].map(key => [key, {}])),
        additionalProperties: false,
        allOf,
      };
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
