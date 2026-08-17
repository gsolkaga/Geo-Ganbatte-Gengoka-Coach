# 国定数テーブルと出典の突き合わせ（AI 未使用、消費 0）

生成: 2026-08-17T08:43:18.874Z　`node tools/add-universal-terms.mjs`

## 走行帯

出典: [Left- and right-hand traffic（Wikipedia）](https://en.wikipedia.org/wiki/Left-_and_right-hand_traffic)

`data/countries.json` の `traffic_side` は**検証済みが 9 / 102 で、`disputed` が 9 件**である。
そのまま絞り込みに使えないため、出典と突き合わせた。

### 出典は左側通行だが表は右になっていた: 0 件

（なし）


### 出典は右側通行だが表は左になっていた: 0 件

（なし）

## この食い違いの意味

国定数テーブルは AI が生成し、人手で一部を訂正したものである（`docs/generated-countries/`）。
**走行帯は「どちら側を走るか」の二択であり、世界で最も documented な事実の 1 つである。**
それでも取りこぼしが出た。

> **二択でも間違う。** 選択肢が少ないことは、正しさを保証しない。

**用語辞書は出典の一覧から作った。** 国定数テーブルは訂正していない
（`data/countries-overrides.json` に人手で入れる作業として残す）。
絞り込み計算が使うのは用語辞書なので、**助言の正しさはこれで担保される。**
