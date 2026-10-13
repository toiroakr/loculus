import assert from 'node:assert/strict';

export const median = values => {
  assert.ok(values.length && values.every(value => Number.isFinite(value) && value >= 0));
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
export const geometricMean = values => {
  assert.ok(values.length && values.every(value => Number.isFinite(value) && value > 0));
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
};
export function runtimeMetrics(report, runtime) {
  const metrics = [];
  for (const group of [...new Set(report.cases.map(item => item.group))]) {
    const cases = report.cases.filter(item => item.group === group);
    for (const mode of report.protocol.modes) for (const peer of ['generated', 'zod', 'valibot']) {
      const ratios = cases.map(item => median(item.runtime[runtime].loculus[mode].map((sample, pass) =>
        sample.median / item.runtime[runtime][peer][mode][pass].median)));
      metrics.push({key: `${group}/${mode}/${peer}`, name: `${group} / ${mode} / Loculus ÷ ${peer}`, value: geometricMean(ratios) * 100, unit: '%'});
    }
  }
  return metrics;
}
export function metricSet(key, name, metadata, metrics) {
  assert.ok(metrics.length && new Set(metrics.map(item => item.key)).size === metrics.length);
  assert.ok(metrics.every(item => item.key && Number.isFinite(item.value)));
  return {key, name, metadata: Object.entries(metadata).map(([key, value]) => ({key, value: String(value)})), metrics};
}
