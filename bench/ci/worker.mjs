import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {cpus, platform, arch} from 'node:os';
import {pathToFileURL} from 'node:url';
import {median, orderedEntries} from './metrics.mjs';

const [manifestFile, outputFile, passText] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
const pass = Number(passText);
assert.ok(Number.isInteger(pass) && pass >= 0 && pass < manifest.protocol.processes, 'Invalid benchmark pass');
const runtime = process.versions.bun ? 'bun' : 'node';
const environment = {runtime, version: runtime === 'bun' ? process.versions.bun : process.version, cpu: cpus()[0].model, platform: platform(), arch: arch()};
assert.equal(environment.version, manifest.environment[runtime], 'Runtime version differs from preparation');
function consume(value) {
  if (value === undefined || value === null) return 1;
  if (typeof value === 'string') return value.length + 1;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 1;
  if (typeof value === 'boolean') return value ? 2 : 1;
  if (value instanceof Date) return value.getTime();
  let sum = 1;
  for (const key of Object.keys(value)) sum += consume(value[key]);
  return sum;
}
const output = {};
for (const entry of orderedEntries(manifest.entries, pass)) {
  const module = await import(pathToFileURL(entry.file));
  output[entry.key] = {};
  for (const mode of manifest.protocol.modes) {
    const data = mode === 'invalid' ? module.bad : module.good;
    assert.ok(data.length);
    let checksum = 0;
    const batch = iterations => {
      for (let i = 0; i < iterations; i++) {
        const schema = mode === 'construct' ? module.createSchema() : module.schema;
        const result = schema['~standard'].validate(data[i % data.length]);
        checksum += result.issues ? result.issues.length : consume(result.value);
      }
    };
    const start = performance.now();
    let warmup = 0;
    do { batch(256); warmup += 256; } while (performance.now() - start < manifest.protocol.warmupMs);
    const iterations = Math.max(128, Math.min(1000000, Math.ceil(warmup * manifest.protocol.roundMs / (performance.now() - start))));
    const samples = [];
    for (let round = 0; round < manifest.protocol.rounds; round++) {
      const start = performance.now();
      batch(iterations);
      samples.push((performance.now() - start) * 1e6 / iterations);
    }
    assert.ok(Number.isFinite(checksum) && checksum !== 0);
    output[entry.key][mode] = {median: median(samples), samples, checksum, iterations, warmup};
  }
}
writeFileSync(outputFile, JSON.stringify({fingerprint: manifest.fingerprint, pass, environment, measurements: output}));
