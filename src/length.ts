import stringWidth from "string-width";

export function codeUnits(value: string): number {
  return value.length;
}
export function codePoints(value: string): number {
  let count = 0;
  for (const point of value) count++;
  return count;
}
let segmenter: Intl.Segmenter | undefined;
export function graphemes(value: string): number {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let count = 0;
  for (const segment of segmenter.segment(value)) count++;
  return count;
}
let encoder: TextEncoder | undefined;
export function utf8Bytes(value: string): number {
  encoder ??= new TextEncoder();
  return encoder.encode(value).length;
}
export function utf16Bytes(value: string): number {
  return value.length * 2;
}
export function displayWidth(value: string): number {
  return stringWidth(value);
}
