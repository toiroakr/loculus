import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import * as ts from 'typescript/ast';
import {
  API,
  CheckFlags,
  ElementFlags,
  NodeBuilderFlags,
  SymbolFlags,
  TypeFlags,
  type Checker,
  type CompilerOptions,
  type Program,
  type ModuleResolver,
  formatDiagnostics,
  type Symbol as CompilerSymbol,
  type Type,
  type TypeReference,
  type TupleTypeReference,
} from 'typescript/sync';
import { readDescriptions, type DescriptionTree } from './descriptions.js';

/** A named type the extracted text refers to, and where to import it from. */
export interface TypeImport {
  /** Name used in the extracted type text. */
  readonly name: string;
  /** Name exported by the source module. */
  readonly importedName: string;
  /** Absolute file path, or a package specifier such as `"some-package"`. */
  readonly from: string;
}

export interface ExtractedSchema {
  /** Exported name of the schema. */
  readonly schemaName: string;
  /** Absolute path of the file declaring the schema. */
  readonly filePath: string;
  /** `Input<typeof schema>` as TypeScript source. */
  readonly input: string;
  /** `Output<typeof schema>` as TypeScript source. */
  readonly output: string;
  /** The schema's own `description`, when written as a string literal. */
  readonly description?: string;
  /** Named types referenced by `input` or `output` that need an import. */
  readonly imports: readonly TypeImport[];
  /** Named types referenced by `input`. */
  readonly inputImports: readonly TypeImport[];
  /** Named types referenced by `output`. */
  readonly outputImports: readonly TypeImport[];
  /** Referenced types that cannot be imported, such as non-exported local types. */
  readonly warnings: readonly string[];
}

export interface ExtractorOptions {
  /** Path to tsconfig.json. Defaults to the nearest tsconfig.json above `cwd`. */
  readonly project?: string;
  /** Base directory for relative paths. Defaults to `process.cwd()`. */
  readonly cwd?: string;
}

export interface ExtractOptions {
  /** Only extract these exported names. */
  readonly schemas?: readonly string[];
  /** Emit `description` options as TSDoc comments on fields. */
  readonly withDescriptions?: boolean;
}

interface Candidate {
  readonly exportName: string;
  readonly declaration: ts.VariableDeclaration;
}

const builderFlags =
  NodeBuilderFlags.NoTruncation | NodeBuilderFlags.InTypeAlias | NodeBuilderFlags.MultilineObjectLiterals;

/** Reads `Input` and `Output` types of exported Loculus schemas with the TypeScript compiler. */
export class LoculusTypeExtractor {
  readonly #api: API;
  readonly #options: CompilerOptions;
  readonly #resolver: ModuleResolver;
  readonly #files = new Set<string>();
  #program: Program | undefined;
  readonly #cwd: string;

  constructor(options: ExtractorOptions = {}) {
    this.#cwd = resolve(options.cwd ?? process.cwd());
    const tsConfigFilePath = options.project ? resolve(this.#cwd, options.project) : findTsConfig(this.#cwd);
    try {
      this.#api = new API({ cwd: this.#cwd });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Unable to resolve @typescript/typescript-')) {
        throw new Error(
          `TypeScript native compiler is unavailable for ${process.platform}/${process.arch}. Install optional dependencies with npm install --include=optional, and use a platform supported by TypeScript 7.1.`,
          { cause: error },
        );
      }
      throw error;
    }
    try {
      const parsed = tsConfigFilePath
        ? this.#api.parseConfigFile(tsConfigFilePath)
        : this.#api.parseCommandLine([
            '--strict',
            '--target',
            'es2022',
            '--module',
            'nodenext',
            '--moduleResolution',
            'nodenext',
            '--skipLibCheck',
          ]);
      const errors = parsed.errors.filter((error) => error.code !== 18002 && error.code !== 18003);
      if (errors.length) throw new Error(formatDiagnostics(errors, this.#api));
      this.#options = parsed.options;
      this.#resolver = this.#api.createModuleResolver(this.#options);
    } catch (error) {
      this.#api[Symbol.dispose]();
      throw error;
    }
  }

  /** Lists exported Loculus schema names in a file. */
  listSchemas(filePath: string): string[] {
    return this.#candidates(this.#sourceFile(filePath)).map((candidate) => candidate.exportName);
  }

  /** Extracts every exported Loculus schema in a file, in declaration order. */
  extractAll(filePath: string, options: ExtractOptions = {}): ExtractedSchema[] {
    const sourceFile = this.#sourceFile(filePath);
    let candidates = this.#candidates(sourceFile);
    if (options.schemas) {
      const wanted = new Set(options.schemas);
      candidates = candidates.filter((candidate) => wanted.has(candidate.exportName));
    }
    if (candidates.length === 0) return [];
    const project = this.#program!.getProject();
    const scope = new Map(
      project.checker
        .getSymbolsInScope(sourceFile, SymbolFlags.Type | SymbolFlags.Value | SymbolFlags.Namespace | SymbolFlags.Alias)
        .map((symbol) => [symbol.name, symbol]),
    );
    return candidates.map(({ exportName, declaration }) => {
      const tree = options.withDescriptions ? readDescriptions(declaration.initializer, project.checker) : {};
      const inputReferences = new References(sourceFile, scope, this.#program!, this.#resolver);
      const outputReferences = new References(sourceFile, scope, this.#program!, this.#resolver);
      const schemaType = project.checker.getTypeAtLocation(declaration);
      const order = this.#shapeOrder(schemaType, declaration);
      const input = this.#print(declaration, schemaType, '_input', tree, order, false, inputReferences);
      const output = this.#print(declaration, schemaType, '_output', tree, order, true, outputReferences);
      const description = options.withDescriptions ? tree.description : undefined;
      return {
        schemaName: exportName,
        filePath: sourceFile.fileName,
        input,
        output,
        ...(description === undefined ? {} : { description }),
        imports: inputReferences.merge(outputReferences),
        inputImports: inputReferences.imports(),
        outputImports: outputReferences.imports(),
        warnings: [...new Set([...inputReferences.warnings, ...outputReferences.warnings])],
      };
    });
  }

  /** Extracts one exported Loculus schema. Throws when it is not found. */
  extract(filePath: string, schemaName: string, options: Omit<ExtractOptions, 'schemas'> = {}): ExtractedSchema {
    const [result] = this.extractAll(filePath, { ...options, schemas: [schemaName] });
    if (!result) throw new Error(`Loculus schema "${schemaName}" is not exported from ${filePath}`);
    return result;
  }

  /** Loads several files before extraction so their dependencies are resolved once, not per file. */
  addSourceFiles(filePaths: readonly string[]): void {
    const before = this.#files.size;
    for (const filePath of filePaths) this.#files.add(resolve(this.#cwd, filePath));
    if (this.#program && before === this.#files.size) return;
    this.#program?.[Symbol.dispose]();
    this.#program = this.#api.createProgram([...this.#files], this.#options);
  }

  dispose(): void {
    this.#program?.[Symbol.dispose]();
    this.#program = undefined;
    this.#resolver[Symbol.dispose]();
    this.#api[Symbol.dispose]();
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  #sourceFile(filePath: string): ts.SourceFile {
    this.addSourceFiles([filePath]);
    const file = this.#program!.getSourceFile(resolve(this.#cwd, filePath));
    if (!file) throw new Error(`Source file not found: ${filePath}`);
    return file;
  }

  #candidates(sourceFile: ts.SourceFile): Candidate[] {
    const checker = this.#program!.getProject().checker;
    const module = checker.getSymbolOfSourceFile(sourceFile.fileName);
    if (!module) return [];
    const candidates: Candidate[] = [];
    for (const exported of checker.getExportsOfModule(module)) {
      if (exported.name === 'default') continue;
      const symbol = exported.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      for (const handle of symbol.declarations) {
        const declaration = handle.resolve();
        if (
          declaration &&
          ts.isVariableDeclaration(declaration) &&
          declaration.getSourceFile().fileName === sourceFile.fileName &&
          isLoculusSchema(checker.getTypeAtLocation(declaration), declaration, checker)
        )
          candidates.push({ exportName: exported.name, declaration });
      }
    }
    return candidates.sort((a, b) => a.declaration.getStart() - b.declaration.getStart());
  }

  /** Field order of `object()` shapes, which the printed intersection types do not keep. */
  #shapeOrder(type: Type, location: ts.Node, depth = 0): ShapeOrder | undefined {
    const checker = this.#program!.getProject().checker;
    const shape = type.getProperty('shape');
    if (!shape || depth > 32) return undefined;
    const fields = new Map<string, ShapeOrder | undefined>();
    for (const property of checker.getTypeOfSymbolAtLocation(shape, location).getProperties()) {
      fields.set(
        property.name,
        this.#shapeOrder(checker.getTypeOfSymbolAtLocation(property, location), location, depth + 1),
      );
    }
    return fields;
  }

  #print(
    declaration: ts.VariableDeclaration,
    schemaType: Type,
    marker: '_input' | '_output',
    tree: DescriptionTree,
    order: ShapeOrder | undefined,
    output: boolean,
    references: References,
  ): string {
    const checker = this.#program!.getProject().checker;
    const location = declaration;
    const property = schemaType.getProperty(marker);
    if (!property) throw new Error(`${declaration.name.getText()} has no ${marker} type`);
    const node = reorder(
      new TypeNodeBuilder(checker, location).build(checker.getTypeOfSymbolAtLocation(property, location)),
      order,
    );
    references.collect(node);
    let text = this.#api.printer.printNode(node);
    text = text.replace(/^( {4})+/gm, (indent) => ' '.repeat(indent.length / 2));
    text = references.replaceImportTypes(text);
    return addDescriptions(text, tree, output, this.#api);
  }
}

/**
 * Builds a type node that spells out anonymous object types, intersections and
 * helper aliases such as `ObjectInput`, while keeping named interfaces and
 * classes (`Date`, `URL`, user interfaces) as references.
 */
class TypeNodeBuilder {
  readonly #checker: Checker;
  readonly #location: ts.Node;
  readonly #visiting = new Set<Type>();

  constructor(checker: Checker, location: ts.Node) {
    this.#checker = checker;
    this.#location = location;
  }

  build(type: Type): ts.TypeNode {
    if (!this.#needsExpansion(type, new Set())) return this.#reference(type);
    if (this.#visiting.has(type)) return this.#reference(type);
    this.#visiting.add(type);
    try {
      return this.#expand(type);
    } finally {
      this.#visiting.delete(type);
    }
  }

  #expand(type: Type): ts.TypeNode {
    const checker = this.#checker;
    const { factory } = ts;
    if (type.isUnionType()) {
      const members: ts.TypeNode[] = [];
      const booleans = type.getTypes().filter((member) => member.flags & TypeFlags.BooleanLiteral);
      // Print null and undefined last, like the compiler does.
      const nullish = (member: Type) =>
        member.flags & TypeFlags.Undefined ? 2 : member.flags & TypeFlags.Null ? 1 : 0;
      // `A & B` adds nothing to a union that already contains `A`. Such members
      // appear when the compiler distributes `ObjectInput`'s intersection.
      const absorbed = (member: Type) =>
        member.isIntersectionType() && member.getTypes().some((part) => type.getTypes().includes(part));
      for (const member of [...type.getTypes()]
        .filter((member) => !absorbed(member))
        .sort((a, b) => nullish(a) - nullish(b))) {
        if (member.flags & TypeFlags.BooleanLiteral && booleans.length === 2) {
          if (member === booleans[0]) members.push(factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword));
          continue;
        }
        const node = this.build(member);
        members.push(
          ts.isFunctionTypeNode(node) || ts.isConstructorTypeNode(node) || ts.isConditionalTypeNode(node)
            ? factory.createParenthesizedTypeNode(node)
            : node,
        );
      }
      return factory.createUnionTypeNode(members);
    }
    if (type.isIntersectionType() && type.getTypes().some((part) => !(part.flags & TypeFlags.Object))) {
      // A primitive intersected with an object, such as a branded string, is not an object shape.
      return factory.createIntersectionTypeNode(
        type.getTypes().map((part) => {
          const node = this.build(part);
          return ts.isUnionTypeNode(node) || ts.isFunctionTypeNode(node)
            ? factory.createParenthesizedTypeNode(node)
            : node;
        }),
      );
    }
    if (checker.isArrayType(type)) {
      const [element] = checker.getTypeArguments(type as TypeReference);
      let node = this.build(element!);
      if (
        ts.isUnionTypeNode(node) ||
        ts.isIntersectionTypeNode(node) ||
        ts.isFunctionTypeNode(node) ||
        ts.isConditionalTypeNode(node)
      )
        node = factory.createParenthesizedTypeNode(node);
      const array = factory.createArrayTypeNode(node);
      return isReadonlyArray(type) ? factory.createTypeOperatorNode(ts.SyntaxKind.ReadonlyKeyword, array) : array;
    }
    if (checker.isTupleType(type)) {
      const target = (type as TupleTypeReference).getTarget();
      const elements = checker.getTypeArguments(type as TypeReference).map((element, index) => {
        const flags = target.elementFlags[index]!;
        const node = this.build(element);
        if (flags & ElementFlags.Rest) return factory.createRestTypeNode(factory.createArrayTypeNode(node));
        return flags & ElementFlags.Optional ? factory.createOptionalTypeNode(node) : node;
      });
      const tuple = factory.createTupleTypeNode(elements);
      return target.readonly ? factory.createTypeOperatorNode(ts.SyntaxKind.ReadonlyKeyword, tuple) : tuple;
    }
    const properties = checker.getPropertiesOfType(type);
    // Symbol keys need a computed name such as `[tag]`, which only the compiler's printer knows.
    if (properties.some((property) => String(property.escapedName).startsWith('__@'))) return this.#reference(type);
    const members = properties.map((property) => {
      const propertyType = checker.getTypeOfSymbolAtLocation(property, this.#location);
      return factory.createPropertySignatureDeclaration(
        isReadonlyProperty(property) ? [factory.createToken(ts.SyntaxKind.ReadonlyKeyword)] : undefined,
        propertyName(property.name),
        property.flags & SymbolFlags.Optional ? factory.createToken(ts.SyntaxKind.QuestionToken) : undefined,
        this.build(propertyType),
        undefined!,
      );
    });
    const indexInfos = checker
      .getIndexInfosOfType(type)
      .map((info) =>
        factory.createIndexSignatureDeclaration(
          info.isReadonly ? [factory.createToken(ts.SyntaxKind.ReadonlyKeyword)] : undefined,
          [
            factory.createParameterDeclaration(
              undefined,
              undefined,
              factory.createIdentifier('key'),
              undefined,
              this.#reference(info.keyType),
            ),
          ],
          this.build(info.valueType),
        ),
      );
    return factory.createTypeLiteralNode([...indexInfos, ...members]);
  }

  /** Whether the type contains an anonymous object or intersection the compiler would print by alias. */
  #needsExpansion(type: Type, seen: Set<Type>): boolean {
    if (seen.has(type)) return false;
    seen.add(type);
    if (type.getCallSignatures().length || type.getConstructSignatures().length) return false;
    if (type.getAliasSymbol() && type.flags & (TypeFlags.Object | TypeFlags.UnionOrIntersection)) return true;
    if (type.isUnionType()) return type.getTypes().some((member) => this.#needsExpansion(member, seen));
    if (type.isIntersectionType()) return true;
    if (this.#checker.isArrayType(type) || this.#checker.isTupleType(type)) {
      return this.#checker.getTypeArguments(type as TypeReference).some((member) => this.#needsExpansion(member, seen));
    }
    if (!(type.flags & TypeFlags.Object)) return false;
    return !isNamed(type);
  }

  #reference(type: Type): ts.TypeNode {
    const node = this.#checker.typeToTypeNode(type, this.#location, builderFlags);
    if (!node) throw new Error(`Cannot print type ${this.#checker.typeToString(type)}`);
    return node;
  }
}

function leftmost(name: ts.EntityName): string {
  while (ts.isQualifiedName(name)) name = name.left;
  return name.text;
}

function isNamed(type: Type): boolean {
  const symbol = type.getSymbol();
  return symbol !== undefined && (symbol.flags & (SymbolFlags.Class | SymbolFlags.Interface | SymbolFlags.Enum)) !== 0;
}

function isReadonlyProperty(property: CompilerSymbol): boolean {
  if (property.checkFlags & CheckFlags.Readonly) return true;
  const declaration = (property.valueDeclaration ?? property.declarations[0])?.resolve();
  return declaration !== undefined && (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Readonly) !== 0;
}

function isReadonlyArray(type: Type): boolean {
  return type.isTypeReference() && type.getTarget().getSymbol()?.name === 'ReadonlyArray';
}

function propertyName(name: string): ts.PropertyName {
  return /^[A-Za-z_$][\w$]*$/.test(name)
    ? ts.factory.createIdentifier(name)
    : ts.factory.createStringLiteral(name, ts.TokenFlags.None);
}

function isLoculusSchema(type: Type, node: ts.Node, checker: Checker): boolean {
  const standard = type.getProperty('~standard');
  if (!standard || !type.getProperty('_input') || !type.getProperty('_output')) return false;
  const standardType = checker.getTypeOfSymbolAtLocation(standard, node);
  const property = standardType.getProperty('vendor');
  const vendor = property && checker.getTypeOfSymbolAtLocation(property, node);
  return vendor?.isStringLiteralType() === true && vendor.value === 'loculus';
}

function findTsConfig(from: string): string | undefined {
  for (let directory = from; ; directory = dirname(directory)) {
    const candidate = join(directory, 'tsconfig.json');
    if (existsSync(candidate)) return candidate;
    if (dirname(directory) === directory) return undefined;
  }
}

type ShapeOrder = Map<string, ShapeOrder | undefined>;

function memberName(member: ts.TypeElement): string | undefined {
  const name =
    ts.isPropertySignatureDeclaration(member) || ts.isMethodSignatureDeclaration(member) ? member.name : undefined;
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    ? name.text
    : undefined;
}

function reorder(node: ts.TypeNode, order: ShapeOrder | undefined): ts.TypeNode {
  if (!order) return node;
  // Optional, nullable and readonly wrappers keep the object's own field order.
  if (ts.isUnionTypeNode(node))
    return ts.factory.updateUnionTypeNode(
      node,
      ts.factory.createNodeArray(node.types.map((type) => reorder(type, order))),
    );
  if (ts.isParenthesizedTypeNode(node)) return ts.factory.updateParenthesizedTypeNode(node, reorder(node.type, order));
  if (!ts.isTypeLiteralNode(node)) return node;
  const keys = [...order.keys()];
  const rank = (member: ts.TypeElement) => {
    const index = keys.indexOf(memberName(member) ?? '');
    return index === -1 ? keys.length : index;
  };
  const members = node.members.map((member, index) => {
    const child = order.get(memberName(member) ?? '');
    const updated =
      child && ts.isPropertySignatureDeclaration(member) && member.type
        ? ts.factory.updatePropertySignatureDeclaration(
            member,
            member.modifiers,
            member.name,
            member.postfixToken,
            reorder(member.type, child),
            member.initializer!,
          )
        : member;
    return { member: updated, rank: rank(member), index };
  });
  members.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return ts.factory.updateTypeLiteralNode(node, ts.factory.createNodeArray(members.map((entry) => entry.member)));
}

function addDescriptions(text: string, tree: DescriptionTree, output: boolean, api: API): string {
  if ((!tree.fields && !tree.element) || (tree.inputOnlyFields && output)) return text;
  const prefix = 'type __LoculusGenerated = ';
  using parsed = api.createSourceFile('__loculus_generated.ts', prefix + text);
  const source = parsed.sourceFile;
  const declaration = source.statements[0];
  if (!declaration || !ts.isTypeAliasDeclaration(declaration)) throw new Error('Cannot parse generated type');
  const edits: { position: number; text: string }[] = [];
  const visit = (node: ts.TypeNode, tree: DescriptionTree): void => {
    if (tree.inputOnlyFields && output) return;
    if (ts.isTypeOperatorNode(node) || ts.isParenthesizedTypeNode(node)) return visit(node.type, tree);
    if (ts.isArrayTypeNode(node)) {
      if (tree.element) visit(node.elementType, tree.element);
      return;
    }
    if (ts.isUnionTypeNode(node)) {
      for (const member of node.types) visit(member, tree);
      return;
    }
    if (!ts.isTypeLiteralNode(node) || !tree.fields) return;
    for (const member of node.members) {
      if (!ts.isPropertySignatureDeclaration(member)) continue;
      const field = tree.fields.get(memberName(member) ?? '');
      if (!field) continue;
      if (field.description !== undefined) {
        const start = member.getStart();
        const lineStart = source.text.lastIndexOf('\n', start - 1) + 1;
        const indent = source.text.slice(lineStart, start);
        edits.push({ position: lineStart, text: formatDoc(field.description, indent) });
      }
      if (member.type) visit(member.type, field);
    }
  };
  visit(declaration.type, tree);
  let result = source.text;
  for (const edit of edits.sort((a, b) => b.position - a.position))
    result = result.slice(0, edit.position) + edit.text + result.slice(edit.position);
  return result.slice(prefix.length);
}

/** Formats a TSDoc comment at the given indentation, ending with a newline. */
export function formatDoc(description: string, indent = ''): string {
  const lines = description.replaceAll('*/', '*\\/').split(/\r?\n/);
  if (lines.length === 1) return `${indent}/** ${lines[0]} */\n`;
  return `${indent}/**\n${lines.map((line) => `${indent} *${line ? ` ${line}` : ''}`).join('\n')}\n${indent} */\n`;
}

/** Tracks named types referenced by printed type nodes. */
class References {
  readonly warnings: string[] = [];
  readonly #sourceFile: ts.SourceFile;
  readonly #program: Program;
  readonly #resolver: ModuleResolver;
  readonly #scope: ReadonlyMap<string, CompilerSymbol>;
  readonly #imports = new Map<string, TypeImport>();

  constructor(
    sourceFile: ts.SourceFile,
    scope: ReadonlyMap<string, CompilerSymbol>,
    program: Program,
    resolver: ModuleResolver,
  ) {
    this.#resolver = resolver;
    this.#program = program;
    this.#sourceFile = sourceFile;
    this.#scope = scope;
  }

  imports(): TypeImport[] {
    return [...this.#imports.values()];
  }

  /** The imports of both, rejecting one name bound to different types. */
  merge(other: References): TypeImport[] {
    const merged = new References(this.#sourceFile, this.#scope, this.#program, this.#resolver);
    for (const entry of [...this.imports(), ...other.imports()]) merged.#record(entry);
    return merged.imports();
  }

  collect(node: ts.Node): void {
    if (ts.isTypeReferenceNode(node)) this.#add(leftmost(node.typeName));
    // `typeof Model` and computed keys such as `[tag]` refer to values; `import type` covers both.
    else if (ts.isTypeQueryNode(node)) this.#add(leftmost(node.exprName));
    else if (ts.isComputedPropertyName(node)) {
      let expression = node.expression;
      while (ts.isPropertyAccessExpression(expression)) expression = expression.expression;
      if (ts.isIdentifier(expression)) this.#add(expression.text);
    }
    node.forEachChild((child) => this.collect(child));
  }

  /** Replaces `import("./module").Name` with `Name` and records the import. */
  replaceImportTypes(text: string): string {
    return text.replace(/import\("([^"]+)"\)\.([A-Za-z_$][\w$]*)/g, (_, specifier: string, name: string) => {
      const from = specifier.startsWith('.') || isAbsolute(specifier) ? this.#resolveModule(specifier) : specifier;
      this.#record({ name, importedName: name, from });
      return name;
    });
  }

  #resolveModule(specifier: string): string {
    return (
      this.#resolver.resolveModuleName(specifier, dirname(this.#sourceFile.fileName)).resolvedModule
        ?.resolvedFileName ?? resolve(dirname(this.#sourceFile.fileName), specifier)
    );
  }

  #add(name: string): void {
    if (this.#imports.has(name)) return;
    const symbol = this.#scope.get(name);
    const declaration = symbol?.declarations[0]?.resolve();
    if (!declaration) return;
    if (ts.isImportSpecifier(declaration)) {
      const imported = declaration.propertyName ?? declaration.name;
      this.#record({ name, importedName: imported.text, from: this.#moduleOf(declaration) });
    } else if (ts.isImportClause(declaration)) {
      this.#record({ name, importedName: 'default', from: this.#moduleOf(declaration) });
    } else if (ts.isNamespaceImport(declaration)) {
      this.#record({ name, importedName: '*', from: this.#moduleOf(declaration) });
    } else if (declaration.getSourceFile().fileName === this.#sourceFile.fileName) {
      const checker = this.#program.getProject().checker;
      const module = checker.getSymbolOfSourceFile(this.#sourceFile.fileName);
      const exported =
        module &&
        checker.getExportsOfModule(module).find((entry) => {
          const target = entry.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(entry) : entry;
          return target.declarations.some((handle) => handle.resolve() === declaration);
        });
      if (exported) this.#record({ name, importedName: exported.name, from: this.#sourceFile.fileName });
      else
        this.warnings.push(`"${name}" is used by a schema type but is not exported from ${this.#sourceFile.fileName}`);
    }
  }

  #moduleOf(node: ts.Node): string {
    while (!ts.isImportDeclaration(node)) node = node.parent;
    const specifier = node.moduleSpecifier;
    if (!ts.isStringLiteral(specifier)) throw new Error('Expected a string module specifier');
    if (!specifier.text.startsWith('.') && !isAbsolute(specifier.text)) return specifier.text;
    return (
      this.#program.getResolvedModuleFromModuleSpecifier(specifier, this.#sourceFile.fileName)?.resolvedFileName ??
      resolve(dirname(this.#sourceFile.fileName), specifier.text)
    );
  }

  #record(entry: TypeImport): void {
    const existing = this.#imports.get(entry.name);
    if (!existing) this.#imports.set(entry.name, entry);
    else if (existing.from !== entry.from || existing.importedName !== entry.importedName)
      throw new Error(
        `"${entry.name}" refers to different types from ${existing.from} and ${entry.from}; rename one of them`,
      );
  }
}
