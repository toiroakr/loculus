import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import {
  Node,
  Project,
  SyntaxKind,
  ts,
  type SourceFile,
  type Symbol as MorphSymbol,
  type Type,
  type VariableDeclaration,
} from 'ts-morph';
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
  readonly declaration: VariableDeclaration;
}

const builderFlags =
  ts.NodeBuilderFlags.NoTruncation | ts.NodeBuilderFlags.InTypeAlias | ts.NodeBuilderFlags.MultilineObjectLiterals;
const docMarker = /^([ \t]*)\/\*\*__LOCULUS_DOC_(\d+)__\*\/\n/gm;

/** Reads `Input` and `Output` types of exported Loculus schemas with the TypeScript compiler. */
export class LoculusTypeExtractor {
  readonly #project: Project;
  readonly #cwd: string;

  constructor(options: ExtractorOptions = {}) {
    this.#cwd = resolve(options.cwd ?? process.cwd());
    const tsConfigFilePath = options.project ? resolve(this.#cwd, options.project) : findTsConfig(this.#cwd);
    this.#project = tsConfigFilePath
      ? new Project({ tsConfigFilePath, skipAddingFilesFromTsConfig: true })
      : new Project({
          compilerOptions: {
            strict: true,
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.NodeNext,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
            skipLibCheck: true,
          },
        });
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
    return candidates.map(({ exportName, declaration }) => {
      const tree = options.withDescriptions ? readDescriptions(declaration.getInitializer()) : {};
      const references = new References(sourceFile);
      const schemaType = declaration.getType().compilerType;
      const order = this.#shapeOrder(schemaType, declaration.compilerNode);
      const input = this.#print(declaration, schemaType, '_input', tree, order, false, references);
      const output = this.#print(declaration, schemaType, '_output', tree, order, true, references);
      const description = options.withDescriptions ? tree.description : undefined;
      return {
        schemaName: exportName,
        filePath: sourceFile.getFilePath(),
        input,
        output,
        ...(description === undefined ? {} : { description }),
        imports: references.imports(),
        warnings: references.warnings,
      };
    });
  }

  /** Extracts one exported Loculus schema. Throws when it is not found. */
  extract(filePath: string, schemaName: string, options: Omit<ExtractOptions, 'schemas'> = {}): ExtractedSchema {
    const [result] = this.extractAll(filePath, { ...options, schemas: [schemaName] });
    if (!result) throw new Error(`Loculus schema "${schemaName}" is not exported from ${filePath}`);
    return result;
  }

  #sourceFile(filePath: string): SourceFile {
    const absolute = resolve(this.#cwd, filePath);
    const existing = this.#project.getSourceFile(absolute);
    if (existing) return existing;
    const sourceFile = this.#project.addSourceFileAtPath(absolute);
    this.#project.resolveSourceFileDependencies();
    return sourceFile;
  }

  #candidates(sourceFile: SourceFile): Candidate[] {
    const candidates: Candidate[] = [];
    for (const [exportName, declarations] of sourceFile.getExportedDeclarations()) {
      if (exportName === 'default') continue;
      for (const declaration of declarations) {
        if (
          Node.isVariableDeclaration(declaration) &&
          declaration.getSourceFile() === sourceFile &&
          isLoculusSchema(declaration.getType(), declaration)
        ) {
          candidates.push({ exportName, declaration });
        }
      }
    }
    return candidates.sort((a, b) => a.declaration.getStart() - b.declaration.getStart());
  }

  /** Field order of `object()` shapes, which the printed intersection types do not keep. */
  #shapeOrder(type: ts.Type, location: ts.Node, depth = 0): ShapeOrder | undefined {
    const checker = this.#project.getTypeChecker().compilerObject;
    const shape = type.getProperty('shape');
    if (!shape || depth > 32) return undefined;
    const fields = new Map<string, ShapeOrder | undefined>();
    for (const property of checker.getTypeOfSymbolAtLocation(shape, location).getProperties()) {
      fields.set(
        property.getName(),
        this.#shapeOrder(checker.getTypeOfSymbolAtLocation(property, location), location, depth + 1),
      );
    }
    return fields;
  }

  #print(
    declaration: VariableDeclaration,
    schemaType: ts.Type,
    marker: '_input' | '_output',
    tree: DescriptionTree,
    order: ShapeOrder | undefined,
    output: boolean,
    references: References,
  ): string {
    const checker = this.#project.getTypeChecker().compilerObject;
    const location = declaration.compilerNode;
    const property = schemaType.getProperty(marker);
    if (!property) throw new Error(`${declaration.getName()} has no ${marker} type`);
    const node = reorder(
      new TypeNodeBuilder(checker, location).build(checker.getTypeOfSymbolAtLocation(property, location)),
      order,
    );
    const docs: string[] = [];
    annotate(node, tree, output, docs);
    references.collect(node);
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
    let text = printer.printNode(ts.EmitHint.Unspecified, node, declaration.getSourceFile().compilerNode);
    text = text.replace(/^( {4})+/gm, (indent) => ' '.repeat(indent.length / 2));
    text = references.replaceImportTypes(text);
    return text.replace(docMarker, (_, indent: string, index: string) => formatDoc(docs[Number(index)]!, indent));
  }
}

/**
 * Builds a type node that spells out anonymous object types, intersections and
 * helper aliases such as `ObjectInput`, while keeping named interfaces and
 * classes (`Date`, `URL`, user interfaces) as references.
 */
class TypeNodeBuilder {
  readonly #checker: ts.TypeChecker;
  readonly #location: ts.Node;
  readonly #visiting = new Set<ts.Type>();

  constructor(checker: ts.TypeChecker, location: ts.Node) {
    this.#checker = checker;
    this.#location = location;
  }

  build(type: ts.Type): ts.TypeNode {
    if (!this.#needsExpansion(type, new Set())) return this.#reference(type);
    if (this.#visiting.has(type)) return this.#reference(type);
    this.#visiting.add(type);
    try {
      return this.#expand(type);
    } finally {
      this.#visiting.delete(type);
    }
  }

  #expand(type: ts.Type): ts.TypeNode {
    const checker = this.#checker;
    const { factory } = ts;
    if (type.isUnion()) {
      const members: ts.TypeNode[] = [];
      const booleans = type.types.filter((member) => member.flags & ts.TypeFlags.BooleanLiteral);
      // Print null and undefined last, like the compiler does.
      const nullish = (member: ts.Type) =>
        member.flags & ts.TypeFlags.Undefined ? 2 : member.flags & ts.TypeFlags.Null ? 1 : 0;
      for (const member of [...type.types].sort((a, b) => nullish(a) - nullish(b))) {
        if (member.flags & ts.TypeFlags.BooleanLiteral && booleans.length === 2) {
          if (member === booleans[0]) members.push(factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword));
          continue;
        }
        const node = this.build(member);
        members.push(
          ts.isFunctionTypeNode(node) || ts.isConstructorTypeNode(node) || ts.isConditionalTypeNode(node)
            ? factory.createParenthesizedType(node)
            : node,
        );
      }
      return factory.createUnionTypeNode(members);
    }
    if (checker.isArrayType(type)) {
      const [element] = checker.getTypeArguments(type as ts.TypeReference);
      let node = this.build(element!);
      if (
        ts.isUnionTypeNode(node) ||
        ts.isIntersectionTypeNode(node) ||
        ts.isFunctionTypeNode(node) ||
        ts.isConditionalTypeNode(node)
      )
        node = factory.createParenthesizedType(node);
      const array = factory.createArrayTypeNode(node);
      return isReadonlyArray(type) ? factory.createTypeOperatorNode(ts.SyntaxKind.ReadonlyKeyword, array) : array;
    }
    if (checker.isTupleType(type)) {
      const target = (type as ts.TypeReference).target as ts.TupleType;
      const elements = checker.getTypeArguments(type as ts.TypeReference).map((element, index) => {
        const flags = target.elementFlags[index]!;
        const node = this.build(element);
        if (flags & ts.ElementFlags.Rest) return factory.createRestTypeNode(factory.createArrayTypeNode(node));
        return flags & ts.ElementFlags.Optional ? factory.createOptionalTypeNode(node) : node;
      });
      const tuple = factory.createTupleTypeNode(elements);
      return target.readonly ? factory.createTypeOperatorNode(ts.SyntaxKind.ReadonlyKeyword, tuple) : tuple;
    }
    const members = checker.getPropertiesOfType(type).map((property) => {
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      const propertyType = checker.getTypeOfSymbolAtLocation(property, this.#location);
      const readonly = declaration
        ? (ts.getCombinedModifierFlags(declaration as ts.Declaration) & ts.ModifierFlags.Readonly) !== 0
        : false;
      return factory.createPropertySignature(
        readonly ? [factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)] : undefined,
        propertyName(property.getName()),
        property.flags & ts.SymbolFlags.Optional ? factory.createToken(ts.SyntaxKind.QuestionToken) : undefined,
        this.build(propertyType),
      );
    });
    const indexInfos = checker
      .getIndexInfosOfType(type)
      .map((info) =>
        factory.createIndexSignature(
          info.isReadonly ? [factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)] : undefined,
          [factory.createParameterDeclaration(undefined, undefined, 'key', undefined, this.#reference(info.keyType))],
          this.build(info.type),
        ),
      );
    return factory.createTypeLiteralNode([...indexInfos, ...members]);
  }

  /** Whether the type contains an anonymous object or intersection the compiler would print by alias. */
  #needsExpansion(type: ts.Type, seen: Set<ts.Type>): boolean {
    if (seen.has(type)) return false;
    seen.add(type);
    if (type.aliasSymbol && type.flags & (ts.TypeFlags.Object | ts.TypeFlags.UnionOrIntersection)) return true;
    if (type.isUnion()) return type.types.some((member) => this.#needsExpansion(member, seen));
    if (type.isIntersection()) return true;
    if (this.#checker.isArrayType(type) || this.#checker.isTupleType(type)) {
      return this.#checker
        .getTypeArguments(type as ts.TypeReference)
        .some((member) => this.#needsExpansion(member, seen));
    }
    if (!(type.flags & ts.TypeFlags.Object)) return false;
    if (isNamed(type)) return false;
    if (type.getCallSignatures().length || type.getConstructSignatures().length) return false;
    return true;
  }

  #reference(type: ts.Type): ts.TypeNode {
    const node = this.#checker.typeToTypeNode(type, this.#location, builderFlags);
    if (!node) throw new Error(`Cannot print type ${this.#checker.typeToString(type)}`);
    return node;
  }
}

function isNamed(type: ts.Type): boolean {
  const symbol = type.getSymbol();
  return (
    symbol !== undefined &&
    (symbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface | ts.SymbolFlags.Enum)) !== 0
  );
}

function isReadonlyArray(type: ts.Type): boolean {
  return (type as ts.TypeReference).target?.getSymbol()?.getName() === 'ReadonlyArray';
}

function propertyName(name: string): ts.PropertyName {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? ts.factory.createIdentifier(name) : ts.factory.createStringLiteral(name);
}

function isLoculusSchema(type: Type, node: Node): boolean {
  const standard = type.getProperty('~standard');
  if (!standard || !type.getProperty('_input') || !type.getProperty('_output')) return false;
  const vendor = standard.getTypeAtLocation(node).getProperty('vendor')?.getTypeAtLocation(node);
  return vendor?.isStringLiteral() === true && vendor.getLiteralValue() === 'loculus';
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
  const name = member.name;
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    ? name.text
    : undefined;
}

function reorder(node: ts.TypeNode, order: ShapeOrder | undefined): ts.TypeNode {
  if (!order || !ts.isTypeLiteralNode(node)) return node;
  const keys = [...order.keys()];
  const rank = (member: ts.TypeElement) => {
    const index = keys.indexOf(memberName(member) ?? '');
    return index === -1 ? keys.length : index;
  };
  const members = node.members.map((member, index) => {
    const child = order.get(memberName(member) ?? '');
    const updated =
      child && ts.isPropertySignature(member) && member.type
        ? ts.factory.updatePropertySignature(
            member,
            member.modifiers,
            member.name,
            member.questionToken,
            reorder(member.type, child),
          )
        : member;
    return { member: updated, rank: rank(member), index };
  });
  members.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return ts.factory.updateTypeLiteralNode(node, ts.factory.createNodeArray(members.map((entry) => entry.member)));
}

function annotate(node: ts.TypeNode, tree: DescriptionTree, output: boolean, docs: string[]): void {
  if (tree.inputOnlyFields && output) return;
  if (ts.isTypeOperatorNode(node)) return annotate(node.type, tree, output, docs);
  if (ts.isArrayTypeNode(node)) {
    if (tree.element) annotate(node.elementType, tree.element, output, docs);
    return;
  }
  if (ts.isParenthesizedTypeNode(node)) return annotate(node.type, tree, output, docs);
  if (ts.isUnionTypeNode(node)) {
    for (const member of node.types) annotate(member, tree, output, docs);
    return;
  }
  if (!ts.isTypeLiteralNode(node) || !tree.fields) return;
  for (const member of node.members) {
    if (!ts.isPropertySignature(member)) continue;
    const name = memberName(member);
    const field = name === undefined ? undefined : tree.fields.get(name);
    if (!field) continue;
    if (field.description !== undefined) {
      ts.addSyntheticLeadingComment(
        member,
        ts.SyntaxKind.MultiLineCommentTrivia,
        `*__LOCULUS_DOC_${docs.length}__`,
        true,
      );
      docs.push(field.description);
    }
    if (member.type) annotate(member.type, field, output, docs);
  }
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
  readonly #sourceFile: SourceFile;
  readonly #scope: Map<string, MorphSymbol>;
  readonly #imports = new Map<string, TypeImport>();

  constructor(sourceFile: SourceFile) {
    this.#sourceFile = sourceFile;
    this.#scope = new Map(
      sourceFile
        .getProject()
        .getTypeChecker()
        .getSymbolsInScope(sourceFile, ts.SymbolFlags.Type | ts.SymbolFlags.Namespace | ts.SymbolFlags.Alias)
        .map((symbol) => [symbol.getName(), symbol]),
    );
  }

  imports(): TypeImport[] {
    return [...this.#imports.values()];
  }

  collect(node: ts.Node): void {
    if (ts.isTypeReferenceNode(node)) {
      let name: ts.EntityName = node.typeName;
      while (ts.isQualifiedName(name)) name = name.left;
      this.#add(name.text);
    }
    ts.forEachChild(node, (child) => this.collect(child));
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
    const result = ts.resolveModuleName(
      specifier,
      this.#sourceFile.getFilePath(),
      this.#sourceFile.getProject().getCompilerOptions(),
      ts.sys,
    );
    return result.resolvedModule?.resolvedFileName ?? resolve(this.#sourceFile.getDirectoryPath(), specifier);
  }

  #add(name: string): void {
    if (this.#imports.has(name)) return;
    const symbol = this.#scope.get(name);
    if (!symbol) return;
    const declaration = symbol.getDeclarations()[0];
    if (!declaration) return;
    if (Node.isImportSpecifier(declaration)) {
      const importDeclaration = declaration.getImportDeclaration();
      this.#record({ name, importedName: declaration.getName(), from: this.#moduleOf(importDeclaration) });
    } else if (Node.isImportClause(declaration)) {
      const importDeclaration = declaration.getParent();
      if (Node.isImportDeclaration(importDeclaration))
        this.#record({ name, importedName: 'default', from: this.#moduleOf(importDeclaration) });
    } else if (Node.isNamespaceImport(declaration)) {
      this.#record({
        name,
        importedName: '*',
        from: this.#moduleOf(declaration.getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration)),
      });
    } else if (declaration.getSourceFile() === this.#sourceFile) {
      const exported = [...this.#sourceFile.getExportedDeclarations()].find(([, nodes]) =>
        nodes.includes(declaration as never),
      );
      if (exported) this.#record({ name, importedName: exported[0], from: this.#sourceFile.getFilePath() });
      else
        this.warnings.push(
          `Type "${name}" is used by a schema but is not exported from ${this.#sourceFile.getFilePath()}`,
        );
    }
  }

  #moduleOf(importDeclaration: {
    getModuleSpecifierValue(): string;
    getModuleSpecifierSourceFile(): SourceFile | undefined;
  }): string {
    const specifier = importDeclaration.getModuleSpecifierValue();
    if (!specifier.startsWith('.') && !isAbsolute(specifier)) return specifier;
    return (
      importDeclaration.getModuleSpecifierSourceFile()?.getFilePath() ??
      resolve(this.#sourceFile.getDirectoryPath(), specifier)
    );
  }

  #record(entry: TypeImport): void {
    if (!this.#imports.has(entry.name)) this.#imports.set(entry.name, entry);
  }
}
