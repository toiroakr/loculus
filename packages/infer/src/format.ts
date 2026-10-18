import { dirname, isAbsolute, relative, sep } from 'node:path';
import { formatDoc, type ExtractedSchema, type TypeImport } from './extractor.js';

export interface FormatOptions {
  /** Emit only input types. */
  readonly inputOnly?: boolean;
  /** Emit only output types. */
  readonly outputOnly?: boolean;
  /** Emit one type when the input and output types are identical. */
  readonly mergeSame?: boolean;
  /** Suffix removed from schema names, such as `"Schema"`. */
  readonly suffix?: string;
  /** Suffix of input type names. Defaults to `"Input"`. */
  readonly inputSuffix?: string;
  /** Suffix of output type names. Defaults to `"Output"`. */
  readonly outputSuffix?: string;
  /** Base type names by schema name, such as `{ UserSchema: "User" }`. */
  readonly map?: Readonly<Record<string, string>>;
}

export interface FormattedType {
  readonly name: string;
  readonly kind: 'input' | 'output' | 'merged';
  readonly schemaName: string;
  readonly text: string;
  readonly description?: string;
}

/** Decides the exported type declarations for extracted schemas. */
export function formatTypes(schemas: readonly ExtractedSchema[], options: FormatOptions = {}): FormattedType[] {
  if (options.inputOnly && options.outputOnly) throw new Error('inputOnly and outputOnly cannot be combined');
  const types: FormattedType[] = [];
  for (const schema of schemas) {
    const base = baseName(schema.schemaName, options);
    const common = { schemaName: schema.schemaName, ...(schema.description === undefined ? {} : { description: schema.description }) };
    if (options.mergeSame && !options.inputOnly && !options.outputOnly && schema.input === schema.output) {
      types.push({ ...common, name: base, kind: 'merged', text: schema.input });
      continue;
    }
    if (!options.outputOnly) types.push({ ...common, name: base + (options.inputSuffix ?? 'Input'), kind: 'input', text: schema.input });
    if (!options.inputOnly) types.push({ ...common, name: base + (options.outputSuffix ?? 'Output'), kind: 'output', text: schema.output });
  }
  const seen = new Map<string, string>();
  for (const type of types) {
    const previous = seen.get(type.name);
    if (previous !== undefined) throw new Error(`Type name "${type.name}" is generated for both ${previous} and ${type.schemaName}`);
    seen.set(type.name, type.schemaName);
  }
  return types;
}

function baseName(schemaName: string, options: FormatOptions): string {
  const mapped = options.map?.[schemaName];
  if (mapped !== undefined) return mapped;
  const { suffix } = options;
  return suffix && schemaName.endsWith(suffix) && schemaName.length > suffix.length ? schemaName.slice(0, -suffix.length) : schemaName;
}

export interface RenderOptions extends FormatOptions {
  /** Absolute path of the generated file, used for relative import specifiers. */
  readonly outFile?: string;
  /** Directory used for relative import specifiers when `outFile` is not set. */
  readonly cwd?: string;
  /** Text placed at the top of the module. */
  readonly header?: string;
}

/** Renders extracted schemas as a TypeScript module. */
export function renderModule(schemas: readonly ExtractedSchema[], options: RenderOptions = {}): string {
  const types = formatTypes(schemas, options);
  const directory = options.outFile ? dirname(options.outFile) : (options.cwd ?? process.cwd());
  const used = types.map(type => type.text).join('\n');
  const imports = new Map<string, Map<string, string>>();
  const namespaces: string[] = [];
  for (const schema of schemas) {
    for (const entry of schema.imports) {
      if (!new RegExp(`(?<![\\w$.])${escapeRegExp(entry.name)}(?![\\w$])`).test(used)) continue;
      const specifier = importSpecifier(entry, directory);
      if (entry.importedName === '*') {
        namespaces.push(`import type * as ${entry.name} from ${JSON.stringify(specifier)};`);
        continue;
      }
      const names = imports.get(specifier) ?? new Map<string, string>();
      names.set(entry.name, entry.importedName === entry.name ? entry.name : `${entry.importedName} as ${entry.name}`);
      imports.set(specifier, names);
    }
  }
  const lines: string[] = [];
  if (options.header) lines.push(options.header, '');
  const importLines = [
    ...[...imports].map(([specifier, names]) => `import type { ${[...new Set(names.values())].sort().join(', ')} } from ${JSON.stringify(specifier)};`),
    ...new Set(namespaces),
  ];
  if (importLines.length) lines.push(...importLines, '');
  for (const type of types) {
    const doc = type.description === undefined ? '' : formatDoc(type.description);
    lines.push(`${doc}export type ${type.name} = ${type.text};`, '');
  }
  return lines.join('\n').replace(/\n+$/, '\n');
}

function importSpecifier(entry: TypeImport, directory: string): string {
  if (!isAbsolute(entry.from)) return entry.from;
  let specifier = relative(directory, entry.from).split(sep).join('/');
  specifier = specifier.replace(/\.d\.([cm]?)ts$/, '.$1js').replace(/\.([cm]?)tsx?$/, '.$1js');
  return specifier.startsWith('.') ? specifier : `./${specifier}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
