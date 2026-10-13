//#region src/index.ts
function schema(meta, validate) {
	return {
		meta,
		"~standard": {
			version: 1,
			vendor: "loculus",
			validate
		}
	};
}
function field(meta, validate) {
	return {
		meta,
		"~standard": {
			version: 1,
			vendor: "loculus",
			validate
		},
		field: true
	};
}
function fail(message, code = "invalid_value") {
	return { issues: [{
		message,
		code
	}] };
}
function safeParse(schema, value) {
	return schema["~standard"].validate(value);
}
var ValidationError = class extends Error {
	issues;
	constructor(issues) {
		super(issues.map((i) => `${i.path?.map((p) => typeof p === "object" ? String(p.key) : String(p)).join(".") ?? ""}: ${i.message}`).join("; "));
		this.issues = issues;
		this.name = "ValidationError";
	}
};
function parse(schema, value) {
	const result = safeParse(schema, value);
	if (result.issues) throw new ValidationError(result.issues);
	return result.value;
}
const fieldPlan = Symbol();
function plannedField(meta, options, validate, innerValidate) {
	validate[fieldPlan] = {
		kind: meta.kind,
		enum: !!meta.enumValues,
		inner: innerValidate,
		options
	};
	return field(meta, validate);
}
function configuredField(meta, options, validate, innerValidate) {
	if (!(options.optional || options.nullable || options.nullish || own(options, "default"))) return plannedField(meta, options, validate, innerValidate);
	let hasUndefinedDefault = false;
	let hasNullDefault = false;
	let undefinedDefault;
	let nullDefault;
	if (own(options, "default") && options.default !== void 0) {
		const value = options.default;
		if (typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
			const targets = value;
			const keys = Object.keys(targets);
			if (!keys.length || keys.some((key) => key !== "undefined" && key !== "null" && key !== "nullish")) throw new TypeError("Default targets must specify undefined, null or nullish");
			const nullish = own(targets, "nullish");
			if (nullish && keys.length > 1) throw new TypeError("nullish defaults cannot be combined with undefined or null defaults");
			hasUndefinedDefault = nullish || own(targets, "undefined");
			hasNullDefault = nullish || own(targets, "null");
			undefinedDefault = nullish ? targets.nullish : targets.undefined;
			nullDefault = nullish ? targets.nullish : targets.null;
		} else {
			hasUndefinedDefault = true;
			undefinedDefault = value;
		}
	}
	const optional = options.optional || options.nullish || hasUndefinedDefault;
	const nullable = options.nullable || options.nullish || hasNullDefault;
	const run = !optional && !nullable ? validate : (value) => {
		if (value === void 0 && optional) return { value: hasUndefinedDefault ? undefinedDefault : void 0 };
		if (value === null && nullable) return { value: hasNullDefault ? nullDefault : null };
		return validate(value);
	};
	const resolved = meta;
	resolved.optional = optional;
	resolved.nullable = nullable;
	if (hasUndefinedDefault) resolved.defaultValue = undefinedDefault;
	return plannedField(meta, options, run, innerValidate);
}
/* @__NO_SIDE_EFFECTS__ */
function string(options = {}) {
	options = { ...options };
	return configuredField({
		kind: "string",
		optional: false,
		nullable: false,
		description: options.description
	}, options, (value) => {
		if (typeof value !== "string") return fail("Expected a string", "invalid_type");
		const output = options.trim ? value.trim() : value;
		if (options.min !== void 0 && output.length < options.min) return fail(`Expected at least ${options.min} characters`);
		if (options.max !== void 0 && output.length > options.max) return fail(`Expected at most ${options.max} characters`);
		if (options.pattern) {
			const pattern = options.pattern;
			const previous = pattern.lastIndex;
			pattern.lastIndex = 0;
			const valid = pattern.test(output);
			pattern.lastIndex = previous;
			if (!valid) return fail("Invalid format");
		}
		return { value: output };
	});
}
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
/* @__NO_SIDE_EFFECTS__ */
function number(options = {}) {
	options = { ...options };
	return configuredField({
		kind: "number",
		optional: false,
		nullable: false,
		description: options.description
	}, options, (value) => {
		if (typeof value !== "number") {
			if (typeof value !== "string" || !decimal.test(value)) return fail("Expected a decimal number", "invalid_type");
			value = Number(value);
		}
		const output = value;
		if (!Number.isFinite(output)) return fail("Expected a finite number");
		if (options.integer && !Number.isSafeInteger(output)) return fail("Expected a safe integer");
		if (options.gt !== void 0 && output <= options.gt) return fail(`Expected greater than ${options.gt}`);
		if (options.gte !== void 0 && output < options.gte) return fail(`Expected at least ${options.gte}`);
		if (options.lt !== void 0 && output >= options.lt) return fail(`Expected less than ${options.lt}`);
		if (options.lte !== void 0 && output > options.lte) return fail(`Expected at most ${options.lte}`);
		return { value: output };
	});
}
/* @__NO_SIDE_EFFECTS__ */
function boolean(options = {}) {
	options = { ...options };
	return configuredField({
		kind: "boolean",
		optional: false,
		nullable: false,
		description: options.description
	}, options, (value) => {
		if (value === true || value === "true" || value === "1") return { value: true };
		if (value === false || value === "false" || value === "0") return { value: false };
		return fail("Expected true, false, 1 or 0", "invalid_type");
	});
}
/* @__NO_SIDE_EFFECTS__ */
function enum_(values, options = {}) {
	options = { ...options };
	const choices = Object.freeze([...values]);
	const allowed = new Set(choices);
	return configuredField({
		kind: "string",
		enumValues: choices,
		optional: false,
		nullable: false,
		description: options.description
	}, options, (value) => {
		return typeof value === "string" && allowed.has(value) ? { value } : fail(`Expected one of: ${choices.join(", ")}`);
	});
}
/* @__NO_SIDE_EFFECTS__ */
function literal(value, options = {}) {
	return /* @__PURE__ */ enum_([value], options);
}
/* @__NO_SIDE_EFFECTS__ */
function date(options = {}) {
	options = { ...options };
	return configuredField({
		kind: "date",
		optional: false,
		nullable: false,
		description: options.description
	}, options, (value) => {
		if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return fail("Expected an ISO date");
		const output = new Date(value);
		if (!Number.isFinite(output.getTime()) || (/* @__PURE__ */ new Date(value.slice(0, 10) + "T00:00:00.000Z")).toISOString().slice(0, 10) !== value.slice(0, 10)) return fail("Invalid date");
		return { value: output };
	});
}
/* @__NO_SIDE_EFFECTS__ */
function array(s, options = {}) {
	options = { ...options };
	if (s.meta.kind === "array") throw new TypeError("Nested arrays are unsupported");
	const innerValidate = s["~standard"].validate;
	return configuredField({
		kind: "array",
		inner: s,
		enumValues: s.meta.enumValues,
		optional: false,
		nullable: false,
		description: options.description
	}, options, (value) => {
		if (options.wrapScalar === false && !Array.isArray(value)) return fail("Expected an array", "invalid_type");
		const inputs = Array.isArray(value) ? value : [value];
		if (options.min !== void 0 && inputs.length < options.min) return fail(`Expected at least ${options.min} items`);
		if (options.max !== void 0 && inputs.length > options.max) return fail(`Expected at most ${options.max} items`);
		const output = [];
		let issues;
		for (let i = 0; i < inputs.length; i++) {
			const result = innerValidate(inputs[i]);
			if (result.issues) for (const issue of result.issues) (issues ??= []).push({
				...issue,
				path: [i, ...issue.path ?? []]
			});
			else output.push(result.value);
		}
		return issues ? { issues } : { value: output };
	}, innerValidate);
}
/* @__NO_SIDE_EFFECTS__ */
function transform(s, fn) {
	const validate = (value) => {
		const result = s["~standard"].validate(value);
		return result.issues ? result : { value: fn(result.value) };
	};
	const meta = {
		...s.meta,
		inner: s
	};
	return "field" in s ? field(meta, validate) : schema(meta, validate);
}
/* @__NO_SIDE_EFFECTS__ */
function refine(s, check, message) {
	const validate = (value) => {
		const result = s["~standard"].validate(value);
		return result.issues || check(result.value) ? result : fail(message, "custom");
	};
	return {
		...s,
		"~standard": {
			...s["~standard"],
			validate
		},
		meta: {
			...s.meta,
			inner: s
		}
	};
}
const own = Object.hasOwn;
/* @__NO_SIDE_EFFECTS__ */
function object(shape, options = {}) {
	const fields = Object.freeze({ ...shape });
	const keys = Object.keys(fields);
	const validators = [];
	for (const key of keys) {
		const s = fields[key];
		if (s.field !== true) throw new TypeError(`Expected field: ${key}`);
		validators.push(s["~standard"].validate);
	}
	const mode = options.unknownKeys ?? "strip";
	const validate = (input) => {
		if (typeof input !== "object" || input === null || Array.isArray(input)) return fail("Expected an object", "invalid_type");
		const raw = input;
		const output = {};
		let issues;
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			const value = own(raw, key) ? raw[key] : void 0;
			const result = validators[i](value);
			if (result.issues) {
				issues ??= [];
				for (const issue of result.issues) issues.push({
					...issue,
					path: [key, ...issue.path ?? []]
				});
			} else if (result.value !== void 0 || own(raw, key)) {
				if (key === "__proto__") Object.defineProperty(output, key, {
					value: result.value,
					enumerable: true,
					writable: true,
					configurable: true
				});
				else output[key] = result.value;
			}
		}
		if (mode !== "strip") {
			for (const key of Object.keys(raw)) if (!own(fields, key)) {
				if (mode === "strict") (issues ??= []).push({
					message: `Unknown key: ${key}`,
					code: "unrecognized_key",
					path: [key]
				});
				else Object.defineProperty(output, key, {
					value: raw[key],
					enumerable: true,
					writable: true,
					configurable: true
				});
			}
		}
		return issues ? { issues } : { value: output };
	};
	return {
		meta: {
			kind: "object",
			shape: fields,
			unknownKeys: mode,
			description: options.description
		},
		"~standard": {
			version: 1,
			vendor: "loculus",
			validate
		},
		shape: fields
	};
}
function appendCompiledIssues(issues, errors, path) {
	issues ??= [];
	for (const issue of errors) issues.push({
		...issue,
		path: [...path, ...issue.path ?? []]
	});
	return issues;
}
function compiledCheck(plan, value) {
	if (!plan || plan.enum) return "false";
	const options = plan.options;
	const checks = [];
	if ([
		"min",
		"max",
		"gt",
		"gte",
		"lt",
		"lte"
	].some((key) => {
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
		checks.push(`(typeof ${value}==="string"?(${value}.length===1?((${value}=${value}.charCodeAt(0)-48)>=0&&${value}<10):decimal.test(${value})&&(${value}=+${value},${finite})):typeof ${value}==="number"&&${finite})`);
		for (const [key, operator] of [
			["gt", "<="],
			["gte", "<"],
			["lt", ">="],
			["lte", ">"]
		]) if (options[key] !== void 0) {
			const bound = options[key];
			if (options.integer && (key === "gt" && bound < -Number.MAX_SAFE_INTEGER || key === "gte" && bound <= -Number.MAX_SAFE_INTEGER || key === "lt" && bound > Number.MAX_SAFE_INTEGER || key === "lte" && bound >= Number.MAX_SAFE_INTEGER)) continue;
			checks.push(`!(${value}${operator}${String(bound)})`);
		}
	} else if (plan.kind === "boolean") return `typeof ${value}==="boolean"||(${value}==="false"||${value}==="0"?(${value}=false,true):${value}==="true"||${value}==="1"?(${value}=true,true):false)`;
	else return "false";
	return checks.join("&&");
}
function compiledValue(result, key, raw, context) {
	if (result.issues) context.issues = appendCompiledIssues(context.issues, result.issues, [key]);
	else if (result.value !== void 0 || own(raw, key)) return result.value;
	else (context.missing ??= /* @__PURE__ */ new Set()).add(key);
}
function compileArray(plan, validate) {
	const options = plan.options;
	const inner = plan.inner;
	const innerPlan = inner[fieldPlan];
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
else{const result=inner(rawItem);if(result.issues)issues=append(issues,result.issues,[i]);else output.push(result.value);}
}
return issues?{issues}:{value:output};}`)(validate, inner, options, fail, decimal, appendCompiledIssues);
}
/* @__NO_SIDE_EFFECTS__ */
function compile(s) {
	if (s.meta.unknownKeys !== "strip" || s.meta.inner) return s;
	const keys = Object.keys(s.shape);
	const validators = keys.map((key) => s.shape[key]["~standard"].validate);
	try {
		const plans = validators.map((validate) => validate[fieldPlan]);
		const compiledValidators = validators.map((validate, i) => plans[i]?.kind === "array" ? compileArray(plans[i], validate) : validate);
		const statements = keys.map((key, i) => {
			const property = JSON.stringify(key);
			const prefix = `const input${i}=Object.prototype.hasOwnProperty.call(raw,${property})?raw[${property}]:undefined;let v${i}=input${i};`;
			if (plans[i]?.kind === "array") return `${prefix}const result${i}=validate${i}(input${i});
if(result${i}.issues)v${i}=resolve(result${i},${property},raw,context??={issues:undefined,missing:undefined});
else{v${i}=result${i}.value;if(v${i}===undefined&&!Object.prototype.hasOwnProperty.call(raw,${property})){context??={issues:undefined,missing:undefined};(context.missing??=new Set()).add(${property});}}`;
			return `${prefix}
if(!(${compiledCheck(plans[i], `v${i}`)}))v${i}=resolve(validate${i}(input${i}),${property},raw,context??={issues:undefined,missing:undefined});`;
		});
		const properties = keys.map((key, i) => `${key === "__proto__" ? `[${JSON.stringify(key)}]` : JSON.stringify(key)}:v${i}`).join(",");
		const additions = keys.map((key, i) => {
			const assignment = key === "__proto__" ? `Object.defineProperty(output,${JSON.stringify(key)},{value:v${i},enumerable:true,writable:true,configurable:true});` : `output[${JSON.stringify(key)}]=v${i};`;
			return `if(!context.missing.has(${JSON.stringify(key)})){${assignment}}`;
		}).join("");
		const validate = new Function("fail", "decimal", "resolve", ...keys.map((_, i) => `validate${i}`), `return function(raw){
if(typeof raw!=="object"||raw===null||Array.isArray(raw))return fail("Expected an object","invalid_type");
let context;${statements.join("\n")}
if(context?.issues)return {issues:context.issues};
if(!context?.missing)return {value:{${properties}}};
const output={};${additions}return {value:output};}`)(fail, decimal, compiledValue, ...compiledValidators);
		return {
			...s,
			"~standard": {
				...s["~standard"],
				validate
			}
		};
	} catch {
		return s;
	}
}
/* @__NO_SIDE_EFFECTS__ */
function union(options, config = {}) {
	const branches = Object.freeze([...options]);
	return schema({
		kind: "union",
		options: branches,
		description: config.description
	}, (input) => {
		const issues = [];
		for (const s of branches) {
			const result = s["~standard"].validate(input);
			if (!result.issues) return result;
			issues.push(...result.issues);
		}
		return { issues };
	});
}
/* @__NO_SIDE_EFFECTS__ */
function xor(options, config = {}) {
	const branches = Object.freeze([...options]);
	return schema({
		kind: "xor",
		options: branches,
		description: config.description
	}, (input) => {
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
/* @__NO_SIDE_EFFECTS__ */
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
	return schema({
		kind: "union",
		discriminator: key,
		options: Object.freeze([...options]),
		description: config.description
	}, (input) => {
		if (typeof input !== "object" || input === null || !own(input, key)) return fail(`Missing discriminator: ${key}`);
		const selected = lookup.get(input[key]);
		return selected ? selected["~standard"].validate(input) : { issues: [{
			message: `Invalid discriminator: ${key}`,
			path: [key]
		}] };
	});
}
/* @__NO_SIDE_EFFECTS__ */
function intersection(a, b, config = {}) {
	return schema({
		kind: "intersection",
		options: [a, b],
		description: config.description
	}, (input) => {
		const left = a["~standard"].validate(input);
		const right = b["~standard"].validate(input);
		if (left.issues || right.issues) return { issues: [...left.issues ?? [], ...right.issues ?? []] };
		if (typeof left.value !== "object" || left.value === null || typeof right.value !== "object" || right.value === null) return fail("Intersections require object outputs");
		for (const key of Object.keys(left.value)) if (own(right.value, key) && !Object.is(left.value[key], right.value[key])) return fail(`Conflicting intersection output: ${key}`);
		return { value: {
			...left.value,
			...right.value
		} };
	});
}
function fromEntries(entries) {
	const result = Object.create(null);
	for (const [key, value] of entries) if (own(result, key)) {
		const current = result[key];
		if (Array.isArray(current)) current.push(value);
		else result[key] = [current, value];
	} else result[key] = value;
	return result;
}
//#endregion
export { ValidationError, array, boolean, compile, date, discriminatedUnion, enum_ as enum, enum_, fromEntries, intersection, literal, number, object, parse, refine, safeParse, string, transform, union, xor };
