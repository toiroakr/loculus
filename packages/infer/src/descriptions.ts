import { Node, SyntaxKind, type Expression, type ObjectLiteralExpression } from 'ts-morph';

/** Descriptions found in a schema expression, keyed by object field. */
export interface DescriptionTree {
  description?: string;
  fields?: Map<string, DescriptionTree>;
  element?: DescriptionTree;
  /** The output is restructured (`unflatten`), so `fields` only describe the input. */
  inputOnlyFields?: boolean;
}

const wrappers = new Set(['transform', 'refine', 'unflatten']);

/**
 * Statically reads `description` options from a schema expression such as
 * `l.object({ name: l.string({ description: '...' }) }, { description: '...' })`.
 * Only string literals are read; anything else is ignored.
 */
export function readDescriptions(expression: Expression | undefined, seen = new Set<Node>()): DescriptionTree {
  const node = expression && unwrap(expression);
  if (!node || seen.has(node)) return {};
  seen.add(node);
  if (Node.isIdentifier(node)) {
    const declaration = (node.getSymbol()?.getAliasedSymbol() ?? node.getSymbol())?.getValueDeclaration();
    return Node.isVariableDeclaration(declaration) ? readDescriptions(declaration.getInitializer(), seen) : {};
  }
  if (!Node.isCallExpression(node)) return {};
  const callee = node.getExpression();
  const name = Node.isPropertyAccessExpression(callee)
    ? callee.getName()
    : Node.isIdentifier(callee)
      ? callee.getText()
      : '';
  const args = node.getArguments() as Expression[];
  if (wrappers.has(name)) {
    const inner = readDescriptions(args[0], seen);
    const options = name === 'unflatten' ? undefined : readOwnDescription(args.slice(1));
    return {
      ...inner,
      ...(options === undefined ? {} : { description: options }),
      ...(name === 'unflatten' ? { inputOnlyFields: true } : {}),
    };
  }
  const tree: DescriptionTree = {};
  if (name === 'object' && args[0] && Node.isObjectLiteralExpression(unwrap(args[0]))) {
    tree.fields = readShape(unwrap(args[0]) as ObjectLiteralExpression, seen);
    const description = readOwnDescription(args.slice(1));
    if (description !== undefined) tree.description = description;
    return tree;
  }
  if (name === 'array') {
    const element = readDescriptions(args[0], seen);
    if (element.fields) tree.element = element;
    const description = readOwnDescription(args.slice(1));
    if (description !== undefined) tree.description = description;
    return tree;
  }
  const description = readOwnDescription(args);
  if (description !== undefined) tree.description = description;
  return tree;
}

function readShape(shape: ObjectLiteralExpression, seen: Set<Node>): Map<string, DescriptionTree> {
  const fields = new Map<string, DescriptionTree>();
  for (const property of shape.getProperties()) {
    if (Node.isPropertyAssignment(property)) {
      const key = propertyKey(property.getNameNode());
      if (key !== undefined) fields.set(key, readDescriptions(property.getInitializer(), new Set(seen)));
    } else if (Node.isShorthandPropertyAssignment(property)) {
      fields.set(property.getName(), readDescriptions(property.getNameNode(), new Set(seen)));
    }
  }
  return fields;
}

function readOwnDescription(args: readonly Expression[]): string | undefined {
  for (const arg of args) {
    const node = unwrap(arg);
    if (!Node.isObjectLiteralExpression(node)) continue;
    const property = node.getProperty('description');
    if (!Node.isPropertyAssignment(property)) continue;
    const value = property.getInitializer() && unwrap(property.getInitializerOrThrow());
    if (Node.isStringLiteral(value) || Node.isNoSubstitutionTemplateLiteral(value)) return value.getLiteralValue();
  }
  return undefined;
}

function propertyKey(name: Node): string | undefined {
  if (Node.isIdentifier(name) || Node.isPrivateIdentifier(name)) return name.getText();
  if (Node.isStringLiteral(name) || Node.isNoSubstitutionTemplateLiteral(name) || Node.isNumericLiteral(name))
    return name.getLiteralText();
  if (Node.isComputedPropertyName(name)) {
    const inner = unwrap(name.getExpression());
    if (Node.isStringLiteral(inner) || Node.isNoSubstitutionTemplateLiteral(inner)) return inner.getLiteralValue();
  }
  return undefined;
}

function unwrap(node: Node): Node {
  let current = node;
  while (
    current.isKind(SyntaxKind.ParenthesizedExpression) ||
    current.isKind(SyntaxKind.AsExpression) ||
    current.isKind(SyntaxKind.SatisfiesExpression) ||
    current.isKind(SyntaxKind.NonNullExpression)
  )
    current = current.getExpression();
  return current;
}
