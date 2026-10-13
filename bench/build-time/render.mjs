import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const raw=JSON.parse(readFileSync('bench/build-time/settled-results.json'));
const stats=JSON.parse(readFileSync('bench/build-time/significance-results.json'));
const sizes=JSON.parse(readFileSync('bench/build-time/bundle-results.json'));
for(const r of [raw,stats])assert.ok(r.completed);
assert.equal(raw.environment.sourceHash,hash('src/index.ts'));
assert.equal(raw.codegenReverification?.pluginHash??raw.environment.pluginHash,hash('packages/rolldown/src/index.ts'));
assert.equal(sizes.pluginHash,hash('packages/rolldown/src/index.ts'));
assert.equal(stats.policy.rawReportSha256,hash('bench/build-time/settled-results.json'));
const h=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const profiles=raw.policy.selection;
const measure=(id,runtime,lib,version='after',mode='construct')=>raw.cases[id+'-'+lib+'/'+version].runtime[runtime][mode].median;
const status=row=>row.practicalImprovement?'勝ち':row.practicalLoss?'負け':'未確定';
const tally=rows=>['勝ち','負け','未確定'].map(label=>label+rows.filter(r=>status(r)===label).length).join(' / ');
const metric=(id,runtime,mode='construct')=>`<p class="metric">${runtime} / ${mode==='construct'?'作成＋1回':'反復検証'}：生成 ${measure(id,runtime,'loculus','after',mode).toFixed(1)} / 通常 ${measure(id,runtime,'loculus','before',mode).toFixed(1)} / Valibot ${measure(id,runtime,'valibot','after',mode).toFixed(1)} ns</p>`;
const speedRows=profiles.flatMap(id=>['node','bun'].flatMap(runtime=>['construct','valid'].map(mode=>{
 const row=stats.peer.find(r=>r.id===id&&r.runtime===runtime&&r.mode===mode&&r.reference==='valibot');
 const change=stats.changes.find(r=>r.id===id&&r.runtime===runtime&&r.mode===mode);
 return `<tr><td><a href="#case-${id}">${id}</a><small>${runtime} / ${mode==='construct'?'作成＋1回':'反復'}</small></td><td>${measure(id,runtime,'loculus','before',mode).toFixed(2)}</td><td>${measure(id,runtime,'loculus','after',mode).toFixed(2)}</td><td>${measure(id,runtime,'zod','after',mode).toFixed(2)}</td><td>${measure(id,runtime,'valibot','after',mode).toFixed(2)}</td><td>Valibot: ${status(row)}<small>通常との差: ${status(change)}</small></td></tr>`;
}))).join('');
const bundleRows=sizes.cases.map(c=>`<tr><td><a href="#case-${c.id}">${c.id}</a></td>${['ordinary','generated','zod','valibot'].map(lib=>`<td>${c.libraries[lib].gzipBytes}<small>raw ${c.libraries[lib].bytes}</small></td>`).join('')}</tr>`).join('');
const lossRows=stats.peer.filter(r=>r.practicalLoss).map(r=>`<li>${h(r.id)} / ${r.runtime} / ${r.mode==='construct'?'作成＋1回':'反復'}：${r.ns.toFixed(1)} vs ${r.referenceNs.toFixed(1)} ns（${r.reference}）</li>`).join('');
const changedLoss=stats.changes.filter(r=>r.practicalLoss);
const smaller=sizes.cases.filter(c=>c.libraries.generated.gzipBytes<c.libraries.ordinary.gzipBytes).length;
const rawBigger=sizes.cases.filter(c=>c.libraries.generated.bytes>c.libraries.ordinary.bytes).length;
const config=`import {defineConfig} from 'tsdown';\nimport {loculusPlugin} from '@loculus/rolldown';\n\nexport default defineConfig({\n  entry: ['src/main.ts'],\n  plugins: [loculusPlugin()],\n});`;
const example=readFileSync('bench/build-time/generated/scalar-string-basic-generated-consumer.mjs','utf8');
const section=`<!--BUILD_TIME_START--><section id="build-time"><h1>Rolldown plugin によるビルド時生成</h1><p>通常のスキーマ記述を保ったまま、ビルド時に静的な検証関数とフィールド生成へ置き換えます。<strong>実行時の compile 呼び出しは不要</strong>。単発も反復も、同じ生成済み JS を使います。plugin は <code>@loculus/rolldown</code> という別の入口に置き、通常のランタイムへビルド用コードを含めません。</p>
<nav><a href="#bt-scopes">何が最適化されるか</a><a href="#bt-results">勝ち負け</a><a href="#bt-details">全計測値</a><a href="#scenarios">通常モードの既存比較</a></nav>
<h2 id="bt-scopes">使い方と適用範囲</h2><pre><code>${h(config)}</code></pre><p><code>import * as l from 'loculus'</code> または named import / alias に対応。変更するのは、直接書いた静的な <code>string</code>・<code>number</code>・<code>boolean</code>。min/max/trim、数値境界/integer、optional/nullable/nullish、文字列・数値・boolean の default と undefined/null/nullish の補完を生成できます。</p><p><code>object</code>・<code>array</code> は既存の実装を使い、その中の静的フィールドを生成します。正規表現・enum・date・動的オプション・getter・spread・callback は通常実装へ任せます。型チェックは元の TypeScript に対して行います。生成後もフィールド・metadata・Standard Schema オブジェクトは毎回別のものです。検証関数の identity とソース文字列は変わります。</p><details><summary>基本 string の生成済み JS を見る</summary><pre><code>${h(example)}</code></pre></details>
<h2 id="bt-results">どういうケースに効くか</h2><div class="cards">
<article class="card"><h3>基本 string の単発</h3><p>ビルド時生成後の単発を、同じ Rolldown と新しい計測条件で比較しています。後掲の通常モードの旧 ns と直接比較できません。</p>${metric('scalar-string-basic','node')}${metric('scalar-string-basic','bun')}<p>gzip：生成 ${sizes.cases.find(c=>c.id==='scalar-string-basic').libraries.generated.gzipBytes} / 通常 ${sizes.cases.find(c=>c.id==='scalar-string-basic').libraries.ordinary.gzipBytes} / Valibot ${sizes.cases.find(c=>c.id==='scalar-string-basic').libraries.valibot.gzipBytes} bytes。</p></article>
<article class="card"><h3>制約のある string・presence/default</h3><p>静的な判定だけを生成するので、オプションの準備と検証中の設定参照を減らせます。</p>${metric('scalar-string-trim','node')}${metric('scalar-presence-target-both','bun')}</article>
<article class="card"><h3>CLI と RHF のフォーム</h3><p>cf deploy、DNS records list、Git clone と、1/100行の RHF 用スキーマを測定。RHF の実際のブラウザデモも生成済みフィールドで動作確認しました。</p>${metric('cli-cf-deploy-full','node')}${metric('supplement-rhf-items-100','bun')}</article>
<article class="card"><h3>反復・広い object の限界</h3><p>object 全体の処理を展開する実装にはしていません。生成してもすべての反復ケースで Valibot に勝つとは限りません。</p>${metric('width-100','node','valid')}<p>通常との差で有意な悪化 ${changedLoss.length} / 64比較。${changedLoss.length?changedLoss.map(r=>h(r.id)+' / '+r.runtime+' / '+r.mode).join(', '):'今回の16ケースでは検出されませんでした。'}</p></article></div>
<p>生成版の勝敗：作成＋1回 / Valibot ${tally(stats.peer.filter(r=>r.reference==='valibot'&&r.mode==='construct'))}、反復 / Valibot ${tally(stats.peer.filter(r=>r.reference==='valibot'&&r.mode==='valid'))}。Zod ${tally(stats.peer.filter(r=>r.reference==='zod'))}（両モード・両runtime）。</p><p>サイズは全107ケースを比較。生成による gzip 縮小 ${smaller}件、非圧縮サイズの増加 ${rawBigger}件。Valibot より gzip が小さい ${sizes.cases.filter(c=>c.libraries.generated.gzipBytes<c.libraries.valibot.gzipBytes).length} / 107。plugin が静的フィールドを生成した92ケースと、通常のまま15ケースを含みます。</p>
<details id="bt-details"><summary>測定条件・64行の速度・107件のサイズを開く</summary><p>性能は事前に選んだ16ケースのみ。各条件9独立プロセス、30ms warmup、7ラウンド（各目標8ms）、Node ${h(raw.environment.node)} / Bun ${h(raw.environment.bun)} / ${h(raw.environment.cpu)}。作成＋1回は全フィールド・スキーマの作成を含み、反復は作成済みスキーマを使います。両方ともビルド時の生成時間を計時しません。Zod は jitless。exact Mann–Whitney＋Holm、10%の実用差。未確定は同等の証明ではありません。</p><p>今回の harness は、生成したスキーマと結果を32件保持し、変換後の値を再帰的に checksum に含めます。以前のキー数中心の harness とは数値を直接比較できません。プロセスの cold start、cf CLI の起動・通信、RHF 自体の描画時間は速度表の範囲外です。正常入力の出力は4条件で一致。107ケースの正常・不正・probe の値・全issue・pathが生成前後で一致しました。</p><p>Rolldown の <a href="https://rolldown.rs/apis/plugin-api">TypeScript 対応 parser</a> と <a href="https://rolldown.rs/apis/plugin-api/transformations">source map API</a> を使っています。生成はユーザーのスキーマ処理をビルド中に実行しません。</p><div class="scroll"><table id="bt-speed"><thead><tr><th>ケース / runtime / mode</th><th>通常Loculus</th><th>生成Loculus</th><th>Zod</th><th>Valibot</th><th>判定</th></tr></thead><tbody>${speedRows}</tbody></table></div><h3>有意に負けた比較</h3><ul>${lossRows||'<li>今回の対象では検出されませんでした。</li>'}</ul><h3>minify済み ESM：gzip bytes / raw bytes</h3><p>同じ Rolldown で schema・createSchema・検証入口を残した実際のconsumerを実行。後掲の以前の esbuild サイズ表とは対象 export が異なります。</p><div class="scroll"><table id="bt-bundles"><thead><tr><th>ケース</th><th>通常Loculus</th><th>生成Loculus</th><th>Zod</th><th>Valibot</th></tr></thead><tbody>${bundleRows}</tbody></table></div><p>各リンクから元の3ライブラリのコードと入力を確認できます。普通の Loculus 記述をそのまま plugin が変換します。</p><p>plugin SHA256: <code>${hash('packages/rolldown/src/index.ts')}</code> / raw measurements SHA256: <code>${hash('bench/build-time/settled-results.json')}</code></p></details></section><!--BUILD_TIME_END-->`;
let html=readFileSync('docs/performance-tuning.html','utf8');
html=html.replace(/<!--BUILD_TIME_START-->[\s\S]*?<!--BUILD_TIME_END-->/,'');
html=html.replace('<title>Loculus：単発利用の比較</title>','<title>Loculus：ビルド時生成と単発比較</title>');
html=html.replace('</style>','</style>'+section);
html=html.replace('<h1>単発利用を主軸にした Loculus</h1>','<h2>通常モード：単発利用の既存比較</h2>');
writeFileSync('docs/performance-tuning.html',html);
console.log('Added mobile build-time report with 16 timing profiles and 107 bundles.');
