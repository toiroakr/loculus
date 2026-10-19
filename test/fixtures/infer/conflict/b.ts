export interface Result {
  b: string;
}
export const toB = (value: string): Result => ({ b: value });
