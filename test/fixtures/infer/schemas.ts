import * as l from '../../../src/index.js';
import type { Money } from './money.js';

export interface Tag {
  name: string;
}
interface Hidden {
  secret: string;
}

export const QuerySchema = l.object({
  search: l.string({ trim: true, min: 1, description: 'Search words' }),
  page: l.number({ integer: true, gte: 1, default: 1 }),
  archived: l.boolean({ default: false }),
  tag: l.array(l.enum(['docs', 'code']), { wrapScalar: true, optional: true }),
  at: l.date({ nullish: true }),
}, { description: 'Search query\nfrom the URL' });

export const SameSchema = l.object({ name: l.string(), kind: l.enum(['a', 'b']) });

const links = l.object({
  home: l.transform(l.string(), value => new URL(value)),
  price: l.transform(l.number(), (amount): Money => ({ amount, currency: 'JPY' })),
  tag: l.transform(l.string(), (name): Tag => ({ name })),
  'status-code': l.literal([200, 201]),
});
export { links as LinksSchema };

export const EventSchema = l.discriminatedUnion('type', [
  l.object({ type: l.literal('a'), a: l.string() }),
  l.object({ type: l.literal('b'), b: l.number() }),
]);

const row = l.object({ name: l.string({ description: 'Item name' }), quantity: l.number({ integer: true }) });
export const OrderSchema = l.object({
  title: l.string(),
  items: l.array(row, { min: 1, description: 'Ordered items' }),
});

export const FlatSchema = l.unflatten(l.object({
  'user.name': l.string({ description: 'User name' }),
  'user.age': l.number(),
}));

export const HiddenSchema = l.object({ value: l.transform(l.string(), (secret): Hidden => ({ secret })) });

export const notASchema = { _input: 1, _output: 2 };

export const WrapSchema = l.object({ value: l.array(l.string(), { wrapScalar: true }) });
export const BrandSchema = l.object({
  id: l.transform(l.string(), value => value as string & { readonly brand: 'Id' }),
});

export const PresenceSchema = l.object({
  nullable: l.string({ nullable: true }),
  nullish: l.number({ nullish: true }),
  fallback: l.number({ default: { null: 0, undefined: 1 } }),
  nested: l.object({ later: l.string({ optional: true }), deep: l.boolean() }, { optional: true }),
  matrix: l.array(l.array(l.number())),
});

export const LiteralSchema = l.object({
  on: l.literal(true),
  answer: l.literal(42),
  mode: l.literal(['auto', 1, false]),
});

export const CombinedSchema = l.intersection(
  l.object({ a: l.string() }, { unknownKeys: 'strip' }),
  l.object({ b: l.number({ optional: true }) }, { unknownKeys: 'strip' }),
);
export const ChoiceSchema = l.xor([l.object({ x: l.string() }), l.object({ y: l.date() })]);
export const RefinedSchema = l.refine(l.object({ min: l.number(), max: l.number() }), value => value.min <= value.max, 'min > max');

export const ReadonlyShapeSchema = l.object({ a: l.string(), b: l.string({ optional: true }) } as const);

export const tag: unique symbol = Symbol('tag');
export class Model {
  value = 1;
}
export type Handler = (value: string) => number;
export type Factory = new () => Model;
export const ReturnSchema = l.object({
  frozen: l.transform(l.string(), (name): Readonly<{ name: string }> => ({ name })),
  handler: l.transform(l.string(), (): Handler => (value) => value.length),
  factory: l.transform(l.string(), (): Factory => Model),
  constructor: l.transform(l.string(), () => Model),
  tagged: l.transform(l.string(), (value): { [tag]: string } => ({ [tag]: value })),
});
