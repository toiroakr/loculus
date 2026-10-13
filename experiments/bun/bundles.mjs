import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { rolldown } from 'rolldown';

const directory = 'experiments/bun/generated';
const bun = process.env.BUN_BIN ?? 'bun';
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const baseline = JSON.parse(readFileSync('experiments/bun/results-before-size.json'));
const report = {
  date: new Date().toISOString(), sourceHash: hash('src/index.ts'), distHash: hash('dist/index.js'),
  scope: 'browser ESM, minified, schema and Standard Schema validate exports, no timing harness',
  versions: { bun: spawnSync(bun, ['--version'], { encoding: 'utf8' }).stdout.trim(), ...Object.fromEntries(['esbuild', 'rolldown', 'zod', 'valibot'].map(name => [name, JSON.parse(readFileSync(`node_modules/${name}/package.json`)).version])) },
  cases: {},
};
for (const profile of ['strings-3', 'strings-30', 'cli']) {
  for (const library of ['loculus', 'zod', 'valibot']) {
    const name = `${library}-${profile}`;
    const entry = resolve(`${directory}/${name}-browser.ts`);
    const probes = JSON.parse(readFileSync(`experiments/perry/generated/${name}-direct.ts`, 'utf8').match(/const probes=(.*);/)[1]);
    for (const bundler of ['bun', 'esbuild', 'rolldown']) {
      let code;
      if (bundler === 'bun') {
        const output = `${directory}/${name}-browser.js`;
        const built = spawnSync(bun, ['build', '--target', 'browser', '--format', 'esm', '--minify', entry, '--outfile', output], { encoding: 'utf8' });
        assert.equal(built.status, 0, built.stderr);
        code = readFileSync(output, 'utf8');
      } else if (bundler === 'esbuild') {
        const result = await build({ entryPoints: [entry], bundle: true, minify: true, treeShaking: true, platform: 'browser', format: 'esm', target: 'es2022', write: false });
        code = result.outputFiles[0].text;
      } else {
        const bundle = await rolldown({ input: entry, platform: 'browser' });
        try {
          const result = await bundle.generate({ format: 'esm', minify: true });
          assert.equal(result.output.length, 1);
          code = result.output[0].code;
        } finally { await bundle.close(); }
      }
      const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
      const results = probes.map((input, index) => {
        const r = module.validate(input);
        return JSON.parse(JSON.stringify({ kind: 'probe', index, ok: !r.issues, value: r.value, issueCount: r.issues?.length ?? 0 }));
      });
      assert.deepEqual(results, baseline.cases[name].probes);
      report.cases[`${bundler}/${name}`] = { bytes: Buffer.byteLength(code), gzipBytes: gzipSync(code).length, verifiedProbes: probes.length };
    }
  }
}
for (const bundler of ['bun', 'esbuild', 'rolldown']) for (const profile of ['strings-3', 'strings-30', 'cli']) {
  const a = report.cases[`${bundler}/loculus-${profile}`];
  const b = report.cases[`${bundler}/valibot-${profile}`];
  assert.ok(a.bytes < b.bytes, `${bundler}/${profile}: raw size regression`);
  assert.ok(a.gzipBytes < b.gzipBytes, `${bundler}/${profile}: gzip size regression`);
  console.log(`${bundler}/${profile}: loculus ${a.bytes}/${a.gzipBytes}; Valibot ${b.bytes}/${b.gzipBytes} bytes/gzip`);
}
assert.equal(hash('src/index.ts'), report.sourceHash);
assert.equal(hash('dist/index.js'), report.distHash);
report.completed = true;
writeFileSync('experiments/bun/bundle-results.json', JSON.stringify(report, null, 2) + '\n');
