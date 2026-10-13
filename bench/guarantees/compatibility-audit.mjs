import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import * as l from '../../dist/index.js';
import {z} from 'zod';
import * as v from 'valibot';
import {profiles, prelude} from '../coverage/fixtures.mjs';

function inputFor(profile, input) {
  if (!profile.format) return input;
  const entries = Object.entries(input).flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map(item => [key, item]));
  if (profile.format === 'url') return l.fromEntries(new URLSearchParams(entries));
  const form = new FormData();
  for (const [key, item] of entries) form.append(key, item);
  return l.fromEntries(form);
}

function run(schema, input) {
  try {
    const result = schema['~standard'].validate(input);
    if (result.issues) return {ok: false, paths: result.issues.map(issue => (issue.path ?? []).map(item => typeof item === 'object' ? item.key : item))};
    return {ok: true, value: result.value};
  } catch (error) { return {threw: error.name}; }
}

const cells = [];
for (const jitless of [false, true]) {
  z.config({jitless});
  for (const profile of profiles) {
    const schemas = profile.expressions.map(expression => new Function('l', 'z', 'v', prelude + '\nreturn ' + expression)(l, z, v));
    for (const [index, raw] of profile.probes.entries()) {
      const input = inputFor(profile, raw);
      const results = schemas.map(schema => run(schema, input));
      const matches = results.slice(1).map(peer => results[0].ok === peer.ok && (results[0].ok ? isDeepStrictEqual(results[0].value, peer.value) : results[0].threw === peer.threw));
      cells.push({profile: profile.id, index, jitless, code: profile.expressions, input, results: Object.fromEntries(['loculus', 'zod', 'valibot'].map((name, i) => [name, results[i]])), matches: Object.fromEntries(['zod', 'valibot'].map((name, i) => [name, matches[i]]))});
    }
  }
}
const unmatched = cells.filter(cell => !cell.matches.zod && !cell.matches.valibot);
const report = {
  completed: !unmatched.length,
  runtime: process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.version}`,
  versions: Object.fromEntries(['zod', 'valibot'].map(name => [name, JSON.parse(readFileSync(`node_modules/${name}/package.json`)).version])),
  sourceHashes: Object.fromEntries(['src/index.ts', 'packages/rolldown/src/index.ts', 'dist/index.js'].map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')])),
  profiles: profiles.length, cells: cells.length, unmatched, results: cells,
  scope: 'Acceptance and successful output equivalence for the existing composed fixtures, with Zod JIT on and off. Issue paths are recorded but not included in this equivalence gate. Arbitrary messages/codes and unsupported schema mutations are not parity claims. Numeric/boolean coercion and scalar wrapping use the explicit peer compositions recorded per case; native equivalent tests are in test/compatibility.test.ts.',
};
writeFileSync(process.argv[2] ?? 'bench/guarantees/compatibility-audit.json', JSON.stringify(report, (_key, value) => value === undefined ? {type: 'undefined'} : typeof value === 'number' && !Number.isFinite(value) ? {type: 'number', value: String(value)} : value, 2) + '\n');
console.log(JSON.stringify({profiles: profiles.length, cells: cells.length, unmatched: unmatched.map(({profile, index, jitless}) => ({profile, index, jitless}))}));
assert.equal(unmatched.length, 0, 'Every acceptance/output case must match at least one explicitly configured peer');
