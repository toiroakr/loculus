import * as ts from 'typescript/ast';
import { SymbolFlags, type Checker } from 'typescript/sync';

export interface DescriptionTree {
  description?: string;
  fields?: Map<string, DescriptionTree>;
  element?: DescriptionTree;
  inputOnlyFields?: boolean;
}

const wrappers = new Set(['transform', 'refine', 'unflatten']);

export function readDescriptions(
  expression: ts.Expression | undefined,
  checker: Checker,
  seen = new Set<ts.Node>(),
): DescriptionTree {
  const node = expression && unwrap(expression);
  if (!node || seen.has(node)) return {};
  seen.add(node);
  if (ts.isIdentifier(node)) {
    let symbol = checker.getSymbolAtLocation(node);
    if (symbol?.flags && symbol.flags & SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const declaration = symbol?.valueDeclaration?.resolve();
    return declaration && ts.isVariableDeclaration(declaration)
      ? readDescriptions(declaration.initializer, checker, seen)
      : {};
  }
  if (!ts.isCallExpression(node)) return {};
  const callee = node.expression;
  const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : '';
  const args = node.arguments ?? [];
  if (wrappers.has(name)) {
    const inner = readDescriptions(args[0], checker, seen);
    const options = name === 'unflatten' ? undefined : readOwnDescription(args.slice(1));
    return {
      ...inner,
      ...(options === undefined ? {} : { description: options }),
      ...(name === 'unflatten' ? { inputOnlyFields: true } : {}),
    };
  }
  const tree: DescriptionTree = {};
  const shape = args[0] && unwrap(args[0]);
  if (name === 'object' && shape && ts.isObjectLiteralExpression(shape)) {
    tree.fields = new Map();
    for (const property of shape.properties) {
      if (ts.isPropertyAssignment(property)) {
        const key = propertyKey(property.name);
        if (key !== undefined) tree.fields.set(key, readDescriptions(property.initializer, checker, new Set(seen)));
      } else if (ts.isShorthandPropertyAssignment(property)) {
        const symbol = checker.getShorthandAssignmentValueSymbol(property);
        const declaration = symbol?.valueDeclaration?.resolve();
        tree.fields.set(
          propertyKey(property.name) ?? property.name.getText(),
          declaration && ts.isVariableDeclaration(declaration)
            ? readDescriptions(declaration.initializer, checker, new Set(seen))
            : {},
        );
      }
    }
    const description = readOwnDescription(args.slice(1));
    if (description !== undefined) tree.description = description;
    return tree;
  }
  if (name === 'array') {
    const element = readDescriptions(args[0], checker, seen);
    if (element.fields) tree.element = element;
    const description = readOwnDescription(args.slice(1));
    if (description !== undefined) tree.description = description;
    return tree;
  }
  const description = readOwnDescription(args);
  if (description !== undefined) tree.description = description;
  return tree;
}

function readOwnDescription(args: readonly ts.Expression[]): string | undefined {
  for (const arg of args) {
    const node = unwrap(arg);
    if (!ts.isObjectLiteralExpression(node)) continue;
    const property = node.properties.find(
      (property) => ts.isPropertyAssignment(property) && propertyKey(property.name) === 'description',
    );
    if (!property || !ts.isPropertyAssignment(property)) continue;
    const value = property.initializer && unwrap(property.initializer);
    if (value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))) return value.text;
  }
  return undefined;
}

function propertyKey(name: ts.Node): string | undefined {
  if (
    ts.isIdentifier(name) ||
    ts.isPrivateIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name) ||
    ts.isNumericLiteral(name)
  )
    return name.text;
  if (ts.isComputedPropertyName(name)) {
    const inner = unwrap(name.expression);
    if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) return inner.text;
  }
  return undefined;
}

function unwrap(node: ts.Node): ts.Node {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  )
    current = current.expression;
  return current;
}
