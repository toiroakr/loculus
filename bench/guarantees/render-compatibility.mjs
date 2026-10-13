import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read = path => JSON.parse(readFileSync(path));
const node = read('bench/guarantees/compatibility-audit.json');
const bun = read('bench/guarantees/compatibility-audit-bun.json');
const integrations = read('bench/guarantees/compatibility-integrations.json');
assert.ok(node.completed && bun.completed && integrations.completed);
for (const [path, expected] of Object.entries(node.sourceHashes)) assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expected);
assert.deepEqual(node.sourceHashes, bun.sourceHashes);
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const code = value => `<pre><code>${esc(value)}</code></pre>`;
const decisions = [
  ['object のデフォルト', 'Valibot strictObject／Zod strictObject', 'unknownKeys の省略・undefined・空 options・description だけの指定は strict とする。配列内の row も同じ。余分なキーを捨てる場合は strip を明示する。比較用の既定 object も peer の strictObject に揃える。'],
  ['継承したフィールド値', 'Zod・Valibot', '通常の input[key] を読む。継承値や getter を拒否しない。own 限定は自然な JavaScript の入力を欠落と誤認する。'],
  ['継承した undefined とキーの出力', 'Zod・Valibot', 'key in input で存在を確認し、明示・継承した undefined は出力の own property にする。完全に欠落した optional は出力から省く。'],
  ['strict の未知キー', 'Valibot', '最初の未知キーだけを報告する。継承した enumerable キーも検査する。全件の報告は大量の issue を割り当て、Valibot より情報量と処理量が増えていた。'],
  ['passthrough の未知キー', 'Zod', 'enumerable な継承値も保持する。既知フィールドだけ継承を認め、未知フィールドを黙って落とす不一致を解消する。'],
  ['__proto__ の出力', 'Zod', '宣言したフィールドは検証・変換も含めてスキップし、passthrough でも除外する。未宣言のキーは strict でエラーにする。null prototype 化は行わず、通常の {} を返す。'],
  ['shape・enum・分岐配列の freeze', '両者の観測／Valibot の変更契約', '実行時の freeze を外す。作成後のスキーマ変更は非対応とし、新しいスキーマを作る。通常の snapshot と検証関数の capture は維持する。書き換え診断が動くことを、変更が保証されることと混同しない。'],
  ['判別キーの optional・nullable・default', 'Zod・Valibot', 'undefined・null を含む入力側の候補を lookup に追加する。継承した判別値も読む。両者が扱える定義を Loculus が拒否していた。'],
  ['重複した判別キー', 'Zod', '重複値は検証時に例外にする。undefined の重複は曖昧として分岐を選ばない。lookup の構築失敗をキャッシュせず、再検証でも不正定義を拒否する。判別フィールド自体の欠落は定義時に拒否する。'],
  ['intersection の出力', 'Valibot（マージと失敗の扱い）', '同値の primitive、Date、配列、plain object を再帰的にマージする。別々に生成された同内容の配列・Date を Object.is で衝突と判定していた。__proto__ の除外は Zod に合わせる。'],
  ['日付の文字列形式', 'Zod ISO date/datetime', 'local・Z・±HH:MM を許可し、24:00 と ±HHMM は拒否する。calendar の実在性と Date の有効性も確認する。24:00 を翌日として受理する Date の寛容さを検証仕様に持ち込まない。'],
  ['正規表現の lastIndex', 'Zod', '各検証前に 0 に戻し、検証後は test が残した cursor を保持する。独自の cursor 復元を外す。'],
  ['配列の長さ制約と子のエラー', 'Valibot：abortPipeEarly=true', '子を検証した後に長さを検査する。子に問題がある場合はその path を返す。長さだけで止まると、修正すべき子の問題を隠していた。'],
  ['NaN の数値境界', 'Zod・Valibot', 'NaN を境界にした比較は失敗させる。比較の否定を使い、NaN で制約が無効になる挙動を解消する。'],
];
const cards = decisions.map(([name, target, reason], i) => `<article class="decision"><div class="badge">${i + 1} · ${esc(target)}</div><h3>${esc(name)}</h3><p>${esc(reason)}</p></article>`).join('');
const profiles = [...new Set(node.results.map(row => row.profile))].map(id => {
  const rows = node.results.filter(row => row.profile === id && row.jitless === false);
  const example = rows[0];
  return `<details class="fixture"><summary>${esc(id)} <small>${rows.length} inputs</small></summary><div class="codes">${['loculus', 'zod', 'valibot'].map((name, i) => `<section><h4>${name}</h4>${code(example.code[i])}</section>`).join('')}</div><details><summary>入力・結果・issue の path</summary>${code(JSON.stringify(rows.map(({index, input, results, matches}) => ({index, input, results, matches})), null, 2))}</details></details>`;
}).join('');
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Loculus の仕様を Zod・Valibot に揃える</title><style>
:root{font-family:system-ui,-apple-system,sans-serif;color:#172c35;background:#edf2f3;line-height:1.75}*{box-sizing:border-box}body{margin:0}main{max-width:1100px;margin:auto;padding:32px 20px 80px}h1{font-size:clamp(25px,4vw,38px);line-height:1.4}h2{margin-top:36px;font-size:23px}h3{font-size:18px;margin:8px 0}p{margin:8px 0}a{color:#006e71;overflow-wrap:anywhere}.lead{font-size:18px}.note,.summary{padding:18px;background:#fff;border-radius:12px;margin:18px 0}.summary{border-left:5px solid #00857f}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.decision{background:white;padding:20px;border-radius:12px;min-width:0}.badge{color:#006e71;font-size:13px;font-weight:700}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 ui-monospace,SFMono-Regular,monospace;background:#f0f4f5;padding:14px;border-radius:8px;max-width:100%}.fixture{background:#fff;border:1px solid #d4e0e2;border-radius:10px;padding:14px;margin:10px 0;min-width:0}summary{cursor:pointer;font-weight:650;overflow-wrap:anywhere}small{color:#52666c;font-weight:400}.codes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.codes section{min-width:0}h4{margin:16px 0 5px}.sources{overflow-wrap:anywhere}@media(max-width:700px){main{padding:20px 14px 60px}.grid,.codes{grid-template-columns:1fr}.decision{padding:16px}pre{font-size:11px}}</style></head><body><main>
<small>2026-10-13 · Zod ${esc(node.versions.zod)} / Valibot ${esc(node.versions.valibot)}</small><h1>Loculus の仕様を<br>Zod・Valibot に揃える</h1>
<p class="lead">object の既定動作を strict に変更しました。項目ごとに一致先を決め、通常モードと生成コードを修正しています。余分なキーを捨てたい場合は unknownKeys: 'strip' を明示します。</p>
<div class="summary"><strong>確認範囲</strong><p>96 プロフィール × 各入力 × Zod JIT on/off：Node ${node.cells} ケース、Bun ${bun.cells} ケース。入力の受理・拒否と成功時の出力について、記録した構成の少なくとも片方と一致しないケースは 0 件です。</p><p>専用比較 13 項目、生成戦略 auto/loop/unroll/chunked の回帰テスト、実際の Politty command・registry・adapter と RHF resolver を確認しています。</p></div>
<h2>変更した仕様とデメリットの整理</h2><div class="grid">${cards}</div>
<h2>維持した機能・契約</h2><div class="note"><p>文字列からの厳密な数値・boolean 変換、単一値の配列ラップ、undefined/null 別の default は合意済みの API として維持します。対応する組み合わせのコードを下に掲載しました。</p><p>配列ルートの拒否は Zod、default の制約を通さない挙動は Zod、配列・Date default の参照共有は Valibot と一致します。スキーマと ~standard の独立性、読み取り・検証・書き込みの順序、readonly な外部 issue の保護も維持します。</p><p>snapshot を取る時点や、非対応のスキーマ直接変更について、他ライブラリの偶然の内部挙動まで互換性を約束するものではありません。</p></div>
<h2>比較の限界</h2><div class="note"><p>一致判定は入力の受理・拒否と成功値です。エラーの path は記録し、通常のフィールド・配列・strict・判別 union は専用テストでも比較しました。文言、vendor 固有 code、union エラーの包み方の完全互換を証明する判定ではありません。</p><p>同じ意味の制約を構成して比較しています。number・boolean の変換、配列ラップ、null default、xor は構成が必要で、裸の z.coerce や Valibot の primitive と同じ既定動作という主張ではありません。単一フィールドの制約エラーで止める仕様は Valibot の abortPipeEarly=true に対応します。</p><p>過去の速度・サイズの結果は以前の仕様に対する測定です。今回の複合変更の速度向上や「常に勝つ」は未計測です。</p></div>
<h2>各ライブラリのコードと確認した入力</h2>${profiles}
<h2>実アダプター・resolver の結果</h2><details class="fixture"><summary>Politty と RHF の実行結果</summary>${code(JSON.stringify(integrations, null, 2))}</details>
<h2>根拠と再現</h2><p class="sources"><a href="https://valibot.dev/guides/internal-architecture/#immutability">Valibot：スキーマを immutable として扱う</a> · <a href="https://valibot.dev/api/strictObject/">Valibot：未知キーを最初の 1 件に制限</a> · <a href="https://zod.dev/api">Zod：ISO 日付・presence・defaults</a> · <a href="https://standardschema.dev/">Standard Schema</a></p>
${code('pnpm test\npnpm typecheck\npnpm test:rhf\nnode bench/guarantees/compatibility-audit.mjs\nexperiments/bun/generated/tools/bun-darwin-aarch64/bun bench/guarantees/compatibility-audit.mjs bench/guarantees/compatibility-audit-bun.json\nnode --import tsx bench/guarantees/compatibility-integrations.mjs /path/to/politty\nnode bench/guarantees/render-compatibility.mjs')}
<details class="fixture"><summary>ソースの識別情報</summary>${code(JSON.stringify(node.sourceHashes, null, 2))}</details></main></body></html>`;
writeFileSync('docs/compatibility.html', html);
console.log(JSON.stringify({file: 'docs/compatibility.html', profiles: node.profiles, bytes: Buffer.byteLength(html)}));
