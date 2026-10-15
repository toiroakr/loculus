import * as l from "../../dist/index.js";

export const itemSchema = l.object({
  name: l.string({ trim: true, min: 1 }),
  quantity: l.number({ integer: true, gte: 1, lte: 99 }),
});

export const formSchema = l.object({
  title: l.string({ trim: true, min: 1 }),
  items: l.array(itemSchema, { min: 1, max: 3 }),
  shipping: l.object({
    zip: l.string({ trim: true, min: 3 }),
    windows: l.array(l.refine(
      l.array(l.number({ integer: true, gte: 0, lte: 23 }), { min: 2, max: 2 }),
      ([start, end]) => start! < end!,
      "End time must be later than start time.",
    ), { min: 1, max: 1 }),
  }, { optional: true }),
});

export type FormInput = l.Input<typeof formSchema>;
export type FormOutput = l.Output<typeof formSchema>;
