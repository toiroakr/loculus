import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const report = JSON.parse(readFileSync('experiments/perry/results.json', 'utf8'));
assert.equal(report.completed, true);
const metadata = JSON.parse(readFileSync('experiments/perry/compiler.json', 'utf8'));
const mb = value => (value / 1e6).toFixed(3);
const ns = value => value === undefined ? '—' : value.toFixed(1);
const profiles = ['strings-3', 'strings-30', 'cli'];
const families = ['loculus', 'zod', 'valibot'];
const lines = [
  '# Perry のサイズ・速度比較', '',
  `Perry ${metadata.latestRelease.tag}（GitHub latest を ${metadata.checkedAt} に確認）、Node ${report.environment.node}、${report.environment.cpu} / ${report.environment.arch}。Zod ${metadata.packages.zod}、Valibot ${metadata.packages.valibot}。`, '',
  'Perry は単独で動く macOS ARM64 実行ファイル。Node は同一内容の事前生成済み .mjs を実行。Zod は jitless、loculus も opt-in compile を使っていない。検証結果が Node と一致した構成だけ速度を掲載。', '',
  `サイズは共通ランタイム＋スキーマ＋検証・計測プログラムを含む。ライブラリなしの基準は ${mb(report.baseline.bytes)} MB / gzip ${mb(report.baseline.gzipBytes)} MB。配布済みランタイムをリンクしており、Perry のソースからのランタイムサイズ最適化は実行できていない。JS ライブラリ単体のバンドルサイズとは別の数値。MB は 1,000,000 bytes。`, '',
  '## 1ファイルにまとめてネイティブ化した版', '',
  '| ケース | ライブラリ | raw MB | gzip MB | 動作 |',
  '|---|---|---:|---:|---|',
];
for (const profile of profiles) for (const family of families) {
  const entry = report.cases[`${family}-${profile}`].native;
  lines.push(`| ${profile} | ${family} | ${entry.bytes === undefined ? '—' : mb(entry.bytes)} | ${entry.gzipBytes === undefined ? '—' : mb(entry.gzipBytes)} | ${entry.status === 'verified' ? '確認した入力で一致' : '実行失敗（サイズは参考値）'} |`);
}
lines.push('', '## 繰り返し検証：ns / 操作', '', '| ケース | Node loculus | Perry loculus | Node Zod | Perry Zod | Node Valibot | Perry Valibot |', '|---|---:|---:|---:|---:|---:|---:|');
for (const profile of profiles) for (const dataset of ['valid', 'invalid']) {
  const values = families.flatMap(family => {
    const entry = report.cases[`${family}-${profile}`];
    return [ns(entry.node[dataset]?.median), ns(entry.native[dataset]?.median)];
  });
  lines.push(`| ${profile} / ${dataset} | ${values.join(' | ')} |`);
}
lines.push('', '## 起動して1回検証：ms / プロセス', '', 'プロセス起動・import/初期化・スキーマ構築・最初の検証・JSON出力・終了を含む。ビルド時間は含まない。15プロセスの中央値。', '', '| ケース | Node loculus | Perry loculus | Node Zod | Perry Zod | Node Valibot | Perry Valibot |', '|---|---:|---:|---:|---:|---:|---:|---:|');
for (const profile of profiles) {
  const values = families.flatMap(family => {
    const entry = report.cases[`${family}-${profile}`];
    return [ns(entry.node.coldMs?.median), ns(entry.native.coldMs?.median)];
  });
  lines.push(`| ${profile} | ${values.join(' | ')} |`);
}
lines.push('', '## 通常のパッケージ import を使う Perry 版', '', '| ケース | ライブラリ | raw MB | gzip MB | 正常 ns | 異常 ns | 1回 ms | 動作 |', '|---|---|---:|---:|---:|---:|---:|---|');
for (const profile of profiles) for (const family of families) {
  const entry = report.cases[`${family}-${profile}`].direct;
  lines.push(`| ${profile} | ${family} | ${entry.bytes === undefined ? '—' : mb(entry.bytes)} | ${entry.gzipBytes === undefined ? '—' : mb(entry.gzipBytes)} | ${ns(entry.valid?.median)} | ${ns(entry.invalid?.median)} | ${ns(entry.coldMs?.median)} | ${entry.status === 'verified' ? '確認した入力で一致' : 'リンク失敗'} |`);
}
lines.push('', 'Zod の1ファイル版は `Error.captureStackTrace` の確認で停止。通常 import 版は未解決の `_validateAsync` シンボルでリンク失敗した。ソースのパッチや検証の削除はしていない。単純な Error の確認コードは成功するため、Error 全般の未対応と断定しない。', '', '3プロセス × 7ラウンド、warmup 10,000。strings-3/CLI は1ラウンド50,000操作、strings-30は10,000操作。生サンプル・min/max・全プローブ・各ビルドの診断・ハッシュは results.json に保存。速度は今回の入力・ビルド設定に限る。Perry の全機能やすべての loculus スキーマへの対応を保証する試験ではない。', '', '[条件と再現手順](README.md) / [全結果](results.json) / [最新版確認・バージョン](compiler.json) / [UTF-16 境界](unicode-results.json)', '');
writeFileSync('experiments/perry/RESULTS.md', lines.join('\n'));
console.log(lines.join('\n'));
