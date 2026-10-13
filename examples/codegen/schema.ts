import * as l from 'loculus';

export const query = l.object({
  search: l.string({ trim: true, min: 1 }),
  page: l.number({ integer: true, gte: 1, default: 1 }),
  archived: l.boolean({ default: false }),
});
