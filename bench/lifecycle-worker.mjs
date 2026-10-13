import { performance } from 'node:perf_hooks';
import { makeSchema, importLibrary, inputFixture, normalize, expectedValues, expectedIssueCounts } from './lifecycle-fixtures.mjs';
const [profile,library,dataset,mode] = process.argv.slice(2);
const input = inputFixture(profile,dataset);
let sink = 0;
function observe(result) { sink += result.issues ? result.issues.length : Object.keys(result.value).length; }
const start = performance.now();
const api = await importLibrary(library);
const imported = performance.now();
let schema = makeSchema(api,library,profile);
const constructed = performance.now();
const validate = schema['~standard'].validate;
const normalized = normalize(profile,input);
const normalizedAt = performance.now();
const first = validate(normalized);
observe(first);
const validatedAt = performance.now();
if (dataset === 'valid') {
  if (first.issues || JSON.stringify(first.value) !== JSON.stringify(expectedValues[profile])) throw new Error('Output mismatch');
} else if (first.issues?.length !== expectedIssueCounts[profile]) throw new Error('Issue count mismatch');
const report = {
  importMs: imported-start, constructMs: constructed-imported,
  normalizeMs: normalizedAt-constructed, firstValidationMs: validatedAt-normalizedAt,
  schemaAndFirstMs: validatedAt-imported, importThroughFirstMs: validatedAt-start,
};
if (mode === 'repeated') {
  report.repeated = {};
  for (const kind of ['validation','withInput']) {
    const operation = kind === 'validation' ? () => observe(validate(normalized)) : () => observe(validate(normalize(profile,input)));
    for(let i=0;i<10000;i++) operation();
    const samples=[];
    for(let round=0;round<7;round++) {
      const begin=performance.now();
      for(let i=0;i<50000;i++) operation();
      samples.push((performance.now()-begin)*1e6/50000);
    }
    report.repeated[kind] = samples;
  }
}
report.sink = sink;
process.stdout.write(JSON.stringify(report));
