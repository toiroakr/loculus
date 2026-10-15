import { RolldownMagicString, type Plugin } from 'rolldown';

export interface LoculusPluginOptions {
  readonly modules?: readonly string[];
  readonly include?: (id: string) => boolean;
  readonly objects?: 'auto' | 'unroll' | 'loop' | 'chunked' | false;
}

interface Node {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}
type Scalar = string | number | boolean | null | undefined;
type Options = Record<string, Scalar | Record<string, Scalar>>;
const unsupported = Symbol();
const presenceKeys = ['optional', 'nullable', 'nullish', 'description', 'default'];
const keys = {
  string: [...presenceKeys, 'min', 'max', 'trim'],
  number: [...presenceKeys, 'gt', 'gte', 'lt', 'lte', 'integer'],
  boolean: presenceKeys,
};
type Kind = keyof typeof keys;
type Factory = Kind | 'object' | 'array' | 'enum' | 'literal' | 'date' | 'transform' | 'refine';
type LiteralValue = string | number | boolean;
interface ScalarSpec {
  kind: Kind;
  opts: Options;
  literals?: { values: LiteralValue[]; multiple: boolean };
}
interface ArraySpec { inner: ScalarSpec; opts: Record<string, Scalar> }
interface FieldSpec { scalar?: ScalarSpec; node: Node }
interface ObjectSpec {
  fields: Record<string, FieldSpec>;
  mode: 'strip' | 'strict' | 'passthrough';
  description: Scalar;
}
const factories = new Set<Factory>(['string', 'number', 'boolean', 'object', 'array', 'enum', 'literal', 'date', 'transform', 'refine']);

function isNode(value: unknown): value is Node {
  return value !== null && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string';
}
function unwrap(node: Node): Node {
  while (['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'ParenthesizedExpression', 'TSTypeAssertion'].includes(node.type) && isNode(node.expression)) node = node.expression;
  return node;
}
function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'comments') continue;
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) walk(child, visit);
    } else if (isNode(value)) walk(value, visit);
  }
}
function name(node: unknown): string | undefined {
  return isNode(node) && node.type === 'Identifier' ? node.name as string : undefined;
}
function literal(node: unknown): Scalar | typeof unsupported {
  if (!isNode(node)) return unsupported;
  node = unwrap(node);
  if (!isNode(node)) return unsupported;
  if (node.type === 'Literal' && !node.regex && !node.bigint &&
      (node.value === null || ['string', 'number', 'boolean'].includes(typeof node.value)))
    return typeof node.value === 'number' && !Number.isFinite(node.value) ? unsupported : node.value as Scalar;
  if (node.type === 'Identifier' && node.name === 'undefined') return undefined;
  if (node.type === 'UnaryExpression' && node.operator === 'void' && literal(node.argument) !== unsupported) return undefined;
  if (node.type === 'UnaryExpression' && (node.operator === '-' || node.operator === '+')) {
    const value = literal(node.argument);
    if (typeof value === 'number') return node.operator === '-' ? -value : value;
  }
  return unsupported;
}
function properties(node: unknown): Record<string, Node> | undefined {
  if (!isNode(node)) return;
  node = unwrap(node);
  if (!isNode(node) || node.type !== 'ObjectExpression') return;
  const result: Record<string, Node> = Object.create(null);
  for (const property of node.properties as Node[]) {
    if (property.type !== 'Property' || property.computed || property.method || property.kind !== 'init') return;
    const key = name(property.key) ?? literal(property.key);
    if (typeof key !== 'string' || key === '__proto__' || !isNode(property.value)) return;
    if (Object.hasOwn(result, key)) return;
    result[key] = property.value;
  }
  return result;
}
function shapeProperties(node: unknown): Record<string, Node> | undefined {
  if (!isNode(node)) return;
  node = unwrap(node);
  if (!isNode(node) || node.type !== 'ObjectExpression') return;
  const result: Record<string, Node> = Object.create(null);
  for (const property of node.properties as Node[]) {
    if (property.type !== 'Property' || property.method || property.kind !== 'init') return;
    const key = property.computed ? literal(property.key) : name(property.key) ?? literal(property.key);
    if ((typeof key !== 'string' && typeof key !== 'number') || (key === '__proto__' && !property.computed) || !isNode(property.value)) return;
    if (Object.hasOwn(result, String(key))) return;
    result[String(key)] = property.value;
  }
  return result;
}
function objectOptions(args: unknown[]): Pick<ObjectSpec, 'mode' | 'description'> | undefined {
  if (args.length === 1 || (args.length === 2 && literal(args[1]) === undefined)) return { mode: 'strict', description: undefined };
  if (args.length !== 2) return;
  const props = properties(args[1]);
  if (!props || Object.keys(props).some(key => key !== 'unknownKeys' && key !== 'description')) return;
  const mode = props.unknownKeys ? literal(props.unknownKeys) : undefined;
  const description = props.description ? literal(props.description) : undefined;
  if (mode !== undefined && mode !== 'strip' && mode !== 'strict' && mode !== 'passthrough') return;
  if (description !== undefined && typeof description !== 'string') return;
  return { mode: mode ?? 'strict', description };
}
function options(args: unknown[], kind: Kind): Options | undefined {
  if (!args.length || (args.length === 1 && literal(args[0]) === undefined)) return {};
  if (args.length !== 1) return;
  const props = properties(args[0]);
  if (!props) return;
  const result: Options = Object.create(null);
  for (const [key, node] of Object.entries(props)) {
    if (!keys[kind].includes(key)) return;
    let value = literal(node);
    if (key === 'default' && value === unsupported) {
      const targets = properties(node);
      if (!targets || !Object.keys(targets).length ||
          Object.keys(targets).some(key => !['undefined', 'null', 'nullish'].includes(key)) ||
          ('nullish' in targets && Object.keys(targets).length > 1)) return;
      const values: Record<string, Scalar> = Object.create(null);
      for (const [key, target] of Object.entries(targets)) {
        const value = literal(target);
        if (value === unsupported) return;
        values[key] = value;
      }
      result[key] = values;
      continue;
    }
    if (value === unsupported) return;
    if (['optional', 'nullable', 'nullish', 'trim', 'integer'].includes(key) && value !== undefined && typeof value !== 'boolean') return;
    if (key === 'description' && value !== undefined && typeof value !== 'string') return;
    if (['min', 'max', 'gt', 'gte', 'lt', 'lte'].includes(key) && value !== undefined && typeof value !== 'number') return;
    result[key] = value;
  }
  return result;
}
function emit(value: Scalar): string {
  return value === undefined ? 'void 0' : Object.is(value, -0) ? '-0' : JSON.stringify(value);
}
function issueResult(message: string, code = 'invalid_value'): string {
  return `{issues:[{message:${JSON.stringify(message)},code:${JSON.stringify(code)}}]}`;
}
function failure(message: string, code = 'invalid_value'): string {
  return `return ${issueResult(message,code)};`;
}
function numericConversion(decimal: string): string {
  return `if(typeof value!=="number"){if(typeof value!=="string"||!${decimal}.test(value)){${failure('Expected a decimal number', 'invalid_type')}}value=Number(value);}if(!Number.isFinite(value)){${failure('Expected a finite number')}}`;
}
function literalIssueChecks(choices: NonNullable<ScalarSpec['literals']>, decimal: string): string {
  if (choices.values.every(value => typeof value === 'string')) return '';
  let body = '';
  for (const value of choices.values) {
    const mismatch = issueResult(`Expected one of: ${value}`);
    body += '{let branchResult;';
    if (typeof value === 'number') {
      const finite = issueResult('Expected a finite number');
      body += `if(typeof value==="number")branchResult=Number.isFinite(value)?{value}:${finite};else if(typeof value==="string"&&${decimal}.test(value)){const numeric=Number(value);branchResult=Number.isFinite(numeric)?{value:numeric}:${finite};}else branchResult=${issueResult('Expected a decimal number','invalid_type')};`;
    } else if (typeof value === 'boolean') {
      body += `branchResult=value===true||value==="true"||value==="1"?{value:true}:value===false||value==="false"||value==="0"?{value:false}:${issueResult('Expected true, false, 1 or 0','invalid_type')};`;
    }
    if (typeof value === 'string') body += `branchResult=value===${emit(value)}?{value:${emit(value)}}:${mismatch};`;
    else body += `if(!branchResult.issues)branchResult=branchResult.value===${emit(value)}?{value:${emit(value)}}:${mismatch};`;
    body += choices.multiple ? 'if(!branchResult.issues)return branchResult;}' : 'return branchResult;}';
  }
  if (choices.multiple) body += failure(`Expected one of: ${choices.values.join(', ')}`);
  return `if("issues" in {}){${body}}`;
}
function literalValidation(choices: NonNullable<ScalarSpec['literals']>, decimal: string, checkIssues: boolean): string {
  const { values, multiple } = choices;
  const mismatch = failure(`Expected one of: ${values.join(', ')}`);
  const inherited = checkIssues ? literalIssueChecks(choices, decimal) : '';
  if (!multiple && typeof values[0] === 'number')
    return inherited + numericConversion(decimal) + `if(value===${emit(values[0])})return {value:${emit(values[0])}};` + mismatch;
  if (!multiple && typeof values[0] === 'boolean') {
    const success = `return {value:${emit(values[0])}};`;
    return inherited + `if(value===true||value==="true"||value==="1"){${values[0] ? success : mismatch}}if(value===false||value==="false"||value==="0"){${values[0] ? mismatch : success}}` + failure('Expected true, false, 1 or 0', 'invalid_type');
  }
  let body = inherited;
  const numeric = values.every(value => typeof value === 'number');
  if (numeric) body += `const numeric=typeof value==="number"?value:typeof value==="string"&&${decimal}.test(value)?Number(value):void 0;`;
  for (const value of values) {
    const match = typeof value === 'number'
      ? numeric ? `numeric===${emit(value)}` : `(typeof value==="number"?value===${emit(value)}:typeof value==="string"&&${decimal}.test(value)&&Number(value)===${emit(value)})`
      : typeof value === 'boolean' ? `value===${value}||value===${emit(String(value))}||value===${emit(value ? '1' : '0')}`
      : `value===${emit(value)}`;
    body += `if(${match})return {value:${emit(value)}};`;
  }
  return body + mismatch;
}
function generate(spec: ScalarSpec, validator: string, decimal: string, enumMeta: string, countString: string, branches: string[] = [], checkIssues = true): { expression: string; body: string } {
  const { kind, opts, literals } = spec;
  let missing: Scalar;
  let nil: Scalar = null;
  let defaults = 0;
  const value = opts.default;
  if (value !== undefined) {
    if (value !== null && typeof value === 'object') {
      const nullish = 'nullish' in value;
      defaults = (nullish || 'undefined' in value ? 1 : 0) | (nullish || 'null' in value ? 2 : 0);
      missing = nullish ? value.nullish : value.undefined;
      if (defaults & 2) nil = nullish ? value.nullish : value.null;
    } else {
      defaults = 1;
      missing = value;
    }
  }
  const optional = !!(opts.optional || opts.nullish || (defaults & 1));
  const nullable = !!(opts.nullable || opts.nullish || (defaults & 2));
  const stringChoices = literals?.values.every(value => typeof value === 'string');
  const mixed = literals?.values.some(value => typeof value !== kind);
  let meta = literals && !stringChoices
    ? `kind:${emit(mixed ? 'union' : kind)},literalValues:[${literals.values.map(emit).join(',')}],${mixed ? `options:[${branches.join(',')}],` : ''}description:${emit(opts.description as Scalar)}`
    : literals ? '' : `kind:${emit(kind)},description:${emit(opts.description as Scalar)}`;
  if (opts.optional || opts.nullable || opts.nullish || value !== undefined) {
    meta += `${meta ? ',' : ''}optional:${optional},nullable:${nullable}`;
    if (defaults & 1) meta += `,defaultValue:${emit(missing)}`;
  }
  let body = '';
  if (optional) body += `if(value===void 0)return {value:${emit(missing)}};`;
  if (nullable) body += `if(value===null${kind === 'number' && !literals ? '||value===""' : ''})return {value:${emit(nil)}};`;
  if (literals) {
    body += literalValidation(literals, decimal, checkIssues);
  } else if (kind === 'string') {
    body += `if(typeof value!=="string"){${failure('Expected a string', 'invalid_type')}}`;
    if (opts.trim) body += 'value=value.trim();';
    if (opts.min !== undefined || opts.max !== undefined) body += `const length=${countString}(value);`;
    if (opts.min !== undefined) body += `if(length<${emit(opts.min as number)}){${failure(`Expected at least ${opts.min} characters`)}}`;
    if (opts.max !== undefined) body += `if(length>${emit(opts.max as number)}){${failure(`Expected at most ${opts.max} characters`)}}`;
    body += 'return {value};';
  } else if (kind === 'number') {
    body += numericConversion(decimal);
    if (opts.integer) body += `if(!Number.isSafeInteger(value)){${failure('Expected a safe integer')}}`;
    for (const [key, operator, message] of [
      ['gt', '>', 'Expected greater than'], ['gte', '>=', 'Expected at least'],
      ['lt', '<', 'Expected less than'], ['lte', '<=', 'Expected at most'],
    ]) {
      if (opts[key!] !== undefined) body += `if(!(value${operator}${emit(opts[key!] as number)})){${failure(`${message} ${opts[key!]}`)}}`;
    }
    body += 'return {value};';
  } else {
    body += 'if(value===true||value==="true"||value==="1")return {value:true};';
    body += 'if(value===false||value==="false"||value==="0")return {value:false};';
    body += failure('Expected true, false, 1 or 0', 'invalid_type');
  }
  return {
    expression: `({meta:${stringChoices ? `Object.assign(${enumMeta}([${literals!.values.map(emit).join(',')}],${emit(opts.description as Scalar)}),{${meta}})` : `{${meta}}`},"~standard":{version:1,vendor:"loculus",validate:${validator}},field:true})`,
    body,
  };
}

export function loculusPlugin(opts: LoculusPluginOptions = {}): Plugin {
  const modules = new Set(opts.modules ?? ['loculus']);
  return {
    name: 'loculus:codegen',
    transform(code, id) {
      if (!/\.[cm]?[jt]sx?(?:\?|$)/.test(id) || id.includes('/node_modules/') ||
          (opts.include && !opts.include(id))) return;
      const extension = /\.([cm]?[jt]sx?)(?:\?|$)/.exec(id)?.[1] ?? 'js';
      const ast = this.parse(code, {
        lang: extension.endsWith('tsx') ? 'tsx' : extension.endsWith('jsx') ? 'jsx' : extension.includes('t') ? 'ts' : 'js',
      }) as unknown as Node;
      const imports = new Map<string, Factory | '*'>();
      const sources = new Set<string>();
      let insert = /^#![^\r\n\u2028\u2029]*(?:\r\n|[\r\n\u2028\u2029]|$)/.exec(code)?.[0].length ?? 0;
      for (const statement of ast.body as Node[]) {
        if (statement.type === 'ExpressionStatement' && statement.directive) insert = statement.end;
        if (statement.type !== 'ImportDeclaration') continue;
        if (!isNode(statement.source) || !modules.has(statement.source.value as string) || statement.importKind === 'type') continue;
        sources.add(statement.source.value as string);
        for (const specifier of statement.specifiers as Node[]) {
          const local = name(specifier.local);
          if (!local || specifier.importKind === 'type') continue;
          if (specifier.type === 'ImportNamespaceSpecifier') imports.set(local, '*');
          const imported = name(specifier.imported);
          if (imported && factories.has(imported as Factory)) imports.set(local, imported as Factory);
        }
      }
      if (!imports.size || sources.size !== 1) return;
      const identifiers = new Set<string>();
      const bindings = new Set<string>();
      let unsafe = false;
      const bind = (node: unknown): void => {
        if (!isNode(node)) return;
        walk(node, node => { if (node.type === 'Identifier') bindings.add(node.name as string); });
      };
      walk(ast, node => {
        if (node.type === 'Identifier') identifiers.add(node.name as string);
        if (node.type === 'VariableDeclarator') bind(node.id);
        if (node.type.includes('Function') || node.type === 'ArrowFunctionExpression') {
          bind(node.id);
          for (const param of node.params as Node[] ?? []) bind(param);
        }
        if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') bind(node.id);
        if (node.type === 'CatchClause') bind(node.param);
        if (node.type.startsWith('Import') && node.type.endsWith('Specifier') && !imports.has(name(node.local) ?? '')) bind(node.local);
        if (node.type === 'WithStatement' || (node.type === 'CallExpression' && name(node.callee) === 'eval')) unsafe = true;
      });
      if (unsafe) return;
      for (const binding of bindings) imports.delete(binding);
      let sequence = 0;
      const unique = (): string => {
        let value: string;
        do value = `__loculus_${sequence++}`; while (identifiers.has(value));
        identifiers.add(value);
        return value;
      };
      const countString = unique();
      const decimal = unique();
      const literalDecimal = unique();
      const collect = unique();
      const invalid = unique();
      const enumMeta = unique();
      let needsDecimal = false;
      let needsLiteralDecimal = false;
      let needsEnumMeta = false;
      const helpers = new Map<string, { name: string; body: string }>();
      const scalarFactories = new Map<string, string>();
      const output = new RolldownMagicString(code);
      const factory = (node: Node): Factory | undefined => {
        node = unwrap(node);
        if (node.type !== 'CallExpression' || node.optional) return;
        const callee = node.callee;
        const imported = imports.get(name(callee) ?? '');
        if (imported && imported !== '*') return imported;
        if (isNode(callee) && callee.type === 'MemberExpression' && !callee.computed && !callee.optional && imports.get(name(callee.object) ?? '') === '*') {
          const member = name(callee.property);
          if (member && factories.has(member as Factory)) return member as Factory;
        }
      };
      const scalar = (node: Node): ScalarSpec | undefined => {
        const kind = factory(node);
        if (kind === 'literal') {
          if (bindings.has('undefined') || ['undefined','Object','Number','Array'].some(name => imports.has(name))) return;
          const args = unwrap(node).arguments as Node[];
          if (args.length < 1 || args.length > 2) return;
          const source = unwrap(args[0]!);
          const multiple = source.type === 'ArrayExpression';
          const elements = multiple ? source.elements as unknown[] : [source];
          if (!elements.length) return;
          const values: LiteralValue[] = [];
          for (const element of elements) {
            const value = literal(element);
            if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return;
            values.push(value);
          }
          if (values.length > 8 && values.every(value => typeof value === 'string')) return;
          if ((values.some(value => typeof value === 'number') && bindings.has('Number')) ||
              (values.some(value => typeof value === 'string') && bindings.has('Object'))) return;
          const opts = options(args.slice(1), 'boolean');
          if (opts) return { kind: typeof values[0] as Kind, opts, literals: { values, multiple } };
          return;
        }
        if (!kind || !Object.hasOwn(keys, kind) || (kind === 'number' && bindings.has('Number')) || bindings.has('undefined')) return;
        const opts = options(unwrap(node).arguments as unknown[], kind as Kind);
        if (opts) return { kind: kind as Kind, opts };
      };
      const field = (node: Node | undefined): FieldSpec | undefined => {
        if (!isNode(node)) return;
        const kind = factory(node);
        if (!kind || kind === 'object') return;
        if ((kind === 'transform' || kind === 'refine') && !field((unwrap(node).arguments as Node[])[0]!)) return;
        return { node, scalar: scalar(node) };
      };
      const arrays = new Map<Node, ArraySpec>();
      const arraySpec = (node: Node): ArraySpec | undefined => {
        if(factory(node)!=='array'||bindings.has('Array')||bindings.has('undefined'))return;
        const args=node.arguments as Node[];
        if(args.length<1||args.length>2)return;
        const inner=scalar(args[0]!);
        if(!inner)return;
        const config=args.length===1||literal(args[1])===undefined?{}:properties(args[1]);
        if(!config)return;
        const opts:Record<string,Scalar>={};
        for(const [key,value]of Object.entries(config)){
          if(!['min','max','wrapScalar','description'].includes(key))return;
          const parsed=literal(value);
          if(parsed===unsupported)return;
          if(parsed!==undefined&&(key==='description'?typeof parsed!=='string':key==='wrapScalar'?typeof parsed!=='boolean':typeof parsed!=='number'))return;
          opts[key]=parsed;
        }
        return {inner,opts};
      };
      const objects = new Map<Node, ObjectSpec>();
      const scalars = new Map<Node, ScalarSpec>();
      walk(ast, node => {
        if (node.type !== 'CallExpression' || node.optional) return;
        const array=arraySpec(node);if(array)arrays.set(node,array);
        const spec = scalar(node);
        if (spec) scalars.set(node, spec);
        if (opts.objects === false || factory(node) !== 'object' || bindings.has('Object') || bindings.has('Array') || bindings.has('undefined')) return;
        const args = node.arguments as Node[];
        const parsedOptions = objectOptions(args);
        const props = shapeProperties(args[0]);
        if (!parsedOptions || !props) return;
        const fields: Record<string, FieldSpec> = Object.create(null);
        for (const [key, value] of Object.entries(props)) {
          const child = field(value);
          if (!child) return;
          fields[key] = child;
        }
        objects.set(node, { ...parsedOptions, fields });
      });
      if (!scalars.size && !objects.size && !arrays.size) return;
      const decimalFor = (spec: ScalarSpec): string => {
        if (spec.literals) {
          if (spec.literals.values.some(value => typeof value === 'number')) needsLiteralDecimal = true;
          return `${literalDecimal}()`;
        }
        if (spec.kind === 'number') needsDecimal = true;
        return decimal;
      };
      let literalError: string | undefined;
      const scalarExpression = (spec: ScalarSpec): string => {
        const candidate = generate(spec, '', decimalFor(spec), enumMeta, countString);
        let helper = helpers.get(candidate.body);
        if (!helper) {
          let body = candidate.body;
          if (spec.literals && !spec.literals.multiple && typeof spec.literals.values[0] === 'number') {
            literalError ??= unique();
            const errors = [
              [`Expected one of: ${spec.literals.values[0]}`, 'invalid_value'],
              ['Expected a decimal number', 'invalid_type'],
              ['Expected a finite number', 'invalid_value'],
            ] as const;
            for (const [message, code] of errors)
              body = body.replaceAll(failure(message,code), `return ${literalError}(${emit(message)},${emit(code)});`);
          }
          helper = { name: unique(), body };
          helpers.set(candidate.body, helper);
        }
        const branches = spec.literals?.values.some(value => typeof value !== spec.kind)
          ? spec.literals.values.map(value => scalarExpression({ kind: typeof value as Kind, opts: {}, literals: { values: [value], multiple: false } }))
          : [];
        const expression = generate(spec, helper.name, decimalFor(spec), enumMeta, countString, branches).expression;
        if (spec.literals?.values.some(value => typeof value === 'string')) needsEnumMeta = true;
        let create = scalarFactories.get(expression);
        if (!create) { create = unique(); scalarFactories.set(expression,create); }
        return `/* @__PURE__ */ ${create}()`;
      };
      const write = (key: string, value: string, dynamic = false): string => {
        const expression = dynamic ? key : emit(key);
        const assign = `output[${expression}]=${value};`;
        return assign;
      };
      const consume = (key: string, dynamic = false): string => `issues=${collect}(result,${dynamic?key:emit(key)},input,output,issues);`;
      const inline = (spec: ScalarSpec, key: string, label: string, dynamic = false): string => {
        const keyExpression = dynamic ? key : emit(key);
        const body = generate(spec, '', decimalFor(spec), enumMeta, countString, [], false).body;
        const prefix = 'function validate(value){';
        const parsed = this.parse(prefix + body + '}') as unknown as Node;
        const replacements: { start: number; end: number; value: string }[] = [];
        walk(parsed, node => {
          if (node.type !== 'ReturnStatement' || !isNode(node.argument)) return;
          const props = properties(node.argument)!;
          const value = props.value;
          const result = (prefix + body + '}').slice(node.argument.start, node.argument.end);
          const expression = value ? (prefix+body+'}').slice(value.start,value.end) : '';
          const defined = value && (literal(value) !== unsupported ? literal(value) !== undefined : value.type === 'Identifier' && value.name === 'value' && spec.kind === 'string' && !spec.opts.trim);
          const assign = defined ? write(key,expression,dynamic) : `const parsed=${expression};if(parsed!==void 0||${keyExpression} in input){${write(key,'parsed',dynamic)}}`;
          let failed = '';
          if (!value) {
            const list = props.issues!;
            const issue = properties((list.elements as Node[])[0])!;
            const src = prefix+body+'}';
            failed = `issues=${invalid}(${keyExpression},input,output,issues,${src.slice(issue.message!.start,issue.message!.end)},${src.slice(issue.code!.start,issue.code!.end)});`;
          }
          replacements.push({ start: node.start - prefix.length, end: node.end - prefix.length,
            value: value
              ? `{if("issues" in {}){const result=${result};${consume(key,dynamic)}}else{${assign}}break ${label};}`
              : `{${failed}break ${label};}` });
        });
        let emitted = body;
        for (const replacement of replacements.sort((a,b)=>b.start-a.start)) emitted = emitted.slice(0,replacement.start)+replacement.value+emitted.slice(replacement.end);
        if (spec.literals?.values.some(value => typeof value !== 'string')) {
          scalarExpression(spec);
          const validator = helpers.get(generate(spec,'',decimalFor(spec),enumMeta,countString).body)!.name;
          emitted = `if("issues" in {}){const result=${validator}(value);${consume(key,dynamic)}break ${label};}` + emitted;
        }
        return `${label}:{let value=input[${keyExpression}];${emitted}}`;
      };
      const arrayValidators = new Map<Node,string>();
      const arrayHelpers = new Map<string, {factory:string;validate:string;body:string;description:Scalar}>();
      const groups: string[] = [];
      const chunks: string[] = [];
      const objectHelpers = new Map<string, { factory: string; validate: string; body: string; captures: string[]; spec: ObjectSpec }>();
      const objectKeyIndexes = new Map<string, string>();
      const render = (node: Node): string => {
        const array=arrays.get(node);
        if(array){
          const child=scalarExpression(array.inner);
          const validator=helpers.get(generate(array.inner,'',decimalFor(array.inner),enumMeta,countString).body)!.name;
          let body='';
          if(array.opts.wrapScalar!==true)body+=`if(!Array.isArray(value)){${failure('Expected an array','invalid_type')}}`;
          body+='const inputs=Array.isArray(value)?value:[value];';
          body+=`const output=[];let issues;for(let i=0;i<inputs.length;i++){const result=${validator}(inputs[i]);if(result.issues)for(const issue of result.issues)(issues??=[]).push({...issue,path:issue.path?[i,...issue.path]:[i]});else output.push(result.value);}if(issues)return {issues};`;
          if(array.opts.min!==undefined)body+=`if(inputs.length<${emit(array.opts.min)}){${failure(`Expected at least ${array.opts.min} items`)}}`;
          if(array.opts.max!==undefined)body+=`if(inputs.length>${emit(array.opts.max)}){${failure(`Expected at most ${array.opts.max} items`)}}`;
          body+='return {value:output};';
          const signature=JSON.stringify([body,array.opts.description]);
          let helper=arrayHelpers.get(signature);
          if(!helper){helper={factory:unique(),validate:unique(),body,description:array.opts.description};arrayHelpers.set(signature,helper);}
          arrayValidators.set(node,helper.validate);
          return `/* @__PURE__ */ ${helper.factory}(${child})`;
        }

        const object = objects.get(node);
        if (object) {
          const fields = Object.entries(object.fields).filter(([key]) => key !== '__proto__');
          const captures: string[] = [];
          let body = `if(typeof input!=="object"||input===null||Array.isArray(input)){${failure('Expected an object','invalid_type')}}const output={};let issues;`;
          for (let index = 0; index < fields.length; index++) {
            const [key,child] = fields[index]!;
            if (child.scalar) {
              let end = index + 1;
              const signature = generate(child.scalar,'',decimalFor(child.scalar),enumMeta,countString).body;
              while (end < fields.length) {
                const next = fields[end]![1].scalar;
                if (!next || generate(next,'',decimalFor(next),enumMeta,countString).body !== signature) break;
                end++;
              }
              const threshold = opts.objects === 'unroll' ? Infinity : opts.objects === 'loop' ? 2 : 3;
              if ((opts.objects === 'chunked' && end-index >= 8) || (opts.objects !== 'unroll' && opts.objects !== 'loop' && end-index >= 32)) {
                for (let start=index;start<end;start+=8) {
                  const helper=unique();
                  const content=fields.slice(start,Math.min(start+8,end)).map(([key,child],offset)=>inline(child.scalar!,key,`field${offset}`)).join('');
                  chunks.push(`function ${helper}(input,output,issues){${content}return issues;}`);
                  body+=`issues=${helper}(input,output,issues);`;
                }
                index=end-1;
              } else if (end - index >= threshold) {
                const keys = unique();
                const values = JSON.stringify(fields.slice(index,end).map(([key])=>key));
                if (child.scalar.literals) {
                  groups.push(`function ${keys}(){return ${keys}.values??=${values};}`);
                  body += `{const keys=${keys}();for(let index=0;index<keys.length;index++){const key=keys[index];${inline(child.scalar,'key',`field${index}`,true)}}}`;
                } else {
                  groups.push(`const ${keys}=${values};`);
                  body += `for(let index=0;index<${keys}.length;index++){const key=${keys}[index];${inline(child.scalar,'key',`field${index}`,true)}}`;
                }
                index = end - 1;
              } else body += inline(child.scalar,key,`field${index}`);
            } else if(arrays.has(child.node)) {
              render(child.node);
              body+=`{const result=${arrayValidators.get(child.node)!}(input[${emit(key)}]);${consume(key)}}`;
            } else {
              const slot = captures.length;
              captures.push(key);
              body += `{const result=v${slot}(input[${emit(key)}]);${consume(key)}}`;
            }
          }
          const keys = Object.keys(object.fields);
          let unknown = keys.length ? keys.map(key => `key!==${emit(key)}`).join('&&') : 'true';
          if (object.mode !== 'strip' && keys.length > 8) {
            const signature = JSON.stringify(keys);
            let index = objectKeyIndexes.get(signature);
            if (!index) {
              index = unique();
              objectKeyIndexes.set(signature, index);
              groups.push(`const ${index}={${keys.map(key => `[${emit(key)}]:true`).join(',')}};`);
            }
            unknown = `!Object.hasOwn(${index},key)`;
          }
          if (object.mode === 'strict') body += `for(const key in input)if(${unknown}){(issues??=[]).push({message:"Unknown key: "+key,code:"unrecognized_key",path:[key]});break;}`;
          if (object.mode === 'passthrough') body += `for(const key in input)if(key!=="__proto__"&&${unknown}){const value=input[key];if(key in output)Object.defineProperty(output,key,{value,enumerable:true,writable:true,configurable:true});else output[key]=value;}`;
          body += 'return issues?{issues}:{value:output};';
          const signature = JSON.stringify([body, captures, object.mode, object.description]);
          let helper = objectHelpers.get(signature);
          if (!helper) {
            helper = { factory: unique(), validate: unique(), body, captures, spec: object };
            objectHelpers.set(signature,helper);
          }
          return `/* @__PURE__ */ ${helper.factory}(${render((node.arguments as Node[])[0]!)})`;
        }
        const spec = scalars.get(node);
        if (spec) return scalarExpression(spec);
        const edits: { node: Node; value: string }[] = [];
        const descend = (parent: Node): void => {
          for (const [key, value] of Object.entries(parent)) {
            if (key === 'parent' || key === 'comments') continue;
            const children = Array.isArray(value) ? value : [value];
            for (const child of children) if (isNode(child)) {
              if (objects.has(child) || scalars.has(child) || arrays.has(child)) edits.push({node:child,value:render(child)});
              else descend(child);
            }
          }
        };
        descend(node);
        let emitted = code.slice(node.start,node.end);
        for (const edit of edits.sort((a,b)=>b.node.start-a.node.start)) emitted = emitted.slice(0,edit.node.start-node.start)+edit.value+emitted.slice(edit.node.end-node.start);
        return emitted;
      };
      const replacements: { node: Node; value: string }[] = [];
      const select = (node: Node): void => {
        if (objects.has(node) || scalars.has(node) || arrays.has(node)) { replacements.push({node,value:render(node)}); return; }
        for (const [key,value] of Object.entries(node)) {
          if (key === 'parent' || key === 'comments') continue;
          for (const child of Array.isArray(value)?value:[value]) if (isNode(child)) select(child);
        }
      };
      select(ast);
      let generated = '\n';
      const decimalPattern = '/^[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?$/';
      if (needsDecimal) generated += `const ${decimal}=${decimalPattern};\n`;
      if (needsLiteralDecimal) generated += `function ${literalDecimal}(){return ${literalDecimal}.pattern??=${decimalPattern};}\n`;
      if (needsEnumMeta) generated += `function ${enumMeta}(values,description){const Metadata=${enumMeta}.Metadata??=class{#choices;constructor(values,description){this.description=description;this.kind="string";this.#choices=values;}get enumValues(){return this.#choices;}set enumValues(values){this.#choices=values;}};return new Metadata(values,description);}\n`;
      generated += groups.join('\n')+'\n'+chunks.join('\n')+'\n';
      if (objects.size) generated += `function ${collect}(result,key,input,output,issues){if(result.issues){issues??=[];for(const issue of result.issues)issues.push({...issue,path:issue.path?[key,...issue.path]:[key]});}else if(result.value!==void 0||key in input){output[key]=result.value;}return issues;}function ${invalid}(key,input,output,issues,message,code){return ${collect}({issues:[{message,code}]},key,input,output,issues);}\n`;
      if (literalError) generated += `function ${literalError}(message,code){return {issues:[{message,code}]};}\n`;
      for (const helper of helpers.values()) {
        let body = helper.body;
        if (body === generate({kind:'string',opts:{}}, '', decimal, enumMeta, countString).body) {
          const error = unique();
          generated += `function ${error}(message,code){return {issues:[{message,code}]};}\n`;
          body = body.replace(failure('Expected a string', 'invalid_type'), `return ${error}("Expected a string","invalid_type");`);
        }
        generated += `function ${helper.name}(value){${body}}\n`;
      }
      for (const [expression,create] of scalarFactories) generated += `/* @__NO_SIDE_EFFECTS__ */ function ${create}(){return ${expression};}\n`;
      for(const helper of arrayHelpers.values()){
        generated+=`function ${helper.validate}(value){${helper.body}}\n`;
        generated+=`/* @__NO_SIDE_EFFECTS__ */ function ${helper.factory}(inner){return {meta:{kind:"array",inner,enumValues:inner.meta.enumValues,...(inner.meta.literalValues?{literalValues:inner.meta.literalValues}:{}),description:${emit(helper.description)}},"~standard":{version:1,vendor:"loculus",validate:${helper.validate}},field:true};}\n`;
      }
      for (const helper of objectHelpers.values()) {
        const args = helper.captures.map((_,index)=>`v${index}`);
        generated += `function ${helper.validate}(input${args.length?','+args.join(','):''}){${helper.body}}\n`;
        generated += `/* @__NO_SIDE_EFFECTS__ */ function ${helper.factory}(shape){${helper.captures.map((key,index)=>`const v${index}=shape[${emit(key)}]["~standard"].validate;`).join('')}return {meta:{kind:"object",shape,unknownKeys:${emit(helper.spec.mode)},description:${emit(helper.spec.description)}},"~standard":{version:1,vendor:"loculus",validate:${args.length?`(input)=>${helper.validate}(input,${args.join(',')})`:helper.validate}},shape,field:true};}\n`;
      }
      if (generated.includes(`${countString}(value)`))
        generated = `\nimport {countString as ${countString}} from ${emit([...sources][0])};\n` + generated;
      for (const replacement of replacements) output.overwrite(replacement.node.start,replacement.node.end,replacement.value);
      output.appendLeft(insert, generated);
      return { code: output };
    },
  };
}
