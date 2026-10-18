import * as l from '../../../../src/index.js';
import { toA } from './a.js';
import { toB } from './b.js';

export const BothSchema = l.object({ a: l.transform(l.string(), toA), b: l.transform(l.string(), toB) });
