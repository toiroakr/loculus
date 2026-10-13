import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const r = JSON.parse(readFileSync('experiments/bun/results.json'));
assert.equal(r.completed, true);
const profiles = ['strings-3', 'strings-30', 'cli'];
const families = ['loculus', 'zod', 'valibot'];
const table = (head, rows) => [head.join(' | '), head.map(() => '---').join(' | '), ...rows.map(row => row.join(' | '))].join('\n');
const speed = [], size = [], cold = [], optimized = [], construction = [];
const fmt = (value, digits = 1) => value.toFixed(digits);
for (const profile of profiles) {
  for (const family of families) {
    const c = r.cases[`${family}-${profile}`];
    speed.push([profile, family, ...['node', 'bun', 'standalone'].flatMap(key => [fmt(c[key].valid.median), fmt(c[key].invalid.median)])]);
    size.push([profile, family, c.browser.bytes, c.browser.gzipBytes, fmt(c.standalone.bytes / 1e6, 3), fmt(c.standalone.gzipBytes / 1e6, 3)]);
    cold.push([profile, family, ...['node', 'bun', 'standalone'].map(key => fmt(c[key].coldMs.median, 2))]);
    construction.push([profile, family, ...['node', 'bun', 'standalone'].map(key => fmt(c[key].construct.median / 1000, 2))]);
    if (family !== 'valibot') {
      const o = r.cases[`${family}-${profile}-optimized`];
      optimized.push([profile, family === 'loculus' ? 'loculus compile' : 'Zod JIT', ...['node', 'bun'].flatMap(key => [fmt(o[key].valid.median), fmt(o[key].invalid.median), fmt(o[key].construct.median / 1000, 2)])]);
    }
  }
}
writeFileSync('experiments/bun/RESULTS.md', `# Bun 比較結果\n\nBun ${r.environment.bun} / Node ${r.environment.node} / ${r.environment.cpu} / Zod ${r.environment.versions.zod} / Valibot ${r.environment.versions.valibot}。最新安定版とSHA-256を確認。全候補が確認した意味論テストに一致。\n\n## 繰り返し検証 / ns\n\n${table(['ケース', 'ライブラリ', 'Node 正常', 'Node 異常', 'Bun 正常', 'Bun 異常', '単独実行 正常', '単独実行 異常'], speed)}\n\n## スキーマ構築 + 1回検証 / µs\n\n${table(['ケース', 'ライブラリ', 'Node', 'Bun', '単独実行'], construction)}\n\n## 明示的なコンパイル / JIT\n\n${table(['ケース', 'ライブラリ', 'Node 正常 ns', 'Node 異常 ns', 'Node 構築 µs', 'Bun 正常 ns', 'Bun 異常 ns', 'Bun 構築 µs'], optimized)}\n\n## サイズ\n\n${table(['ケース', 'ライブラリ', 'JS bytes', 'JS gzip bytes', '単独実行 MB', '単独実行 gzip MB'], size)}\n\nライブラリなしの単独実行基準: ${fmt(r.baseline.bytes / 1e6, 3)} MB / gzip ${fmt(r.baseline.gzipBytes / 1e6, 3)} MB。ランタイム込みであり、JSライブラリ単体のサイズとは別。\n\n## プロセス起動から1回検証・終了まで / ms\n\n${table(['ケース', 'ライブラリ', 'Node', 'Bun', '単独実行'], cold)}\n\n通常版のZodはjitless:true。Loculusは通常スキーマのみ。最適化版はZod JIT有効。21サンプルの中央値、起動は15サンプル。詳細は README.md / results.json。\n`);
console.log(readFileSync('experiments/bun/RESULTS.md', 'utf8'));
