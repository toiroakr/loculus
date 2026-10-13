# Whole-object code generation: empty constructor / Bun width100

ソース読解のみ。変更したファイルは本分析だけ。build/test/benchmarkは実行していない。src/rolldown.ts、generated width100 worker、screening-losses/probe-results、strategy preparationを読んだ。

## 現状で分かること

screening-lossesのempty Node constructorは64ns対Val42ns、width100 Bun validは1726ns対1015ns。3-process screeningの値であり、ここでは有意な改善/損失と断定しない。

生成objectはfactoryでfresh shape literalをfreezeし、fresh meta/Std/outer schemaを作る。static ObjectExpressionしか認識しないため、元のliteral入力shapeは外へ漏れず、copyを省いてそのliteral自体をsnapshotに使っている。empty shapeは子capture/keys allocation/validator closureなしで共有generated validatorを使う。依然shape+meta+Std+schemaの4 object評価とfreezeが残る。Valのflat object+Stdはshape込み3 objectsで、shapeをfreezeしない。ここに制約上の下限差がある。

width100はautoの連続scalar group threshold3により、moduleの100key arrayを使う1本のindexed loopへ生成される。成功fieldごとにown input check/get、typeof string、`"issues" in {}`、`key==='__proto__'`、ordinary output assignmentを行う。outputはpreseedしない。

probe-variantsは既にfresh{} guardをshared __guardProbe={}へ置換している。Bun validは元が約1.0/1.15/6.2us、probeが約7.2/1.12/1.08usでどちらも揺れる。したがってguard literalのallocationだけが不安定性の原因という根拠はない。Nodeのprobeも改善を示していない。以下はsource上の削減候補であって、性能改善の主張ではない。

## 優先候補1: static empty shapeだけpreventExtensions

factoryのshapeが空literalと分かる場合だけ:

```ts
const freezeShape = Object.keys(helper.spec.fields).length === 0
  ? 'Object.preventExtensions(shape);'
  : 'Object.freeze(shape);';
```

plain fresh empty objectにはown propertyがないため、preventExtensionsだけでObject.isFrozen/isSealedがtrueになる。own keys、own descriptors、prototype、fresh identity、snapshotは同じ。追加/削除の結果も同じ。nonempty shapeやProxyへ一般化してはいけない。

期待する削減はfreeze側のkey enumeration / property-descriptor処理。VM内で空object freezeが同じfast pathなら差は出ない。Object.freeze/preventExtensions自体をユーザーがmonkeypatchして観測する場合は呼び出すbuiltinが異なる。public shapeの観測同値とbuiltin instrumentingの同値は分ける必要がある。

empty shapeの共有はfresh shape identityを変えるため除外。meta/Std/schemaの共有も独立性を変えるため除外。freeze省略、遅延freeze、公開prototype変更も除外。

## 優先候補2: static scalar groupのproto安全性を生成時に判定

現write(dynamic=true)は全dynamic keyにproto分岐を付ける。しかしgroup key listはbuild-time既知で、width100はf0..f99のみ。安全なgroupなら普通assignmentだけを生成できる。

```ts
const write = (key: string, value: string, dynamic = false, mayProto = true): string => {
  const expression = dynamic ? key : emit(key);
  const assign = `output[${expression}]=${value};`;
  if (dynamic && !mayProto) return assign;
  const define = `Object.defineProperty(output,${expression},{value:${value},enumerable:true,writable:true,configurable:true});`;
  return dynamic ? `if(${key}==="__proto__"){${define}}else{${assign}}`
    : key === '__proto__' ? define : assign;
};
```

group生成時 `const mayProto=fields.slice(index,end).some(([key])=>key==='__proto__')` を計算し、inline→writeへ渡す。proto入りgroup、generic collect、dynamic unknown keysは今の安全経路を残す。non-proto fieldでもinherited setter/readonlyを踏むordinary assignmentはそのままなので、preseedのような契約差はない。computed ['__proto__']のgroupを必ず専用意味検証に残す。

期待削減はwidth100成功で100回のkey comparison/branchとloop bodyのcode。group keysはmodule privateで公開shapeとは独立しており、input getterがraw inputやObject.prototypeを変更してもkey namesは変わらない。own/get/callback/result消費順は変えない。

## 低優先候補3: guardのliteral/prototype hopを減らす

既存shared probeがあるので重複する部分が多いが、以下はその派生:

```js
const intrinsicObjectPrototype = Object.getPrototypeOf({});
// Each field still checks after reading its input:
if ("issues" in intrinsicObjectPrototype) {
  const result = { value };
  issues = collect(result, key, input, output, issues);
} else {
  // The original write path.
}
```

empty literalにはown keysがないため、元HasPropertyはそのprototypeへ進む。直接prototypeをチェックすればfresh literalと1段のown missを省ける。field毎のcheckは残し、getterが途中でObject.prototype.issuesを追加/削除しても反映する。true時のResultはfreshのままなのでinherited issues getterのthis/value/読取回数は維持される。

validation時にObject.prototypeを参照し直す形は、callbackがglobal Objectを差し替えた場合にliteral intrinsic prototypeとズレる。module初期化時の捕捉を推奨。ただしgetPrototypeOf自体がmodule load前にmonkeypatchされている場合は新たなbuiltin dependencyになる。shared probeの結果が不安定なので採用を先に決める根拠はない。

## 候補4: full unrollと単一loopの中間、small blocked unroll

既存strategyは全100fields unrollと同一body100回のloopの両端。未準備の中間は4/8fieldsだけ展開するstrip-mined loop。

```js
for (let index = 0; index < 96; index += 8) {
  const key0 = keys[index];
  field0: { /* Original inline scalar body with key0. */ }
  const key1 = keys[index + 1];
  field1: { /* Same body with key1. */ }
  // Up to key7; preserves all reads/writes in sequence.
}
for (let index = 96; index < 100; index++) {
  const key = keys[index];
  tail: { /* Original inline body. */ }
}
```

boundsはbuild-timeのgroup lengthから生成する。4/8倍のbody増と引き換えにloop backedge/bounds checkを減らし、full100 unrollほど巨大にしない。group>=32などに限定し、small objectsは元生成コードを維持できる。各fieldのinput own/get、prototype issues guard、ordinary assignment、issue collectionは元順のまま。副作用のあるgetter/Result/callbackを前倒ししたり、own判定やoutputをまとめて処理しない。

VMがloopを自動展開している場合は利益なし。JSCのcode size/OSR/tieringには逆効果もあり得る。これはsource上のbranch回数削減候補であり、Bun安定化が保証される案ではない。

## 不安定性について断定しない事項

生成loopは1inputあたり1validation functionに100field処理を含める。Valはobject ~runからstring ~runを100回呼ぶ。従ってfunction invocation単位のtiering回数は異なる。一方生成loopには100回のloop backedgeがあり、OSR counterの扱い次第で逆の効果もある。JSCの具体的tier threshold/compiled code/GC情報はここでは取得していないため、主因は特定できない。

workersの30ms warmup、8ms calibration、7round、fresh3processという設定はsourceで確認済み。幅100は各sampleで大量のoutput object property additionを行う。runtime instabilityはguard-probeでも継続しているため、単一3-process中央値をcode shapeの優劣とみなさない。親の逐次測定でraw process mediansとround distributionsを同時に見る必要がある。

## 再度提案しない案

- output preseed: inherited setter/readonly、receiver keys、error/missing omissionで意味が変わる。先にinput keysを列挙してown判定を省く案もinput mutation/Proxy順を変える。
- own checksをvalidation先頭でまとめる: getterによる後続追加削除を見逃す。
- issues-prototype guardをvalidation一回だけにする: field getterが途中でissuesを追加するケースを壊す。
- shared empty result/meta/std/shape: public identityとfreeze/拡張の意味を変える。
- Object.assignによるshape clone: inherited __proto__ setterを踏む。
- Val型のlive shape/child function読み取り: frozen snapshot/Std getter captureを変える。

測定優先はempty preventExtensions、non-proto group branch除去、次にblocked4/8。guard派生は既存probeがあるため低優先。どれも本体コードには反映していない。
