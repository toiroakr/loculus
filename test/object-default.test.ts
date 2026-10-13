import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as l from '../src/index.js';

test('objects reject unknown keys by default for every omitted-mode option form', () => {
  for (const options of [undefined, {}, {unknownKeys: undefined}, {description: 'Options'}]) {
    const schema = l.object({name: l.string()}, options);
    assert.equal(schema.meta.unknownKeys, 'strict');
    assert.deepEqual(l.parse(schema, {name: 'guest'}), {name: 'guest'});
    assert.deepEqual(l.safeParse(schema, {name: 'guest', typo: 'value'}).issues, [{message: 'Unknown key: typo', code: 'unrecognized_key', path: ['typo']}]);
    assert.throws(() => l.parse(schema, {name: 'guest', typo: 'value'}), l.ValidationError);
  }
  assert.deepEqual(l.parse(l.object({name: l.string()}, {unknownKeys: 'strip'}), {name: 'guest', typo: 'value'}), {name: 'guest'});
  assert.deepEqual(l.parse(l.object({name: l.string()}, {unknownKeys: 'passthrough'}), {name: 'guest', extra: 'value'}), {name: 'guest', extra: 'value'});
});

test('array rows reject unknown fields by default with their full error path', () => {
  const form = l.object({items: l.array(l.object({name: l.string()}), {wrapScalar: false})});
  assert.deepEqual(l.safeParse(form, {items: [{name: 'guest', typo: 1}]}).issues?.map(issue => issue.path), [['items', 0, 'typo']]);
});
