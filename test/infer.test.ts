import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';
import { findOutdated, formatTypes, generate, LoculusTypeExtractor, renderModule } from '../packages/infer/src/index.js';
import { main } from '../packages/infer/src/cli.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/infer/schemas.ts', import.meta.url));
const extractor = new LoculusTypeExtractor({ cwd: root });

test('lists exported Loculus schemas in declaration order', () => {
  assert.deepEqual(extractor.listSchemas(fixture), ['QuerySchema', 'SameSchema', 'LinksSchema', 'EventSchema', 'OrderSchema', 'FlatSchema', 'HiddenSchema']);
});

test('extracts input and output types in shape order', () => {
  const query = extractor.extract(fixture, 'QuerySchema');
  assert.equal(query.input, `{
  search: string;
  page?: string | number | undefined;
  archived?: string | boolean | undefined;
  tag?: "docs" | "code" | readonly ("docs" | "code")[] | undefined;
  at?: string | null | undefined;
}`);
  assert.equal(query.output, `{
  search: string;
  page: number;
  archived: boolean;
  tag?: ("docs" | "code")[] | undefined;
  at?: Date | null | undefined;
}`);
  assert.equal(query.description, undefined);
});

test('keeps named classes and interfaces and reports their imports', () => {
  const links = extractor.extract(fixture, 'LinksSchema');
  assert.equal(links.output, `{
  home: URL;
  price: Money;
  tag: Tag;
  "status-code": 200 | 201;
}`);
  assert.deepEqual(links.imports.map(entry => [entry.name, entry.importedName, entry.from.replace(root, '')]), [
    ['Money', 'Money', 'test/fixtures/infer/money.ts'],
    ['Tag', 'Tag', 'test/fixtures/infer/schemas.ts'],
  ]);
  assert.deepEqual(extractor.extract(fixture, 'HiddenSchema').warnings, [`Type "Hidden" is used by a schema but is not exported from ${fixture}`]);
});

test('prints unions of object variants', () => {
  assert.equal(extractor.extract(fixture, 'EventSchema').output, `{
  type: "a";
  a: string;
} | {
  type: "b";
  b: number;
}`);
});

test('emits description options as TSDoc comments', () => {
  const [query] = extractor.extractAll(fixture, { schemas: ['QuerySchema'], withDescriptions: true });
  assert.equal(query?.description, 'Search query\nfrom the URL');
  assert.match(query!.input, /^ {2}\/\*\* Search words \*\/\n {2}search: string;$/m);
  const order = extractor.extract(fixture, 'OrderSchema', { withDescriptions: true });
  assert.equal(order.output, `{
  title: string;
  /** Ordered items */
  items: {
    /** Item name */
    name: string;
    quantity: number;
  }[];
}`);
  const flat = extractor.extract(fixture, 'FlatSchema', { withDescriptions: true });
  assert.match(flat.input, /\/\*\* User name \*\/\n {2}"user\.name": string;/);
  assert.equal(flat.output, `{
  user: {
    name: string;
    age: number;
  };
}`);
});

test('names types with suffix, map and merge options', () => {
  const schemas = extractor.extractAll(fixture, { schemas: ['QuerySchema', 'SameSchema'] });
  assert.deepEqual(formatTypes(schemas).map(type => type.name), ['QuerySchemaInput', 'QuerySchemaOutput', 'SameSchemaInput', 'SameSchemaOutput']);
  assert.deepEqual(formatTypes(schemas, { mergeSame: true, suffix: 'Schema', map: { QuerySchema: 'Query' } }).map(type => type.name), ['QueryInput', 'QueryOutput', 'Same']);
  assert.deepEqual(formatTypes(schemas, { outputOnly: true, suffix: 'Schema', outputSuffix: '' }).map(type => type.name), ['Query', 'Same']);
  assert.throws(() => formatTypes(schemas, { map: { QuerySchema: 'X', SameSchema: 'X' } }), /generated for both QuerySchema and SameSchema/);
});

test('renders modules with relative type imports', () => {
  const schemas = extractor.extractAll(fixture, { schemas: ['LinksSchema', 'QuerySchema'], withDescriptions: true });
  const text = renderModule(schemas, { outFile: join(root, 'test/fixtures/infer/out/types.ts'), outputOnly: true, suffix: 'Schema', outputSuffix: '' });
  assert.equal(text.split('\n\n')[0], 'import type { Money } from "../money.js";\nimport type { Tag } from "../schemas.js";');
  assert.match(text, /\/\*\*\n \* Search query\n \* from the URL\n \*\/\nexport type Query = \{/);
});

test('generated types are equal to Input and Output', async () => {
  const directory = await mkdtemp(join(root, 'test/fixtures/infer/.generated-'));
  try {
    const { files, warnings } = await generate({ cwd: root, include: ['test/fixtures/infer/*.ts'], exclude: ['**/money.ts'], schemas: extractor.listSchemas(fixture).filter(name => name !== 'HiddenSchema'), outFile: join(directory, 'types.ts'), withDescriptions: true, mergeSame: true });
    assert.equal(files.length, 1);
    assert.deepEqual(warnings, []);
    await writeFile(files[0]!.path!, files[0]!.content);
    const names = files[0]!.schemas.flatMap(schema => formatTypes([schema], { mergeSame: true }).map(type => ({ type, schema })));
    const checks = names.map(({ type, schema }) => {
        const helper = type.kind === 'output' ? 'Output' : 'Input';
        const left = `l.${helper}<typeof s.${schema.schemaName}>`;
        const lines = [`type Check${type.name} = Expect<Equal<t.${type.name}, ${left}>>;`];
        if (type.kind === 'merged') lines.push(`type Check${type.name}Output = Expect<Equal<t.${type.name}, l.Output<typeof s.${schema.schemaName}>>>;`);
        return lines.join('\n');
      });
    const checkFile = join(directory, 'check.ts');
    await writeFile(checkFile, `import type * as l from '../../../../src/index.js';
import type * as s from '../schemas.js';
import type * as t from './types.js';
// Loculus spells input types as intersections, so compare by mutual assignability and keys.
type Equal<A, B> = [A, keyof A] extends [B, keyof B] ? ([B, keyof B] extends [A, keyof A] ? true : false) : false;
type Expect<T extends true> = T;
${checks.join('\n')}
`);
    const project = new Project({ tsConfigFilePath: join(root, 'tsconfig.json'), skipAddingFilesFromTsConfig: true });
    project.addSourceFileAtPath(checkFile);
    project.resolveSourceFileDependencies();
    const diagnostics = project.getPreEmitDiagnostics().filter(diagnostic => diagnostic.getSourceFile()?.getFilePath().startsWith(directory));
    assert.deepEqual(diagnostics.map(diagnostic => project.formatDiagnosticsWithColorAndContext([diagnostic])), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('CLI writes per-file modules and checks them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'loculus-infer-'));
  const cwd = process.cwd();
  const write = process.stderr.write;
  process.chdir(root);
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    const args = ['test/fixtures/infer/schemas.ts', '--schemas', 'SameSchema', '--merge-same', '--suffix', 'Schema', '--outDir', directory];
    assert.equal(await main(args), 0);
    const written = await readFile(join(directory, 'schemas.types.ts'), 'utf8');
    assert.equal(written, `// Generated by @loculus/infer. Do not edit by hand.

export type Same = {
  name: string;
  kind: "a" | "b";
};
`);
    assert.equal(await main([...args, '--check']), 0);
    await writeFile(join(directory, 'schemas.types.ts'), 'stale');
    assert.equal(await main([...args, '--check']), 1);
    const { files } = await generate({ cwd: root, include: ['test/fixtures/infer/schemas.ts'], schemas: ['SameSchema'], outDir: directory, declaration: true });
    assert.equal(files[0]!.path, join(directory, 'schemas.types.d.ts'));
    assert.equal((await findOutdated(files)).length, 1);
  } finally {
    process.stderr.write = write;
    process.chdir(cwd);
    await rm(directory, { recursive: true, force: true });
  }
});
