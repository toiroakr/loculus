import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const directory = 'experiments/bun/generated';
mkdirSync(directory, { recursive: true });
const base = JSON.parse(readFileSync('experiments/perry/generated/fixtures.json', 'utf8'));
const fixtures = [];
for (const fixture of base) {
  const direct = readFileSync(`experiments/perry/generated/${fixture.name}-direct.ts`, 'utf8');
  for (const optimized of fixture.library === 'zod' ? [false, true] : [false]) {
    const name = `${fixture.name}${optimized ? '-optimized' : ''}`;
    let source = direct.replace("'../../../dist/index.js'", "'./dist/index.js'");
    if (optimized && fixture.library === 'zod') source = source.replace('jitless:true', 'jitless:false');
    const split = source.indexOf("\nimport {performance}");
    let setup = source.slice(0, split);
    let harness = source.slice(split);
    const schemaIndex = setup.indexOf('const schema=');
    const imports = setup.slice(0, schemaIndex);
    const construction = setup.slice(schemaIndex);
    setup = `${imports}\nfunction createSchema(){${construction}return schema;}\nconst schema=createSchema();`;
    harness = harness.replace("const iterations=", "const constructing=process.argv[2]==='construct';\nconst warmup=constructing?100:10000;\nconst iterations=constructing?500:");
    harness = harness.replace('i<10000', 'i<warmup').replaceAll('const r=validate(input);', "const r=constructing?createSchema()['~standard'].validate(input):validate(input);");
    const result = await build({ stdin: { contents: setup + harness, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, treeShaking: true, minify: false, format: 'esm', platform: 'node', target: 'es2022', write: false });
    writeFileSync(`${directory}/${name}.mjs`, result.outputFiles[0].text);
    writeFileSync(`${directory}/${name}-browser.ts`, `${source.slice(0, split)}\nexport {schema};export const validate=input=>schema['~standard'].validate(input);` .replace("'./dist/index.js'", "'../../../dist/index.js'"));
    fixtures.push({ ...fixture, name, optimized });
  }
}
writeFileSync(`${directory}/baseline.mjs`, readFileSync('experiments/perry/generated/baseline.ts'));
writeFileSync(`${directory}/fixtures.json`, JSON.stringify(fixtures, null, 2));
console.log(`Prepared ${fixtures.length} Bun fixtures.`);
