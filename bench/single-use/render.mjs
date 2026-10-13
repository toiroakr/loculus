import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inspect } from 'node:util';
import { profiles, prelude } from './fixtures.mjs';

const read = name => JSON.parse(readFileSync(`bench/single-use/${name}.json`));
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const raw = read('settled-results');
const stats = read('significance-results');
const sizes = read('bundle-results');
const semantics = read('semantics-results');
const types = read('type-results');
for (const report of [raw, stats, sizes, semantics, types]) {
  assert.equal(report.completed, true);
  assert.equal(report.environment?.sourceHash ?? report.sourceHash, hash('src/index.ts'));
}
assert.deepEqual(raw.policy.modes, ['construct']);
assert.equal(raw.policy.freshProcesses, 9);
assert.equal(stats.policy.rawReportSha256, hash('bench/single-use/settled-results.json'));
assert.equal(sizes.distHash, hash('dist/index.js'));
assert.equal(types.distHash, hash('dist/index.d.ts'));
assert.equal(semantics.fixtureHash, hash('bench/single-use/fixtures.json'));
const h = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const literal = value => inspect(value, { depth: null, compact: true, breakLength: Infinity, maxArrayLength: null, maxStringLength: null });
const status = row => row.practicalImprovement ? '勝ち' : row.practicalLoss ? '負け' : '未確定';
const tally = rows => ['勝ち', '負け', '未確定'].map(label => `${label}${rows.filter(row => status(row) === label).length}`).join(' / ');
const measure = (id, runtime, library, version = 'after') => Object.values(raw.cases).find(value => value.id === id && value.library === library && value.version === version).runtime[runtime].construct.median;
const codeLink = id => `<a href="#case-${id}">3ライブラリのコード</a>`;
const metric = (id, runtime) => `<p class="metric">${runtime}: Loculus ${measure(id, runtime, 'loculus').toFixed(1)} ns / Zod ${measure(id, runtime, 'zod').toFixed(1)} ns / Valibot ${measure(id, runtime, 'valibot').toFixed(1)} ns</p>`;
const changes = stats.changes;
const smaller = Object.values(sizes.cases).filter(value => value.loculus.gzipBytes < value.before.gzipBytes).length;
const bigger = Object.values(sizes.cases).filter(value => value.loculus.gzipBytes > value.before.gzipBytes).length;
const cliProfiles = profiles.filter(profile => profile.id.startsWith('cli-'));
const cliCards = [...new Set(cliProfiles.map(profile => profile.command))].map(command => {
  const cases = cliProfiles.filter(profile => profile.command === command);
  const counts = ['zod', 'valibot'].map(reference => `${reference}: ${tally(stats.peer.filter(row => row.reference === reference && cases.some(profile => profile.id === row.id)))}`).join('<br>');
  const sparse = cases.find(profile => profile.density === 'sparse');
  return `<article class="card cli-card"><h3>${h(command)}：${sparse.fieldCount}項目</h3><p>少数・多数指定 × Node・Bun の単発比較<br>${counts}</p><div class="scroll"><table><thead><tr><th>ライブラリ</th><th>Node</th><th>Bun</th></tr></thead><tbody>${['loculus', 'zod', 'valibot'].map(library => `<tr><td>${library}</td>${['node', 'bun'].map(runtime => `<td>${measure(sparse.id, runtime, library).toFixed(1)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p>上は少数指定の ns。${codeLink(sparse.id)} · <a href="#case-${cases[1].id}">多数指定</a></p><p><a href="${h(sparse.source)}">公式のオプション資料</a></p></article>`;
}).join('');
const speedRows = profiles.flatMap(profile => ['node', 'bun'].map(runtime => {
  const peers = ['zod', 'valibot'].map(reference => stats.peer.find(row => row.id === profile.id && row.runtime === runtime && row.reference === reference));
  const change = changes.find(row => row.id === profile.id && row.runtime === runtime);
  return `<tr><td><a href="#case-${profile.id}">${profile.id}</a><small>${runtime}</small></td>${['loculus', 'zod', 'valibot'].map(library => `<td>${measure(profile.id, runtime, library).toFixed(2)}</td>`).join('')}<td>${peers.map((row, i) => `${['Zod', 'Valibot'][i]}: ${row ? status(row) : 'native 機能なし'}`).join('<br>')}</td><td>${measure(profile.id, runtime, 'loculus', 'before').toFixed(2)}<small>${change.practicalImprovement ? '有意な改善' : change.practicalLoss ? '有意な悪化' : '未確定'}</small></td></tr>`;
})).join('');
const bundleRows = profiles.map(profile => `<tr><td>${profile.id}</td>${['before', 'loculus', 'zod', 'valibot'].map(library => `<td>${sizes.cases[profile.id][library].gzipBytes}</td>`).join('')}</tr>`).join('');
const typeRows = Object.entries(types.groups).map(([name, group]) => `<tr><td>${name}</td>${['loculus', 'zod', 'valibot'].map(library => `<td>${group.libraries[library].checkSeconds.toFixed(3)}<small>${group.libraries[library].instantiations} instantiations</small></td>`).join('')}</tr>`).join('');
const codes = profiles.map(profile => {
  const snippets = ['Loculus', 'Zod', 'Valibot'].map((library, index) => {
    const imported = index === 0 ? "import * as l from 'loculus';" : index === 1 ? "import {z} from 'zod';\nz.config({jitless:true});" : "import * as v from 'valibot';";
    let input = `const input=${literal(profile.valid[0])};`;
    let prepared = 'input';
    let normalization = '';
    if (profile.format) {
      const entries = Object.entries(profile.valid[0]).flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map(item => [key, item]));
      input = profile.format === 'url' ? `const input=new URLSearchParams(${literal(entries)});` : `const input=new FormData();\nfor(const [key,value] of ${literal(entries)})input.append(key,value);`;
      if (index === 0) prepared = 'l.fromEntries(input)';
      else {
        normalization = "const normalize=entries=>{const out=Object.create(null);for(const [key,value]of entries){if(Object.hasOwn(out,key)){if(Array.isArray(out[key]))out[key].push(value);else out[key]=[out[key],value];}else out[key]=value;}return out;};\n";
        prepared = 'normalize(input)';
      }
    }
    let call = `const result=schema['~standard'].validate(${prepared});`;
    if (profile.method === 'safeParse') call = `const result=${['l.safeParse(schema, ', 'schema.safeParse(', 'v.safeParse(schema, '][index]}${prepared});`;
    if (profile.method === 'parse') call = `const result=${['l.parse(schema, ', 'schema.parse(', 'v.parse(schema, '][index]}${prepared});`;
    return `<h3>${library}</h3><pre><code>${h(imported + '\n' + prelude + '\n' + normalization + 'const schema=' + profile.expressions[index] + ';\n' + input + '\n' + call)}</code></pre>`;
  }).join('');
  return `<details id="case-${profile.id}" class="case-code"><summary>${profile.id} — ${h(profile.feature)}</summary>${profile.argv ? `<pre><code>${h(profile.argv)}</code></pre>` : ''}${profile.note ? `<p>${h(profile.note)}</p>` : ''}${snippets}<p>計時する正常入力: <code>${h(literal(profile.valid))}</code></p><p>計時外の不正・照合入力: <code>${h(literal([...profile.invalid, ...profile.probes]))}</code></p></details>`;
}).join('');
const losses = stats.peer.filter(row => row.practicalLoss);
const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Loculus：単発利用の比較</title><style>
body{font:16px/1.75 system-ui,sans-serif;max-width:1150px;margin:auto;padding:22px;color:#18302f;background:#f8faf8}h1{font-size:1.7rem}h2{font-size:1.25rem;margin-top:32px}h3{font-size:1.05rem}a{color:#066b67}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;font-size:14px}th,td{text-align:right;padding:10px;border-bottom:1px solid #dde5df;white-space:nowrap}th:first-child,td:first-child{text-align:left}th{background:#edf3ee}small{display:block;color:#57736b;font-size:12px}.scroll{overflow:auto;border:1px solid #dde5df;border-radius:10px;background:white}details{padding:12px;margin:8px 0;background:white;border:1px solid #dde5df;border-radius:9px}summary{cursor:pointer}pre{overflow:auto;padding:12px;background:#eef3f0;font-size:13px}code{overflow-wrap:anywhere}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px}.card{background:white;border:1px solid #dde5df;border-radius:12px;padding:18px;min-width:0}.metric{background:#eff4f1;border-radius:7px;padding:9px;overflow-wrap:anywhere}.note{padding:14px;background:#fff6dc;border-radius:9px}nav{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0}nav a{padding:6px 10px;border:1px solid #c6d7d0;border-radius:8px;background:white}html{scroll-padding-top:12px}@media(max-width:600px){body{padding:16px}h1{font-size:1.45rem}.card{padding:15px}}
</style><h1>単発利用を主軸にした Loculus</h1><p>公開 API の <code>compile</code> と、通常のフィールド作成時に付けていた生成用情報を削除しました。重点を置くのは、CLI・フォームなどで使う<strong>全フィールドとスキーマの作成＋検証1回</strong>の速度、サイズ、型チェックです。作った通常スキーマは引き続き再利用できます。</p><nav><a href="#scenarios">勝つケース・負けるケース</a><a href="#cli">Git / cf</a><a href="#size-types">サイズ・型チェック</a><a href="#evidence">全データ・比較コード</a></nav>
<p>削除前との比較：有意な改善 ${changes.filter(row => row.practicalImprovement).length}件、有意な悪化 ${changes.filter(row => row.practicalLoss).length}件（107スキーマ × Node・Bun）。通常の出力とエラーは削除前と一致しています。</p>
<h2 id="scenarios">どういうケースで勝っているか</h2><div class="cards">
<article class="card"><h3>文字列の数値変換・混在する CLI</h3><p>数値・boolean・配列・enum を組み合わせるケースが強みです。以下は10進数の文字列を数値に変換するスキーマを作って1回検証する時間です。</p>${metric('number-decimal', 'node')}${codeLink('number-decimal')}</article>
<article class="card"><h3>RHF の items を持つフォーム</h3><p>1・10・100行の配列フォームは、両ランタイムで Zod・Valibot より有意に速いです。以下は100行の入力を検証するスキーマの作成＋検証1回です。</p>${metric('supplement-rhf-items-100', 'node')}${codeLink('supplement-rhf-items-100')}</article>
<article class="card"><h3>単純な文字列は Valibot にまだ負ける</h3><p>string 1項目の object や、文字列の optional/default を中心にした小さいスキーマには弱点が残ります。基本文字列のサイズは Loculus ${sizes.cases['string-basic'].loculus.gzipBytes} / Valibot ${sizes.cases['string-basic'].valibot.gzipBytes} bytes（gzip）です。</p>${metric('string-basic', 'node')}${codeLink('string-basic')}</article>
<article class="card"><h3>全ケースの勝利は達成していません</h3><p>Zod に対しては全107ケースで両ランタイムとも有意に速い結果です。Valibot との勝敗は、型・省略値・object の幅によって変わります。</p><p>Node / Valibot: ${tally(stats.peer.filter(row => row.runtime === 'node' && row.reference === 'valibot'))}<br>Bun / Valibot: ${tally(stats.peer.filter(row => row.runtime === 'bun' && row.reference === 'valibot'))}</p><p>Valibot に native xor がない2ケースを除外。未確定は同等の証明ではありません。</p></article></div>
<h2 id="cli">実在コマンドのオプション</h2><p>Git log / clone と、公式 <strong>cf@1.0.0-beta.14</strong> の deploy / DNS records list。少数指定・多数指定を分けています。cf の型・enum・default は公開パッケージの metadata から取得しました。</p><div class="cards">${cliCards}</div>
<h2 id="size-types">サイズと型チェック</h2><p>削除前より小さいバンドル ${smaller} / 107。増加 ${bigger}件は最大${Math.max(...Object.values(sizes.cases).map(value => value.loculus.gzipBytes - value.before.gzipBytes))} byte（gzip）で、minifier の変数名などでも変わる差です。107個の live schema/validator をバンドルし、428個の minify 済みモジュールを実行して正常出力を照合しました。</p><p>型チェックは6グループを各3プロセスで測定。時間の中央値と instantiations を示します。時間の統計検定は行っていません。</p><div class="scroll"><table id="types"><thead><tr><th>グループ / 秒</th><th>Loculus</th><th>Zod</th><th>Valibot</th></tr></thead><tbody>${typeRows}</tbody></table></div>
<details id="evidence"><summary>全計測値・負けたケース・3ライブラリのコードを開く</summary><h2>測定条件</h2><p>Node ${h(raw.environment.node)} / Bun ${h(raw.environment.bun)} / ${h(raw.environment.cpu)}。107ケース、各ランタイム・条件9独立プロセス、30ms warmup、7ラウンド。スキーマ作成＋正常検証1回が1 operation。プロセスの cold start ではありません。entries のケースは検証時の正規化も速度に含みます。単発の入力は図示した入力群を順に切り替えます。Zod は jitless。exact Mann–Whitney と Holm 補正、10%の実用差を併用しています。</p><p>cf の zone/account や Git の ref/path の解決、argv tokenization、通信、設定ファイルの合成は計測範囲外です。Bun ではスキーマの検証を測っており、cf CLI 自体は起動していません。RHF の通常スキーマも再利用できます。compile の生成＋1回や反復速度は、今回の評価にはありません。</p><p>スキーマ57テスト（Node/Bun）、RHF 12ブラウザテスト、Politty 84テストと型チェックが成功。107スキーマの削除前後の出力・issue数・pathが一致し、計時する正常入力は3ライブラリで一致。不正入力のライブラリ間の差は計時外の観測として保存しています。</p>
<h2>作成＋検証1回：ns / operation</h2><div class="scroll"><table id="speed"><thead><tr><th>ケース / runtime</th><th>Loculus</th><th>Zod</th><th>Valibot</th><th>単発の判定</th><th>削除前 Loculus</th></tr></thead><tbody>${speedRows}</tbody></table></div>
<details><summary>Valibot に有意に負けている ${losses.length}比較</summary><div class="scroll"><table><thead><tr><th>ケース</th><th>runtime</th><th>Loculus ns</th><th>Valibot ns</th></tr></thead><tbody>${losses.map(row => `<tr><td><a href="#case-${row.id}">${row.id}</a></td><td>${row.runtime}</td><td>${row.ns.toFixed(2)}</td><td>${row.referenceNs.toFixed(2)}</td></tr>`).join('')}</tbody></table></div></details>
<h2>ブラウザ ESM：gzip bytes</h2><p>実際の tsdown JSを esbuild で minify。schema と Standard Schema validate を export して使用。Zod named import、Mini の比較は含みません。entries の正規化と parse の例外ラッパーはサイズ表には含みません。型チェックの6グループは canonical の workload であり、新しい cf / RHF 専用の型ベンチマークではありません。</p><div class="scroll"><table id="bundles"><thead><tr><th>ケース</th><th>削除前</th><th>Loculus</th><th>Zod named</th><th>Valibot</th></tr></thead><tbody>${bundleRows}</tbody></table></div><h2>API・コード・入力</h2>${codes}
<p>source SHA256: <code>${hash('src/index.ts')}</code><br>測定開始: ${h(raw.environment.date)}<br>型チェック TypeScript ${h(types.typescript)}</p></details>
<script>const openCase=()=>{const target=document.getElementById(decodeURIComponent(location.hash.slice(1)));if(!target)return;for(let element=target;element;element=element.parentElement)if(element.tagName==='DETAILS')element.open=true;target.scrollIntoView();};addEventListener('hashchange',openCase);if(location.hash)openCase();</script></html>`;
writeFileSync('docs/performance-tuning.html', html);
console.log('Wrote current single-use report with 107 schemas.');
