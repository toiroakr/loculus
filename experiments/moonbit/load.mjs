import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { host } from './host.mjs';

export async function loadCores() {
  const jsStart = performance.now();
  const js = await import('./_build/js/release/build/core/core.js');
  const jsImportMs = performance.now() - jsStart;
  const bytes = readFileSync(new URL('./_build/wasm-gc/release/build/core/core.wasm', import.meta.url));
  const start = performance.now();
  const module = await WebAssembly.compile(bytes, { builtins: ['js-string'], importedStringConstants: '_' });
  const compileMs = performance.now() - start;
  const instantiateStart = performance.now();
  const instance = await WebAssembly.instantiate(module, { host });
  return { js, wasm: instance.exports, startup: { jsImportMs, wasmCompileMs: compileMs, wasmInstantiateMs: performance.now() - instantiateStart } };
}
