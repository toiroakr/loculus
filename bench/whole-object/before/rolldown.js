import { RolldownMagicString } from "rolldown";
//#region src/rolldown.ts
const unsupported = Symbol();
const presenceKeys = [
	"optional",
	"nullable",
	"nullish",
	"description",
	"default"
];
const keys = {
	string: [
		...presenceKeys,
		"min",
		"max",
		"trim"
	],
	number: [
		...presenceKeys,
		"gt",
		"gte",
		"lt",
		"lte",
		"integer"
	],
	boolean: presenceKeys
};
function isNode(value) {
	return value !== null && typeof value === "object" && "type" in value;
}
function walk(node, visit) {
	visit(node);
	for (const [key, value] of Object.entries(node)) {
		if (key === "parent" || key === "comments") continue;
		if (Array.isArray(value)) {
			for (const child of value) if (isNode(child)) walk(child, visit);
		} else if (isNode(value)) walk(value, visit);
	}
}
function name(node) {
	return isNode(node) && node.type === "Identifier" ? node.name : void 0;
}
function literal(node) {
	if (!isNode(node)) return unsupported;
	if (node.type === "Literal" && !node.regex && !node.bigint && (node.value === null || [
		"string",
		"number",
		"boolean"
	].includes(typeof node.value))) return typeof node.value === "number" && !Number.isFinite(node.value) ? unsupported : node.value;
	if (node.type === "Identifier" && node.name === "undefined") return void 0;
	if (node.type === "UnaryExpression" && (node.operator === "-" || node.operator === "+")) {
		const value = literal(node.argument);
		if (typeof value === "number") return node.operator === "-" ? -value : value;
	}
	return unsupported;
}
function properties(node) {
	if (!isNode(node) || node.type !== "ObjectExpression") return;
	const result = Object.create(null);
	for (const property of node.properties) {
		if (property.type !== "Property" || property.computed || property.method || property.kind !== "init") return;
		const key = name(property.key) ?? literal(property.key);
		if (typeof key !== "string" || key === "__proto__" || !isNode(property.value)) return;
		if (Object.hasOwn(result, key)) return;
		result[key] = property.value;
	}
	return result;
}
function options(args, kind) {
	if (!args.length || args.length === 1 && literal(args[0]) === void 0) return {};
	if (args.length !== 1) return;
	const props = properties(args[0]);
	if (!props) return;
	const result = Object.create(null);
	for (const [key, node] of Object.entries(props)) {
		if (!keys[kind].includes(key)) return;
		let value = literal(node);
		if (key === "default" && value === unsupported) {
			const targets = properties(node);
			if (!targets || !Object.keys(targets).length || Object.keys(targets).some((key) => ![
				"undefined",
				"null",
				"nullish"
			].includes(key)) || "nullish" in targets && Object.keys(targets).length > 1) return;
			const values = Object.create(null);
			for (const [key, target] of Object.entries(targets)) {
				const value = literal(target);
				if (value === unsupported) return;
				values[key] = value;
			}
			result[key] = values;
			continue;
		}
		if (value === unsupported) return;
		if ([
			"optional",
			"nullable",
			"nullish",
			"trim",
			"integer"
		].includes(key) && value !== void 0 && typeof value !== "boolean") return;
		if (key === "description" && value !== void 0 && typeof value !== "string") return;
		if ([
			"min",
			"max",
			"gt",
			"gte",
			"lt",
			"lte"
		].includes(key) && value !== void 0 && typeof value !== "number") return;
		result[key] = value;
	}
	return result;
}
function emit(value) {
	return value === void 0 ? "void 0" : Object.is(value, -0) ? "-0" : JSON.stringify(value);
}
function failure(message, code = "invalid_value") {
	return `return {issues:[{message:${JSON.stringify(message)},code:${JSON.stringify(code)}}]};`;
}
function generate(kind, opts, validator, decimal) {
	let missing;
	let nil = null;
	let defaults = 0;
	const value = opts.default;
	if (value !== void 0) {
		if (value !== null && typeof value === "object") {
			const nullish = "nullish" in value;
			defaults = (nullish || "undefined" in value ? 1 : 0) | (nullish || "null" in value ? 2 : 0);
			missing = nullish ? value.nullish : value.undefined;
			if (defaults & 2) nil = nullish ? value.nullish : value.null;
		} else {
			defaults = 1;
			missing = value;
		}
	}
	const optional = !!(opts.optional || opts.nullish || defaults & 1);
	const nullable = !!(opts.nullable || opts.nullish || defaults & 2);
	let meta = `kind:${JSON.stringify(kind)},description:${emit(opts.description)}`;
	if (opts.optional || opts.nullable || opts.nullish || value !== void 0) {
		meta += `,optional:${optional},nullable:${nullable}`;
		if (defaults & 1) meta += `,defaultValue:${emit(missing)}`;
	}
	let body = "";
	if (optional) body += `if(value===void 0)return {value:${emit(missing)}};`;
	if (nullable) body += `if(value===null)return {value:${emit(nil)}};`;
	if (kind === "string") {
		body += `if(typeof value!=="string"){${failure("Expected a string", "invalid_type")}}`;
		if (opts.trim) body += "value=value.trim();";
		if (opts.min !== void 0) body += `if(value.length<${emit(opts.min)}){${failure(`Expected at least ${opts.min} characters`)}}`;
		if (opts.max !== void 0) body += `if(value.length>${emit(opts.max)}){${failure(`Expected at most ${opts.max} characters`)}}`;
		body += "return {value};";
	} else if (kind === "number") {
		body += `if(typeof value!=="number"){if(typeof value!=="string"||!${decimal}.test(value)){${failure("Expected a decimal number", "invalid_type")}}value=Number(value);}`;
		body += `if(!Number.isFinite(value)){${failure("Expected a finite number")}}`;
		if (opts.integer) body += `if(!Number.isSafeInteger(value)){${failure("Expected a safe integer")}}`;
		for (const [key, operator, message] of [
			[
				"gt",
				"<=",
				"Expected greater than"
			],
			[
				"gte",
				"<",
				"Expected at least"
			],
			[
				"lt",
				">=",
				"Expected less than"
			],
			[
				"lte",
				">",
				"Expected at most"
			]
		]) if (opts[key] !== void 0) body += `if(value${operator}${emit(opts[key])}){${failure(`${message} ${opts[key]}`)}}`;
		body += "return {value};";
	} else {
		body += "if(value===true||value===\"true\"||value===\"1\")return {value:true};";
		body += "if(value===false||value===\"false\"||value===\"0\")return {value:false};";
		body += failure("Expected true, false, 1 or 0", "invalid_type");
	}
	return {
		expression: `({meta:{${meta}},"~standard":{version:1,vendor:"loculus",validate:${validator}},field:true})`,
		body
	};
}
function loculusPlugin(opts = {}) {
	const modules = new Set(opts.modules ?? ["loculus"]);
	return {
		name: "loculus:codegen",
		transform(code, id) {
			if (!/\.[cm]?[jt]sx?(?:\?|$)/.test(id) || id.includes("/node_modules/") || opts.include && !opts.include(id)) return;
			const extension = /\.([cm]?[jt]sx?)(?:\?|$)/.exec(id)?.[1] ?? "js";
			const ast = this.parse(code, { lang: extension.endsWith("tsx") ? "tsx" : extension.endsWith("jsx") ? "jsx" : extension.includes("t") ? "ts" : "js" });
			const imports = /* @__PURE__ */ new Map();
			let insert = 0;
			for (const statement of ast.body) {
				if (statement.type === "ExpressionStatement" && statement.directive) insert = statement.end;
				if (statement.type !== "ImportDeclaration") continue;
				insert = statement.end;
				if (!isNode(statement.source) || !modules.has(statement.source.value) || statement.importKind === "type") continue;
				for (const specifier of statement.specifiers) {
					const local = name(specifier.local);
					if (!local || specifier.importKind === "type") continue;
					if (specifier.type === "ImportNamespaceSpecifier") imports.set(local, "*");
					const imported = name(specifier.imported);
					if (imported && Object.hasOwn(keys, imported)) imports.set(local, imported);
				}
			}
			if (!imports.size) return;
			const identifiers = /* @__PURE__ */ new Set();
			const bindings = /* @__PURE__ */ new Set();
			let unsafe = false;
			const bind = (node) => {
				if (!isNode(node)) return;
				walk(node, (node) => {
					if (node.type === "Identifier") bindings.add(node.name);
				});
			};
			walk(ast, (node) => {
				if (node.type === "Identifier") identifiers.add(node.name);
				if (node.type === "VariableDeclarator") bind(node.id);
				if (node.type.includes("Function") || node.type === "ArrowFunctionExpression") {
					bind(node.id);
					for (const param of node.params ?? []) bind(param);
				}
				if (node.type === "ClassDeclaration" || node.type === "ClassExpression") bind(node.id);
				if (node.type === "CatchClause") bind(node.param);
				if (node.type.startsWith("Import") && node.type.endsWith("Specifier") && !imports.has(name(node.local) ?? "")) bind(node.local);
				if (node.type === "WithStatement" || node.type === "CallExpression" && name(node.callee) === "eval") unsafe = true;
			});
			if (unsafe) return;
			for (const binding of bindings) imports.delete(binding);
			let sequence = 0;
			const unique = () => {
				let value;
				do
					value = `__loculus_${sequence++}`;
				while (identifiers.has(value));
				identifiers.add(value);
				return value;
			};
			const decimal = unique();
			let needsDecimal = false;
			const helpers = /* @__PURE__ */ new Map();
			const expressions = /* @__PURE__ */ new Map();
			const output = new RolldownMagicString(code);
			let changed = false;
			walk(ast, (node) => {
				if (node.type !== "CallExpression" || node.optional) return;
				const callee = node.callee;
				let kind = imports.get(name(callee) ?? "");
				if (isNode(callee) && callee.type === "MemberExpression" && !callee.computed && !callee.optional && imports.get(name(callee.object) ?? "") === "*") {
					const member = name(callee.property);
					kind = member && Object.hasOwn(keys, member) ? member : void 0;
				}
				if (!kind || kind === "*" || kind === "number" && bindings.has("Number") || bindings.has("undefined")) return;
				const config = options(node.arguments, kind);
				if (!config) return;
				const candidate = generate(kind, config, "", decimal);
				let helper = helpers.get(candidate.body);
				if (!helper) {
					helper = {
						name: unique(),
						body: candidate.body
					};
					helpers.set(candidate.body, helper);
				}
				const expression = generate(kind, config, helper.name, decimal).expression;
				const entry = expressions.get(expression) ?? { nodes: [] };
				entry.nodes.push(node);
				expressions.set(expression, entry);
				if (kind === "number") needsDecimal = true;
				changed = true;
			});
			if (!changed) return;
			let generated = "\n";
			if (needsDecimal) generated += `const ${decimal}=/^[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?$/;\n`;
			for (const helper of helpers.values()) generated += `function ${helper.name}(value){${helper.body}}\n`;
			for (const [expression, entry] of expressions) {
				if (entry.nodes.length > 1) {
					entry.factory = unique();
					generated += `/* @__NO_SIDE_EFFECTS__ */ function ${entry.factory}(){return ${expression};}\n`;
				}
				for (const node of entry.nodes) output.overwrite(node.start, node.end, entry.factory ? `/* @__PURE__ */ ${entry.factory}()` : expression);
			}
			output.appendLeft(insert, generated);
			return { code: output };
		}
	};
}
//#endregion
export { loculusPlugin };
