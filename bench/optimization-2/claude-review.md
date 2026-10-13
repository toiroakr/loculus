# loculus 性能レビュー（すべて未計測の仮説。ソースの読解のみに基づく）

**前提**
- 以下の数値・効果は計測していません。「効きそう」と書いた箇所はすべて仮説で、採用前に V8 と JSC の両方で測ってください。
- 先に、性能以外で読解中に見つけた懸念を 2 点挙げます。
  - compiled 経路で、スカラー検査が失敗したあと `remainder` が `output[key]`（検査中に書き換わった値）を再検証しています。
  - `compiledRemainder` が `delete output[key]` を使っています。

## 1. compiled 経路: 「プランなしフィールドで即 bail」をやめる（優先度 高）

### 現状
- `compiledCheck` が `"false"` を返すフィールドは、enum / date / transform / refine / optional+default 付きなどです。
- そのようなフィールドは、有効な入力でも必ず `break fast` します。
- その結果、有効入力でも `compiledRemainder` に落ち、リテラル生成と各バリデータ呼び出しの二重の仕事になります。
- 配列フィールドだけは「バリデータを呼び、issues があれば bail、なければ続行」という文になっていて、これを全フィールドに一般化できます。

### コード形（number など値が書き換わるもの）
```js
u3 = Object.hasOwn(raw,"age") ? raw["age"] : undefined;
v3 = u3;
if (!(CHECK(v3))) {                      // プランなしなら CHECK は false
  const r3 = validators[3](u3);          // 原値 u3 を渡す。coercion 後の v3 は渡さない
  if (r3.issues) { first = r3; start = 3; break fast; }
  v3 = r3.value;
  if (v3 === undefined && !Object.hasOwn(raw,"age")) { first = r3; start = 3; break fast; }
}
```
- string のように値を書き換えない kind は `u3` を省けます。幅 100 でローカル変数が 200 本になるのを避けるためです。
- 呼び出し元は 1 回しか読まないので、getter の実行回数は変わりません。
- 失敗時は必ず `first` が渡るため、「スカラー失敗後に `output[key]` を再検証する」分岐が不要になります。
- 現状の再検証は、`"1e999"` や bounds 違反で coercion 済みの値を再検証しており、結果が同じになるのは偶然に近いです。

### 期待される効果
- enum / date / optional を混ぜたスキーマの有効入力が fast 経路のまま完走します。
- `remainder` に落ちる条件が「失敗または省略」に限られます。

## 2. `compiledRemainder` の `delete` と先行リテラル（高）

### 現状
- bail 時に `{k0:v0, k1:v1,…}` を全キー分先に作り、省略キーを `delete output[key]` しています。
- V8 は最後に追加したプロパティ以外を `delete` すると辞書モード（ハッシュ表のスロー表現）に落ちます。
- その場合、optional が欠けた行の出力オブジェクトが、後段（RHF など）で遅くなる可能性があります。
- 「optional が欠けた入力」は実用上ありふれているので、ここは測る価値があります。

### コード形
生成コード側（失敗経路）:
```js
return remainder(raw, start, [v0, v1, v2 /* …全 v */], first, keys, validators);
```

`compiledRemainder` 側:
```ts
const output: Record<string, unknown> = {};
for (let i = 0; i < start; i++) put(output, keys[i]!, prefix[i]);   // 先頭 start 個は必ず値あり
```
- `put` は `"__proto__"` だけ `defineProperty` にします。
- `start` 以降は `output[key] = value` を、値あり・own のときだけ行います。`delete` は不要になります。
- 生成ソースから失敗経路のオブジェクトリテラルが消えるので、`new Function` の文字列も約半分になります。
- 追加の `[v0,…]` 配列確保は失敗・省略経路だけです。

## 3. issue の path 構築（interpreted・compiled 両方、高）

### 現状（失敗経路が Bun で Valibot に負けている箇所）
- `path: [key, ...(issue.path ?? [])]` は、フィールドごとに空配列、`...` 展開、新配列を作ります。
- `appendCompiledIssues` は、さらに呼び出し側で `[key]` を作り、`[...path, ...]` で展開します。

### コード形（意味は同一）
```ts
function prependPath(issue: Issue, head: PropertyKey): Issue {
  const path = issue.path;
  return { ...issue, path: path ? [head, ...path] : [head] };
}
```
- `?? []` と同じく null / undefined を欠落扱いにするため、`path ? … : …` を使います。
- `appendCompiledIssues` は `[key]` 配列を渡さず `key` を直接渡します。
- `for…of` は添字ループにします。
- 配列 `array()` の `[i, ...(issue.path ?? [])]` も同様です。
- `{...issue}` を明示プロパティ構築に置き換えるのは非推奨です。`code: undefined` キーが増え、キー省略の仕様と外部 issue の追加プロパティを壊します。
- issue を in-place で書き換える案も、外部から混ぜた Field が凍結・共有した issue を返す場合に壊れるため、不採用を勧めます。

## 4. passthrough 書き込み（Node で Zod に負けている箇所、高）

### 現状
- 非宣言キーごとに `Object.defineProperty(output, key, {descriptor リテラル})` を呼んでいます。
- 記述子オブジェクトの確保と汎用パスを毎キー通ります。

### コード形（意味は維持）
```ts
const proto = Object.prototype;
const extra = Object.keys(raw);
for (let i = 0; i < extra.length; i++) {
  const key = extra[i]!;
  if (own(fields, key)) continue;
  const v = raw[key];                       // getter は従来どおり 1 回・キー順
  if (key in proto) Object.defineProperty(output, key, { value: v, enumerable: true, writable: true, configurable: true });
  else output[key] = v;
}
```
- `key in Object.prototype` が真になるのは `__proto__`、`constructor`、`toString`、汚染済みキー、`Object.freeze(Object.prototype)` 環境の継承キーです。
- 「プロトタイプチェーンに同名がない」なら、代入は新規 own データプロパティ作成と等価です。
- `__proto__` だけの文字列比較より広く、凍結 prototype でも throw しません。
- 一方、単純に `output[key] = v` へ置換すると、凍結 prototype 環境で `toString` キーが strict mode で throw します。この仕様変更は避けられます。
- 同様に、メインループの宣言キー（`output[key] = result.value`）も、`constructor` や `toString` など Object.prototype 上のキー名のフィールドを宣言し、かつ prototype が凍結された環境では throw します。
- 修正するなら `"__proto__"` の文字列比較を、構築時 1 回の判定に置き換える案があります。ただし構築コストが増えるため、測ってから決めてください。
- `own(fields,key)` を `Set` に置き換える案は、`hasOwn` とどちらが速いか自明ではありません。passthrough/strict のときだけ構築する形で測る価値はありますが、効果は未知です。

## 5. スカラー enum の valid 退行（5.87→8.45ns）への手

### 原因の仮説
- `contains` の入れ子クロージャと、毎回の `lookup` 確認・`++uses` による捕捉変数への書き込みが、有効パスに入っています。
- そのうえ 32 要素では、Bun の `Set.has` が `includes` に勝っていない可能性があります。
- 「Set 化」自体が退行要因かどうかは、`includes` / `Set` / 初回構築のみ、を分けて測らないと断定できません。

### コード形（要素数別に 1 クロージャ）
```ts
const n = allowed.length, a = allowed[0], b = allowed[1];
const validate =
  n === 1 ? (v: unknown) => v === a ? { value: v } : miss()
  : n === 2 ? (v: unknown) => v === a || v === b ? { value: v } : miss()
  : n <= THRESHOLD ? (v: unknown) => allowed.includes(v as string) ? { value: v } : miss()
  : (v: unknown) => (lookup ??= new Set(allowed)).has(v as string) ? { value: v } : miss();
```
- `typeof value === "string"` は不要です。要素はすべて文字列なので、`===` / `includes` / `has` は非文字列に対して常に false で、結果は変わりません。
- `++uses` のカウンタは廃止します。初回呼び出しでの Set 化に統一すると、2 回目以降は読み取りだけです。
- `THRESHOLD` は V8 と JSC の両方で、先頭・中央・末尾のメンバーを回して測って決めてください。
- 注意: `includes` は `allowed`（凍結しない配列）に対して使うこと。`Object.freeze` 済み配列は JSC で通常の配列と別の（遅い）内部表現になる可能性があり、現在の `#choices` 分離はこの意味で正しいです。
- `literal` の `typeof input === "string" &&` も、`input === value`（`value` は文字列）で包含されるため冗長です。

## 6. 構築コスト（50 件の負けの本丸）

### (a) 無条件の closure とプラン保存を減らす
- `boolean` と `date` の検証関数は、何も捕捉していません。モジュールレベルの `validateBoolean`・`validateDate` に出せます。
- `number()` の制約なし版も同様に、モジュールレベルの `validateNumber`（options 非依存）にできます。
- これで、制約なしのフィールドは closure 確保、`plan = {}` の確保、`validate[fieldPlan] = plan`（関数への Symbol キー追加＝map 遷移）が丸ごと消えます。
- プラン取得は ID 比較にします:
  ```ts
  const planOf = (v) => v === validateString ? stringPlan : v === validateBoolean ? booleanPlan : v[fieldPlan];
  ```
- ただし `validate[fieldPlan]` の保存先を `field` オブジェクトへ移すのは禁物です。`refine` が `{...s}` で自前の Symbol キーをコピーし、refine 後のスキーマが元のプランを引き継いで、refine が compiled 経路で無視されます。
- 関数に付ける現行方式は、`refine` / `transform` が新しい関数を作るため安全です。

### (b) `meta` を 1 回のリテラルで作る
- 現状は `{kind, description}` を作ってから `optional`、`nullable`、`defaultValue` を後付けしており、構築ごとに shape 遷移が発生します。
- `configuredField(kind, description, options, validate)` に変え、内部で `{kind, description, optional, nullable}` を一括で作ります。
- `defaultValue` は有りの場合だけ別リテラルにして、キー省略（`Object.keys(meta)` が従来と同一）を維持します。

### (c) `enum_` のクロージャを 1 つに
- 現状は `contains` と validate の 2 つです。§5 の形にすれば 1 つで済みます。
- `EnumMeta` は private フィールド（`#source`、`#choices`）を持ちます。private フィールドのあるクラスは、インスタンスごとに field initializer の呼び出しが入るため、仕様上オブジェクトリテラルより重いはずです。
- 代替は、構築時に「凍結済み配列の遅延生成用」の通常クラス（アクセサだけ prototype）にすることです。ただし、`Object.keys(meta)` が従来と変わらない形にする必要があります。これは未検証なので、まず `EnumMeta` を使わない構築時間を計測してください。

### (d) `date` の正規表現リテラルをモジュールレベルへ
- 現在は呼び出しのたびに `/^\d{4}-\d{2}-\d{2}(?:T.*)?$/` を評価します。仕様上は評価ごとに新しい RegExp オブジェクトが作られます。
- `g` や `y` フラグがないため、モジュール定数にしても結果は同じです。parse 時の確保が減ります。

### (e) `object()` の `validators.push`
- 幅 100 では配列の再確保が数回起きます。事前確保（`new Array(n)` は holey 配列になる点に注意）か `keys.map` を試す余地はありますが、効果は小さいと思います。

## 7. presence ラッパー（default / optional / nullable）の特殊化（小）

- 現状は 1 つのクロージャが `input === undefined && optional`、`input === null && nullable`、`defaults & 2` を毎回評価します。
- 代わりに、構築時に形を決めた 3 種類を使います:
  ```ts
  optional && !nullable ? (i) => i === undefined ? { value: missing } : base(i)
  : nullable && !optional ? (i) => i === null ? { value: nullValue } : base(i)   // nullValue = defaults & 2 ? nil : null を事前計算
  : (i) => /* 現行の汎用形 */
  ```
- 捕捉する変数が減り、フォームで多い「optional のみ」の有効パスの分岐が減ります。バンドルは数十バイト増えます。
- 共有の凍結 `{ value: undefined }` を返す案は、利用者が `result.value = …` を試みた際に strict で throw します。API の見え方が変わるので避けてください。

## 8. 未試行のその他の候補

### 配列の「基本 string 要素」インライン化（非 compiled の `array()`）
- 試行済みなのは object 側のインラインで、array 側は未試行です。
- RHF の useFieldArray で多い `array(string())` は、要素ごとに `{value}` を確保しています。
- 構築時に `const basic = innerValidate === validateString` を決めます:
  ```ts
  const item = inputs[i];
  if (basic && typeof item === "string") { output.push(item); continue; }
  ```
- 要素エラー時の path と issue、配列の参照同一性、default の素通しは変わりません。gzip は object の試行と同様に増える可能性があるため、まずバイト数を測ってください。

### compiled の string `trim` 対応
- 現在は `trim` があるとプラン全体が `"false"` になり、fast 経路が使えません。
- `typeof v==="string"&&(v=v.trim(),true)&&…` と書き、失敗時のフォールバックには §1 の `u` を渡します。
- pattern は `lastIndex` の退避が絡むため、対象外のままで構いません。

### 幅 100 の出力オブジェクト（Bun 729ns vs Valibot 577ns）
- 非 compiled 経路は、キー変数の keyed load / keyed store が megamorphic（呼び出し箇所のキーが多すぎて IC が効かない状態）になります。
- そのうえ出力オブジェクトが、プロパティ数の上限で辞書モードに落ちている可能性があります。
- まず、ベンチで compiled と interpreted のどちらを測っているかを確認してください。
- Node では `--allow-natives-syntax` の `%HasFastProperties(output)`（V8 のみ）で、辞書モードかどうかを確認できます。JSC 側は同等の確認手段が別途必要です。
- 辞書モードだった場合に「リテラル `{k0:v0,…}`」を作る §2 の形が、非 compiled 側でも有効かは未検証です。自動コード生成を使わずに近づける方法は、現時点では思いつきません。

## 9. 避けるべき案（セマンティクスを壊す）

- `raw[key]` を先に読んで後から own 判定する案は、継承 getter が実行されるため NG です。
- 失敗 issue の in-place 書き換えは、§3 で述べた理由で NG です。
- 共有の凍結 Result は、§7 で述べた理由で NG です。
- `Object.freeze(allowed)` で配列を共有する案は、JSC で `includes` が遅くなる懸念があります。
- `Object.create(null)` を passthrough の出力に使う案は、プロトタイプが変わるため `toStrictEqual` を壊します。
- プランを `field` オブジェクトに移す案は、§6(a) で述べたとおり NG です。

## 10. より強い回帰テストが要る点

1. **compiled と interpreted の差分テスト（プロパティベース/ファジング）**
   - ランダムなスキーマ（string / number / boolean / enum / date / array / optional / default / nullable / refine / transform）と、ランダムな入力を使います。
   - 入力には `undefined` 値を持つ own キー、欠落キー、`"1e999"`、`"5"`（bounds 付き）、`"__proto__"`、`"constructor"`、`"toString"`、部分的に不正な配列を含めます。
   - 比較は `toStrictEqual`、`Object.keys` の順序、`Object.getPrototypeOf(output) === Object.prototype`、issue の `path` / `code` / キー集合で行います。
   - これは §1・§2 の変更の最大のリスク対策です。
2. **getter / Proxy の実行回数と順序**
   - 各フィールドを getter（カウンタ付き）にし、fast 経路の途中失敗、optional 省略、配列の最初の失敗の `first` 再利用、passthrough でも、各 getter が 1 回・ソース順であることを確認します。
   - Proxy の `getOwnPropertyDescriptor` と `ownKeys` の回数も記録します。`Object.hasOwn` の 2 回呼びが現在発生しているため、変更前後で差が出ます。
3. **スナップショット不変性**
   - 構築後に、options、shape、enum の values、`min` / `max`、`default` 配列（参照同一性は維持されること）を変更しても、既存スキーマの挙動が変わらないことを確認します。
   - `meta` の `Object.keys` と各値（`optional` / `nullable` / `defaultValue` の有無）を、構築パターンごとにスナップショットします。§6(b) の変更の直接の回帰になります。
4. **enum の境界**
   - 要素数 1、2、3、8、9、32 を使います。
   - 呼び出し回数 7、8、9 回目をまたいでも結果が不変であること、`"__proto__"` / `"constructor"` / `""` を含む値、重複要素、不正値のメッセージ（キャッシュ含む）を確認します。
5. **Object.prototype 汚染・凍結**
   - 別プロセス（子プロセス）で `Object.freeze(Object.prototype)` した上で、passthrough と宣言キー `constructor` / `toString` / `__proto__` が throw せず own データプロパティになることを検証します。他のテストと汚染を共有させないためです。
6. **型の回帰**
   - `configuredField` の引数を変えるため、既存の `Input` / `Output` 推論、オーバーロードの解決を `expectTypeOf` などで固定します。
   - Standard Schema の `~standard` の形（`version` / `vendor` / `validate`）と、CLI 向け `meta` の形も固定します。
7. **RHF useFieldArray 統合テスト**
   - 現行のまま維持し、optional 欠落の行や、配列要素の部分失敗の path（`[i, key]`）を追加して確認します。

## 11. ベンチマークの衛生

- 構築のみを測るケースと、「構築＋初回 parse」を測るケースを分けてください。遅延化は構築を速くして初回 parse を遅くするだけで、総コストが増える場合があります（enum の Set がその例です）。
- 構築ベンチは、結果を消費して dead-code elimination を避けてください。
- enum は、先頭・中央・末尾の入力を回してください。`includes` は位置で時間が変わります。
- 比較相手（Zod / Valibot）が、凍結・スナップショットなどの同等の防御処理を行っているかを確認してください。相手がしていなければ、その分は loculus 側の仕様コストです。
- 変更は 1 つずつ入れ、各変更の前後で gzip サイズも記録してください。過去の試行がこの観点で却下されているためです。

## 推奨する着手順

1. §3（path 構築）と §4（passthrough 書き込み）: 変更が小さく、意味が保ちやすい。
2. §6(a)(b)(d): 構築と date の parse 改善で、construction の負けに直結。
3. §1 と §2: 効果が大きい可能性がある反面、差分テスト（§10-1）が前提。
4. §5: 要素数別クロージャは、しきい値を計測してから確定。
