import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseAst } from 'rolldown/parseAst';
import { rolldown } from 'rolldown';
import { build } from 'esbuild';
import { profiles, prelude } from '../coverage/fixtures.mjs';

const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const sourceHash = hash('src/index.ts');
const distHash = hash('dist/index.js');
const folder = resolve('bench/optimization-3/generated/modular');
mkdirSync(folder + '/internal', { recursive: true });
mkdirSync(folder + '/published', { recursive: true });
mkdirSync(folder + '/tests', { recursive: true });
const source = readFileSync('dist/index.js', 'utf8');
const program = parseAst(source);
const groups = {
  core: ['schema', 'field', 'fail', 'fieldPlan', 'emptyOptions', 'configuredField', 'own'],
  string: ['validateString', 'string'], number: ['decimal', 'number'],
  boolean: ['validateBoolean', 'boolean'], enum: ['EnumMeta', 'enum_'],
  literal: ['literal'], date: ['validateDate', 'date'], array: ['array'],
  object: ['object'], compile: ['appendCompiledIssues', 'compiledCheck', 'compiledRemainder', 'compileArray', 'compile'],
  transform: ['transform'], refine: ['refine'], union: ['union'], xor: ['xor'],
  'discriminated-union': ['discriminatedUnion'], intersection: ['intersection'],
  entries: ['fromEntries'], parse: ['safeParse', 'ValidationError', 'parse'],
};
const owner = new Map(Object.entries(groups).flatMap(([group, names]) => names.map(name => [name, group])));
const declarations = new Map();
let previousEnd = 0;
let exported;
for (const node of program.body) {
  if (node.type === 'ExportNamedDeclaration') { exported = node.specifiers; continue; }
  const names = node.type === 'FunctionDeclaration' ? [node.id.name] : node.type === 'VariableDeclaration' ? node.declarations.map(d => d.id.name) : [];
  assert.equal(names.length, 1, node.type);
  const gap = source.slice(previousEnd, node.start);
  const text = (gap.includes('@__NO_SIDE_EFFECTS__') ? '/* @__NO_SIDE_EFFECTS__ */\n' : '') + source.slice(node.start, node.end);
  declarations.set(names[0], { node, text });
  previousEnd = node.end;
}
assert.deepEqual([...declarations.keys()].sort(), [...owner.keys()].sort());
const publicNames = exported.map(s => ({ local: s.local.name, exported: s.exported.name }));
const references = node => {
  const found = new Set();
  const visit = (value, parent, key) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const child of value) visit(child, parent, key); return; }
    if (value.type === 'Identifier' && owner.has(value.name)) {
      if (key === 'id' || key === 'label' || key === 'params') return;
      if (key === 'property' && parent?.type === 'MemberExpression' && !parent.computed) return;
      if (key === 'key' && !parent?.computed && !parent?.shorthand) return;
      found.add(value.name);
    }
    for (const [name, child] of Object.entries(value)) if (name !== 'parent') visit(child, value, name);
  };
  visit(node);
  return found;
};
for (const [group, names] of Object.entries(groups)) {
  const deps = new Map();
  for (const name of names) for (const dependency of references(declarations.get(name).node)) {
    const target = owner.get(dependency);
    if (target !== group) {
      const list = deps.get(target) ?? new Set(); list.add(dependency); deps.set(target, list);
    }
  }
  const imported = [...deps].map(([target, names]) => `import { ${[...names].join(', ')} } from './${target}.mjs';`).join('\n');
  writeFileSync(folder + `/internal/${group}.mjs`, imported + '\n' + names.map(name => declarations.get(name).text).join('\n') + `\nexport { ${names.join(', ')} };\n`);
  if (group !== 'core') {
    const exports = publicNames.filter(name => owner.get(name.local) === group).map(name => name.local === name.exported ? name.local : `${name.local} as ${name.exported}`);
    writeFileSync(folder + `/${group}.mjs`, `export { ${exports.join(', ')} } from './internal/${group}.mjs';\n`);
  }
}
writeFileSync(folder + '/index.mjs', Object.keys(groups).filter(group => group !== 'core').map(group => `export * from './${group}.mjs';`).join('\n') + '\n');
const entries = Object.fromEntries(['index', ...Object.keys(groups).filter(g => g !== 'core')].map(name => [name, folder + `/${name}.mjs`]));
const publisher = await rolldown({ input: entries });
await publisher.write({ dir: folder + '/published', format: 'esm', entryFileNames: '[name].mjs', chunkFileNames: 'chunks/[name]-[hash].mjs' });
await publisher.close();
const original = await import(resolve('dist/index.js'));
const modular = await import(folder + '/published/index.mjs');
assert.deepEqual(Object.keys(modular).sort(), Object.keys(original).sort());
for (const { local, exported } of publicNames) {
  const group = owner.get(local);
  const entry = await import(folder + `/published/${group}.mjs`);
  assert.equal(entry[exported], modular[exported]);
}
const size = code => ({ bytes: Buffer.byteLength(code), gzipBytes: gzipSync(code).length, codeHash: createHash('sha256').update(code).digest('hex') });
const imported = (profile, variant, compiled = false) => {
  const expression = compiled ? `l.compile(${profile.expressions[0]})` : profile.expressions[0];
  if (variant !== 'direct') return `import * as l from '${variant === 'original' ? resolve('dist/index.js') : folder + '/published/index.mjs'}';\n${prelude}\nexport const schema=${expression};export const validate=input=>schema['~standard'].validate(input);`;
  const names = [...new Set([...expression.matchAll(/\bl\.([\w$]+)/g)].map(m => m[1]))];
  const imports = names.map(name => {
    const local = publicNames.find(n => n.exported === name).local;
    return `import { ${name} as l_${name} } from '${folder}/published/${owner.get(local)}.mjs';`;
  }).join('\n');
  return `${imports}\n${prelude}\nexport const schema=${expression.replace(/\bl\.([\w$]+)/g, (_, name) => 'l_' + name)};export const validate=input=>schema['~standard'].validate(input);`;
};
const report = { date: new Date().toISOString(), sourceHash, distHash, scope: 'Unchanged built JS split by element with one shared core, published as Rolldown multi-entry ESM; runtime-only prototype, not public package or declaration changes', cases: {}, compiled: {}, identityChecks: publicNames.length, completed: false };
const compiledIds = new Set(Object.values(JSON.parse(readFileSync('bench/optimization-3/compiled-settled-results.json')).cases).map(c => c.id));
for (const profile of profiles) for (const compiled of [false, true]) {
  if (compiled && !compiledIds.has(profile.id)) continue;
  const result = (compiled ? report.compiled : report.cases)[profile.id] = {};
  for (const variant of ['original', 'barrel', 'direct']) {
    const output = await build({ stdin: { contents: imported(profile, variant, compiled), resolveDir: resolve('.'), loader: 'js' }, bundle: true, minify: true, platform: 'browser', target: 'es2022', format: 'esm', write: false });
    result[variant] = size(output.outputFiles[0].text);
  }
}
const representative = ['string-basic', 'number-decimal', 'presence-default', 'array-strict', 'date', 'width-100'];
report.bundlers = {};
const bun = resolve('experiments/bun/generated/tools/bun-darwin-aarch64/bun');
for (const id of representative) {
  report.bundlers[id] = {};
  const profile = profiles.find(p => p.id === id);
  for (const variant of ['original', 'barrel', 'direct']) {
    const input = folder + `/${id}-${variant}.mjs`;
    writeFileSync(input, imported(profile, variant));
    const builder = await rolldown({ input });
    const output = await builder.generate({ format: 'esm', minify: true });
    await builder.close();
    assert.equal(output.output.length, 1);
    const bunOutput = execFileSync(bun, ['build', input, '--target=browser', '--format=esm', '--minify'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    report.bundlers[id][variant] = { esbuild: report.cases[id][variant], rolldown: size(output.output[0].code), bun: size(bunOutput) };
  }
}
for (const file of readdirSync('test').filter(name => name.endsWith('.test.ts'))) {
  await build({ entryPoints: ['test/' + file], outfile: folder + '/tests/' + file.replace('.ts','.mjs'), bundle: true, platform: 'node', format: 'esm', plugins: [{ name: 'modular-loculus', setup(builder) { builder.onResolve({ filter: /\.\.\/src\/index\.js$/ }, () => ({ path: folder + '/published/index.mjs' })); } }] });
}
report.runtimeRegressionTests = {};
const testFiles = readdirSync(folder + '/tests').filter(name => name.endsWith('.test.mjs')).map(name => folder + '/tests/' + name);
for (const [runtime, binary] of [['node',process.execPath],['bun',bun]]) {
  const result = spawnSync(binary, runtime === 'node' ? ['--test', ...testFiles] : ['test', ...testFiles], { encoding: 'utf8' });
  const output = result.stdout + result.stderr;
  const log = `/tmp/loculus-modularity-tests-${runtime}.log`;
  writeFileSync(log, output);
  assert.equal(result.status, 0, output);
  assert.match(output, runtime === 'node' ? /pass 57/ : /57 pass/);
  report.runtimeRegressionTests[runtime] = { passed: 57, log, logSha256: hash(log) };
}
assert.equal(hash('src/index.ts'), sourceHash);
assert.equal(hash('dist/index.js'), distHash);
report.completed = true;
writeFileSync('bench/optimization-3/modularity-results.json', JSON.stringify(report, null, 2) + '\n');
for (const key of ['cases', 'compiled']) {
  const rows = Object.values(report[key]);
  for (const variant of ['barrel', 'direct']) console.log(key, variant, { smaller: rows.filter(c => c[variant].gzipBytes < c.original.gzipBytes).length, larger: rows.filter(c => c[variant].gzipBytes > c.original.gzipBytes).length, same: rows.filter(c => c[variant].gzipBytes === c.original.gzipBytes).length, maxSaving: Math.max(...rows.map(c => c.original.gzipBytes - c[variant].gzipBytes)), maxGrowth: Math.max(...rows.map(c => c[variant].gzipBytes - c.original.gzipBytes)) });
}
