import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findOutdated, formatTypes, generate, LoculusTypeExtractor, renderModule } from '../packages/infer/src/index.js';
import { main } from '../packages/infer/src/cli.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/infer/schemas.ts', import.meta.url));
const extractor = new LoculusTypeExtractor({ cwd: root });

test('lists exported Loculus schemas in declaration order', () => {
  assert.deepEqual(extractor.listSchemas(fixture), ['QuerySchema', 'SameSchema', 'LinksSchema', 'EventSchema', 'OrderSchema', 'FlatSchema', 'HiddenSchema', 'WrapSchema', 'BrandSchema', 'PresenceSchema', 'LiteralSchema', 'CombinedSchema', 'ChoiceSchema', 'RefinedSchema', 'ReadonlyShapeSchema', 'ReturnSchema']);
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
  assert.deepEqual(extractor.extract(fixture, 'HiddenSchema').warnings, [`"Hidden" is used by a schema type but is not exported from ${fixture}`]);
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

test('omits union members absorbed by distributed intersections and keeps branded primitives', () => {
  assert.equal(extractor.extract(fixture, 'WrapSchema').input, `{
  value: string | readonly string[];
}`);
  assert.equal(extractor.extract(fixture, 'BrandSchema').output, `{
  id: string & {
    readonly brand: "Id";
  };
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

test('generated snapshot used by infer.test-d.ts is up to date', async () => {
  const { files } = await generate({
    cwd: root,
    include: ['test/fixtures/infer/schemas.ts'],
    schemas: extractor.listSchemas(fixture).filter(name => name !== 'HiddenSchema'),
    outFile: 'test/fixtures/infer/__generated__/schemas.types.ts',
    suffix: 'Schema',
    withDescriptions: true,
  });
  if (process.env.UPDATE_SNAPSHOTS) {
    await mkdir(join(root, 'test/fixtures/infer/__generated__'), { recursive: true });
    await writeFile(files[0]!.path!, files[0]!.content);
  }
  const outdated = await findOutdated(files);
  assert.deepEqual(outdated.map(file => file.path), [], 'Run UPDATE_SNAPSHOTS=1 node --import tsx --test test/infer.test.ts');
});

test('rejects one name bound to different types', async () => {
  const conflict = join(root, 'test/fixtures/infer/conflict');
  assert.throws(() => extractor.extract(join(conflict, 'schemas.ts'), 'BothSchema'), /"Result" refers to different types/);
  await assert.rejects(
    generate({ cwd: conflict, include: ['only-a.ts', 'only-b.ts'], outFile: 'types.ts' }),
    /"Result" would refer to both Result from \.\/a\.js and Result from \.\/b\.js/,
  );
  const links = extractor.extractAll(fixture, { schemas: ['LinksSchema'] });
  assert.throws(
    () => renderModule(links, { outputOnly: true, outputSuffix: '', map: { LinksSchema: 'Money' } }),
    /"Money" would refer to both the generated type Money and Money from/,
  );
  const { files } = await generate({ cwd: conflict, include: ['only-a.ts', 'only-b.ts'], outDir: 'out' });
  assert.equal(files.length, 2);
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
    await assert.rejects(main(['test/fixtures/infer/schemas.ts', '--check']), /--check needs --outDir or --outFile/);
    // A source without schemas makes its previous output obsolete, for both --check and writing.
    await writeFile(join(directory, 'money.types.ts'), 'stale');
    const moneyArgs = ['test/fixtures/infer/money.ts', '--outDir', directory];
    assert.equal(await main([...moneyArgs, '--check']), 1);
    assert.equal(await main(moneyArgs), 0);
    await assert.rejects(readFile(join(directory, 'money.types.ts')), { code: 'ENOENT' });
    assert.equal(await main([...moneyArgs, '--check']), 0);
    const out = join(directory, 'empty-suffix.ts');
    assert.equal(await main(['test/fixtures/infer/schemas.ts', '--schemas', 'SameSchema', '--output-only', '--suffix', 'Schema', '--output-suffix', '', '--outFile', out]), 0);
    assert.match(await readFile(out, 'utf8'), /export type Same = \{/);
  } finally {
    process.stderr.write = write;
    process.chdir(cwd);
    await rm(directory, { recursive: true, force: true });
  }
});
