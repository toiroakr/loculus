import {median} from './metrics.mjs';

const libraries = ['loculus', 'generated', 'zod', 'valibot'];
const columns = 'Loculus | Loculus + Rolldown | Zod | Valibot';
const table = (labels, rows) => `| ${labels} | ${columns} |\n| ${labels.split(' | ').map(() => '---').join(' | ')} | ---: | ---: | ---: | ---: |\n${rows.join('\n')}\n`;
const row = (labels, values) => `| ${labels} | ${values.join(' | ')} |`;

export function benchmarkSummary(report) {
  let summary = '# Loculus benchmark report\n\nAll four implementations use the same fixtures. Lower is better. Latency is in ns/op and includes consuming the result. Each cell is the median of process medians; runner noise and error representations differ, so these numbers do not establish statistical significance.\n\n';
  summary += 'Construction includes schema creation + one valid validation. Repeated validation excludes schema creation and build-time generation. Zod uses its default JIT mode.\n\n';
  for (const runtime of ['node', 'bun']) {
    summary += `## ${runtime} latency (ns/op)\n\n`;
    summary += table('Case | Mode', report.cases.flatMap(item => report.protocol.modes.map(mode =>
      row(`${item.id} | ${mode}`, libraries.map(library => median(item.runtime[runtime][library][mode].map(sample => sample.median)).toFixed(1))))));
  }
  summary += '\n## Browser ESM bundles (bytes)\n\n';
  summary += table('Case | Format', report.cases.flatMap(item => ['bytes', 'gzipBytes'].map(format =>
    row(`${item.id} | ${format === 'bytes' ? 'minified' : 'gzip'}`, libraries.map(library => item.bundle[library][format])))));
  summary += '\n## TypeScript input/output inference\n\n';
  summary += table('Metric', ['wallMs', 'checkSeconds', 'instantiations', 'memoryKiB'].map(key =>
    row({wallMs: 'Wall time (ms)', checkSeconds: 'Check time (s)', instantiations: 'Instantiations', memoryKiB: 'Memory (KiB)'}[key], libraries.map(library =>
      median(report.types[library === 'generated' ? 'loculus' : library].map(sample => sample[key])).toFixed(key === 'checkSeconds' ? 3 : 1)))));
  summary += '\nThe Rolldown plugin shares Loculus type definitions; its type column repeats the same measurement, rather than a separate compiler run. Octocov retains grouped paired runtime ratios and baseline comparisons. Full samples, rounds, checksums, fixture/harness hashes, environment versions, and compiler diagnostics are in the benchmark artifact.\n';
  return summary;
}
