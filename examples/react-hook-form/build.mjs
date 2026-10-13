import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';
import { loculusPlugin } from '../../packages/rolldown/dist/index.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('.', import.meta.url));
let generatedFields = false;
const bundle = await rolldown({
  input: dir + 'App.tsx', platform: 'browser',
  transform: { target: 'es2022', jsx: { runtime: 'automatic' }, define: { 'process.env.NODE_ENV': '"production"' } },
  plugins: [
    loculusPlugin({ modules: ['../../dist/index.js'], include: id => id === dir + 'schema.ts' }),
    { name: 'verify-schema-codegen', transform(code, id) {
      if (id === dir + 'schema.ts') generatedFields = code.includes('function __loculus_') && !code.includes('l.string(') && !code.includes('l.number(');
    } },
  ],
});
let output;
try { output = (await bundle.generate({ format: 'iife', minify: true })).output; }
finally { await bundle.close(); }
assert.ok(generatedFields, 'RHF schema scalar fields must use build-time code generation');
assert.equal(output.length, 1);
const css = await readFile(dir + 'style.css', 'utf8');
const code = output[0].code.replaceAll('</script', '<\\/script');
await mkdir(dir + 'generated', { recursive: true });
await writeFile(dir + 'generated/index.html', `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>loculus × React Hook Form</title><style>${css}</style></head>
<body><div id="root"></div><script>${code}</script></body></html>`);
console.log('Built standalone React Hook Form demo with Rolldown code generation.');
