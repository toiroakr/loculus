export interface Result {
  a: string;
}
export const toA = (value: string): Result => ({ a: value });
