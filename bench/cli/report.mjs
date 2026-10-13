import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inspect } from 'node:util';
import { profiles, prelude } from './fixtures.mjs';

const read = name => JSON.parse(readFileSync(`bench/cli/${name}.json`));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const h = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const literal = value => inspect(value, { depth: null, compact: true, breakLength: Infinity, maxArrayLength: null, maxStringLength: null });
const status = row => row.practicalImprovement ? '勝ち' : row.practicalLoss ? '負け' : '未確定';
const tally = rows => ['勝ち', '負け', '未確定'].map(label => `${label}${rows.filter(row => status(row) === label).length}`).join('・');

export const renderCli = () => {
  const normal = read('settled-results');
  const compiled = read('compiled-settled-results');
  const stats = read('significance-results');
  const compiledStats = read('compiled-significance-results');
  const bundles = read('bundle-results');
  const semantics = read('semantics-results');
  const sourceHash = hash('src/index.ts');
  for (const report of [normal, compiled, stats, compiledStats]) {
    assert.equal(report.completed, true);
    assert.equal(report.environment.sourceHash, sourceHash);
    const measuredIds = report.cases ? Object.values(report.cases).map(value => value.id) : report.peer.map(value => value.id);
    assert.deepEqual([...new Set(measuredIds)].sort(), profiles.map(profile => profile.id).sort());
  }
  assert.equal(normal.policy.freshProcesses, 9);
  assert.equal(compiled.policy.freshProcesses, 9);
  assert.deepEqual(compiled.policy.modes, ['valid', 'invalid']);
  assert.equal(stats.policy.peerFamilySize, 96);
  assert.equal(compiledStats.policy.peerFamilySize, 64);
  assert.equal(stats.policy.rawReportSha256, hash('bench/cli/settled-results.json'));
  assert.equal(compiledStats.policy.rawReportSha256, hash('bench/cli/compiled-settled-results.json'));
  for (const report of [semantics, bundles]) {
    assert.equal(report.completed, true);
    assert.equal(report.sourceHash, sourceHash);
    assert.equal(report.fixturesHash, hash('bench/cli/fixtures.mjs'));
    assert.equal(report.referenceHash, hash('bench/cli/cf-reference.json'));
  }
  assert.equal(bundles.distHash, hash('dist/index.js'));
  assert.equal(bundles.behaviorProbesHash, hash('bench/cli/behavior-probes.mjs'));
  const commands = [...new Set(profiles.map(profile => profile.command))];
  const cells = (report, id, runtime, mode) => ['loculus', 'zod', 'valibot'].map(library => {
    const candidate = Object.values(report.cases).find(value => value.id === id && value.library === library && value.version === 'after');
    return `<td>${candidate.runtime[runtime][mode].median.toFixed(2)}</td>`;
  }).join('');
  const header = '<thead><tr><th>ライブラリ</th><th>Node</th><th>Bun</th></tr></thead>';
  const cards = commands.map(command => {
    const cases = profiles.filter(profile => profile.command === command);
    const result = ['zod', 'valibot'].map(library => `${library}: ${tally(stats.peer.filter(row => cases.some(profile => profile.id === row.id) && row.mode === 'construct' && row.reference === library))}`).join(' / ');
    const sparse = cases.find(profile => profile.density === 'sparse');
    const rows = ['loculus', 'zod', 'valibot'].map(library => {
      const candidate = Object.values(normal.cases).find(value => value.id === sparse.id && value.library === library && value.version === 'after');
      return `<tr><td>${{ loculus: 'Loculus', zod: 'Zod', valibot: 'Valibot' }[library]}</td>${['node', 'bun'].map(runtime => `<td>${candidate.runtime[runtime].construct.median.toFixed(2)}</td>`).join('')}</tr>`;
    }).join('');
    return `<article class="cli-scenario scenario-cli"><h3>${h(command)}：${cases[0].fieldCount}項目</h3><p>単発の勝敗（少数・多数指定 × Node・Bun）<br>${result}</p><div class="scroll"><table>${header}<tbody>${rows}</tbody></table></div><p>上は少数指定で、スキーマ作成＋検証1回の ns。<a href="#case-${sparse.id}">少数指定のコード</a> · <a href="#case-${cases[1].id}">多数指定のコード</a></p><p><a href="${h(cases[0].source)}">公式のオプション資料</a>をもとに選んだ項目です。</p></article>`;
  }).join('');
  const aggregate = (report, mode) => ['zod', 'valibot'].map(library => `${library}: ${tally(report.peer.filter(row => row.mode === mode && row.reference === library))}`).join(' / ');
  const ordinaryBundleWins = library => profiles.filter(profile => bundles.cases[profile.id].ordinary.loculus.gzipBytes < bundles.cases[profile.id].ordinary[library].gzipBytes).length;
  const sparseNode = (report, mode) => report.peer.filter(row => row.runtime === 'node' && row.mode === mode && row.reference === 'valibot' && row.id.endsWith('-sparse'));
  const summary = `<h2 id="cli-cases">実在コマンドのオプションを使うケース</h2>
<p>Git log / clone、cf deploy / cf dns records list の4スキーマを、少数指定と多数指定に分けた8ケースです。CLI の単発利用は「全フィールドとスキーマの作成＋正常入力の検証1回」で比較します。</p>
<p>単発の合計：${aggregate(stats, 'construct')}</p>
<div class="cards">${cards}</div>
<p>省略の多い Node 入力での Valibot との比較：通常・正常反復 ${tally(sparseNode(stats, 'valid'))} / compile 済み・正常反復 ${tally(sparseNode(compiledStats, 'valid'))}。反復検証でも compile の採用はケースごとに判断する必要があります。</p>
<p>通常バンドル（gzip）で Loculus が小さいケース：Zod named import ${ordinaryBundleWins('zodNamed')} / 8、Valibot ${ordinaryBundleWins('valibot')} / 8。数 bytes の差を実質的な優位とは扱いません。<a href="#cli-evidence">全計測値・サイズ</a></p>
<details><summary>コマンドモデルの範囲・反復の勝敗・測定条件</summary>
<p>通常・正常反復：${aggregate(stats, 'valid')}<br>通常・不正反復：${aggregate(stats, 'invalid')}<br>compile 済み・正常反復：${aggregate(compiledStats, 'valid')}<br>compile 済み・不正反復：${aggregate(compiledStats, 'invalid')}</p>
<p>argv の解析後の flat record を検証し、文字列の数値・boolean フラグ・繰り返し指定の配列を含めます。Git / cf の全処理は再現していません。設定ファイルとの合成、日付・ref・パス・zone の意味解析、オプション間の条件、プロセス起動・通信は含みません。設定依存の省略値は補完せず、指定した定数の default だけを適用します。単発計測もウォームアップ後の処理であり、CLI の cold start 時間ではありません。</p>
<p>9独立プロセス / runtime。Holm 補正と10%の実用差で判定し、未確定は同等の証明ではありません。既存96ケースの勝敗には加算していません。compile の作成・生成時間は除外し、生成＋1回の計測はありません。環境：${h(normal.environment.cpu)}、Node ${h(normal.environment.node)}、Bun ${h(normal.environment.bun)}。</p>
<p>CF のオプション名・型・enum・default は cf@1.0.0-beta.14 の公開パッケージ内のコマンド metadata から取りました。cf deploy は9個の固有オプション＋mode、cf dns records list は37個の固有オプション＋zoneです。DNS の page / per-page は metadata の number 型に合わせ、整数や範囲の制約を追加していません。Bun でもこのスキーマ検証を測りますが、cf CLI 自体を Bun で起動した結果ではありません。</p>
<p>64個の minify 済みモジュールを実行して出力を確認し、通常版では未使用の Loculus compile import が消えることも確認しました。</p></details>`;
  const codes = profiles.map(profile => {
    const snippets = ['Loculus', 'Zod', 'Valibot'].map((library, index) => {
      const imported = index === 0 ? "import * as l from 'loculus';" : index === 1 ? "import {z} from 'zod';\nz.config({jitless:true});" : "import * as v from 'valibot';";
      const code = `${imported}\n${prelude}\nconst schema=${profile.expressions[index]};\nconst input=${literal(profile.valid[0])};\nconst result=schema['~standard'].validate(input);`;
      return `<h3>${library}</h3><pre><code>${h(code)}</code></pre>`;
    }).join('');
    return `<details id="case-${profile.id}"><summary>${profile.id} — ${h(profile.feature)}</summary><p>代表するコマンド行（計測対象は下の解析後 record）：</p><pre><code>${h(profile.argv)}</code></pre><p>${h(profile.note)}</p>${profile.referencePackage ? `<p>オプション定義: <a href="https://www.npmjs.com/package/cf/v/1.0.0-beta.14">${h(profile.referencePackage)}</a></p>` : ''}${snippets}<p>出力の期待値: <code>${h(literal(profile.expectedValid[0]))}</code></p><p>正常入力: <code>${h(literal(profile.valid))}</code></p><p>不正入力: <code>${h(literal(profile.invalid))}</code></p><p>照合用入力: <code>${h(literal(profile.probes))}</code></p></details>`;
  }).join('');
  const speedRows = [['通常', normal, stats], ['compile', compiled, compiledStats]].flatMap(([scope, report, significance]) => profiles.flatMap(profile => ['node', 'bun'].flatMap(runtime => report.policy.modes.map(mode => {
    const peer = library => status(significance.peer.find(row => row.id === profile.id && row.runtime === runtime && row.mode === mode && row.reference === library));
    return `<tr data-scope="${scope}" data-mode="${mode}"><td>${profile.id}<small>${scope} / ${runtime}</small></td><td>${{ construct: '作成＋検証1回', valid: '正常反復', invalid: '不正反復' }[mode]}</td>${cells(report, profile.id, runtime, mode)}<td>Zod ${peer('zod')} / Valibot ${peer('valibot')}</td></tr>`;
  })))).join('');
  const bundleRows = profiles.flatMap(profile => ['ordinary', 'compiled'].map(mode => `<tr><td>${profile.id}<small>${mode}</small></td>${['loculus', 'zodNamed', 'zodNamespace', 'valibot'].map(library => `<td>${bundles.cases[profile.id][mode][library].gzipBytes}</td>`).join('')}</tr>`)).join('');
  const evidence = `<h2 id="cli-evidence">コマンドモデル8ケースの全データ</h2><p>各比較の ns / operation。baseline は現行ソースと同じスナップショットで、前後の改善は主張していません。計時外の照合入力でも出力・issue数・pathが一致しました。型チェック速度についてはこの新しい4スキーマの追加測定は行っていません。</p><div class="scroll"><table class="cli-speed"><thead><tr><th>ケース / runtime</th><th>処理</th><th>Loculus</th><th>Zod</th><th>Valibot</th><th>判定</th></tr></thead><tbody>${speedRows}</tbody></table></div><h3>ブラウザ ESM バンドル：gzip bytes</h3><p>schema と Standard Schema validate を export して使用。Loculus は本番 tsdown 出力、esbuild minify。Zod の namespace / named import を分けて測定。Valibot は通常 schema を両方の比較に使用。CLI 本体や argv パーサーは含みません。</p><div class="scroll"><table class="cli-bundles"><thead><tr><th>ケース</th><th>Loculus</th><th>Zod named</th><th>Zod namespace</th><th>Valibot</th></tr></thead><tbody>${bundleRows}</tbody></table></div>`;
  return { summary, codes, evidence };
};
