import assert from 'node:assert/strict';
import {test} from 'node:test';
import {z} from 'zod';
import * as v from 'valibot';
import * as l from '../src/index.js';

function value(schema: {readonly '~standard': {readonly validate: (input: unknown) => unknown}}, input: unknown): unknown {
  const result = schema['~standard'].validate(input) as l.Result<unknown>;
  assert.equal(result.issues, undefined);
  return result.value;
}

test('known inherited fields and explicit undefined match Zod and Valibot', () => {
  const local = l.object({name: l.string(), note: l.string({optional: true}), count: l.number({default: 1})});
  const zod = z.object({name: z.string(), note: z.string().optional(), count: z.number().default(1)});
  const valibot = v.object({name: v.string(), note: v.optional(v.string()), count: v.optional(v.number(), 1)});
  for (const input of [Object.create({name: 'guest', note: undefined, count: 3}), {name: 'guest', note: undefined}, Object.create({name: 'guest'})]) {
    assert.deepEqual(value(local, input), value(zod, input));
    assert.deepEqual(value(local, input), value(valibot, input));
  }
  let reads = 0;
  const input = Object.create({get name() { reads++; return 'guest'; }});
  assert.deepEqual(l.parse(l.object({name: l.string()}), input), {name: 'guest'});
  assert.equal(reads, 1);
});

test('inherited discriminators match Zod and Valibot', () => {
  const local = l.discriminatedUnion('kind', [l.object({kind: l.literal('a')}), l.object({kind: l.literal('b')})]);
  const zod = z.discriminatedUnion('kind', [z.object({kind: z.literal('a')}), z.object({kind: z.literal('b')})]);
  const valibot = v.variant('kind', [v.object({kind: v.literal('a')}), v.object({kind: v.literal('b')})]);
  const input = Object.create({kind: 'a'});
  assert.deepEqual(value(local, input), value(zod, input));
  assert.deepEqual(value(local, input), value(valibot, input));
});

test('strict objects report only the first unknown key like Valibot', () => {
  const local = l.object({name: l.string()}, {unknownKeys: 'strict'});
  const peer = v.strictObject({name: v.string()});
  for (const input of [{name: 'guest', extra1: 1, extra2: 2}, Object.assign(Object.create({extra1: 1}), {name: 'guest'})]) {
    const result = l.safeParse(local, input);
    const expected = v.safeParse(peer, input);
    assert.equal(result.issues?.length, 1);
    assert.deepEqual(result.issues?.map(issue => issue.path), expected.issues?.map(issue => issue.path?.map(item => item.key)));
  }
});

test('declared and passthrough __proto__ fields are excluded like Zod', () => {
  for (const mode of ['strip', 'strict', 'passthrough'] as const) {
    let callbacks = 0;
    const local = l.object({name: l.string(), ['__proto__']: l.transform(l.string(), () => { callbacks++; return {isAdmin: true}; })}, {unknownKeys: mode});
    const shape = {name: z.string(), ['__proto__']: z.string().transform(() => ({isAdmin: true}))};
    const peer = mode === 'strict' ? z.strictObject(shape) : mode === 'passthrough' ? z.looseObject(shape) : z.object(shape);
    for (const input of [{name: 'guest'}, JSON.parse('{"name":"guest","__proto__":"value"}')]) {
      const actual = value(local, input);
      assert.deepEqual(actual, value(peer, input));
      assert.equal(Object.getPrototypeOf(actual), Object.prototype);
      assert.equal(Object.hasOwn(actual as object, '__proto__'), false);
    }
    assert.equal(callbacks, 0);
  }
  const input = JSON.parse('{"__proto__":{"isAdmin":true}}');
  assert.deepEqual(l.parse(l.object({}, {unknownKeys: 'passthrough'}), input), value(z.looseObject({}), input));
  assert.ok(l.safeParse(l.object({}, {unknownKeys: 'strict'}), input).issues);
});

test('passthrough inherited unknown fields match Zod', () => {
  const input = Object.assign(Object.create({extra: 'inherited'}), {name: 'guest'});
  assert.deepEqual(l.parse(l.object({name: l.string()}, {unknownKeys: 'passthrough'}), input), value(z.looseObject({name: z.string()}), input));
});

test('schema introspection is unfrozen like Zod and Valibot', () => {
  const object = l.object({name: l.string()});
  const choices = l.enum(['a', 'b']);
  assert.equal(Object.isFrozen(object.shape), false);
  assert.equal(Object.isFrozen(choices.meta.enumValues), false);
  assert.equal(Object.isFrozen(l.literal('a').meta.enumValues), false);
  assert.equal(Object.isFrozen(l.union([object, object]).meta.options), false);
});

test('intersections merge equal scalar, date, array and row outputs like Valibot', () => {
  const cases: [l.AnySchema, l.AnySchema, v.BaseSchema<any, any, any>, v.BaseSchema<any, any, any>, unknown][] = [
    [l.string(), l.string(), v.string(), v.string(), 'a'],
    [l.number(), l.number(), v.number(), v.number(), 1],
    [l.object({tags: l.array(l.string(), {wrapScalar: false})}), l.object({tags: l.array(l.string(), {wrapScalar: false})}), v.object({tags: v.array(v.string())}), v.object({tags: v.array(v.string())}), {tags: ['a', 'b']}],
    [l.object({day: l.date()}), l.object({day: l.date()}), v.object({day: v.pipe(v.string(), v.toDate())}), v.object({day: v.pipe(v.string(), v.toDate())}), {day: '2024-02-29'}],
    [l.object({items: l.array(l.object({a: l.string()}, {unknownKeys: 'strip'}), {wrapScalar: false})}), l.object({items: l.array(l.object({b: l.string()}, {unknownKeys: 'strip'}), {wrapScalar: false})}), v.object({items: v.array(v.object({a: v.string()}))}), v.object({items: v.array(v.object({b: v.string()}))}), {items: [{a: 'a', b: 'b'}]}],
  ];
  for (const [left, right, a, b, input] of cases) assert.deepEqual(value(l.intersection(left, right), input), value(v.intersect([a, b]), input));
  const left = l.transform(l.string(), () => ({n: -0}));
  const right = l.transform(l.string(), () => ({n: 0}));
  assert.ok(!l.safeParse(l.intersection(left, right), 'a').issues);
  for (const [a, b] of [[['a'], ['b']], [['a'], ['a', 'b']]]) {
    assert.ok(l.safeParse(l.intersection(l.transform(l.string(), () => a), l.transform(l.string(), () => b)), 'a').issues);
  }
});

test('date input grammar matches Zod ISO date and local or offset datetime', () => {
  const peer = z.union([z.iso.date(), z.iso.datetime({offset: true, local: true})]).transform(input => new Date(input)).refine(date => Number.isFinite(date.getTime()));
  for (const input of ['2024-02-29', '2023-02-29', '0000-02-29', '2024-02-29T00:00', '2024-02-29T00:00:00', '2024-02-29T00:00:00.123456Z', '2024-02-29T00:00:00+14:00', '2024-02-29T24:00:00Z', '2024-02-29T00:00:00+1400', '2024-02-29T00:00:00+25:00', '2024-02-29T00:60:00Z', '', null, new Date()]) {
    const actual = l.safeParse(l.date(), input), expected = peer.safeParse(input);
    assert.equal(!actual.issues, expected.success, String(input));
    if (!actual.issues && expected.success) assert.equal(actual.value.getTime(), expected.data.getTime());
  }
});

test('regex parsing resets its cursor like Zod', () => {
  const a = /a/g, b = /a/g;
  a.lastIndex = b.lastIndex = 5;
  const local = l.string({pattern: a}), peer = z.string().regex(b);
  for (const input of ['a', 'a', 'b', 'a']) {
    assert.equal(!l.safeParse(local, input).issues, peer.safeParse(input).success);
    assert.equal(a.lastIndex, b.lastIndex);
  }
});

test('array child errors precede length constraints like Valibot with abortPipeEarly', () => {
  const local = l.array(l.string(), {wrapScalar: false, min: 3});
  const peer = v.pipe(v.array(v.string()), v.minLength(3));
  const actual = l.safeParse(local, [1]);
  const expected = v.safeParse(peer, [1], {abortPipeEarly: true});
  assert.deepEqual(actual.issues?.map(issue => issue.path), expected.issues?.map(issue => issue.path?.map(item => item.key)));
  assert.ok(l.safeParse(local, ['a']).issues);
});

test('NaN numeric boundaries reject values like Zod and Valibot', () => {
  for (const options of [{gt: NaN}, {gte: NaN}, {lt: NaN}, {lte: NaN}]) {
    for (const input of [0, 1, '1']) assert.ok(l.safeParse(l.number(options), input).issues);
  }
  assert.equal(z.number().gte(NaN).safeParse(1).success, false);
  assert.equal(v.safeParse(v.pipe(v.number(), v.minValue(NaN)), 1).success, false);
});

test('discriminators support presence and defaults like Zod and Valibot', () => {
  const cases = [
    [l.literal('a', {optional: true}), z.literal('a').optional(), v.optional(v.literal('a'))],
    [l.literal('a', {nullable: true}), z.literal('a').nullable(), v.nullable(v.literal('a'))],
    [l.literal('a', {default: 'a'}), z.literal('a').default('a'), v.optional(v.literal('a'), 'a')],
    [l.literal('a', {default: {nullish: 'a'}}), z.union([z.literal('a'), z.null().transform(() => 'a' as const)]).default('a'), v.nullish(v.literal('a'), 'a')],
  ] as const;
  for (const [field, a, b] of cases) {
    const local = l.discriminatedUnion('kind', [l.object({kind: field}), l.object({kind: l.literal('b')})]);
    const zod = z.discriminatedUnion('kind', [z.object({kind: a}), z.object({kind: z.literal('b')})]);
    const valibot = v.variant('kind', [v.object({kind: b}), v.object({kind: v.literal('b')})]);
    for (const input of [{}, {kind: undefined}, {kind: null}, {kind: 'a'}, {kind: 'b'}, Object.create({kind: undefined})]) {
      const actual = l.safeParse(local, input), expected = zod.safeParse(input), other = v.safeParse(valibot, input);
      assert.equal(!actual.issues, expected.success);
      assert.equal(!actual.issues, other.success);
      if (!actual.issues && expected.success && other.success) {
        assert.deepEqual(actual.value, expected.data);
        assert.deepEqual(actual.value, other.output);
      }
    }
  }
});

test('duplicate discriminators fail at validation like Zod without accepting a later retry', () => {
  let local: l.AnySchema;
  assert.doesNotThrow(() => {local = l.discriminatedUnion('kind', [l.object({kind: l.literal('a')}), l.object({kind: l.literal('a')})]);});
  const peer = z.discriminatedUnion('kind', [z.object({kind: z.literal('a')}), z.object({kind: z.literal('a')})]);
  for (let i = 0; i < 2; i++) {
    assert.throws(() => l.safeParse(local!, {kind: 'a'}), /Duplicate discriminator/);
    assert.throws(() => peer.parse({kind: 'a'}), /Duplicate discriminator/);
  }
  assert.ok(l.safeParse(local!, []).issues);
  assert.equal(peer.safeParse([]).success, false);
  const ambiguous = l.discriminatedUnion('kind', [l.object({kind: l.literal('a', {optional: true})}), l.object({kind: l.literal('b', {optional: true})})]);
  assert.ok(l.safeParse(ambiguous, {}).issues);
  assert.deepEqual(l.parse(ambiguous, {kind: 'a'}), {kind: 'a'});
});
