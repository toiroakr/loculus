export interface BenchmarkReport {
  protocol: {modes: string[]};
  cases: {
    id: string;
    bundle: Record<string, Record<string, number>>;
    runtime: Record<string, Record<string, Record<string, {median: number}[]>>>;
  }[];
  types: Record<string, Record<string, number>[]>;
}
export function benchmarkSummary(report: BenchmarkReport): string;
