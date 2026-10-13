import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {z} from 'zod';
import * as v from 'valibot';
import * as l from '../../dist/index.js';

const libraries = {
  zod: {
    text: z.string, number: z.number, object: z.object,
    shape: s => s.shape, run: (s, x) => s.safeParse(x),
    success: r => r.success, output: r => r.data,
    transform: s => s.transform(() => ({isAdmin: true})),
    choices: values => z.enum(values), options: s => s.options,
    issues: r => r.error?.issues,
  },
  valibot: {
    text: v.string, number: v.number, object: v.object,
    shape: s => s.entries, run: v.safeParse,
    success: r => r.success, output: r => r.output,
    transform: s => v.pipe(s, v.transform(() => ({isAdmin: true}))),
    choices: v.picklist, options: s => s.options,
    issues: r => r.issues,
  },
  loculus: {
    text: l.string, number: l.number, object: l.object,
    shape: s => s.shape, run: l.safeParse,
    success: r => !r.issues, output: r => r.value,
    transform: s => l.transform(s, () => ({isAdmin: true})),
    choices: l.enum, options: s => s.meta.enumValues,
    issues: r => r.issues,
  },
};

function attempt(fn) {
  try { fn(); return 'applied'; }
  catch (error) { return error.name; }
}

const cases = [];
for (const jitless of [false, true]) {
  z.config({jitless});
  for (const [library, a] of Object.entries(libraries)) {
    const protoSchema = a.object({['__proto__']: a.transform(a.text())});
    const protoResult = a.run(protoSchema, JSON.parse('{"__proto__":"value"}'));
    assert.equal(a.success(protoResult), true);
    const proto = a.output(protoResult);
    const originalShape = {name: a.text()};
    const schema = a.object(originalShape);
    a.run(schema, {name: 'a'});
    const shape = a.shape(schema);
    const shapeMutation = attempt(() => { shape.name = a.number(); });
    const options = ['a'];
    const enumSchema = a.choices(options);
    const exposedOptions = a.options(enumSchema);
    const enumMutation = attempt(() => { exposedOptions.push('b'); });
    const first = a.text(), second = a.text();
    const firstStandard = first['~standard'];
    const errors = a.run(a.object({a: a.text(), b: a.text()}), {a: 1, b: 2});
    cases.push({
      library, jitless,
      proto: {
        own: Object.hasOwn(proto, '__proto__'),
        plain: Object.getPrototypeOf(proto) === Object.prototype,
        nullPrototype: Object.getPrototypeOf(proto) === null,
        inheritedAdmin: proto.isAdmin === true,
      },
      shape: {
        frozen: Object.isFrozen(shape), sameAsOriginal: shape === originalShape,
        mutation: shapeMutation,
        stringAccepted: a.success(a.run(schema, {name: 'a'})),
        numberAccepted: a.success(a.run(schema, {name: 3})),
      },
      enum: {
        frozen: Object.isFrozen(exposedOptions), mutation: enumMutation,
        addedAccepted: a.success(a.run(enumSchema, 'b')),
      },
      inheritedInputAccepted: a.success(a.run(a.object({name: a.text()}), Object.create({name: 'inherited'}))),
      arrayRootAccepted: a.success(a.run(a.object({}), [])),
      freshSchema: first !== second,
      freshStandard: firstStandard !== second['~standard'],
      stableStandard: firstStandard === first['~standard'],
      normalFieldErrors: a.issues(errors)?.length,
    });
  }
}
for (const c of cases) {
  assert.equal(c.freshSchema, true);
  assert.equal(c.freshStandard, true);
  assert.equal(c.stableStandard, true);
  assert.equal(c.normalFieldErrors, 2);
  assert.equal(c.shape.frozen, false);
  assert.equal(c.enum.frozen, false);
  assert.equal(c.enum.addedAccepted, c.library === 'valibot');
  assert.equal(c.inheritedInputAccepted, true);
  assert.equal(c.arrayRootAccepted, c.library === 'valibot');
  assert.equal(c.proto.inheritedAdmin, c.library === 'valibot');
  assert.equal(c.proto.own, false);
  assert.equal(c.proto.nullPrototype, false);
}
const versions = Object.fromEntries(['zod', 'valibot'].map(name => [name, JSON.parse(readFileSync(`node_modules/${name}/package.json`)).version]));
const report = {
  completed: true, runtime: process.version, versions, cases,
  scope: 'Installed-version behavior, not a claim about public guarantees for schema mutation. The prototype case uses an explicitly declared computed __proto__ field transformed to an object. Zod is tested with JIT enabled and disabled. No performance claims.',
};
writeFileSync('bench/guarantees/parity-probe-node.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
