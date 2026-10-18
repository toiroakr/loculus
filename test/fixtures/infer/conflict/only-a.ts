import * as l from '../../../../src/index.js';
import type { Result } from './a.js';

export const OnlyASchema = l.object({ value: l.transform(l.string(), (a): Result => ({ a })) });
