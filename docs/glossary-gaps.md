# 正解タグと用語辞書の不整合

生成: 2026-08-17T05:46:50.499Z　
`node scripts/validate-answer-keys.mjs` が算出した。**AI を使っていない。リクエスト消費 0。**

## これはタグ付けの誤りではない

タグは「この地点に何が写っているか」を書くものであり、
一般的な GeoGuessr プレイヤーの知識に基づいて作る。**それは正しい。**

問題は**用語が「見た目の名前」と「該当国の主張」を 1 つに束ねている**ことである。

```
観察           「中央線は黄色の実線」                ← 正しい
用語 ID         road_marking_center_yellow          ← 文字面としては正しい対応
用語が持つ主張  US CA MX BR AR UY PE BO PY CO EC TH KH  ← **KZ が無い**
```

> **用語は観察の名前ではなく、主張である。**
> 正規化すると、名前だけでなく主張まで輸入される。

したがって直すのは **`data/glossary-human.json` の該当国リスト**である。
人間の作業であり、**これが Plonk It が何年もかけていることである。**

## 検出: 4 件

| 問 | 正解 | スロット | 種類 | 残り | 用語（該当国数） |
|---|---|---|---|---|---|
| q-tr-01 | TR | `pavement` | **正解を含まない** | 1 | pavement_tile_like(1) |
| q-ru-01 | RU | `road_marking` | **正解を含まない** | 1 | road_marking_center_white(1) |
| q-kz-01 | KZ | `road_marking` | **正解を含まない** | 13 | road_marking_center_yellow(13) |
| q-za-01 | ZA | `road_marking` | **正解を含まない** | 1 | road_marking_center_white(1) |

## 対応の候補

- **q-tr-01 / `pavement`**（正解を含まない）: TR を該当国に追加するか、この用語の割り当てを見直す
- **q-ru-01 / `road_marking`**（正解を含まない）: RU を該当国に追加するか、この用語の割り当てを見直す
- **q-kz-01 / `road_marking`**（正解を含まない）: KZ を該当国に追加するか、この用語の割り当てを見直す
- **q-za-01 / `road_marking`**（正解を含まない）: ZA を該当国に追加するか、この用語の割り当てを見直す

## 影響

`server/utils/narrowing.ts` は以下を守っているため、**誤った助言は表示されない。**

- 積集合が空（矛盾）の行は `nextPriority` に出さない
- **正解国を含まない行は `nextPriority` に出さない**
- `unverified`（AI 生成）の用語は絞り込み計算に使わない

その結果として「次に見るべきスロット」が空になる出題がある。
**空であることが、辞書が足りていないという事実の表示である。**
