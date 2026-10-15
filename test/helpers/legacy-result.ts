import type { Result } from '../../src/index.js';

export function legacyResult<T>(result: Result<T>): Result<T> {
  if (!result.issues) return result;
  return { issues: result.issues.map(issue => {
    if (issue.code !== 'too_small' && issue.code !== 'too_big' && issue.code !== 'invalid_format') return issue;
    const { origin, min, max, inclusive, ...legacy } = issue;
    return { ...legacy, code: 'invalid_value' };
  }) };
}
