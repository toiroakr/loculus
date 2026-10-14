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
    for (const mode of report.protocol.modes) for (const library of ['loculus', 'generated']) {
      const latencies = cases.map(item => median(item.runtime[runtime][library][mode].map(sample => sample.median)));
      metrics.push({key: `${group}/${mode}/${library}`, name: `${group} / ${mode} / ${library}`, value: geometricMean(latencies), unit: 'ns/op'});
    }
  }
  return metrics;
}
export function metricSet(key, name, metadata, metrics) {
  assert.ok(metrics.length && new Set(metrics.map(item => item.key)).size === metrics.length);
  assert.ok(metrics.every(item => item.key && Number.isFinite(item.value)));
  return {key, name, metadata: Object.entries(metadata).map(([key, value]) => ({key, value: String(value)})), metrics};
}

export function orderedEntries(entries, pass) {
  const ids = [...new Set(entries.map(entry => entry.id))];
  return ids.flatMap((_, index) => {
    const group = entries.filter(entry => entry.id === ids[(index + pass) % ids.length]);
    return group.map((_, index) => group[(index + pass) % group.length]);
  });
}
