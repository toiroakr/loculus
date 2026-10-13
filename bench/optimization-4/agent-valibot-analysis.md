# Installed Valibot 1.5.0 の実装調査

対象はローカル `node_modules/valibot/dist/index.mjs` と `index.d.mts`、package.json。ソース読取りのみ。コード変更、ビルド、テスト、計測は実施していない。以下の allocation はソース上の評価回数であり、VM が実際に heap allocation を残す回数を測ったものではない。

## 実装から確定できること

| 機能 | 実装位置 index.mjs | 構造 |
| --- | --- | --- |
| getGlobalConfig | 1–35 | 設定なしなら module の DEFAULT_CONFIG を返す。設定ありだけ merge object を作る |
| _standardSchema | 553–560 | schema に own ~standard を eager assignment。wrapper と validate arrow を毎回新規作成 |
| string | 6614–6631 | flat descriptor、~run method、_standardSchema。成功時 Dataset.typed=true、同じ Dataset を返す |
| object | 5655–5716 | entries 参照を保持。keys/capture/freezeなし。実行時 for-in、live child ~run、in lookup |
| optional | 5994–6016 | wrapped/default を持つ別 schema。undefined を処理して wrapped.~run に同じ Dataset を渡す |
| nullish | 5586–5608 | null/undefined と default を処理し、同じ Dataset を wrapped に渡す |
| pipe | 7409–7426 | 第1 schema を spread、pipe listと~runを追加、Stdを作り直す。各 action は同じ Dataset を更新 |
| trim/minLength | 3671–3684 / 2399–2418 | transformation/validation action は Std を持たず、~run が Dataset を返す |
| safeParse/parse | 7487–7495 / 7318–7322 | Dataset を作って~runへ。safeParseはさらに public result object、parseはvalueを返す |
| _addIssue | 180–209 | error時だけ issue生成、既存Datasetのtyped/issuesを更新 |
| getDefault | 4202–4204 | defaultが関数ならparse時に呼ぶ。それ以外は値を返す |

重要な補正: installed 1.5.0 の ~standard は lazy getter ではない。_standardSchema は毎回 fresh wrapper を eager に作る。string の ~run も factory の object literal に現れる method なので、schema を作るごとに function value が作られる。さらに Std.validate arrow を作る。Loculus の private validateString は共有関数なので、「Valibotは関数が共有されているから速い」とはこのソースから言えない。

### 単純 string object のソース上のコスト

`v.object({name:v.string()})` は、fieldで flat schema+Std の2 objects、outerで flat schema+Std の2 objectsを作る。~run methodsとStd.validate closuresもfreshで、singletonではない。一方 Loculus は field に meta+Field+Std の3 objects、outer に meta+ObjectSchema+Std の3 objects がある。Loculus の plain string は validator function が共有されるが、object は shape copy/freeze、keys array、captured validators array を追加する。この construction 上の違いはソースで確認できる。

Valibot object は各 child に `{value}` Dataset を新規に渡す。したがって「Valibotはbasic childごとのResult allocationを省略している」は誤り。Loculus の child `{value}` Result と Valibot の child Dataset は、ソース上は各1 container。outerもValibotのroot Dataset+output objectとLoculusのoutput object+final Resultで各2 containers。Dataset in-placeの明確な利益は、pipeの各actionやoptional wrapperが追加Resultを作らない点であり、basic1fieldだけのcontainer数差ではない。

Valibot Std.validateはroot Datasetをそのまま返し、typed等のextra keysが残る。Loculus公開Resultのdeep equality/keysを保つなら、このDatasetをpublic Resultとしてそのまま返す移植はできない。

### 契約が軽いため省けている処理

- Val object は `input && typeof input === 'object'`。Loculusはarrayも明示拒否する。
- entriesをfreeze/copyしない。schema作成後のentriesやchild.~run変更を実行時に読む。
- field存在判定はinで、inputのinherited propertyも読む。valid branchではin判定が2回現れる。
- error pathはchild issueをin-placeでunshift/代入し、issue objectやissues arrayを共有する。Loculusはopaque Result/issue/pathを変更せずcloneする契約。
- optional missingはchild runを省く条件がある。Loculusはcaptured validatorを呼び、その結果と実行後のown判定でomitを決める。input getterがキーを削除する場合も考慮される。

これらをそのまま移すとsnapshot、own-only、Result/accessor、prototype保証が変わる。速度の根拠として扱えるが、そのまま採用できる最適化ではない。

## optional/nullish/pipe の違い

Valibot optional/nullish はdefault適用後にwrapped schemaを検証する。たとえばoptional(string min5, 'A')はdefaultをmin5にも通す。Loculusはdefault値をcaptureし、missing/nullならdefault値を直接返すため、同じschema constraintsへ再投入しない。Val default factoryはparse時評価で、Loculusのtarget values captureと異なる。wrapperを移植するとこの意味が変わる。

Valibot pipeはbaseを含むrest array、fresh schema/Std、各action descriptorを作る。構築時はbasic stringより重い。metadata actionだけskipし、issuesがある時はschema/transformationへ進まずtyped=falseにする。validation actionはabort設定次第で続ける。Loculus string(options)はtrim/min/max/patternを一つのvalidator内へ融合しており、Valibotのaction列を同じroot APIの内部へ機械的に導入してもconstructor/bundleが改善するとは限らない。

package.jsonはsideEffects:false、各factoryにNO_SIDE_EFFECTS、config取得等にPURE annotationがある。ESMは単一distファイルだがnamed exportsごとに未使用codeを落とせる。string()の実装からoptional/nullish/trim/minLength/pipeへ参照がないことが小サイズの核心。LoculusもESM/tree-shake可能だが、string(options)からすべてのoption branchへ到達する。ファイルを分割するだけではこの到達関係は変わらない。

## 型宣言の構造

index.d.mts BaseSchema 3065–3115はreadonly descriptor fieldsと~standard/~run、optional phantom ~typesを定義する。~typesはinput/output/issueの推論用でruntimeには生成されない。Unknown/Success/Partial/Failure Dataset 2907–2975はtyped discriminantのmutable内部データ。StandardProps 2981以降は公開protocolを別に表現する。

StringSchema 7001–7032はBaseSchema<string,string,StringIssue>とmessage genericのみ。object 6057–6105はconst entries genericからInferObjectInput/Outputを導く。Optional/Nullish 6298/5896はwrapped+defaultの型からconditional outputを導く。SchemaWithPipe 504以降は最初のinput/最後のoutput、itemsのissue unionを計算し、~types/~run/~standardを上書きする。多数のpipe overloadもある。

Loculusはruntimeに使わない入力/出力phantom型を既に利用している。typed Dataset型を導入するだけでruntimeが速くなるわけではなく、ValibotとLoculusのcompile-time型チェックコストの優劣をこのdecl読取りだけで断定できない。

## Root APIを保持して検討できる工夫

### 1. private built-in runnerと公開Resultを分離する内部経路

Valibotから移せる核心はDatasetそのもののpublic化ではなく、内部pipelineが同じstateを更新し、public boundaryだけResultを作る構造。Loculusではlibrary-owned validatorだけを認識し、object内部にprivate sink/runner経路を持たせる案が未検討。構築時はStd getterを元の順で1回だけ読み、そのcaptured function identityが登録済みowned runnerなら内部実行、その他は元のvalidators[i](rawValue)→Result accessor経路へ戻す。

opaque callable ProxyからfieldPlan Symbolを読む方法は新get trapを生むため不可。private WeakMapでfunction identityを照合するならProxy trapは発生せず、custom Std overrideもidentity不一致でgenericへ戻せる。private validateStringだけならWeakMapを使わずidentity比較で十分で、今回のagent配列省略候補はその狭い版。

期待する削減は、多数built-in constraints/presenceを通すobjectでchild Result containersを除くこと。basic1fieldは追加registry/container/dispatchの費用が上回る可能性がある。外側のField/Std/metaはfreshのまま。opaque Resultのissues/value getter、this=validators array、issue/path cloneはそのまま維持する。

成立条件: sinkはparse invocationごとに独立させる。共有global sinkはpattern/valueOf/transformによるreentrant parseで壊れる。core runnerのgetter/callback/error順を元validatorと同じにする。public Std.validateは従来のexact Result形を返す。private plan introspectionや別runner closureの追加がconstructor/bundleを悪化させるので、初めはprivate unconstrained stringだけに限定し、他typesは測定結果で判断する。

既存のsuccess inline-elisionとは、ループ内へconstraint codeを追加するのでなく内部kernelを別にする点が異なる。ただし共有validation helper自体は既存candidateで探索済み。まだ改善が確認された案ではない。

### 2. private validation配列をbasic identity時だけ省く

Valのobject constructorは実行用のvalidator配列を作らない。live lookupは移植不可だが、snapshotでcaptured validatorがすべてprivate validateStringと判明した時、配列自体を保持しないことはできる。最初のopaqueが出た時だけ配列を確保して過去のbasic分を埋め、opaque receiverは従来の完成したarrayにする。

agent-deferred-string/single-stringがこの形で、既に親へsource準備済み。Std getter/callback/Result accessorを変えず、basic objectのarray1個を省く。これは新しいsingleton/APIではない。ただしArray.prototype.push等を改変した場合のprivate constructor array operationsまで同じではなく、内部分岐とbackfillの追加が性能/サイズを悪化させ得る。

### 3. full APIを保持したstatic build specialization

Valの小bundleは未参照feature codeが到達不能であるため。Loculusの同じstring(options)公開APIでこの利点を得るなら、通常のmodule分割ではなく、build-timeに静的literal schema callをprivate minimal factoryへ置換する処理が必要になる。

例: string()または完全に静的なstring({min:1})を、同じfresh meta/Std/Fieldと同じvalidator semanticsを生成する内部factoryへ落とし、動的options/side-effectful gettersはroot runtime実装を残す。ユーザーsourceのAPIは変更しないが、専用build pluginという新workflowが必要。compile plan identity/Politty WeakMap field identity/metadata reflectionまで同じになるminimal coreを共有しないと別の意味になる。既存runtime compile()はimportされたconstructorのoption codeをbundleから除けないため、同じ問題を解いていない。

これはtree-shakingの到達関係を実際に変える手段であり、単なるPURE commentやファイル分割より具体的。ただし追加ツールの開発/保守が大きく、現段階では優先度を下げる。通常esbuildだけでfull root string APIから200gzip bytes消せると主張する根拠にはならない。

## 採用しない移植

- Field singleton: Politty arg()のschema identity WeakMap登録を上書きするため不可。
- schemaを跨いだmutable meta/std共有: 独立性を破る。readonly共有でもruntime freeze/metadata拡張の意味は変わる。
- meta===Stdのdescriptor統合: flat Val schemaの2objectsへ近付くが、freeze/delete/override/keys/receiver/serializationの契約を変える。今回の条件を完全には保持しない。
- Valのlive entries/~run・in lookup・shape alias: freeze/snapshot/own-onlyを破る。
- optional missingのrun skip: opaque callbacksやinput mutation後のomit判定を変える。
- issue/pathのin-place変更: frozenまたは共有opaque issuesを壊す。
- genericprivate fieldPlan lookupによるfast classification: callable Proxyへ新get trapを出す。
- pipe-style public Result/Dataset追加キー: 現行公開Resultの形とdeep equalityを変える。

## VM仮説と今後の判断

未確認のVM仮説は、straight-lineなVal string factoryがinlineしやすい、flat descriptorのallocation siteが軽い、entries.for-inがVM fast-properties pathへ乗る、~run/Datasetがescape analysisやproperty-layout最適化へ乗る、というもの。sourceのfunction長やobject数から可能性は示せるが、現在のns差の主因とは断定できない。

今後は同一semantic gateを保ち、constructor allocationだけを変える候補とparse kernelだけを変える候補を分ける。constructor+1validation、repeated validation、bundleを別々に測る。ソース事実から優先できるのはstraight-line basic constructorと不要なcapture storageの省略で、単なるValの表面API模倣ではない。Field/meta/Stdの独立性を保つ限り、flat Valのdescriptor allocation差は残る。
