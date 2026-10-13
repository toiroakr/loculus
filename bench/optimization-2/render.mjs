import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { profiles, prelude } from '../coverage/fixtures.mjs';
const read = name => JSON.parse(readFileSync(`bench/optimization-2/${name}.json`));
const normal = read('settled-results');
const compiled = read('compiled-settled-results');
const significance = read('significance-results');
const compiledSignificance = read('compiled-significance-results');
const bundles = read('bundle-results');
const types = read('type-results');
const verification = read('verification');
const sourceHash = createHash('sha256').update(readFileSync('src/index.ts')).digest('hex');
for (const report of [normal, compiled, significance, compiledSignificance]) {
  if (!report.completed || report.environment.sourceHash !== sourceHash) throw new Error('Stale performance report');
}
if (bundles.hashes.after !== sourceHash || verification.sourceHash !== sourceHash) throw new Error('Stale verification');
const h = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const fmt = value => value.toFixed(2);
const rows = [];
for (const [scope, report, stats] of [['通常', normal, significance], ['compile', compiled, compiledSignificance]]) {
  for (const c of Object.values(report.cases)) {
    if (c.library !== 'loculus' || c.version !== 'after') continue;
    const previous = Object.values(report.cases).find(x => x.id === c.id && x.library === 'loculus' && x.version === 'before');
    const peer = lib => Object.values(report.cases).find(x => x.id === c.id && x.library === lib && x.version === 'after');
    for (const runtime of ['node', 'bun']) for (const mode of ['valid', 'invalid', 'construct']) {
      const value = c.runtime[runtime][mode].median;
      const before = previous.runtime[runtime][mode].median;
      const change = stats.changes.find(x => x.id === c.id && x.runtime === runtime && x.mode === mode);
      const status = change.practicalImprovement ? '有意な改善' : change.practicalLoss ? '有意な悪化' : '未確定';
      rows.push(`<tr data-runtime="${runtime}" data-mode="${mode}" data-scope="${scope}"><td>${h(c.id)}<small>${scope} / ${runtime}</small></td><td>${{ valid: '正常入力・反復', invalid: '不正入力・反復', construct: '生成＋正常入力1回' }[mode]}</td><td>${fmt(before)}</td><td>${fmt(value)}</td><td>${fmt(peer('zod').runtime[runtime][mode].median)}</td><td>${fmt(peer('valibot').runtime[runtime][mode].median)}</td><td class="${change.practicalImprovement ? 'good' : change.practicalLoss ? 'bad' : ''}">${fmt((1 - value / before) * 100)}%<small>${status}</small></td></tr>`);
    }
  }
}
const ids = new Set(Object.values(normal.cases).map(x => x.id));
const codes = profiles.filter(p => ids.has(p.id)).map(p => `<details><summary>${h(p.id)} — ${h(p.feature)}</summary>${p.note ? `<p>${h(p.note)}</p>` : ''}${['Loculus', 'Zod', 'Valibot'].map((name, i) => `<h3>${name}</h3><pre><code>${h(p.expressions[i])}</code></pre>`).join('')}<p>正常入力: <code>${h(JSON.stringify(p.valid))}</code></p><p>不正入力: <code>${h(JSON.stringify(p.invalid))}</code></p></details>`).join('');
const bundleRows = profiles.map(p => { const c = bundles.cases[p.id]; return `<tr><td>${h(p.id)}${p.nativeValibot === false ? '<small>Valibot は合成による比較</small>' : ''}</td>${['before', 'after', 'zod', 'valibot'].map(v => `<td>${c[v].gzipBytes}</td>`).join('')}<td>${c.after.gzipBytes - c.before.gzipBytes}</td></tr>`; }).join('');
const typeRows = Object.entries(types.groups).map(([group, data]) => `<tr><td>${h(group)}</td>${['loculus', 'zod', 'valibot'].map(lib => `<td>${data.libraries[lib].checkSeconds.toFixed(3)}<small>${data.libraries[lib].instantiations} instantiations</small></td>`).join('')}</tr>`).join('');
const compiledGains = compiledSignificance.changes.filter(x => x.practicalImprovement).length;
const compiledLosses = compiledSignificance.changes.filter(x => x.practicalLoss).length;
const gains = significance.changes.filter(x => x.practicalImprovement).length;
const losses = significance.changes.filter(x => x.practicalLoss).length;
const peerLosses = significance.peer.filter(x => x.practicalLoss).length;
const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Loculus パフォーマンス改善・回帰確認</title><style>
body{font:16px/1.75 system-ui,sans-serif;max-width:1150px;margin:auto;padding:22px;color:#18302f;background:#f8faf8}h1{font-size:1.7rem}h2{font-size:1.25rem;margin-top:32px}a{color:#066b67}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;font-size:14px}th,td{text-align:right;padding:10px;border-bottom:1px solid #dde5df;white-space:nowrap}th:first-child,td:first-child{text-align:left}th{background:#edf3ee;position:sticky;top:0}small{display:block;color:#57736b;font-size:12px}.scroll{overflow:auto;border:1px solid #dde5df;border-radius:10px;background:white}.good{color:#087340}.bad{color:#a13227}details{padding:12px;margin:8px 0;background:white;border:1px solid #dde5df;border-radius:9px}summary{cursor:pointer}pre{overflow:auto;padding:12px;background:#eef3f0;font-size:13px}label{display:inline-block;margin:5px}select{font:inherit;padding:6px;border:1px solid #adbfb5;border-radius:6px}.note{padding:14px;background:#fff6dc;border-radius:9px}code{overflow-wrap:anywhere}h3{font-size:1rem}li{margin:6px 0}
</style><h1>Loculus パフォーマンス改善・回帰確認</h1><p>RHF 対応後の実装を固定し、変更前後を比較しました。回帰テスト、公式資料の調査、Claude Code による独立レビュー、Node / Bun の測定を組み合わせています。</p>
<p><strong>${verification.schemaTests.passed}件のスキーマテスト、RHF ${verification.browserTests.passed}件、Politty ${verification.polittyTests.passed}件が成功。</strong>96ケースの値・エラー・パスと、固定 seed の300組の明細入力を変更前と比較しています。</p>
<h2>採用した変更</h2><ul><li>パスのないエラーでは、空配列への spread を避け、先頭キーだけの配列を作る。</li><li>boolean / date のバリデーター関数を共有。boolean の compile 用情報は関数の識別で取得し、別のスキーマの設定による上書きを防ぐ。</li><li>passthrough の通常キーを代入でコピー。継承された setter、読み取り専用プロパティ、__proto__ は従来の defineProperty でコピーする。getter の実行順とキーのスナップショットを維持する。</li></ul>
<p>enum の関数統合、数値バリデーターの共有、default 検査のループ化、追加の共通ヘルパーは、Bun の速度低下やサイズ増加、効果の不安定さを理由に見送りました。</p>
<div class="note">通常スキーマの確認対象では、変更前に対する有意な改善が ${gains} 件、有意な悪化が ${losses} 件。他ライブラリに対する有意な負けは ${peerLosses} 件残っています。compile の変更前との比較は改善 ${compiledGains} 件、悪化 ${compiledLosses} 件。全ケースで Zod / Valibot を上回ったという結果ではありません。</div>
<h2>速度 — ns / operation</h2><p>各ランタイムで独立した9プロセス。各プロセスは30msのウォームアップ後、7ラウンドの中央値を使用。exact Mann–Whitney と Holm 補正、10%の実用差を併用しています。生成の欄には正常入力の検証1回を含みます。CLI のプロセス起動時間は含みません。</p>
<p>通常モードの Zod は jitless。compile モードは Loculus の compile と Zod の明示的な compile を比較します。Valibot は通常スキーマです。今回測定しなかったプロファイルの同等性・優位性は主張しません。</p>
<label>実行環境 <select id="runtime"><option value="all">両方</option><option>node</option><option>bun</option></select></label><label>利用形態 <select id="scope"><option value="all">両方</option><option>通常</option><option>compile</option></select></label><label>処理 <select id="mode"><option value="all">すべて</option><option value="valid">正常入力・反復</option><option value="invalid">不正入力・反復</option><option value="construct">生成＋正常入力1回</option></select></label>
<div class="scroll"><table id="speed"><thead><tr><th>ケース</th><th>処理</th><th>変更前</th><th>Loculus</th><th>Zod</th><th>Valibot</th><th>短縮率</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
<h2>型チェック — 秒</h2><p>各グループを独立した3プロセスでチェックした中央値。時間の統計的有意性は検定していません。型の instantiations 数は前回と同じで、公開された型定義ファイルも変更前と同一です。</p><div class="scroll"><table><thead><tr><th>グループ</th><th>Loculus</th><th>Zod</th><th>Valibot</th></tr></thead><tbody>${typeRows}</tbody></table></div><h2>バンドル — gzip bytes</h2><p>96ケース、esbuild、minify、ブラウザ向け ESM。schema と Standard Schema validate の両方を使用。速度改善によりサイズが増えたケースも表示しています。tree-shaking は別途 esbuild / Rolldown / Bun で実行確認しています。gzip の数バイトの差には minifier の変数名も影響します。</p><div class="scroll"><table><thead><tr><th>ケース</th><th>変更前</th><th>Loculus</th><th>Zod</th><th>Valibot</th><th>増減</th></tr></thead><tbody>${bundleRows}</tbody></table></div>
<p>Node の GC 診断では、100項目の不正入力を10万回検証した際の割り当て量は両版とも約2.0GBでした。今回の速度差を、Node の割り当て量の削減と結論づける証拠はありません。</p><h2>測定したスキーマと入力</h2>${codes}
<details><summary>比較コードの共有ヘルパーと import</summary><pre><code>${h("import * as l from 'loculus';\nimport { z } from 'zod';\nimport * as v from 'valibot';\n" + prelude)}</code></pre></details><h2>調査と確認範囲</h2><p><a href="https://v8.dev/blog/fast-properties">V8: fast properties</a>、<a href="https://v8.dev/blog/fast-for-in">V8: enumeration</a>、<a href="https://v8.dev/blog/elements-kinds">V8: elements kinds</a>、<a href="https://v8.dev/features/object-rest-spread">V8: object spread</a>、<a href="https://webkit.org/blog/7536/jsc-loves-es6/">JavaScriptCore: ES6 optimization</a> を参照しました。資料から得た仮説を現行バージョンで測り、資料の記述だけでは採用していません。</p><p>回帰テストは getter / callback の回数・順序、default の参照、shape と enum のスナップショット、継承プロパティ、共有・凍結されたエラー、compile の失敗経路、RHF の行追加・削除・移動を含みます。スマホのブラウザ確認は iPhone 13 の画面サイズを Chromium で模擬したもので、実機 Safari の結果ではありません。</p>
<p>${h(normal.environment.node)} / Bun ${h(normal.environment.bun)} / ${h(normal.environment.cpu)}<br>測定開始: ${h(normal.environment.date)}<br>source SHA256: <code>${sourceHash}</code></p>
<script>for(const id of ['runtime','scope','mode'])document.getElementById(id).addEventListener('change',()=>{for(const row of document.querySelectorAll('#speed tbody tr'))row.hidden=['runtime','scope','mode'].some(key=>{const value=document.getElementById(key).value;return value!=='all'&&row.dataset[key]!==value;});});</script></html>`;
writeFileSync('docs/performance-tuning.html', html);
console.log('Wrote docs/performance-tuning.html');
