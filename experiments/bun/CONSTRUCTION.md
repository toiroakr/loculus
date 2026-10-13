# 構築コストの改善

Bun 1.4.3 / Node 24.13.0 / Apple M3。µs、9プロセス × 7ラウンドの中央値。

ケース | Bun 前 | Bun 後 | Bun Valibot | Node 前 | Node 後 | Node Valibot
--- | --- | --- | --- | --- | --- | ---
文字列3項目 | 0.749 | 0.404 | 0.517 | 0.961 | 0.454 | 0.683
文字列30項目 | 4.601 | 2.146 | 3.292 | 7.906 | 3.652 | 4.968
CLI 4項目 | 1.149 | 0.948 | 1.991 | 1.480 | 0.776 | 2.287

Bun browser bundle はraw・gzipとも3ケースでValibotより小さい。APIと検証結果を維持し、29テスト・型チェック・tree-shakingを確認。未対応のネストフィールドに対する構築時TypeErrorはキーを含むよう変更。詳細と再現方法は README.md / construction-results.json。
