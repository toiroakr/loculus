from pathlib import Path
import json,html,re,hashlib
root=Path(__file__).resolve().parents[2];folder=root/'bench/coverage'
read=lambda n:json.loads((folder/n).read_text())
fixtures=read('fixtures.json');types=read('type-results.json');native=read('semantic-differences.json');moon=read('moonbit-results.json')
base=read('results.json');scalar=read('scalar-results.json');compiled=read('compiled-results.json');compiled_scalar=read('compiled-scalar-results.json');perry=read('perry-results.json');perry_scalar=read('perry-scalar-results.json')
for r in [base,scalar,compiled,compiled_scalar,moon,perry,perry_scalar]:assert r['completed']
for report,name in [(perry,'perry-reference-results.json'),(perry_scalar,'perry-scalar-reference-results.json')]:
 reference=read(name);assert reference['completed']
 for key,group in report['groups'].items():
  for mode,entry in group['modes'].items():assert reference['groups'][key+'/'+mode]['sourceHash']==entry['sourceHash']
settled=read('settled-results.json');significance=read('significance-results.json');assert settled['completed'] and significance['completed']
source=hashlib.sha256((root/'src/index.ts').read_bytes()).hexdigest()
for r in [base,scalar,compiled,compiled_scalar,moon,perry,perry_scalar,settled,significance,types,native]:assert r.get('environment',r)['sourceHash']==source
cold=read('cold-results.json');assert cold['completed'];tree=read('tree-shaking-results.json');assert tree['completed']
for r in [cold,tree]:assert r.get('environment',r)['sourceHash']==source
cases={**base['cases'],**scalar['cases'],**compiled['cases'],**compiled_scalar['cases']};p_groups={**perry['groups'],**perry_scalar['groups']}
escape=lambda x:html.escape(str(x))
def table(head,rows):return '<div class="table-wrap"><table><thead><tr>'+''.join('<th>'+escape(x)+'</th>'for x in head)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+escape(x)+'</td>'for x in row)+'</tr>'for row in rows)+'</tbody></table></div>'
libs=['loculus','zod','valibot'];profiles=fixtures['profiles'];count=len(profiles);root_profiles=[p for p in profiles if not p['id'].startswith('scalar-')];scalar_profiles=[p for p in profiles if p['id'].startswith('scalar-')]
def native_profiles(items):return [p for p in items if p.get('nativeValibot')!=False]
def score(items,metric,runtime):
 good=native_profiles(items);wins=sum(cases[p['id']+'-loculus']['runtime'][runtime][metric]['median']<cases[p['id']+'-valibot']['runtime'][runtime][metric]['median'] for p in good);return f'{wins} / {len(good)}'
def size_score(items,bundler):
 good=native_profiles(items);wins=sum(cases[p['id']+'-loculus']['bundles'][bundler]['gzipBytes']<cases[p['id']+'-valibot']['bundles'][bundler]['gzipBytes']for p in good);return f'{wins} / {len(good)}'
section=f'<section id="coverage"><div class="section-head"><span class="eyebrow">FULL API COMPARISON</span><h2>未比較の機能を含む全{count}ケース</h2></div><div class="callout"><strong>比較を広げると、すべての面で Valibot を上回るという目標はまだ達成できていません。</strong><br>enum の異常入力・構築、単体フィールドの構築、型推論などを改善しました。単純なスキーマのサイズと構築、100フィールドの検証には未達が残っています。</div><p>object内の57ケース＋単体フィールド39ケース。全公開runtime APIを代表する入力で比較し、通常版・loculus compile・Zod object JIT・明示的な z.compile を分けました。任意の全入力／全オプション組み合わせを網羅したという意味ではありません。変更前の実装を保存し、変更後と同じ環境・入力で比較しました。実装の変更は通常のJS版に反映されています。</p>'
summary=[]
for name,items in [('object / composite',root_profiles),('単体フィールド',scalar_profiles)]:summary.append([name,len(items),score(items,'valid','bun'),score(items,'invalid','bun'),score(items,'construct','bun'),size_score(items,'bun')])
losses=[row for row in significance['peer'] if row['practicalLoss']]
gains=[row for row in significance['changes'] if row['practicalImprovement']]
regressions=[row for row in significance['changes'] if row['practicalLoss']]
section+='<h3>負けが見つかった全ケースの再確認</h3><p>47プロフィールについて、各ランタイム・各実装を9個の独立プロセスで実行。各プロセスで30 ms以上ウォームアップし、7ラウンドの中央値を統計単位にしました。候補の選択に使った短い計測とは分けています。</p>'
section+=f'<p>変更前より10%以上速くなり、補正後も有意な改善は {len(gains)} 件。現在の他ライブラリとの差が10%以上で、補正後も有意な負けは {len(losses)} 件です。同じプロフィールでもランタイム・正常／異常／構築を別々に数えます。</p>'
section+='<p class="note">両側・正確 Mann–Whitney 検定（同順位も置換分布で計算）、Holm補正、α=0.05。競合との比較は全96プロフィール×2ランタイム×3測定×2競合から、native xorのないValibot比較を除いた1140検定を補正対象にしています。変更前後は576検定。未計測の比較はp=1として保守的に扱い、同等とは判定していません。測定環境に共通する偏りは、この反復だけでは取り除けません。</p>'
section+='<details open><summary>有意な未達と残る理由</summary>'+table(['ケース','runtime','測定','loculus ns','競合','競合 ns','倍率','補正p'],[[r['id'],r['runtime'],r['mode'],f"{r['ns']:.2f}",r['reference'],f"{r['referenceNs']:.2f}",f"{r['ratio']:.2f}",f"{r['adjustedP']:.4f}"]for r in sorted(losses,key=lambda r:r['ratio'],reverse=True)])+'<p class="note">構築では、shape/optionsのスナップショット、Standard Schema、Politty用メタデータ、default対象の検査を含みます。100フィールドでは、継承プロパティを無視するown確認のコストが残ります。この表で負けているものを「解決済み」とは扱っていません。</p></details>'
section+='<details><summary>有意な変更前後の改善</summary>'+table(['ケース','runtime','測定','変更前 ns','変更後 ns','速さの倍率','補正p'],[[r['id'],r['runtime'],r['mode'],f"{r['referenceNs']:.2f}",f"{r['ns']:.2f}",f"{1/r['ratio']:.2f}",f"{r['adjustedP']:.4f}"]for r in sorted(gains,key=lambda r:r['ratio'])])+'</details>'
section+=f'<details open><summary>変更前より有意に遅くなった {len(regressions)} 件</summary>'+table(['ケース','runtime','測定','変更前 ns','変更後 ns','倍率','補正p'],[[r['id'],r['runtime'],r['mode'],f"{r['referenceNs']:.2f}",f"{r['ns']:.2f}",f"{r['ratio']:.2f}",f"{r['adjustedP']:.4f}"]for r in regressions])+'<p class="note">遅延生成や共通のdefault処理にはトレードオフがあり、すべての処理が変更前より速くなったという意味ではありません。</p></details>'
section+='<p>採用した変更：制約なしstringのvalidator共有、compiler情報を必要なフィールドだけに保持、enumのSetと表示メタデータの遅延生成・エラー文の再利用、literalの専用処理、unionのエラー配列の遅延生成、strictの未知キー列挙、compile失敗地点からの継続、presence/defaultの型推論の簡略化。明示的undefinedのtarget defaultは出力型にも反映。getterやcallbackを再実行せず、エラーパスとキーの省略規則を保持します。falseを意味する未設定のmeta.optional/meta.nullableは省略できます。</p>'
section+='<h3>Valibot を上回ったケース数</h3>'+table(['範囲','ケース数','Bun 正常','Bun 異常','Bun 構築＋検証','Bun gzip'],summary)+'<p class="note">native xorのないValibotとのcustom比較2ケースは勝敗集計から除外。ほぼ同じ速度・微小差でも中央値で判定しており、有意差や全環境での優位を示す集計ではありません。</p>'
section+='<h3>型チェック / 20コピー × 各ケース</h3>'
rows=[]
for name,g in types['groups'].items():
 for lib in libs:
  c=g['libraries'][lib];rows.append([name,lib,len(g['caseIds']),c['checkSeconds'],c['instantiations'],c['memoryKiB']])
section+=table(['group','library','ケース数','check秒','instantiations','memory KiB'],rows)+'<p class="note">strict / skipLibCheck / ambient typesなし / TypeScript 7.0.2。InputとOutputを推論し、正常出力を代入。3 fresh compiler processの中央値。xorは除外。これは型検査負荷の比較であり、あらゆる誤用の検出能力を数値化したものではありません。</p>'
section+='<h3>3ライブラリのtree-shaking / raw bytes</h3>'+table(['library','bundler','baseline','unused date差','PURE date差','unused object差','PURE object差'],[[lib,b,tree['cases'][lib+'/'+b+'/base']['bytes']]+[tree['cases'][lib+'/'+b+'/'+k]['bytes']-tree['cases'][lib+'/'+b+'/base']['bytes']for k in ['unusedConstruct','pureUnusedConstruct','unusedObject','pureUnusedObject']]for lib in libs for b in ['bun','esbuild','rolldown']])+'<p class="note">minifyしたbrowser ESM。全3bundler×3libraryで未使用packageの除去、残ったvalidatorの動作、PURE呼び出しの引数の副作用保持を確認。0はbaselineからrawサイズ増加なし。正数は未使用constructorの処理が残る差です。</p>'
section+='<h3>標準APIの挙動差</h3>'
for row in native['rows']:
 section+='<details><summary>'+escape(row['id'])+'</summary><pre><code>'+escape(json.dumps(row['input'],ensure_ascii=False))+'</code></pre>'
 if row.get('note'):section+='<p class="note">'+escape(row['note'])+'</p>'
 section+=table(['library','結果'],[[lib,json.dumps(row['results'][lib],ensure_ascii=False)]for lib in libs])
 for lib,code in zip(libs,row['code']):section+='<h3>'+lib+'</h3><pre><code>'+escape(code)+'</code></pre>'
 section+='</details>'
section+='<p>比較用コードでは、UTF-16長、数値／booleanの変換規則、defaultのタイミングなどをそろえています。Valibotのnullable(optional())は欠落キーを許さないためnullish()を使用。dateのdefaultは変換前のISO文字列で指定。各ケースの注記とコードに違いを載せています。</p>'
section+='<details><summary>共有ヘルパー・測定条件</summary><pre><code>'+escape(fixtures['prelude']+'\nconst normalizeEntries = entries => {\n  const result = Object.create(null);\n  for (const [key, value] of entries) {\n    if (!Object.hasOwn(result, key)) result[key] = value;\n    else if (Array.isArray(result[key])) result[key].push(value);\n    else result[key] = [result[key], value];\n  }\n  return result;\n};')+'</code></pre><p>Node 24.13.0 / Bun 1.4.3 / Apple M3 / Zod 4.6.5 / Valibot 1.5.0。3プロセス × 7ラウンド。検証warmup3000・5000操作、構築warmup100・500操作。全正常／異常データを巡回し、結果のキー数・issue数を消費。エラーの件数・構造にはnative APIの差があり、文面を同じにする調整はしていません。全ビルドとgzip処理の後に逐次測定。URL/Form入力の準備は測定外、fromEntriesまたは同等の手動ループは測定内です。</p><p>バンドルはschema・createSchema・validateをexportするbrowser ESM。Bun／esbuild ES2022／Rolldownのminify。createSchemaも残すため、前のschema＋validateのみの3ケースとは別の利用コードです。全バンドルを入力ケースに照合しました。</p></details>'
section+='<p class="note">入力表示の {$undefined:true} は実際の undefined、{$number:"NaN"} 等は非有限数を表します。URL/FormケースのJSONは正規化後の入力例です。parseの異常入力では、実際に投げた例外を計測コードが捕捉します。</p>'
section+='<h3>全ケース：コード・速度・サイズ・バックエンド対応</h3><label>ケースを絞る <input id="coverage-filter" type="search" placeholder="例：default、array、scalar"></label><p class="note">nsは繰り返し検証、µsは毎回の構築＋正常入力1回。小さいほど速い。Perryの失敗はグループ内での実行結果であり、単独の同じスキーマが常に動かないという意味ではありません。</p>'
failures=[]
for p in profiles:
 id=p['id'];section+='<details class="coverage-case"><summary>'+escape(id)+' · '+escape(p['feature'])+'</summary>'
 if p.get('note') and isinstance(p['note'],str):section+='<p class="note">'+escape(p['note'])+'</p>'
 section+='<h3>正常 / 異常入力</h3><pre><code>'+escape(json.dumps({'valid':p['valid'],'invalid':p['invalid'],'probes':p['probes']},ensure_ascii=False,indent=2))+'</code></pre>'
 for lib,expr in zip(libs,p['expressions']):
  call='schema["~standard"].validate(input)'
  if p.get('method')=='safeParse':call={'loculus':'l.safeParse(schema,input)','zod':'schema.safeParse(input)','valibot':'v.safeParse(schema,input)'}[lib]
  elif p.get('method')=='parse':call={'loculus':'l.parse(schema,input)','zod':'schema.parse(input)','valibot':'v.parse(schema,input)'}[lib]
  elif p.get('format') in ['url','form']:call='schema["~standard"].validate('+('l.fromEntries(input)'if lib=='loculus'else'normalizeEntries(input)')+')'
  section+='<h3>'+lib+'</h3><pre><code>'+escape('const schema = '+expr+';\nconst result = '+call+';')+'</code></pre>'
 variants=[(id+'-loculus','loculus'),(id+'-zod','Zod jitless'),(id+'-valibot','Valibot'),(id+'-loculus-optimized','loculus compile'),(id+'-zod-optimized','Zod object JIT'),(id+'-zod-compiled','Zod z.compile')]
 runtime=[];sizes=[]
 for key,label in variants:
  c=cases.get(key)
  if not c:continue
  if c.get('unavailable'):runtime.append([label,'未対応',c['unavailable'][:110],'','','','']);continue
  runtime.append([label]+[f'{c["runtime"][engine][mode]["median"]/(1000 if mode=="construct" else 1):.2f}'for engine in ['bun','node']for mode in ['valid','invalid','construct']])
  for bundler,b in c['bundles'].items():sizes.append([label,bundler,b['bytes'],b['gzipBytes']])
 section+=table(['library','Bun正常 ns','Bun異常 ns','Bun構築 µs','Node正常 ns','Node異常 ns','Node構築 µs'],runtime)
 section+='<h3>fresh process：1回実行して終了 / ms</h3>'+table(['library','Node','Bun'],[[label,f'{cold["cases"][key]["node"]["median"]:.2f}',f'{cold["cases"][key]["bun"]["median"]:.2f}']for key,label in variants if key in cold['cases']])+'<p class="note">5 fresh processの中央値。起動・import・構築/compile・入力準備・正常入力1回・JSON出力・終了を含みます。ビルド時間は測定外。各ケースの最初の正常入力を使い、全出力を照合。cold値は上のwarmな構築＋検証とは異なる指標です。</p>'
 section+='<h3>browser bundle / bytes</h3>'+table(['library','bundler','raw','gzip'],sizes)
 if id in moon['cases']:
  m=moon['cases'][id];rows=[]
  for key,c in m['runtime'].items():rows.append([key,c['status']]+([f'{c[mode]["median"]/(1000 if mode=="construct" else 1):.2f}'for mode in ['valid','invalid','construct']]if c['status']=='verified'else ['—','—','—']))
  section+='<h3>MoonBit 試作版</h3>'+table(['backend/runtime','status','正常 ns','異常 ns','構築 µs'],rows)+table(['backend','JS raw','Wasm raw','合計 raw','合計 gzip'],[[k,b['jsBytes'],b['wasmBytes'],b['bytes'],b['gzipBytes']]for k,b in m['bundle'].items()])+'<p class="note">型付けconstructor・metadataや一部機能を持たない試作版です。全機能を持つ製品と同等のbundleではありません。Wasmの初期化は検証時間に含みません。</p>'
 else:section+='<p class="note">MoonBit：未実装。試作版はflat object専用で、単体フィールドAPI・date・regex/trim・callback・合成等に対応していません。</p>'
 prows=[]
 for group,g in p_groups.items():
  if id not in g['profiles']:continue
  for mode,e in g['modes'].items():
   c=e.get('cases',{}).get(id);status=c['status']if c else e['status'];prows.append([g['library'],mode,status]+([f'{c[k]["median"]/(1000 if k=="construct" else 1):.2f}'for k in ['valid','invalid','construct']]if status=='verified'else ['—','—','—']))
   if status!='verified':failures.append([id,g['library'],mode,status])
 section+='<h3>Perry native</h3>'+table(['library','build mode','status','正常 ns','異常 ns','構築 µs'],prows)+'</details>'
section+='<h3>Perryのプログラム単位のサイズ / bytes</h3><p class="note">各feature groupの全ケース＋Perry runtime＋測定コードを含むMach-O。個別スキーマのサイズでもJS bundleでもありません。出力が不一致の実行ファイルもサイズは記録しますが、速度の比較対象からは除外しています。</p>'
section+=table(['group','library','mode','status','raw','gzip'],[[group,g['library'],mode,e['status'],e.get('bytes','—'),e.get('gzipBytes','—')]for group,g in p_groups.items()for mode,e in g['modes'].items()])
section+='<div class="links">'+''.join('<a href="../bench/coverage/'+name+'">'+label+'</a>'for name,label in [('README.md','再現条件'),('settled.mjs','ウォームアップ後の計測'),('significance.py','有意差の判定コード'),('settled-results.json','9プロセスの全サンプル'),('significance-results.json','補正後の有意差'),('before-optimization/index.ts.txt','変更前の実装'),('fixtures.mjs','全ライブラリのコード'),('prepare.mjs','実際の呼び出しと正規化コード'),('run.mjs','計測とbundle検証'),('semantics.mjs','挙動差の実行コード'),('results.json','object/composite 全サンプル'),('scalar-results.json','単体フィールド全サンプル'),('compiled-results.json','Zod明示compile'),('compiled-scalar-results.json','単体Zod compile'),('type-results.json','型チェック'),('cold-results.json','fresh process 1回実行'),('tree-shaking-results.json','3ライブラリのtree-shaking'),('semantic-differences.json','挙動差'),('moonbit-results.json','MoonBit JS / Wasm'),('perry-results.json','Perry object/composite'),('perry-scalar-results.json','Perry単体'),('perry-reference-results.json','PerryのNode基準'),('perry-scalar-reference-results.json','単体PerryのNode基準')])+'</div></section>'
f=root/'docs/review.html';s=f.read_text()
if 'id="coverage"'in s:s=re.sub(r'<section id="coverage">.*?</section>',lambda _:section,s,count=1,flags=re.S)
else:s=s.replace('</header>','</header>'+section,1)
if 'href="#coverage"'not in s:s=s.replace('<nav ', '<nav ',1).replace('<a href="#api">','<a href="#coverage">全API比較（96ケース）</a><a href="#api">',1)
if 'coverage-filter' not in re.findall(r'<script>(.*?)</script>',s,re.S).__str__():s=s.replace('</body>', '<script>{const filter=document.getElementById("coverage-filter");filter.addEventListener("input",()=>{const term=filter.value.toLowerCase();document.querySelectorAll(".coverage-case").forEach(item=>item.hidden=!item.textContent.toLowerCase().includes(term));});}</script></body>')
for historical in ['performance','upstream','moonbit','bun','construction','size','perry','tree-shaking','lifecycle']:
 marker=f'<section id="{historical}">'
 message=f'<p class="note" data-history="{historical}">この節は以前の実装で測定した履歴です。現在の実装に対する全API・9プロセスの比較は、ページ先頭の全API比較を参照してください。</p>'
 if f'data-history="{historical}"' not in s:s=s.replace(marker,marker+message,1)

f.write_text(s)
md=['# Full API comparison','','Scope: 57 object/composite profiles and 39 standalone field profiles. Not every possible input/option combination.','','Range | Cases | Bun valid vs Valibot | Bun invalid | Bun construction | Bun gzip','--- | --- | --- | --- | --- | ---']+[' | '.join(map(str,row))for row in summary]+['','Counts exclude custom Valibot xor; medians are not a statistical significance test. All three-dimensional superiority remains unachieved. Detailed code, every case, native differences and backend limitations are in docs/review.html.','']
md+=['## Confirmatory optimization comparison','','Nine independent processes per implementation/runtime, with settled warmup; exact two-sided Mann–Whitney and Holm adjustment, plus a 10% practical threshold.',f'Confirmed improvements vs baseline: {len(gains)} mode/runtime comparisons. Remaining confirmed competitor losses: {len(losses)}.', '', 'Case | Runtime | Mode | loculus ns | Peer | Peer ns | Ratio | Holm p','--- | --- | --- | --- | --- | --- | --- | ---']+[' | '.join(map(str,[r['id'],r['runtime'],r['mode'],round(r['ns'],2),r['reference'],round(r['referenceNs'],2),round(r['ratio'],2),round(r['adjustedP'],4)]))for r in sorted(losses,key=lambda r:r['ratio'],reverse=True)]+['']
md+=['## Confirmed regressions vs baseline','', 'Case | Runtime | Mode | Before ns | After ns | Ratio | Holm p','--- | --- | --- | --- | --- | --- | ---']+[' | '.join(map(str,[r['id'],r['runtime'],r['mode'],round(r['referenceNs'],2),round(r['ns'],2),round(r['ratio'],2),round(r['adjustedP'],4)]))for r in regressions]+['']
(folder/'RESULTS.md').write_text('\n'.join(md))
print('All 96 comparison details rendered.')
