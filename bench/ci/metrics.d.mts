export function median(values: readonly number[]): number;
export function geometricMean(values: readonly number[]): number;
export interface Metric { key: string; name?: string; value: number; unit?: string; }
export function runtimeMetrics(report: {
  protocol: {modes: string[]};
  cases: {group: string; runtime: Record<string, Record<string, Record<string, {median: number}[]>>>}[];
}, runtime: string): Metric[];
export function metricSet(key: string, name: string, metadata: Record<string, unknown>, metrics: Metric[]): {
  key: string; name: string; metadata: {key: string; value: string}[]; metrics: Metric[];
};
