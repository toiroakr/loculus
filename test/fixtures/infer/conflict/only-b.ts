import * as l from '../../../../src/index.js';
import type { Result } from './b.js';

export const OnlyBSchema = l.object({ value: l.transform(l.string(), (b): Result => ({ b })) });
