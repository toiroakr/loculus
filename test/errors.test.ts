import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as l from '../src/index.js';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';

test('field error strings replace built-in messages without changing codes or paths', () => {
  const form = l.object({
    name: l.string({ min: 3, error: '3文字以上で入力してください' }),
    count: l.number({ gte: 1, error: '1以上の数値を入力してください' }),
  });
  assert.deepEqual(l.safeParse(form, { name: '', count: '0' }), { issues: [
    { message: '3文字以上で入力してください', code: 'too_small', origin: 'string', min: 3, inclusive: true, path: ['name'] },
    { message: '1以上の数値を入力してください', code: 'too_small', origin: 'number', min: 1, inclusive: true, path: ['count'] },
  ] });
});

test('error callbacks receive original input and can fall back to built-in messages', () => {
  const seen: l.ErrorContext[] = [];
  let required = '入力してください';
  const field = l.string({ min: 3, error: issue => {
    seen.push(issue);
    return issue.input === undefined ? required : undefined;
  } });
  assert.deepEqual(l.safeParse(field, undefined), { issues: [{ message: '入力してください', code: 'invalid_type' }] });
  required = 'Required';
  assert.equal(l.safeParse(field, undefined).issues?.[0]?.message, 'Required');
  assert.deepEqual(l.safeParse(field, ''), { issues: [{ message: 'Expected at least 3 characters', code: 'too_small', origin: 'string', min: 3, inclusive: true }] });
  assert.deepEqual(seen[0], { message: 'Expected a string', code: 'invalid_type', input: undefined });
  assert.deepEqual(seen[2], { message: 'Expected at least 3 characters', code: 'too_small', origin: 'string', min: 3, inclusive: true, input: '' });
  assert.deepEqual(l.safeParse(l.number({ gte: 1, error: issue => ({ message: `Invalid: ${issue.input}` }) }), '0'),
    { issues: [{ message: 'Invalid: 0', code: 'too_small', origin: 'number', min: 1, inclusive: true }] });
  assert.equal(l.safeParse(l.string({ error: '' }), 1).issues?.[0]?.message, '');
});

test('all scalar factories support custom errors and preserve successful outputs', () => {
  const cases = [
    [l.string({ error: 'Invalid' }), 1, 'valid', 'valid'],
    [l.number({ error: 'Invalid' }), 'bad', '2', 2],
    [l.boolean({ error: 'Invalid' }), 'bad', 'true', true],
    [l.enum(['a', 'b'], { error: 'Invalid' }), 'c', 'a', 'a'],
    [l.literal(42, { error: 'Invalid' }), 'bad', '42', 42],
    [l.literal(true, { error: 'Invalid' }), 'false', 'true', true],
    [l.literal('a', { error: 'Invalid' }), 'b', 'a', 'a'],
    [l.literal([true, 42, 'a'], { error: 'Invalid' }), 'bad', '42', 42],
    [l.date({ error: 'Invalid' }), 'bad', '2026-10-15', new Date('2026-10-15')],
  ] as const;
  for (const [schema, invalid, valid, output] of cases) {
    const result = l.safeParse(schema, invalid);
    assert.equal(result.issues?.[0]?.message, 'Invalid');
    assert.deepEqual(l.safeParse(schema, valid), { value: output });
    assert.equal('input' in result.issues![0]!, false);
  }
});

test('parent array and object errors preserve child messages and nested paths', () => {
  let parentCalls = 0;
  const row = l.object({ name: l.string({ min: 1, error: '名前が必要です' }) }, {
    error: issue => { parentCalls++; return `Row: ${issue.message}`; },
  });
  const form = l.object({ rows: l.array(row, { min: 1, max: 2, error: '行数が不正です' }) }, { error: 'フォームが不正です' });
  assert.deepEqual(l.safeParse(form, { rows: [{ name: '' }] }), { issues: [
    { message: '名前が必要です', code: 'too_small', origin: 'string', min: 1, inclusive: true, path: ['rows', 0, 'name'] },
  ] });
  assert.equal(parentCalls, 0);
  assert.deepEqual(l.safeParse(form, { rows: [] }), { issues: [
    { message: '行数が不正です', code: 'too_small', origin: 'array', min: 1, inclusive: true, path: ['rows'] },
  ] });
  assert.equal(l.safeParse(form, { rows: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }).issues?.[0]?.message, '行数が不正です');
  assert.equal(l.safeParse(form, { rows: 'bad' }).issues?.[0]?.message, '行数が不正です');
  assert.deepEqual(l.safeParse(form, { rows: [null] }), { issues: [
    { message: 'Row: Expected an object', code: 'invalid_type', path: ['rows', 0] },
  ] });
  assert.deepEqual(l.safeParse(form, { rows: [{ name: 'a', extra: true }] }), { issues: [
    { message: 'Row: Unknown key: extra', code: 'unrecognized_key', path: ['rows', 0, 'extra'] },
  ] });
  assert.deepEqual(l.safeParse(form, null), { issues: [{ message: 'フォームが不正です', code: 'invalid_type' }] });
});

test('custom errors work through presence options, transforms, refinements and composition', () => {
  let calls = 0;
  const error = () => { calls++; return 'Invalid'; };
  const field = l.number({ optional: true, nullable: true, default: 2, error });
  assert.deepEqual(l.safeParse(field, undefined), { value: 2 });
  assert.deepEqual(l.safeParse(field, null), { value: null });
  assert.deepEqual(l.safeParse(field, '3'), { value: 3 });
  assert.equal(calls, 0);
  assert.equal(l.safeParse(field, 'bad').issues?.[0]?.message, 'Invalid');
  assert.equal(calls, 1);
  assert.equal(l.safeParse(l.transform(field, String), 'bad').issues?.[0]?.message, 'Invalid');
  assert.equal(l.safeParse(l.refine(l.string({ error: 'Type' }), v => v.length > 0, 'Empty'), '').issues?.[0]?.message, 'Empty');
  assert.equal(l.safeParse(l.refine(l.string({ error: 'Type' }), () => false, 'Empty'), 1).issues?.[0]?.message, 'Type');
  const optional = l.object({ name: l.string({ error: 'Name' }) }, { optional: true, error: 'Object' });
  assert.deepEqual(l.safeParse(optional, undefined), { value: undefined });
  assert.equal(l.safeParse(optional, null).issues?.[0]?.message, 'Object');
  assert.equal(l.safeParse(optional, { name: 1 }).issues?.[0]?.message, 'Name');
  const variants = [l.object({ kind: l.literal('a'), name: l.string({ error: 'Name' }) }), l.object({ kind: l.literal('b') })] as const;
  assert.equal(l.safeParse(l.discriminatedUnion('kind', variants), { kind: 'a', name: 1 }).issues?.[0]?.message, 'Name');
  assert.equal(l.safeParse(l.union([l.string({ error: 'String' }), l.number({ error: 'Number' })]), null).issues?.length, 2);
});

test('Standard Schema and ValidationError expose the customized messages', () => {
  const form = l.object({ rows: l.array(l.object({ name: l.string({ error: '名前が必要です' }) })) });
  const input = { rows: [{}] };
  assert.deepEqual(form['~standard'].validate(input), { issues: [
    { message: '名前が必要です', code: 'invalid_type', path: ['rows', 0, 'name'] },
  ] });
  assert.throws(() => l.parse(form, input), (error: unknown) => {
    assert.ok(error instanceof l.ValidationError);
    assert.equal(error.message, 'rows.0.name: 名前が必要です');
    assert.deepEqual(error.issues[0]?.path, ['rows', 0, 'name']);
    return true;
  });
});

test('error definitions are captured and callback exceptions propagate', () => {
  const options = { error: 'Original' };
  const field = l.string(options);
  const object = l.object({}, options);
  options.error = 'Changed';
  assert.equal(l.safeParse(field, null).issues?.[0]?.message, 'Original');
  assert.equal(l.safeParse(object, null).issues?.[0]?.message, 'Original');
  const failure = new Error('Translation failed');
  assert.throws(() => l.safeParse(l.string({ error: () => { throw failure; } }), null), error => error === failure);
});


test('React Hook Form resolver exposes customized messages on their fields', async () => {
  const form = l.object({ name: l.string({ min: 3, error: '3文字以上で入力してください' }) });
  const result = await standardSchemaResolver(form)({ name: '' }, undefined, { fields: {}, shouldUseNativeValidation: false });
  assert.equal(result.errors.name?.message, '3文字以上で入力してください');
  assert.deepEqual(result.values, {});
});

test('custom error options preserve field input and output inference', () => {
  const form = l.object({
    name: l.string({ min: 1, error: issue => issue.message }),
    count: l.number({ default: 1, error: 'Count' }),
    flag: l.boolean({ optional: true, error: 'Flag' }),
    choice: l.enum(['a', 'b'], { error: 'Choice' }),
    literal: l.literal(42, { error: 'Literal' }),
    rows: l.array(l.string({ error: 'Row' }), { optional: true, error: 'Rows' }),
  });
  const input: l.Input<typeof form> = { name: 'a', choice: 'a', literal: '42' };
  const output = l.parse(form, input);
  output.name satisfies string;
  output.count satisfies number;
  output.flag satisfies boolean | undefined;
  output.choice satisfies 'a' | 'b';
  output.literal satisfies 42;
  output.rows satisfies string[] | undefined;
  assert.deepEqual(output, { name: 'a', count: 1, choice: 'a', literal: 42 });
});

test('min and max errors can be mapped globally after schema creation', () => {
  const field = l.string({ min: 3, max: 10 });
  l.config({ customError: issue => {
    if (issue.code === 'too_small') return `${issue.min}文字以上で入力してください`;
    if (issue.code === 'too_big') return `${issue.max}文字以下で入力してください`;
    return undefined;
  } });
  try {
    assert.equal(l.safeParse(field, 'a').issues?.[0]?.message, '3文字以上で入力してください');
    assert.equal(l.safeParse(field, 'abcdefghijk').issues?.[0]?.message, '10文字以下で入力してください');
    assert.equal(l.safeParse(field, 1).issues?.[0]?.message, 'Expected a string');
  } finally { l.config({ customError: undefined }); }
});


test('local strings and functions take precedence and undefined delegates to global messages', () => {
  let calls = 0;
  l.config({ customError: issue => { calls++; return `Global: ${issue.code}`; } });
  try {
    assert.equal(l.safeParse(l.string({ min: 3, max: 10, error: 'Local' }), '').issues?.[0]?.message, 'Local');
    assert.equal(l.safeParse(l.string({ min: 3, max: 10, error: '' }), '').issues?.[0]?.message, '');
    assert.equal(calls, 0);
    const field = l.string({ min: 3, max: 10, error: issue => issue.code === 'too_small' ? `${issue.min}以上` : undefined });
    assert.equal(l.safeParse(field, '').issues?.[0]?.message, '3以上');
    assert.equal(calls, 0);
    assert.equal(l.safeParse(field, 'abcdefghijk').issues?.[0]?.message, 'Global: too_big');
    assert.equal(calls, 1);
    assert.equal(l.safeParse(l.refine(l.string(), () => false, 'Custom check'), 'value').issues?.[0]?.message, 'Custom check');
  } finally { l.config({ customError: undefined }); }
});

test('bounds describe their origin, limit and inclusivity without parsing message text', () => {
  const cases = [
    [l.string({ min: 3 }), 'ab', 'too_small', 'string', 3, true],
    [l.string({ max: 10 }), 'abcdefghijk', 'too_big', 'string', 10, true],
    [l.number({ gt: 3 }), '3', 'too_small', 'number', 3, false],
    [l.number({ gte: 3 }), '2', 'too_small', 'number', 3, true],
    [l.number({ lt: 10 }), '10', 'too_big', 'number', 10, false],
    [l.number({ lte: 10 }), '11', 'too_big', 'number', 10, true],
    [l.array(l.string(), { min: 1 }), [], 'too_small', 'array', 1, true],
    [l.array(l.string(), { max: 1 }), ['a', 'b'], 'too_big', 'array', 1, true],
  ] as const;
  for (const [schema, input, code, origin, limit, inclusive] of cases) {
    const issue = l.safeParse(schema, input).issues![0]!;
    assert.equal(issue.code, code);
    assert.equal(issue.origin, origin);
    assert.equal(code === 'too_small' ? issue.min : issue.max, limit);
    assert.equal(issue.inclusive, inclusive);
  }
  assert.equal(l.safeParse(l.string({ pattern: /^a$/ }), 'b').issues?.[0]?.code, 'invalid_format');
});

test('global messages reach existing nested Standard Schema and React Hook Form consumers', async () => {
  const form = l.object({ rows: l.array(l.object({ name: l.string({ min: 3, max: 10 }) }), { min: 1 }) });
  const seen: l.ErrorContext[] = [];
  l.config({ customError: issue => { seen.push(issue); return { message: `Translated ${issue.code}` }; } });
  try {
    const input = { rows: [{ name: '' }] };
    const issue = form['~standard'].validate(input).issues![0]!;
    assert.equal(issue.message, 'Translated too_small');
    assert.deepEqual(issue.path, ['rows', 0, 'name']);
    assert.deepEqual(seen[0], { message: 'Expected at least 3 characters', code: 'too_small', origin: 'string', min: 3, inclusive: true, input: '' });
    assert.equal(seen.length, 1);
    assert.equal('input' in issue, false);
    assert.throws(() => l.parse(form, input), /rows.0.name: Translated too_small/);
    const simple = l.object({ name: l.string({ min: 3 }) });
    const result = await standardSchemaResolver(simple)({ name: '' }, undefined, { fields: {}, shouldUseNativeValidation: false });
    assert.equal(result.errors.name?.message, 'Translated too_small');
  } finally { l.config({ customError: undefined }); }
  assert.equal(l.safeParse(form, { rows: [{ name: '' }] }).issues?.[0]?.message, 'Expected at least 3 characters');
});

test('global callbacks resolve optional object errors once and ignore internal literal probes', () => {
  let calls = 0;
  l.config({ customError: () => { calls++; return 'Global'; } });
  try {
    const object = l.object({}, { optional: true });
    assert.equal(l.safeParse(object, null).issues?.[0]?.message, 'Global');
    assert.equal(calls, 1);
    assert.deepEqual(l.safeParse(l.literal([42, true, 'a']), 'true'), { value: true });
    assert.equal(calls, 1);
    assert.equal(l.safeParse(l.literal(42), 'bad').issues?.[0]?.message, 'Global');
    assert.equal(calls, 2);
    const variants = [l.object({ kind: l.literal(42) }), l.object({ kind: l.literal(true) })] as const;
    assert.deepEqual(l.safeParse(l.discriminatedUnion('kind', variants), { kind: 'true' }), { value: { kind: true } });
    assert.equal(calls, 2);
  } finally { l.config({ customError: undefined }); }
});

test('global messages handle composition-owned issues and callback exceptions', () => {
  l.config({ customError: () => 'Global' });
  try {
    assert.equal(l.safeParse(l.xor([l.string(), l.string()]), '').issues?.[0]?.message, 'Global');
    assert.equal(l.safeParse(l.xor([l.string(), l.number()]), null).issues?.[0]?.message, 'Global');
    const intersection = l.intersection(l.transform(l.string(), () => 'a'), l.transform(l.string(), () => 'b'));
    assert.equal(l.safeParse(intersection, '').issues?.[0]?.message, 'Global');
    const variants = l.discriminatedUnion('kind', [l.object({ kind: l.literal('a') }), l.object({ kind: l.literal('b') })]);
    assert.equal(l.safeParse(variants, null).issues?.[0]?.message, 'Global');
    assert.equal(l.safeParse(variants, { kind: 'c' }).issues?.[0]?.message, 'Global');
    l.config({ customError: () => { throw new Error('Translation failed'); } });
    assert.throws(() => l.safeParse(l.string(), null), /Translation failed/);
  } finally { l.config({ customError: undefined }); }
});
