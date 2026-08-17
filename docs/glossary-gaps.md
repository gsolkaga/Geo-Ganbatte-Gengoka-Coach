# 正解タグと用語辞書の不整合

生成: 2026-08-17T06:12:57.545Z　
`node scripts/validate-answer-keys.mjs` が算出した。**AI を使っていない。リクエスト消費 0。**

## これはタグ付けの誤りではない

タグは「この地点に何が写っているか」を書くものであり、
一般的な GeoGuessr プレイヤーの知識に基づいて作る。**それは正しい。**

用語が「見た目の名前」と「該当国の主張」を 1 つに束ねているため、
正規化すると名前だけでなく主張まで輸入される。

```
観察           「中央線は黄色の実線」                ← その地点の事実として正しい
用語 ID         road_marking_center_yellow          ← 文字面としては正しい対応
用語が持つ主張  US CA MX BR AR UY PE BO PY CO EC TH KH  ← KZ が無い
```

> **用語は観察の名前ではなく、主張である。**

## 不整合には 2 種類ある。混ぜてはならない

当初この一覧は全部を「辞書の穴」として報告した。**誤りだった。**
v2 の実測（2026-08-17、`docs/v2-kz.md`）で 3 モデルが違いを説明した。

| 種類 | 意味 | 直すか |
|---|---|---|
| **(a) 辞書が不完全** | 該当国リストが埋まっていない | **直す**（`data/glossary-human.json`） |
| **(b) 観察が誤誘導** | 用語は正しく、その手がかりが国を示さない | **直さない。正しい診断である** |

(a) の例。`road_marking_center_white` は該当国が `CL` の 1 件しかなく、
note に「**この用語は現状ほぼ機能しない。** 欧州の国を埋めるまで保留」と書いてある。
白い中央線は欧州の標準であり、ロシアも南アフリカも該当する。**埋めるべきである。**

(b) の例。`road_marking_center_yellow` の 13 カ国は**メタとして正しい。**
旧ソ連圏は「黄色い中央線の国」ではない。学習者が見た黄色い実線は
その地点の事実だが、**国を示す手がかりではない。**

> **観察が事実として正しいことと、その観察が国を示すことは別である。**

(b) では積集合が正解を含まないことが**正しい診断**である。`.RU` ドメインと同じ誤誘導である。

## 検出: 2 件

| 問 | 正解 | スロット | 種類 | 残り | 用語（該当国数） | 見立て |
|---|---|---|---|---|---|---|
| q-tr-01 | TR | `pavement` | 正解を含まない | 1 | pavement_tile_like(1) | (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない） |
| q-kz-01 | KZ | `road_marking` | 正解を含まない | 13 | road_marking_center_yellow(13) | (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない） |

## 対応の候補

**見立ては機械的な推定である。** `note` に「保留」「機能しない」と
書いてあるかどうかで分けているだけなので、最終判断は人間が行う。

### q-tr-01 / `pavement`（正解 TR、残り 1 カ国）

- 用語: pavement_tile_like(1)
- 見立て: (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない）
- 対応: 用語が正しければ直す必要はない。**その手がかりが TR を示さないことが正しい診断である**
- note — pavement_tile_like: 経験則。 出典が「連想する」と書いている。断定に使わない。

### q-kz-01 / `road_marking`（正解 KZ、残り 13 カ国）

- 用語: road_marking_center_yellow(13)
- 見立て: (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない）
- 対応: 用語が正しければ直す必要はない。**その手がかりが KZ を示さないことが正しい診断である**
- note — road_marking_center_yellow: 補助メタ。単独では大陸すら決まらない。 13 カ国・3 大陸にまたがる。組み合わせの材料として使う。出典では VE も挙がっているが対象国リストに無いため除いた。

## 保留中の用語（`disputed`）: 2 件

`server/utils/narrowing.ts` は `disputed` な用語を**絞り込み計算から外す。**
したがって誤った助言は出ない。**ただし辞書の宿題は残っている。**

> **除外は問題の解決ではなく、被害の停止である。**

`unverified`（AI 生成）は最初から絞り込みの材料ではないので、ここには出さない。
**人手記述で保留にしたものだけ**が宿題である。

| 問 | 正解 | スロット | 用語 | 該当国数 |
|---|---|---|---|---|
| q-ru-01 | RU | `road_marking` | `road_marking_center_white` | 1 |
| q-za-01 | ZA | `road_marking` | `road_marking_center_white` | 1 |

- `road_marking_center_white` — 出典は「まずヨーロッパを考える」だが具体的な国が挙がっていない。 唯一明示されたのがチリ（南米だが白いことがある）。ヨーロッパ側の国は未記載のため入れていない。この用語は現状ほぼ機能しない。 欧州の国を埋めるまで保留。

## 絞り込みに使える用語が無いスロット: 35 件

正解タグには用語が割り当てられているが、**すべて `unverified` か `disputed`** である。
「次に見るべきスロット」として提示されない。

**これは隠された欠落である。** 画面上は何も表示されないため、
辞書が足りないことに気づけない。この一覧がその代わりになる。

| 問 | 正解 | スロット | 割り当てられている用語 |
|---|---|---|---|
| q-jp-01 | JP | `pavement` | ai_pavement_01(unverified, disputed) |
| q-th-01 | TH | `vehicle` | ai_vehicle_01(unverified, disputed) + ai_vehicle_02(unverified, disputed) |
| q-tr-01 | TR | `traffic_side` | ai_traffic_side_01(unverified) + ai_traffic_side_03(unverified, disputed) + ai_traffic_side_04(unverified, disputed) + ai_traffic_side_05(unverified, disputed) |
| q-tr-01 | TR | `script` | ai_script_03(unverified, disputed) |
| q-tr-01 | TR | `vehicle` | ai_vehicle_01(unverified, disputed) + ai_vehicle_02(unverified, disputed) + ai_vehicle_05(unverified, disputed) |
| q-br-01 | BR | `traffic_side` | ai_traffic_side_01(unverified) |
| q-br-01 | BR | `script` | ai_script_03(unverified, disputed) |
| q-br-01 | BR | `vehicle` | ai_vehicle_01(unverified, disputed) + ai_vehicle_02(unverified, disputed) + ai_vehicle_05(unverified, disputed) |
| q-br-01 | BR | `pavement` | ai_pavement_01(unverified, disputed) |
| q-au-01 | AU | `bollard` | ai_bollard_01(unverified, disputed) |
| q-au-01 | AU | `vehicle` | ai_vehicle_01(unverified, disputed) + ai_vehicle_02(unverified, disputed) |
| q-au-01 | AU | `pavement` | ai_pavement_01(unverified, disputed) + ai_pavement_05(unverified, disputed) |
| q-au-01 | AU | `season` | ai_season_01(unverified, disputed) |
| q-is-01 | IS | `ground` | ai_ground_03(unverified, disputed) |
| q-is-01 | IS | `pavement` | ai_pavement_04(unverified, disputed) |
| q-bg-01 | BG | `traffic_side` | ai_traffic_side_01(unverified) + ai_traffic_side_04(unverified, disputed) |
| q-bg-01 | BG | `sign` | ai_sign_01(unverified, disputed) |
| q-bg-01 | BG | `vehicle` | ai_vehicle_01(unverified, disputed) + ai_vehicle_02(unverified, disputed) + ai_vehicle_05(unverified, disputed) |
| q-bg-01 | BG | `pavement` | ai_pavement_01(unverified, disputed) + ai_pavement_02(unverified, disputed) |
| q-ru-01 | RU | `traffic_side` | ai_traffic_side_01(unverified) |
| q-ru-01 | RU | `road_marking` | road_marking_center_white(heuristic, disputed) + ai_road_marking_02(unverified, disputed) + ai_road_marking_03(unverified, disputed) + ai_road_marking_04(unverified, disputed) |
| q-ru-01 | RU | `pole` | ai_pole_03(unverified) |
| q-ru-01 | RU | `vehicle` | ai_vehicle_01(unverified, disputed) + ai_vehicle_02(unverified, disputed) |
| q-ru-01 | RU | `pavement` | ai_pavement_01(unverified, disputed) + ai_pavement_03(unverified, disputed) |
| q-kz-01 | KZ | `traffic_side` | ai_traffic_side_01(unverified) |
| q-kz-01 | KZ | `pole` | ai_pole_01(unverified, disputed) |
| q-kz-01 | KZ | `vehicle` | ai_vehicle_01(unverified, disputed) + ai_vehicle_02(unverified, disputed) |
| q-kz-01 | KZ | `pavement` | ai_pavement_01(unverified, disputed) |
| q-kz-01 | KZ | `season` | ai_season_04(unverified, disputed) |
| q-za-01 | ZA | `road_marking` | road_marking_center_white(heuristic, disputed) + ai_road_marking_01(unverified, disputed) + ai_road_marking_02(unverified, disputed) + ai_road_marking_04(unverified, disputed) |
| q-za-01 | ZA | `pole` | ai_pole_01(unverified, disputed) |
| q-za-01 | ZA | `script` | ai_script_01(unverified, disputed) |
| q-za-01 | ZA | `ground` | ai_ground_03(unverified, disputed) |
| q-za-01 | ZA | `vehicle` | ai_vehicle_01(unverified, disputed) + ai_vehicle_02(unverified, disputed) |
| q-za-01 | ZA | `pavement` | ai_pavement_01(unverified, disputed) + ai_pavement_02(unverified, disputed) |

## 影響

`server/utils/narrowing.ts` は以下を守っているため、**誤った助言は表示されない。**

- 積集合が空（矛盾）の行は `nextPriority` に出さない
- **正解国を含まない行は `nextPriority` に出さない**
- `unverified`（AI 生成）の用語は絞り込み計算に使わない

その結果として「次に見るべきスロット」が空になる出題がある。
**空であることが、辞書が足りていないという事実の表示である。**
