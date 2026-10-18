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
