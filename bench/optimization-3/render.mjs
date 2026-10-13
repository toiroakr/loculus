import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inspect } from 'node:util';
import { profiles, prelude } from '../coverage/fixtures.mjs';
import { profiles as rhfProfiles } from './supplement-fixtures.mjs';
import { profiles as mixedProfiles } from './mixed-fixtures.mjs';
import { performance } from './evidence.mjs';
import { renderCli } from '../cli/report.mjs';
const cli = renderCli();
const read = name => JSON.parse(readFileSync(`bench/optimization-3/${name}.json`));
const normal = performance('settled-results');
const compiled = performance('compiled-settled-results');
const significance = performance('significance-results');
const compiledSignificance = performance('compiled-repeated-significance-results');
const additional = ['supplement', 'mixed'].map(prefix => ({ prefix, normal: performance(prefix + '-settled-results'), compiled: performance(prefix + '-compiled-settled-results'), significance: performance(prefix + '-significance-results'), compiledSignificance: performance(prefix + '-compiled-repeated-significance-results') }));
const bundles = read('bundle-results');
const additionalBundles = read('additional-bundle-results');
const modularity = read('modularity-results');
const modularityCold = read('modularity-cold-results');
const types = read('type-results');
const verification = read('verification');
const ablation = JSON.parse(readFileSync('bench/optimization-4/valibot-ablation-results.json'));
const reachability = JSON.parse(readFileSync('bench/optimization-4/bundle-reachability-results.json'));
if (!ablation.completed || ablation.freshProcesses < 9 || !reachability.completed) throw new Error('Incomplete Valibot analysis');
const sourceHash = createHash('sha256').update(readFileSync('src/index.ts')).digest('hex');
const normalizeEntries = `
const normalizeEntries = entries => {
  const out = Object.create(null);
  for (const [key, value] of entries) {
    if (Object.hasOwn(out, key)) {
      if (Array.isArray(out[key])) out[key].push(value);
      else out[key] = [out[key], value];
    } else out[key] = value;
  }
  return out;
};`;
const distHash = createHash('sha256').update(readFileSync('dist/index.js')).digest('hex');
const declarationsHash = createHash('sha256').update(readFileSync('dist/index.d.ts')).digest('hex');
for (const report of [modularity, modularityCold]) if (!report.completed || report.sourceHash !== sourceHash || report.distHash !== distHash) throw new Error('Stale modularity experiment');
if (bundles.hashes.after !== distHash || additionalBundles.distHash !== distHash || additionalBundles.sourceHash !== sourceHash || !additionalBundles.completed || verification.sourceHash !== sourceHash || verification.distHash !== distHash || types.sourceHash !== sourceHash || types.distHash !== declarationsHash) throw new Error('Stale verification');
const h = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const fmt = value => value.toFixed(2);
const rows = [];
for (const [scope, report, stats] of [['通常', normal, significance], ['compile', compiled, compiledSignificance]]) {
  for (const c of Object.values(report.cases)) {
    if (c.library !== 'loculus' || c.version !== 'after') continue;
    const previous = Object.values(report.cases).find(x => x.id === c.id && x.library === 'loculus' && x.version === 'before');
    const peer = lib => Object.values(report.cases).find(x => x.id === c.id && x.library === lib && x.version === 'after');
    for (const runtime of ['node', 'bun']) for (const mode of (scope === 'compile' ? ['valid', 'invalid'] : ['valid', 'invalid', 'construct'])) {
      const value = c.runtime[runtime][mode].median;
      const before = previous.runtime[runtime][mode].median;
      const change = stats.changes.find(x => x.id === c.id && x.runtime === runtime && x.mode === mode);
      const status = change.practicalImprovement ? '有意な改善' : change.practicalLoss ? '有意な悪化' : '未確定';
      rows.push(`<tr data-runtime="${runtime}" data-mode="${mode}" data-scope="${scope}"><td>${h(c.id)}<small>${scope} / ${runtime}</small></td><td>${{ valid: '正常入力・反復', invalid: '不正入力・反復', construct: 'スキーマ作成＋検証1回' }[mode]}</td><td>${fmt(before)}</td><td>${fmt(value)}</td><td>${fmt(peer('zod').runtime[runtime][mode].median)}</td><td>${fmt(peer('valibot').runtime[runtime][mode].median)}</td><td class="${change.practicalImprovement ? 'good' : change.practicalLoss ? 'bad' : ''}">${fmt((1 - value / before) * 100)}%<small>${status}</small></td></tr>`);
    }
  }
}
const ids = new Set(Object.values(normal.cases).map(x => x.id));
const literal = value => inspect(value, { depth: null, compact: true, breakLength: Infinity, maxArrayLength: null, maxStringLength: null });
const example = (p, i) => {
  const lib = ['l', 'z', 'v'][i];
  let input = `const input = ${literal(p.valid[0])};`;
  let prepared = 'input';
  if (p.format) {
    const entries = Object.entries(p.valid[0]).flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map(item => [key, item]));
    input = `const entries = ${literal(entries)};\n` + (p.format === 'url' ? 'const input = new URLSearchParams(entries);' : 'const input = new FormData();\nfor (const [key, value] of entries) input.append(key, value);');
    prepared = `${i === 0 ? 'l.fromEntries' : 'normalizeEntries'}(input)`;
  }
  let invoke = `const result = schema['~standard'].validate(${prepared});`;
  if (p.method === 'safeParse') invoke = i === 0 ? `const result = l.safeParse(schema, ${prepared});` : i === 1 ? `const parsed = schema.safeParse(${prepared});\nconst result = parsed.success ? { value: parsed.data } : { issues: parsed.error.issues };` : `const parsed = v.safeParse(schema, ${prepared});\nconst result = parsed.success ? { value: parsed.output } : { issues: parsed.issues };`;
  if (p.method === 'parse') invoke = `let result;\ntry { result = { value: ${i === 1 ? `schema.parse(${prepared})` : `${lib}.parse(schema, ${prepared})`} }; }\ncatch (error) { result = { issues: error.issues }; }`;
  return `${i === 1 ? 'z.config({ jitless: true });\n' : ''}const schema = ${p.expressions[i]};\n${input}\n${invoke}`;
};
const namedCode = p => {
  const c = additionalBundles.namedZodOrdinary[p.id];
  return c ? `<h3>Zod named import（サイズ補足）</h3><pre><code>${h(c.imports + '\n' + prelude + '\nexport const schema=' + c.expression + ';\nexport const validate=input=>schema["~standard"].validate(input);')}</code></pre>` : '';
};
const codes = [...profiles.filter(p => ids.has(p.id)), ...rhfProfiles, ...mixedProfiles].map(p => `<details id="case-${h(p.id)}"><summary>${h(p.id)} — ${h(p.feature)}</summary>${p.note ? `<p>${h(p.note)}</p>` : ''}${['Loculus', 'Zod', 'Valibot'].map((name, i) => `<h3>${name}</h3><pre><code>${h(example(p, i))}</code></pre>`).join('')}${namedCode(p)}<p>正常入力: <code>${h(literal(p.valid))}</code></p><p>不正入力: <code>${h(literal(p.invalid))}</code></p><p>値・エラーの照合入力: <code>${h(literal(p.probes))}</code></p></details>`).join('');
const bundleRows = profiles.map(p => { const c = bundles.cases[p.id]; return `<tr><td>${h(p.id)}${p.nativeValibot === false ? '<small>Valibot は合成による比較</small>' : ''}</td>${['before', 'after', 'zod', 'valibot'].map(v => `<td>${c[v].gzipBytes}</td>`).join('')}<td>${additionalBundles.namedZodOrdinary[p.id].gzipBytes}</td><td>${c.after.gzipBytes - c.before.gzipBytes}</td></tr>`; }).join('');
const typeRows = Object.entries(types.groups).map(([group, data]) => `<tr><td>${h(group)}</td>${['loculus', 'zod', 'valibot'].map(lib => `<td>${data.libraries[lib].checkSeconds.toFixed(3)}<small>${data.libraries[lib].instantiations} instantiations</small></td>`).join('')}</tr>`).join('');
const compiledGains = compiledSignificance.changes.filter(x => x.practicalImprovement).length;
const compiledLosses = compiledSignificance.changes.filter(x => x.practicalLoss).length;
const gains = significance.changes.filter(x => x.practicalImprovement).length;
const losses = significance.changes.filter(x => x.practicalLoss).length;
const peerLosses = significance.peer.filter(x => x.practicalLoss).length;
const ordinaryCount = Object.values(normal.cases).filter(c => c.library === 'loculus' && c.version === 'after').length;
const compiledCount = Object.values(compiled.cases).filter(c => c.library === 'loculus' && c.version === 'after').length;
const tally = items => [items.filter(x => x.practicalImprovement).length, items.filter(x => x.practicalLoss).length, items.filter(x => !x.practicalImprovement && !x.practicalLoss).length];
const peerRows = [['通常', significance], ['compile', compiledSignificance]].flatMap(([scope, stats]) => ['zod', 'valibot'].flatMap(lib => ['node', 'bun'].map(runtime => {
  const counts = tally(stats.peer.filter(x => x.reference === lib && x.runtime === runtime));
  return `<tr><td>${scope} / ${runtime}</td><td>${lib}</td>${counts.map(x => `<td>${x}</td>`).join('')}</tr>`;
}))).join('');
const bundleWins = lib => Object.values(bundles.cases).filter(c => c.after.gzipBytes < c[lib].gzipBytes).length;
const namedZodWins = Object.entries(bundles.cases).filter(([id, c]) => c.after.gzipBytes < additionalBundles.namedZodOrdinary[id].gzipBytes).length;
const maxValibotBytes = Math.max(...Object.values(bundles.cases).map(c => c.after.gzipBytes - c.valibot.gzipBytes));
const maxValibotCreation = Math.max(...significance.peer.filter(c => c.reference === 'valibot' && c.practicalLoss && c.mode === 'construct').map(c => c.ns - c.referenceNs));
const modularityRows = [['cases','通常96'],['compiled','compiled49']].flatMap(([key,scope]) => ['barrel','direct'].map(variant => {
  const values = Object.values(modularity[key]);
  return `<tr><td>${scope} / ${variant}</td><td>${values.filter(c => c[variant].gzipBytes < c.original.gzipBytes).length}</td><td>${values.filter(c => c[variant].gzipBytes > c.original.gzipBytes).length}</td><td>${Math.max(...values.map(c => c.original.gzipBytes - c[variant].gzipBytes))}</td><td>${Math.max(...values.map(c => c[variant].gzipBytes - c.original.gzipBytes))}</td></tr>`;
})).join('');
const coldRows = ['node/string','node/query','bun/string','bun/query'].map(id => `<tr><td>${id}</td>${['original','barrel','direct'].map(variant => `<td>${fmt(modularityCold.cases[id][variant].medians.importNs / 1e6)}</td>`).join('')}</tr>`).join('');
const additionalBundleRows = Object.entries(additionalBundles.cases).flatMap(([id, modes]) => Object.entries(modes).map(([mode, c]) => `<tr><td>${h(id)}<small>${h(mode)}</small></td>${['before','after','zod','valibot'].map(lib => `<td>${c[lib].gzipBytes}</td>`).join('')}<td>${c.after.gzipBytes - c.before.gzipBytes}</td></tr>`)).join('');
const entryRows = Object.entries(additionalBundles.entrySanity).map(([entry, size]) => `<tr><td>${h(entry)}</td><td>${size.bytes}</td><td>${size.gzipBytes}</td></tr>`).join('');
const lossRows = [['通常', significance], ['compile', compiledSignificance]].flatMap(([scope, stats]) => stats.peer.filter(x => x.practicalLoss).sort((a,b) => b.ratio - a.ratio).map(x => `<tr><td>${h(x.id)}<small>${scope} / ${x.runtime}</small></td><td>${h(x.mode)}</td><td>${x.reference}</td><td>${fmt(x.ns)}</td><td>${fmt(x.referenceNs)}</td><td>${fmt(x.ratio)}×</td></tr>`)).join('');
const additionalTables = additional.map(group => {
  const body = [];
  for (const [scope, report, stats] of [['通常', group.normal, group.significance], ['compile', group.compiled, group.compiledSignificance]]) {
    for (const current of Object.values(report.cases).filter(c => c.library === 'loculus' && c.version === 'after')) {
      const find = (library, version = 'after') => Object.values(report.cases).find(c => c.id === current.id && c.library === library && c.version === version);
      for (const runtime of ['node', 'bun']) for (const mode of (scope === 'compile' ? ['valid', 'invalid'] : ['valid', 'invalid', 'construct'])) {
        const change = stats.changes.find(c => c.id === current.id && c.runtime === runtime && c.mode === mode);
        body.push(`<tr><td>${h(current.id)}<small>${scope} / ${runtime}</small></td><td>${h(mode)}</td>${[find('loculus','before'), current, find('zod'), find('valibot')].map(c => `<td>${fmt(c.runtime[runtime][mode].median)}</td>`).join('')}<td>${change.practicalImprovement ? '有意な改善' : change.practicalLoss ? '有意な悪化' : '未確定'}</td></tr>`);
      }
    }
  }
  const gains = group.compiledSignificance.changes.filter(c => c.practicalImprovement).length;
  const losses = group.compiledSignificance.changes.filter(c => c.practicalLoss).length;
  return `<h3>${group.prefix === 'supplement' ? 'RHF: items が1・10・100行' : 'HTTP: transform / default ＋99項目・12項目の混在クエリ'}</h3><p>各3スキーマを追加比較。通常と compile を別々に、両ランタイムで各9プロセス測定しました。統計補正の対象は通常で peer 36比較・変更前後18比較、compile は反復のみで peer 24比較・変更前後12比較。既存96ケースの勝敗には加えていません。compile の変更前後: 有意な改善 ${gains}件、悪化 ${losses}件。</p>${group.prefix === 'mixed' ? '<p>候補の選定で同じ領域を試した後の追加測定です。計時する入力の出力・issue数・pathは一致。計時外の配列ルート入力では Valibot が欠落フィールドごとの issue を返し、Loculus / Zod はルートの型エラーを返します。nullタグを scalar wrap した失敗では Loculus は item 0、他ライブラリの union は tags 自体の path を返します。</p>' : '<p>フォームでは通常スキーマを使います。compile 版はスキーマを生成した後の反復検証だけを比較しています。</p>'}<div class="scroll"><table class="additional-speed"><thead><tr><th>ケース</th><th>処理</th><th>変更前</th><th>Loculus</th><th>Zod</th><th>Valibot</th><th>変更前後</th></tr></thead><tbody>${body.join('')}</tbody></table></div>`;
}).join('');
const provenanceNote = `<p>最後の変更は compile の処理です。通常モードの全計測用 JavaScript が最終実装から生成したものとバイト単位で一致することを確認し、通常の測定値・測定日時・測定時の source hash は維持しました。最終版 source hash との対応は ordinary-worker-equivalence.json に記録。compile は最終版で再測定しています。</p>`;
if (ablation.sourceHashes.loculus !== sourceHash || reachability.cases.loculus.sourceHash !== sourceHash) throw new Error('Stale Valibot analysis');
const median = values => [...values].sort((a,b) => a-b)[Math.floor(values.length / 2)];
const diagnosticRows = [['valibot','Valibot（通常実装）'],['valibot-freeze-copy-own','Valibot＋コピー・凍結・own判定・配列拒否'],['loculus','Loculus（通常実装）'],['loculus-no-freeze','Loculusから凍結だけを外す診断版']].map(([id,label])=>`<tr><td>${h(label)}</td><td>${median(ablation.cases[id].runtime.node.construct).toFixed(2)}</td><td>${median(ablation.cases[id].runtime.bun.construct).toFixed(2)}</td></tr>`).join('');
const reachabilityRows = [['loculus','Loculus（通常実装）'],['loculus-no-presence','optional / nullable / nullish / default 処理を除いた診断版'],['loculus-no-constraints','trim / min / max / pattern 処理を除いた診断版'],['valibot','Valibot（通常実装）']].map(([id,label])=>`<tr><td>${h(label)}</td><td>${reachability.cases[id].gzipBytes}</td></tr>`).join('');
const time = ns => ns >= 1000 ? `${(ns / 1000).toFixed(3)}µs` : `${ns.toFixed(1)}ns`;
const codeLink = (id, label = '3ライブラリのコードと入力') => `<a href="#case-${h(id)}">${h(label)}</a>`;
const comparison = (stats, id, runtime, mode, reference, outcome) => {
  const row = stats.peer.find(x => x.id === id && x.runtime === runtime && x.mode === mode && x.reference === reference);
  if (!row || !row[outcome === 'win' ? 'practicalImprovement' : 'practicalLoss']) throw new Error(`Unsupported scenario claim: ${id}/${runtime}/${mode}/${reference}`);
  return `<p class="metric">${runtime === 'node' ? 'Node' : 'Bun'}：Loculus <strong>${time(row.ns)}</strong> / ${reference === 'zod' ? 'Zod' : 'Valibot'} ${time(row.referenceNs)}</p>`;
};
const rhf = additional.find(x => x.prefix === 'supplement');
const mixed = additional.find(x => x.prefix === 'mixed');
const cross = read('compile-vs-normal-results');
if (cross.sourceHash !== sourceHash) throw new Error('Stale cross-mode comparison');
const crossExample = (group, id, runtime) => {
  const row = cross.groups[group].comparisons.find(x => x.id === id && x.runtime === runtime && x.mode === 'valid');
  if (!row) throw new Error(`Missing cross-mode evidence: ${id}`);
  return `<p class="metric">${runtime === 'node' ? 'Node' : 'Bun'}・正常入力：通常 <strong>${time(row.normalNs)}</strong> / compiled <strong>${time(row.compiledNs)}</strong></p>`;
};
const overview = `<h1>Loculus はどんなケースで勝ち、負けるか</h1>
<p class="lead">文字列を数値・真偽値・日付へ変換する入力と、通常モードの配列フォームで強いです。単純な文字列オブジェクトの単発利用は Valibot、生成済みの大きいオブジェクトの正常入力は Zod が有利です。全条件で勝てているわけではありません。</p>
<nav aria-label="レポート内の移動"><a href="#wins">勝っているケース</a><a href="#losses">負けているケース</a><a href="#compile-choice">compile の使いどころ</a><a href="#size-types">サイズ・型チェック</a><a href="#valibot-analysis">Valibotとの差の原因</a><a href="#cli-cases">Git / cf</a><a href="#evidence">全データ・コード</a></nav>
<div class="note"><strong>比べている時間</strong><ul><li><strong>単発：</strong>通常のフィールド・スキーマ作成＋正常入力の検証1回。作成コストを含みます。</li><li><strong>反復：</strong>スキーマを再利用する検証時間。通常・compiled とも作成時間を除外します。</li><li><strong>compile：</strong>コード生成は計測前に完了。「生成＋1回」は評価しません。</li></ul><p>通常の Zod は jitless、compiled の Zod は明示的に compile。以下の勝敗は各条件の統計検定と10%以上の差を満たしたものです。ns / µs は小さいほど速く、単発もウォームアップ済みプロセスの測定なので CLI 起動時間ではありません。</p></div>
<h2 id="wins">勝っているケース</h2><div class="cards">
<article class="scenario win"><small>CLI オプション・HTTP クエリの変換</small><h3>文字列の変換や検査が必要な入力</h3><p>通常モードでは、数値への変換と範囲チェック、真偽値への変換、日付、数値配列で、単発・正常反復・不正反復のいずれも両ランタイムで Zod / Valibot より有意に速いです。</p>${comparison(significance, 'number-decimal', 'node', 'construct', 'valibot', 'win')}<p>上は文字列から数値へ変換するスキーマを作って1回検証した時間です。入力の変換を含む用途が Loculus の強みです。</p>${codeLink('number-decimal')}</article>
<article class="scenario win"><small>React Hook Form の items 配列</small><h3>行を持つフォームを通常モードで検証</h3><p>文字列の trim と数量チェックを持つ1・10・100行のフォームでは、単発・正常反復・不正反復のすべてで両ランタイムとも Zod / Valibot より有意に速いです。フォームを再利用する場合も強みが続きます。</p>${comparison(rhf.significance, 'supplement-rhf-items-100', 'node', 'valid', 'valibot', 'win')}<p>上は100行の正常入力を、作成済みの通常スキーマで検証した時間です。</p>${codeLink('supplement-rhf-items-100')}</article>
<article class="scenario win"><small>入力に誤りがあるとき</small><h3>不正入力の検証は広く優位</h3><p>基本96スキーマの通常モードでは、不正入力の反復は Zod に全比較で勝ち、Valibot にも有意な負けがありません。compiled の基本49スキーマと RHF でも有意な負けはありません。</p><p>ただし追加の HTTP 100項目では、Node の compiled が Zod に負ける不正入力が2ケースあります。「エラー処理は常に最速」とは言えません。</p>${codeLink('number-inclusive', '範囲チェックのコードと入力')}</article></div>
<h2 id="losses">負けているケース</h2><div class="cards">
<article class="scenario loss"><small>通常モード・スキーマ作成＋検証1回</small><h3>単純な文字列オブジェクトを1回だけ使う</h3><p>必須文字列、literal、文字列の optional / nullable / default を含む小さいオブジェクトは、Valibot の作成＋検証が速いです。通常モードの Valibot への有意な負け58件中57件が、この単発の指標に集中しています。</p>${comparison(significance, 'string-basic', 'node', 'construct', 'valibot', 'loss')}<p>この例の差は約28ns。100項目の作成＋検証では最大約1.10µsの差です。文字列フィールド単体では両ランタイムとも Loculus が勝っており、文字列全般が弱いという結果ではありません。通常モードで Zod への有意な負けはありません。</p>${codeLink('string-basic')}</article>
<article class="scenario loss"><small>通常モード・Bun・正常入力の反復</small><h3>100項目の平坦な文字列オブジェクト</h3><p>通常モードの反復で Valibot に有意に負けたのは、この比較1件です。小さいスキーマの反復や、同じ100行でも RHF の配列フォームとは結果が異なります。</p>${comparison(significance, 'width-100', 'bun', 'valid', 'valibot', 'loss')}${codeLink('width-100')}</article>
<article class="scenario loss"><small>compiled・正常入力の反復</small><h3>生成済み Zod の大きい object と配列フォーム</h3><p>100項目の基本文字列 object と1・10・100行の RHF フォームは、両ランタイムで生成済み Zod が速いです。通常モードで Zod に勝っていても、生成済みスキーマでは勝敗が変わります。</p>${comparison(compiledSignificance, 'width-100', 'node', 'valid', 'zod', 'loss')}${comparison(rhf.compiledSignificance, 'supplement-rhf-items-100', 'node', 'valid', 'zod', 'loss')}<p>追加の HTTP 混在スキーマも3ケースすべてで、正常入力は両ランタイムとも生成済み Zod に負けます。</p>${codeLink('width-100', '100項目 object のコード')} · ${codeLink('supplement-rhf-items-100', '配列フォームのコード')}</article>
<article class="scenario loss"><small>compiled・正常入力の反復</small><h3>optional / nullish と大きい enum の一部</h3><p>Valibot への有意な負けは、Node の optional / nullish 系4ケースと、Bun の32候補 enum の計5件です。RHF と追加 HTTP では compiled でも Valibot への有意な負けはありません。</p>${comparison(compiledSignificance, 'presence-optional', 'node', 'valid', 'valibot', 'loss')}${codeLink('presence-optional', 'optional のコードと入力')} · ${codeLink('enum-32', '32候補 enum のコード')}</article></div>
<h2 id="compile-choice">compile はどんなときに使うか</h2><p>反復専用の機能ですが、生成すれば速くなるとは限りません。大きい HTTP object では効くケースがあり、小さい混在クエリや配列フォームでは通常モードが十分速いです。</p><div class="cards">
<article class="scenario"><h3>100項目の HTTP object：生成が効く</h3><p>先頭が default、残り99項目が基本文字列の正常入力では、Node で検証時間が大きく減ります。それでも生成済み Zod より遅い点は残ります。</p>${crossExample('mixed3', 'mixed-http-default-100', 'node')}${codeLink('mixed-http-default-100')}</article>
<article class="scenario"><h3>12項目の混在クエリ：通常が有利</h3><p>欠落した page の default を含むこの入力では、Node の compiled が通常より遅くなります。生成コードから通常の検証処理へ戻る経路を通るため、この入力では生成の利点が出ません。</p>${crossExample('mixed3', 'mixed-http-query-12', 'node')}${codeLink('mixed-http-query-12')}</article>
<article class="scenario"><h3>配列フォーム：通常を基本にする</h3><p>100行の Node の正常入力はほぼ同じ時間でした。Bun の基本49スキーマでは compiled が通常より遅い正常入力20件・不正入力32件があり、Bun では特に一律の compile 採用を勧められません。</p>${crossExample('rhf3', 'supplement-rhf-items-100', 'node')}<p>通常と compiled の比較は別日時の既存測定を使った追加分析です。環境差の影響を完全に除いた独立検証ではありません。</p></article></div>
<h2 id="size-types">サイズと型チェックではどうか</h2><div class="cards">
<article class="scenario"><h3>サイズ：変換は強く、単純な文字列は弱い</h3><p>gzip サイズも用途で分かれます。数値変換は Loculus 1,318B / Valibot 1,637B、真偽値変換は1,172B / 1,527Bで Loculus が小さく、必須文字列 object は1,279B / 1,078B、wrap しない配列は1,540B / 1,201Bで Valibot が小さいです。</p><p>96スキーマ中、Valibot より小さいもの43、大きいもの53。負けた53のうち52は差が256B以内で、最大339Bです。Zod は named import でも全96ケースで Loculus より大きく、tree-shaking は esbuild / Rolldown / Bun で確認済みです。</p></article>
<article class="scenario win"><h3>型チェック：全6グループで中央値が低い</h3><p>primitive・presence・array・composition・object・scalar field の全6グループで Loculus のチェック時間が両ライブラリより短い結果でした。object の例は Loculus 0.032秒 / Zod 0.058秒 / Valibot 0.064秒です。</p><p>各3プロセスの中央値で、時間の統計的有意性は検定していません。「有意な勝ち」として速度の勝敗には足していません。</p></article></div>
<h2 id="valibot-analysis">Valibot はなぜ単純な文字列で強いのか</h2>
<p><strong>作成時間は事前処理の違い、サイズは機能ごとの到達関係が大きく効いています。</strong>インストール済みの Valibot 1.5.0 の実装・型宣言と、実際の計測用バンドルを読み、要因を変えた診断用の実装も比較しました。別 API や singleton Field は製品に追加していません。</p>
<details><summary>実装の違い：内部処理と Standard Schema の境界</summary><ul><li>Valibot の object() は entries の参照を保持し、検証時に for-in で列挙して子の ~run を呼びます。Loculus は作成時に shape をコピー・凍結し、キーと子の Standard Schema 検証関数を保存します。</li><li>Valibot は子の Standard Schema アダプターを経由しません。子の ~standard.validate を差し替えても object の処理は変わらず、entries や ~run の変更は後の検証へ反映されます。Loculus は作成時に取得した検証関数を呼びます。</li><li>Valibot は in で継承プロパティも読み、名前付きプロパティを持つ配列も object として受け入れます。Loculus は own property のみを読み、配列ルートを拒否します。</li><li>Valibot の Standard Schema 情報は毎回作成されます。lazy getter や関数の singleton が作成速度の理由ではありません。設定なしの getGlobalConfig は共通の DEFAULT_CONFIG を返します。</li><li>Dataset は pipeline の各段で更新されます。ただし object の各子には新しい {value} を作るため、「単純な子の結果オブジェクトを作らない」という説明は誤りです。Loculus は trim・長さ・pattern を既に1つの検証関数へまとめています。</li></ul><p>V8 の trace では両ライブラリの string / object の作成関数がインライン化されました。Loculus の関数が単に大きくてインライン化されない、という仮説はこのケースでは裏付けられません。</p></details>
<h3>作成＋検証1回：同じ入力で要因を変える</h3><div class="scroll"><table><thead><tr><th>診断条件</th><th>Node・ns</th><th>Bun・ns</th></tr></thead><tbody>${diagnosticRows}</tbody></table></div><p>各条件9プロセス、7ラウンドの中央値。診断版は製品ではなく、元のライブラリとの42比較を exact Mann–Whitney・Holm 補正・10%差で確認しました。コピー・凍結・own判定を足した Valibot の作成時間の増加と、凍結を外した Loculus の減少は両環境で有意でした。</p><p>この Valibot 診断版が Loculus の全仕様を再現するわけではありません。検証関数のスナップショット、opaque callback や getter、エラーのコピーなどは別の違いです。元の Valibot への作成時間の負けを、この表で勝ちに置き換えていません。</p>
<h3>サイズ：string(options) から何が残るか</h3><div class="scroll"><table><thead><tr><th>機能の到達関係を調べる診断条件</th><th>gzip bytes</th></tr></thead><tbody>${reachabilityRows}</tbody></table></div><p>Valibot の string() は optional / nullish / trim / minLength を参照しないため、それらは未使用なら消えます。Loculus の string(options) はその処理を直接参照し、引数なしの string() を使ってもコードが残ります。単なるファイル分割や PURE 注釈では、この関係は変わりません。上の機能を除いた実装は採用しておらず、同等機能のサイズ比較でもありません。</p><p>Field 自体を共有する案には Politty の制約もあります。arg() は Field の identity をキーに metadata を登録するため、同じ Field を複数引数で共有すると設定を上書きします。Field は独立させる必要があります。</p><p>現在は自動 freeze の必要性と、公開 API を保てる内部の検証経路・構築用配列の削減を検討しています。通常実装の作成時間・サイズで Valibot を超えた変更は、まだ採用できていません。</p>
<p><strong>現時点の使いどころ：</strong>文字列入力の変換と通常モードのフォームを主軸にするのがバランスのよい使い方です。単純な文字列の最小サイズや生成済み正常入力の最速を最優先する条件には、まだ弱点があります。</p>
<p class="muted">製品は TypeScript からビルドした JavaScript。以下は Node / Bun の測定で、MoonBit・Wasm・Perry は別実験です。スキーマ ${verification.schemaTests.passed}件、RHF ${verification.browserTests.passed}件、Politty ${verification.polittyTests.passed}件の回帰確認が成功しています。</p>`;
const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Loculus パフォーマンス改善・回帰確認</title><style>
body{font:16px/1.75 system-ui,sans-serif;max-width:1150px;margin:auto;padding:22px;color:#18302f;background:#f8faf8}h1{font-size:1.7rem}h2{font-size:1.25rem;margin-top:32px}a{color:#066b67}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;font-size:14px}th,td{text-align:right;padding:10px;border-bottom:1px solid #dde5df;white-space:nowrap}th:first-child,td:first-child{text-align:left}th{background:#edf3ee;position:sticky;top:0}small{display:block;color:#57736b;font-size:12px}.scroll{overflow:auto;border:1px solid #dde5df;border-radius:10px;background:white}.good{color:#087340}.bad{color:#a13227}details{padding:12px;margin:8px 0;background:white;border:1px solid #dde5df;border-radius:9px}summary{cursor:pointer}pre{overflow:auto;padding:12px;background:#eef3f0;font-size:13px}label{display:inline-block;margin:5px}select{font:inherit;padding:6px;border:1px solid #adbfb5;border-radius:6px}.note{padding:14px;background:#fff6dc;border-radius:9px}code{overflow-wrap:anywhere}h3{font-size:1rem}li{margin:6px 0}.lead{font-size:1.1rem}nav{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}nav a{padding:6px 10px;border:1px solid #c6d7d0;border-radius:8px;background:white}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px}.scenario-cli{background:white;border:1px solid #dde5df;border-radius:12px;padding:18px;min-width:0}.scenario{background:white;border:1px solid #dde5df;border-radius:12px;padding:18px;min-width:0}.scenario h3{font-size:1.08rem;margin:6px 0}.scenario p{margin:10px 0}.win{border-top:4px solid #278464}.loss{border-top:4px solid #bb6646}.metric{background:#eff4f1;border-radius:7px;padding:9px;font-variant-numeric:tabular-nums}.muted{color:#57736b}#evidence>summary{font-weight:700;padding:8px}html{scroll-padding-top:12px}@media(max-width:600px){body{padding:16px}h1{font-size:1.45rem}.scenario{padding:15px}}
</style>${overview}${cli.summary}<details id="evidence"><summary>全データ・比較コード・測定条件を開く</summary><h2>測定と回帰確認</h2><p>RHF 対応後の実装を固定し、変更前後を比較しました。回帰テスト、公式資料の調査、Claude Code による独立レビュー、Node / Bun の測定を組み合わせています。</p>
<p><strong>${verification.schemaTests.passed}件のスキーマテスト、RHF ${verification.browserTests.passed}件、Politty ${verification.polittyTests.passed}件が成功。</strong>通常 ${ordinaryCount}ケース、compile ${compiledCount}ケースを再測定しました。日付は各ランタイムで ${verification.calendarChecks.perRuntime.toLocaleString('ja-JP')}入力を変更前と比較。不正な日付で例外が漏れる ${verification.calendarChecks.fixedExceptions}ケースは、検証エラーを返すよう修正しています。</p>
<details><summary>型ごとのパッケージ分割も試した結果</summary><p>同じ JavaScript を要素別ESMと共有coreに切り出し、Rolldown の複数entry出力として比較しました。rootと個別entryの関数同一性、Node/Bun 各57回帰テストを確認しています。型宣言や製品の exports は変更していません。通常96・compiled49を esbuild、代表6ケースを Rolldown / Bun でも測定しました。一貫したサイズ改善はなく、現行rootでも tree-shaking が効いています。</p><div class="scroll"><table><thead><tr><th>esbuild / import</th><th>小さくなる</th><th>大きくなる</th><th>最大削減 bytes</th><th>最大増加 bytes</th></tr></thead><tbody>${modularityRows}</tbody></table></div><p>モジュール読込の中央値 — ms。各条件9個の新規プロセス、ファイルシステムcacheは温まった状態です。統計的有意性は検定していません。barrelは分割後のroot、directは要素別entry。パッケージ分割だけを性能改善として採用する根拠は得られず、今回は製品の1パッケージを維持します。</p><div class="scroll"><table><thead><tr><th>環境 / 入力</th><th>現行</th><th>barrel</th><th>direct</th></tr></thead><tbody>${coldRows}</tbody></table></div></details>
<h2>今回採用した変更</h2><ul><li>日付の再生成・ISO文字列への変換を、Gregorian calendar の月日チェックに置き換える。タイムゾーン付き入力の出力は元の日時を保持する。</li><li>number / array の常に真になる分岐を除去し、バンドルに不要な string の検証コードが残ることを防ぐ。</li><li>configuredField の戻り値を既存のオブジェクトリテラルで生成し、追加ヘルパーを減らす。</li><li>compile が生成する関数に own を渡し、各フィールドの変数をその位置で宣言する。own property の判定と getter の実行順は維持する。</li><li>32項目以上の compile で transform / default 等を処理した後も、後続の基本フィールドを生成コードで検証する。Result の getter の回数・順序を保ち、通常モードには追加コードが残らないようにする。</li></ul>
<p>出力の事前確保、関数・メタデータの共有、遅延 Field クラス、数値の特殊処理、presence の分岐変更、compile の opaque field 処理などを検討しました。意味が変わる案、Bun の速度低下やサイズ増加を招く案は見送りました。検討したソースと測定結果は bench/optimization-3 に残しています。</p>
<div class="note">通常スキーマの確認対象では、変更前に対する有意な改善が ${gains} 件、有意な悪化が ${losses} 件。他ライブラリに対する有意な負けは ${peerLosses} 件残っています。compile の変更前との比較は改善 ${compiledGains} 件、悪化 ${compiledLosses} 件。全ケースで Zod / Valibot を上回ったという結果ではありません。</div>
<h2>ライブラリ間の比較</h2><p>1件はケース × ランタイム × 処理です。10%以上の差と統計検定の両方を満たす比較だけを勝敗に数えています。「未確定」は同等性の証明ではありません。Valibot に native xor がないケースはこの勝敗集計から除外しています。</p><div class="scroll"><table><thead><tr><th>実行形態</th><th>比較相手</th><th>Loculus が有意に速い</th><th>有意に遅い</th><th>未確定</th></tr></thead><tbody>${peerRows}</tbody></table></div>
<h2>速度 — ns / operation</h2><p>各ランタイムで独立した9プロセス。各プロセスは30msのウォームアップ後、7ラウンドの中央値を使用。exact Mann–Whitney と Holm 補正、10%の実用差を併用しています。通常モードのスキーマ作成の欄には正常入力の検証1回を含みます。compile のコード生成は評価対象に含みません。CLI のプロセス起動時間は含みません。</p>
<p>通常モードの Zod は jitless。compile モードは Loculus の compile と Zod の明示的な compile を比較します。Valibot は通常スキーマです。compile にフォールバックする strict / passthrough 等も含みます。MoonBit / Wasm / Perry の比較結果はこの速度表には含みません。製品のランタイムは TypeScript からビルドした JavaScript です。</p>
<label>実行環境 <select id="runtime"><option value="all">両方</option><option>node</option><option>bun</option></select></label><label>利用形態 <select id="scope"><option value="all">両方</option><option>通常</option><option>compile</option></select></label><label>処理 <select id="mode"><option value="all">すべて</option><option value="valid">正常入力・反復</option><option value="invalid">不正入力・反復</option><option value="construct">スキーマ作成＋検証1回（通常のみ）</option></select></label>
<div class="scroll"><table id="speed"><thead><tr><th>ケース</th><th>処理</th><th>変更前</th><th>Loculus</th><th>Zod</th><th>Valibot</th><th>短縮率</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
<details><summary>他ライブラリに有意に負けている比較</summary><div class="scroll"><table><thead><tr><th>ケース</th><th>処理</th><th>比較相手</th><th>Loculus</th><th>比較相手</th><th>倍率</th></tr></thead><tbody>${lossRows}</tbody></table></div></details>
<h2>追加の実用スキーマ</h2><p>RHF の配列フォームと、HTTP の混在スキーマを追加しました。compile は生成済みスキーマを再利用する正常・不正入力の反復だけで評価します。過去の「生成＋1回」を含む生データは履歴として維持し、集計と統計補正は反復のみの範囲で再計算しました。</p>${additionalTables}
<h2>型チェック — 秒</h2><p>各グループを独立した3プロセスでチェックした中央値。時間の統計的有意性は検定していません。型の instantiations 数は前回と同じで、公開された型定義ファイルも変更前と同一です。</p><div class="scroll"><table><thead><tr><th>グループ</th><th>Loculus</th><th>Zod</th><th>Valibot</th></tr></thead><tbody>${typeRows}</tbody></table></div><h2>バンドル — gzip bytes</h2><p>96ケース、実際の tsdown 出力を esbuild で minify したブラウザ向け ESM。schema と Standard Schema validate の両方を使用。fromEntries の前処理や parse の例外生成は、このサイズ表には含みません。Zod は zod パッケージの { z } import と named import を別々に示しています。Mini の全ケース比較ではありません。Zod の { z } より小さいケース ${bundleWins('zod')} / 96、named import より小さいケース ${namedZodWins} / 96、Valibot より小さいケース ${bundleWins('valibot')} / 96。速度改善によりサイズが増えたケースも表示しています。tree-shaking は別途 esbuild / Rolldown / Bun で実行確認しています。gzip の数バイトの差には minifier の変数名も影響します。</p><div class="scroll"><table><thead><tr><th>ケース</th><th>変更前</th><th>Loculus</th><th>Zod { z }</th><th>Valibot</th><th>Zod named</th><th>増減</th></tr></thead><tbody>${bundleRows}</tbody></table></div>
<h3>追加6スキーマの通常・compile サイズ</h3><p>compile の追加処理によるサイズ増加も含め、実際の変更前後の JavaScript を同じ条件で測定しました。</p><div class="scroll"><table><thead><tr><th>ケース</th><th>変更前</th><th>Loculus</th><th>Zod</th><th>Valibot</th><th>増減</th></tr></thead><tbody>${additionalBundleRows}</tbody></table></div><h3>単一 string オブジェクトの import 確認</h3><p>Zod の通常・named import・v4・Mini を別々にバンドルしました。Mini はこの単一ケースのサイズ確認だけで、上の速度・型チェックの比較には含みません。</p><div class="scroll"><table><thead><tr><th>entry / import</th><th>bytes</th><th>gzip bytes</th></tr></thead><tbody>${entryRows}</tbody></table></div>
<p>前回の Node GC 診断では、100項目の不正入力を10万回検証した際の割り当て量は両版とも約2.0GBでした。今回の変更について GC 割り当て量の削減は測定していません。</p><h2>測定したスキーマと入力</h2><p>compile の測定ではスキーマ生成を l.compile(...) / z.compile(...) で包みます。entries の生成自体は事前に行い、検証時の正規化コストは速度測定に含めています。表示した正常入力の1例だけでなく、下記の入力群を順番に切り替えて測定します。</p>${codes}${cli.codes}
${cli.evidence}
<details><summary>比較コードの共有ヘルパーと import</summary><pre><code>${h("import * as l from 'loculus';\nimport { z } from 'zod';\nimport * as v from 'valibot';\n" + prelude + normalizeEntries)}</code></pre></details><h2>調査と確認範囲</h2><p><a href="https://v8.dev/blog/fast-properties">V8: fast properties</a>、<a href="https://v8.dev/blog/fast-for-in">V8: enumeration</a>、<a href="https://v8.dev/blog/maglev">V8: Maglev</a>、<a href="https://esbuild.github.io/api/#pure">esbuild: pure calls</a>、<a href="https://webkit.org/blog/10308/speculation-in-javascriptcore/">JavaScriptCore: speculation</a> を参照しました。資料から得た仮説を現行バージョンで測り、資料の記述だけでは採用していません。</p><p>回帰テストは getter / callback の回数・順序、default の参照、shape と enum のスナップショット、継承プロパティ、共有・凍結されたエラー、compile の失敗経路、日付の leap century、コピー・凍結したフィールド、RHF の行追加・削除・移動を含みます。スマホのブラウザ確認は iPhone 13 の画面サイズを Chromium で模擬したもので、実機 Safari の結果ではありません。</p>
${provenanceNote}<p>${h(normal.environment.node)} / Bun ${h(normal.environment.bun)} / ${h(normal.environment.cpu)}<br>通常測定開始: ${h(normal.environment.date)}<br>compile 測定開始: ${h(compiled.environment.date)}<br>通常測定時 source SHA256: <code>${normal.environment.sourceHash}</code><br>最終版 source SHA256: <code>${sourceHash}</code></p>
</details><script>const openCase=()=>{const id=decodeURIComponent(location.hash.slice(1));const target=document.getElementById(id);if(!target)return;for(let element=target;element;element=element.parentElement)if(element.tagName==='DETAILS')element.open=true;target.scrollIntoView();};window.addEventListener('hashchange',openCase);if(location.hash)openCase();const filter=()=>{const compiled=document.getElementById('scope').value==='compile';document.querySelector('#mode option[value="construct"]').disabled=compiled;if(compiled&&document.getElementById('mode').value==='construct')document.getElementById('mode').value='all';for(const row of document.querySelectorAll('#speed tbody tr'))row.hidden=['runtime','scope','mode'].some(key=>{const value=document.getElementById(key).value;return value!=='all'&&row.dataset[key]!==value;});};for(const id of ['runtime','scope','mode'])document.getElementById(id).addEventListener('change',filter);</script></html>`;
writeFileSync('docs/performance-tuning.html', html);
console.log('Wrote docs/performance-tuning.html');
