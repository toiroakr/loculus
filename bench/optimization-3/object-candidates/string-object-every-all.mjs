function schema(meta, validate) {
  return { meta, "~standard": { version: 1, vendor: "loculus", validate } };
}
function field(meta, validate) {
  return { meta, "~standard": { version: 1, vendor: "loculus", validate }, field: true };
}
function fail(message, code = "invalid_value") {
  return { issues: [{ message, code }] };
}
function safeParse(schema2, value) {
  return schema2["~standard"].validate(value);
}
class ValidationError extends Error {
  constructor(issues) {
    super(
      issues.map(
        (i) => `${i.path?.map((p) => typeof p === "object" ? String(p.key) : String(p)).join(".") ?? ""}: ${i.message}`
      ).join("; ")
    );
    this.issues = issues;
    this.name = "ValidationError";
  }
  issues;
}
function parse(schema2, value) {
  const result = safeParse(schema2, value);
  if (result.issues) throw new ValidationError(result.issues);
  return result.value;
}
const fieldPlan = /* @__PURE__ */ Symbol();
const emptyOptions = {};
function validateString(value) {
  return typeof value === "string" ? { value } : fail("Expected a string", "invalid_type");
}
function configuredField(meta, options, validate) {
  if (options === emptyOptions) return { meta, "~standard": { version: 1, vendor: "loculus", validate }, field: true };
  const value = own(options, "default") ? options.default : void 0;
  if (options.optional || options.nullable || options.nullish || value !== void 0) {
    let defaults = 0;
    let missing;
    let nil;
    if (value !== void 0) {
      if (typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
        const keys = Object.keys(value);
        const nullish = own(value, "nullish");
        if (!keys.length || keys.some((key) => key !== "undefined" && key !== "null" && key !== "nullish") || nullish && keys.length > 1)
          throw new TypeError("Invalid default targets");
        defaults = (nullish || own(value, "undefined") ? 1 : 0) | (nullish || own(value, "null") ? 2 : 0);
        missing = nullish ? value.nullish : value.undefined;
        nil = nullish ? value.nullish : value.null;
      } else {
        defaults = 1;
        missing = value;
      }
    }
    const optional = !!(options.optional || options.nullish || defaults & 1);
    const nullable = !!(options.nullable || options.nullish || defaults & 2);
    const base = validate;
    if (optional || nullable) validate = (input) => {
      if (input === void 0 && optional) return { value: missing };
      if (input === null && nullable) return { value: defaults & 2 ? nil : null };
      return base(input);
    };
    meta.optional = optional;
    meta.nullable = nullable;
    if (defaults & 1) meta.defaultValue = missing;
  }
  return { meta, "~standard": { version: 1, vendor: "loculus", validate }, field: true };
}
// @__NO_SIDE_EFFECTS__
function string(options = emptyOptions) {
  if (options !== emptyOptions) options = { ...options };
  const result = configuredField(
    { kind: "string", description: options.description },
    options,
    !options.trim && options.min === void 0 && options.max === void 0 && !options.pattern ? validateString : (value) => {
      if (typeof value !== "string") return fail("Expected a string", "invalid_type");
      const output = options.trim ? value.trim() : value;
      if (options.min !== void 0 && output.length < options.min)
        return fail(`Expected at least ${options.min} characters`);
      if (options.max !== void 0 && output.length > options.max)
        return fail(`Expected at most ${options.max} characters`);
      if (options.pattern) {
        const pattern = options.pattern;
        const previous = pattern.lastIndex;
        pattern.lastIndex = 0;
        const valid = pattern.test(output);
        pattern.lastIndex = previous;
        if (!valid) return fail("Invalid format");
      }
      return { value: output };
    }
  );
  const validate = result["~standard"].validate;
  if (validate !== validateString) {
    const plan = options;
    plan.kind = "string";
    validate[fieldPlan] = plan;
  }
  return result;
}
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
// @__NO_SIDE_EFFECTS__
function number(options = emptyOptions) {
  if (options !== emptyOptions) options = { ...options };
  const result = configuredField(
    { kind: "number", description: options.description },
    options,
    (value) => {
      if (typeof value !== "number") {
        if (typeof value !== "string" || !decimal.test(value))
          return fail("Expected a decimal number", "invalid_type");
        value = Number(value);
      }
      const output = value;
      if (!Number.isFinite(output)) return fail("Expected a finite number");
      if (options.integer && !Number.isSafeInteger(output)) return fail("Expected a safe integer");
      if (options.gt !== void 0 && output <= options.gt)
        return fail(`Expected greater than ${options.gt}`);
      if (options.gte !== void 0 && output < options.gte)
        return fail(`Expected at least ${options.gte}`);
      if (options.lt !== void 0 && output >= options.lt)
        return fail(`Expected less than ${options.lt}`);
      if (options.lte !== void 0 && output > options.lte)
        return fail(`Expected at most ${options.lte}`);
      return { value: output };
    }
  );
  const validate = result["~standard"].validate;
  const plan = options === emptyOptions ? {} : options;
  plan.kind = "number";
  validate[fieldPlan] = plan;
  return result;
}
function validateBoolean(value) {
  if (value === true || value === "true" || value === "1") return { value: true };
  if (value === false || value === "false" || value === "0") return { value: false };
  return fail("Expected true, false, 1 or 0", "invalid_type");
}
// @__NO_SIDE_EFFECTS__
function boolean(options = emptyOptions) {
  if (options !== emptyOptions) options = { ...options };
  const result = configuredField(
    { kind: "boolean", description: options.description },
    options,
    validateBoolean
  );
  const validate = result["~standard"].validate;
  if (validate !== validateBoolean) {
    const plan = options === emptyOptions ? {} : options;
    plan.kind = "boolean";
    validate[fieldPlan] = plan;
  }
  return result;
}
class EnumMeta {
  constructor(source, description) {
    this.description = description;
    this.#source = source;
  }
  description;
  kind = "string";
  #source;
  #choices;
  get enumValues() {
    if (this.#source !== void 0) {
      this.#choices = Object.freeze(typeof this.#source === "string" ? [this.#source] : [...this.#source]);
      this.#source = void 0;
    }
    return this.#choices;
  }
  set enumValues(value) {
    this.#source = void 0;
    this.#choices = value;
  }
}
// @__NO_SIDE_EFFECTS__
function enum_(values, options = emptyOptions) {
  if (options !== emptyOptions) options = { ...options };
  const allowed = [...values];
  let message;
  let lookup;
  let uses = 0;
  const contains = allowed.length === 2 ? (value) => value === allowed[0] || value === allowed[1] : (value) => {
    if (!lookup && allowed.length > 8 && ++uses === 8) lookup = new Set(allowed);
    return lookup ? lookup.has(value) : allowed.includes(value);
  };
  return configuredField(
    new EnumMeta(allowed, options.description),
    options,
    (value) => {
      return typeof value === "string" && contains(value) ? { value } : fail(message ??= `Expected one of: ${allowed.join(", ")}`);
    }
  );
}
// @__NO_SIDE_EFFECTS__
function literal(value, options = emptyOptions) {
  if (options !== emptyOptions) options = { ...options };
  let message;
  return configuredField(
    new EnumMeta(value, options.description),
    options,
    (input) => typeof input === "string" && input === value ? { value } : fail(message ??= `Expected one of: ${value}`)
  );
}
function validateDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value))
    return fail("Expected an ISO date");
  const output = new Date(value);
  if (!Number.isFinite(output.getTime())) return fail("Invalid date");
  const year = +value.slice(0, 4);
  const month = +value.slice(5, 7);
  const day = +value.slice(8, 10);
  const days = month === 2 ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28 : 31 - ((1 << 4 | 1 << 6 | 1 << 9 | 1 << 11) >> month & 1);
  if (month < 1 || month > 12 || day < 1 || day > days) return fail("Invalid date");
  return { value: output };
}
// @__NO_SIDE_EFFECTS__
function date(options = emptyOptions) {
  if (options !== emptyOptions) options = { ...options };
  return configuredField(
    { kind: "date", description: options.description },
    options,
    validateDate
  );
}
// @__NO_SIDE_EFFECTS__
function array(s, options = emptyOptions) {
  if (options !== emptyOptions) options = { ...options };
  if (s.meta.kind === "array") throw new TypeError("Nested arrays are unsupported");
  const innerValidate = s["~standard"].validate;
  const result = configuredField(
    { kind: "array", inner: s, enumValues: s.meta.enumValues, description: options.description },
    options,
    (value) => {
      if (options.wrapScalar === false && !Array.isArray(value))
        return fail("Expected an array", "invalid_type");
      const inputs = Array.isArray(value) ? value : [value];
      if (options.min !== void 0 && inputs.length < options.min)
        return fail(`Expected at least ${options.min} items`);
      if (options.max !== void 0 && inputs.length > options.max)
        return fail(`Expected at most ${options.max} items`);
      const output = [];
      let issues;
      for (let i = 0; i < inputs.length; i++) {
        const result2 = innerValidate(inputs[i]);
        if (result2.issues)
          for (const issue of result2.issues)
            (issues ??= []).push({ ...issue, path: issue.path ? [i, ...issue.path] : [i] });
        else output.push(result2.value);
      }
      return issues ? { issues } : { value: output };
    }
  );
  const validate = result["~standard"].validate;
  const plan = options === emptyOptions ? {} : options;
  plan.kind = "array";
  plan.inner = innerValidate;
  validate[fieldPlan] = plan;
  return result;
}
// @__NO_SIDE_EFFECTS__
function transform(s, fn) {
  const validate = (value) => {
    const result = s["~standard"].validate(value);
    return result.issues ? result : { value: fn(result.value) };
  };
  const meta = { ...s.meta, enumValues: s.meta.enumValues, inner: s };
  return "field" in s ? field(meta, validate) : schema(meta, validate);
}
// @__NO_SIDE_EFFECTS__
function refine(s, check, message) {
  const validate = (value) => {
    const result = s["~standard"].validate(value);
    return result.issues || check(result.value) ? result : fail(message, "custom");
  };
  return { ...s, "~standard": { ...s["~standard"], validate }, meta: { ...s.meta, enumValues: s.meta.enumValues, inner: s } };
}
const own = Object.hasOwn;
function validateStringObject(input, keys, fields, mode) {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return fail("Expected an object", "invalid_type");
  const raw = input;
  const output = {};
  let issues;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = own(raw, key) ? raw[key] : void 0;
    if (typeof value === "string") {
      if (key === "__proto__")
        Object.defineProperty(output, key, { value, enumerable: true, writable: true, configurable: true });
      else output[key] = value;
    } else {
      const result = validateString(value);
      if (result.issues) {
        issues ??= [];
        for (const issue of result.issues)
          issues.push({ ...issue, path: issue.path ? [key, ...issue.path] : [key] });
      }
    }
  }
  if (mode === "strict") {
    for (const key in raw)
      if (!own(fields, key) && own(raw, key))
        (issues ??= []).push({ message: `Unknown key: ${key}`, code: "unrecognized_key", path: [key] });
  } else if (mode === "passthrough") {
    for (const key of Object.keys(raw)) {
      if (!own(fields, key)) {
        const value = raw[key];
        if (key in output)
          Object.defineProperty(output, key, {
            value,
            enumerable: true,
            writable: true,
            configurable: true
          });
        else output[key] = value;
      }
    }
  }
  return issues ? { issues } : { value: output };
}
// @__NO_SIDE_EFFECTS__
function object(shape, options = emptyOptions) {
  const fields = Object.freeze({ ...shape });
  const keys = Object.keys(fields);
  const validators = [];
  for (const key of keys) {
    const s = fields[key];
    if (s.field !== true) throw new TypeError(`Expected field: ${key}`);
    validators.push(s["~standard"].validate);
  }
  const stringsOnly = keys.length !== 0 && validators.every((validate2) => validate2 === validateString);
  const mode = options.unknownKeys ?? "strip";
  const validate = stringsOnly ? (input) => validateStringObject(input, keys, fields, mode) : (input) => {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      return fail("Expected an object", "invalid_type");
    const raw = input;
    const output = {};
    let issues;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const result = validators[i](own(raw, key) ? raw[key] : void 0);
      if (result.issues) {
        issues ??= [];
        for (const issue of result.issues)
          issues.push({ ...issue, path: issue.path ? [key, ...issue.path] : [key] });
      } else if (result.value !== void 0 || own(raw, key)) {
        if (key === "__proto__")
          Object.defineProperty(output, key, { value: result.value, enumerable: true, writable: true, configurable: true });
        else output[key] = result.value;
      }
    }
    if (mode === "strict") {
      for (const key in raw)
        if (!own(fields, key) && own(raw, key))
          (issues ??= []).push({ message: `Unknown key: ${key}`, code: "unrecognized_key", path: [key] });
    } else if (mode === "passthrough") {
      for (const key of Object.keys(raw)) {
        if (!own(fields, key)) {
          const value = raw[key];
          if (key in output)
            Object.defineProperty(output, key, {
              value,
              enumerable: true,
              writable: true,
              configurable: true
            });
          else output[key] = value;
        }
      }
    }
    return issues ? { issues } : { value: output };
  };
  return {
    meta: { kind: "object", shape: fields, unknownKeys: mode, description: options.description },
    "~standard": { version: 1, vendor: "loculus", validate },
    shape: fields
  };
}
function appendCompiledIssues(issues, errors, key) {
  issues ??= [];
  for (const issue of errors) issues.push({ ...issue, path: issue.path ? [key, ...issue.path] : [key] });
  return issues;
}
function compiledCheck(plan, value) {
  if (!plan) return "false";
  const options = plan;
  const checks = [];
  if (["min", "max", "gt", "gte", "lt", "lte"].some((key) => {
    const bound = options[key];
    return bound !== void 0 && typeof bound !== "number";
  })) return "false";
  if (plan.kind === "string") {
    if (options.trim || options.pattern) return "false";
    checks.push(`typeof ${value}==="string"`);
    if (options.min !== void 0) checks.push(`!(${value}.length<${String(options.min)})`);
    if (options.max !== void 0) checks.push(`!(${value}.length>${String(options.max)})`);
  } else if (plan.kind === "number") {
    const finite = options.integer ? `Number.isSafeInteger(${value})` : `Number.isFinite(${value})`;
    checks.push(`(typeof ${value}==="string"?(${value}.length===1?(${value}>="0"&&${value}<="9"&&(${value}=+${value},true)):decimal.test(${value})&&(${value}=+${value},${finite})):typeof ${value}==="number"&&${finite})`);
    for (const [key, operator] of [["gt", "<="], ["gte", "<"], ["lt", ">="], ["lte", ">"]])
      if (options[key] !== void 0) {
        const bound = options[key];
        if (options.integer && (key === "gt" && bound < -Number.MAX_SAFE_INTEGER || key === "gte" && bound <= -Number.MAX_SAFE_INTEGER || key === "lt" && bound > Number.MAX_SAFE_INTEGER || key === "lte" && bound >= Number.MAX_SAFE_INTEGER)) continue;
        checks.push(`!(${value}${operator}${String(bound)})`);
      }
  } else if (plan.kind === "boolean") {
    return `typeof ${value}==="boolean"||(${value}==="false"||${value}==="0"?(${value}=false,true):${value}==="true"||${value}==="1"?(${value}=true,true):false)`;
  } else return "false";
  return checks.join("&&");
}
function compiledRemainder(raw, start, output, keys, validators, first) {
  let issues;
  for (let i = start; i < keys.length; i++) {
    const key = keys[i];
    const result = i === start && first ? first : validators[i](
      i === start ? output[key] : own(raw, key) ? raw[key] : void 0
    );
    if (result.issues) issues = appendCompiledIssues(issues, result.issues, key);
    else if (result.value !== void 0 || own(raw, key)) output[key] = result.value;
    else delete output[key];
  }
  return issues ? { issues } : { value: output };
}
function compileArray(plan, validate) {
  const options = plan;
  const inner = plan.inner;
  const innerPlan = inner === validateString ? { kind: "string" } : inner === validateBoolean ? { kind: "boolean" } : inner[fieldPlan];
  return new Function("base", "inner", "options", "fail", "decimal", "append", `return function(input){
if(input===undefined||input===null)return base(input);
if(${options.wrapScalar === false}&&!Array.isArray(input))return fail("Expected an array","invalid_type");
const inputs=Array.isArray(input)?input:[input];
if(${options.min !== void 0}&&inputs.length<options.min)return fail("Expected at least "+options.min+" items");
if(${options.max !== void 0}&&inputs.length>options.max)return fail("Expected at most "+options.max+" items");
const output=[];let issues;
for(let i=0;i<inputs.length;i++){
const rawItem=inputs[i];let item=rawItem;
if(${compiledCheck(innerPlan, "item")})output.push(item);
else{const result=inner(rawItem);if(result.issues)issues=append(issues,result.issues,i);else output.push(result.value);}
}
return issues?{issues}:{value:output};}`)(validate, inner, options, fail, decimal, appendCompiledIssues);
}
// @__NO_SIDE_EFFECTS__
function compile(s) {
  if (s.meta.unknownKeys !== "strip" || s.meta.inner) return s;
  const keys = Object.keys(s.shape);
  const validators = keys.map((key) => s.shape[key]["~standard"].validate);
  try {
    const plans = validators.map((validate2) => validate2 === validateString ? { kind: "string" } : validate2 === validateBoolean ? { kind: "boolean" } : validate2[fieldPlan]);
    const compiledValidators = validators.map((validate2, i) => plans[i]?.kind === "array" ? compileArray(plans[i], validate2) : validate2);
    const statements = keys.map((key, i) => {
      const property = JSON.stringify(key);
      const prefix = `var v${i}=own(raw,${property})?raw[${property}]:undefined;`;
      if (plans[i]?.kind === "array") return `${prefix}const r${i}=validators[${i}](v${i});
if(r${i}.issues){first=r${i};start=${i};break fast;}
v${i}=r${i}.value;
if(v${i}===undefined&&!own(raw,${property})){first=r${i};start=${i};break fast;}`;
      return `${prefix}if(!(${compiledCheck(plans[i], `v${i}`)})){start=${i};break fast;}`;
    });
    const properties = keys.map((key, i) => `${key === "__proto__" ? `[${JSON.stringify(key)}]` : JSON.stringify(key)}:v${i}`).join(",");
    const validate = new Function(
      "fail",
      "decimal",
      "remainder",
      "keys",
      "validators",
      "own",
      `return function(raw){
if(typeof raw!=="object"||raw===null||Array.isArray(raw))return fail("Expected an object","invalid_type");
let start,first;
fast:{${statements.join("\n")}
return {value:{${properties}}};}
return remainder(raw,start,{${properties}},keys,validators,first);}`
    )(fail, decimal, compiledRemainder, keys, compiledValidators, own);
    return { ...s, "~standard": { ...s["~standard"], validate } };
  } catch {
    return s;
  }
}
// @__NO_SIDE_EFFECTS__
function union(options, config = {}) {
  const branches = Object.freeze([...options]);
  return schema({ kind: "union", options: branches, description: config.description }, (input) => {
    let issues;
    for (let i = 0; i < branches.length; i++) {
      const result = branches[i]["~standard"].validate(input);
      if (!result.issues) return result;
      (issues ??= []).push(...result.issues);
    }
    return { issues };
  });
}
// @__NO_SIDE_EFFECTS__
function xor(options, config = {}) {
  const branches = Object.freeze([...options]);
  return schema({ kind: "xor", options: branches, description: config.description }, (input) => {
    let success;
    for (const s of branches) {
      const result = s["~standard"].validate(input);
      if (!result.issues) {
        if (success) return fail("Expected exactly one matching schema");
        success = result;
      }
    }
    return success ?? fail("No matching schema");
  });
}
// @__NO_SIDE_EFFECTS__
function discriminatedUnion(key, options, config = {}) {
  const lookup = /* @__PURE__ */ new Map();
  for (const option of options) {
    const values = option.shape[key]?.meta.enumValues;
    if (!values?.length) throw new TypeError("Discriminator must be an enum or literal");
    for (const value of values) {
      if (lookup.has(value)) throw new TypeError(`Duplicate discriminator: ${value}`);
      lookup.set(value, option);
    }
  }
  return schema(
    {
      kind: "union",
      discriminator: key,
      options: Object.freeze([...options]),
      description: config.description
    },
    (input) => {
      if (typeof input !== "object" || input === null || !own(input, key))
        return fail(`Missing discriminator: ${key}`);
      const selected = lookup.get(input[key]);
      return selected ? selected["~standard"].validate(input) : { issues: [{ message: `Invalid discriminator: ${key}`, path: [key] }] };
    }
  );
}
// @__NO_SIDE_EFFECTS__
function intersection(a, b, config = {}) {
  return schema(
    { kind: "intersection", options: [a, b], description: config.description },
    (input) => {
      const left = a["~standard"].validate(input);
      const right = b["~standard"].validate(input);
      if (left.issues || right.issues)
        return { issues: [...left.issues ?? [], ...right.issues ?? []] };
      if (typeof left.value !== "object" || left.value === null || typeof right.value !== "object" || right.value === null)
        return fail("Intersections require object outputs");
      for (const key of Object.keys(left.value))
        if (own(right.value, key) && !Object.is(left.value[key], right.value[key]))
          return fail(`Conflicting intersection output: ${key}`);
      return { value: { ...left.value, ...right.value } };
    }
  );
}
function fromEntries(entries) {
  const result = /* @__PURE__ */ Object.create(null);
  for (const [key, value] of entries) {
    if (own(result, key)) {
      const current = result[key];
      if (Array.isArray(current)) current.push(value);
      else result[key] = [current, value];
    } else result[key] = value;
  }
  return result;
}
export {
  ValidationError,
  array,
  boolean,
  compile,
  date,
  discriminatedUnion,
  enum_ as enum,
  enum_,
  fromEntries,
  intersection,
  literal,
  number,
  object,
  parse,
  refine,
  safeParse,
  string,
  transform,
  union,
  xor
};
