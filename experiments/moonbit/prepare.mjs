import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { transform } from 'esbuild';
const source = readFileSync(new URL('../../bench/run.ts', import.meta.url), 'utf8').split('const imports = [')[0].replace('../src/index.js', '../../../dist/index.js');
mkdirSync(new URL('generated', import.meta.url), { recursive: true });
const result = await transform(source + '\nexport {cases};', { loader: 'ts', format: 'esm' });
writeFileSync(new URL('generated/fixtures.mjs', import.meta.url), result.code);
