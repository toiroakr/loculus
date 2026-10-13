ツールは使わず、貼られたコードだけを根拠に書いています。速度・gzip の増減はすべて未計測なので、数値は主張しません。各候補の採否は計測で決めてください。

## 採用候補（construction / presence / default の size 優先、意味は変えない）

### 1. `number()` と `array()` の常に真になる条件分岐を削除する
`number()` と `array()` は `if (validate !== validateString)` で plan を付けています。ここでの `validate` は毎回新しく作った closure か presence wrapper なので、`validateString` と等しくなることはなく、条件は常に真です。

```ts
// number(), array(): 条件を外す
const validate = result["~standard"].validate as PlannedValidate;
const plan = (options === emptyOptions ? {} : options) as FieldPlan;
plan.kind = "number";
validate[fieldPlan] = plan;
```

- 純粋な削除なので意味は変わりません。
- `string()` と `boolean()` の条件は、`validateString` / `validateBoolean` を共有する経路で偽になるため残します。

### 2. plan の付与を `configuredField` に寄せる
`string` / `number` / `boolean` / `array` の 4 か所に、`result["~standard"].validate` を読み戻して `PlannedValidate` へ cast し、`plan.kind` を代入して symbol を付ける同じ処理があります。これを `configuredField` の末尾に 1 つだけ置きます。

```ts
function configuredField(
  meta: Meta, options: FieldOptions<any>, validate: (v: unknown) => Result<any>,
  kind?: Meta["kind"], shared?: unknown, inner?: FieldPlan["inner"],
): Field<any, any, boolean> {
  if (options !== emptyOptions) {
    /* 既存の default / presence 処理（early return は外す） */
  }
  if (kind !== undefined && validate !== shared) {
    const plan = (options === emptyOptions ? {} : options) as FieldPlan;
    plan.kind = kind;
    if (inner) plan.inner = inner;
    (validate as PlannedValidate)[fieldPlan] = plan;
  }
  return field(meta, validate);
}
// string:  configuredField(meta, options, v, "string", validateString)
// number:  configuredField(meta, options, v, "number")
// boolean: configuredField(meta, options, v, "boolean", validateBoolean)
// array:   configuredField(meta, options, v, "array", undefined, innerValidate)
```

- 見込めるのは、重複ブロックの削減と、construction ごとの `result["~standard"].validate` 読み出しの削減です。重複部分は gzip でもともと効くので、gzip への効果は小さい可能性があります。
- 共有の `emptyOptions` を絶対に変更しないこと。`number()` / `array()` の引数なしの場合は、必ず `{}` を新規に作ります。
- `plan.inner` は `inner` がある場合だけ代入します。`inner: undefined` を常に足すと plan の形が変わります。
- 引数が増えるので、minify 後に size が増える可能性があります。計測が必要です。

### 3. presence closure の整理と、`nullish` getter の二重読み出しの解消
現状の default target 処理には 2 つの問題があります。

- `missing = nullish ? value.nullish : value.undefined` と `nil = nullish ? value.nullish : value.null` で、`nullish` を getter にした default target の getter が 2 回呼ばれます。「accessor は exactly once」の要件と食い違っています。
- closure が `defaults` と `nil` を捕捉し、呼び出しごとに `defaults & 2 ? nil : null` を評価しています。

```ts
const nullish = own(value, "nullish");
const u = nullish || own(value, "undefined");
const n = nullish || own(value, "null");
defaults = (u ? 1 : 0) | (n ? 2 : 0);
missing = nullish ? value.nullish : value.undefined;
nil = nullish ? missing : value.null;
const nullValue = defaults & 2 ? nil : null;
// closure は optional, nullable, missing, nullValue, base だけを捕捉
validate = (input) =>
  input === undefined && optional ? { value: missing }
  : input === null && nullable ? { value: nullValue }
  : base(input);
```

- 変わる挙動は、`nullish` が accessor の default target だけです。getter の呼び出しが 2 回から 1 回になります。要件に合わせた修正ですが、挙動変更としてテストに明記してください。
- 通常の値の default には影響しません。
- closure の捕捉変数は 6 個から 5 個に減ります。construction 速度への影響は未計測です。
- 三項演算子への書き換えは minifier が自動で行う可能性が高いので、size 目的ではなく可読性のためです。

### 4. `validateDate` の正規表現をモジュールスコープへ移す
```ts
const isoDate = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/;
// validateDate 内: !isoDate.test(value)
```

- フラグなしの正規表現なので `lastIndex` の影響はなく、意味は変わりません。
- 呼び出しごとの RegExp 生成を避けられる可能性があります。エンジンがどこまで最適化済みかは未計測です。
- size はほぼ同じです。

## 計測してから決める候補（trade-off あり）

### 5. closure 内の `options.*` 読み出しを、構築時に destructure した値へ置き換える
`string` / `number` の検証 closure は、option の形が違う全インスタンスで同じコードを共有します。そのため `options.gt` などの property 読み出しが多相（megamorphic）になりやすいです。`options` は `{...options}` で作った自前コピーなので、構築時に読んでも accessor の順序や回数は変わりません。

```ts
const { integer, gt, gte, lt, lte } = options;
(value) => { /* integer && …, gt !== undefined && output <= gt … */ }
```

- 狙いは validate 速度です。
- construction と gzip は悪化する見込みです。destructure の分のコードと、context slot の増加があります。
- 優先順位が construction/size なので、validate 速度が改善しても採用しない判断もありえます。
- plan 側（compile 用）は `options` をそのまま参照するので、変更不要です。

### 6. `object()` の validate で `own(raw, key)` を 1 回に減らす
```ts
const has = own(raw, key);
const result = validators[i]!(has ? raw[key] : undefined);
… else if (result.value !== undefined || has) …
```

- 現状は、値が `undefined` のとき（キー欠落の optional など）に `hasOwn` を 2 回呼びます。
- 意味の違いは、validator の callback（transform / refine）が `raw` を変更した場合だけです。変更後の状態を見るか、変更前を見るかが変わります。
- この変更を許容するかどうかの判断が必要です。許容しないなら不採用にしてください。

### 7. `literal` / `enum_` の `typeof value === "string"` を外す
型を信頼する呼び出し元だけなら冗長ですが、未型付けの呼び出し元で意味が変わります。たとえば `literal(5)` が数値 `5` を受理するようになります。「意味を保つ」という条件に反するので、採用は非推奨です。

## 不採用にすべきもの（制約に抵触）

- **`compile` が `meta.kind` から plan を導く案**: meta は mutable なので、ユーザーが `meta.kind` を書き換えると検証経路が変わります。validate 関数に symbol で紐づける現状の設計は、この点で正しいです。
- **`Object.assign({}, options)` や destructure での options コピー**: `__proto__` キーで setter が走り、また継承プロパティを読んでしまいます。`{...options}` の own-input only に反します。
- **`field()` を `schema()` + `f.field = true` で実装する案**: key 順と descriptor は同じになりますが、construction ごとに shape transition が 1 回増えます。size の見返りは gzip で小さい見込みです。

## wide output seed について
seed のコードが提示されていないため、直接の評価はできません。symbol の漏れと prototype setter の問題を避ける条件だけ書きます。

- seed のキー集合は `fields` の spread ではなく、`Object.keys(fields)` の string キーだけから作る。`{...fields}` は own の enumerable な symbol も複製します。
- `"__proto__"` は代入ではなく `Object.defineProperty` で定義する。代入だと prototype setter が走ります。
- 欠落キーを持たない出力にする必要があるので、seed から `delete` する形は dictionary mode に落ちる可能性があります。この点は要計測です。

## 計測の進め方
- 変更は 1 つずつ入れてください。
- gzip は、minify 済みバンドルを `gzip -9` した値で比較します。
- 速度は Node と Bun の両方で、construction（引数なし / presence のみ / default / 制約あり）と validate を別々に測ります。
- 候補 3 は挙動変更を含むので、accessor 付き default target のテストを先に Red で追加してください。
