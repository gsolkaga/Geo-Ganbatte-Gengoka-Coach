# 正解タグと用語辞書の不整合

生成: 2026-08-18T01:30:42.928Z　
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

## 検出: 1 件

| 問 | 正解 | スロット | 種類 | 残り | 用語（該当国数） | 見立て |
|---|---|---|---|---|---|---|
| q-kz-01 | KZ | `road_marking` | 正解を含まない | 37 | ref_road_marking_center_yellow(37) | (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない） |

## 対応の候補

**見立ては機械的な推定である。** `note` に「保留」「機能しない」と
書いてあるかどうかで分けているだけなので、最終判断は人間が行う。

### q-kz-01 / `road_marking`（正解 KZ、残り 37 カ国）

- 用語: ref_road_marking_center_yellow(37)
- 見立て: (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない）
- 対応: 用語が正しければ直す必要はない。**その手がかりが KZ を示さないことが正しい診断である**
- note — ref_road_marking_center_yellow: `KZ` を含まない。 人手の road_marking_center_yellow（13 カ国）は本人の連想であり、こちらは記載である。上書きせず別に持つ。出典が独立に「黄色い中央線はカザフスタンを示さない」という診断と一致した。

## 絞り込みに使える用語が無いスロット: 29 件

正解タグには用語が割り当てられているが、**すべて `unverified` か `disputed`** である。
「次に見るべきスロット」として提示されない。

**これは隠された欠落である。** 画面上は何も表示されないため、
辞書が足りないことに気づけない。この一覧がその代わりになる。

| 問 | 正解 | スロット | 割り当てられている用語 |
|---|---|---|---|
| q-jp-01 | JP | `terrain_vegetation` | ai_terrain_vegetation_01(unverified, disputed) |
| q-jp-01 | JP | `pavement` | ai_pavement_01(unverified, disputed) |
| q-th-01 | TH | `vehicle` | ai_vehicle_01(unverified, disputed) + ai_vehicle_02(unverified, disputed) |
| q-tr-01 | TR | `vehicle` | ai_vehicle_01(unverified, disputed) + ai_vehicle_02(unverified, disputed) + ref_plate_eu_blue_band(heuristic) |
| q-br-01 | BR | `script` | ai_script_02(unverified, disputed) |
| q-br-01 | BR | `pavement` | ai_pavement_01(unverified, disputed) + ai_pavement_02(unverified, disputed) |
| q-au-01 | AU | `bollard` | ai_bollard_01(unverified, disputed) |
| q-au-01 | AU | `ground` | ai_ground_03(unverified, disputed) |
| q-au-01 | AU | `terrain_vegetation` | ref_flora_eucalyptus(heuristic) |
| q-au-01 | AU | `vehicle` | ai_vehicle_01(unverified, disputed) + ai_vehicle_02(unverified, disputed) |
| q-au-01 | AU | `pavement` | ai_pavement_01(unverified, disputed) + ai_pavement_05(unverified, disputed) |
| q-au-01 | AU | `season` | ai_season_01(unverified, disputed) |
| q-is-01 | IS | `ground` | ai_ground_03(unverified, disputed) |
| q-is-01 | IS | `terrain_vegetation` | ref_flora_grass_only_no_trees(heuristic) |
| q-is-01 | IS | `pavement` | ai_pavement_04(unverified, disputed) |
| q-bg-01 | BG | `sign` | ai_sign_01(unverified, disputed) |
| q-bg-01 | BG | `vehicle` | ref_plate_eu_blue_band(heuristic) + ai_vehicle_01(unverified, disputed) + ai_vehicle_02(unverified, disputed) + ai_vehicle_05(unverified, disputed) |
| q-bg-01 | BG | `pavement` | ai_pavement_01(unverified, disputed) + ai_pavement_02(unverified, disputed) |
| q-ru-01 | RU | `pole` | ai_pole_03(unverified) |
| q-ru-01 | RU | `vehicle` | ai_vehicle_01(unverified, disputed) + ai_vehicle_02(unverified, disputed) |
| q-ru-01 | RU | `pavement` | ai_pavement_01(unverified, disputed) + ai_pavement_03(unverified, disputed) |
| q-kz-01 | KZ | `pole` | ai_pole_01(unverified, disputed) |
| q-kz-01 | KZ | `vehicle` | ai_vehicle_01(unverified, disputed) + ai_vehicle_02(unverified, disputed) |
| q-kz-01 | KZ | `pavement` | ai_pavement_01(unverified, disputed) |
| q-kz-01 | KZ | `season` | ai_season_04(unverified, disputed) |
| q-za-01 | ZA | `pole` | ai_pole_01(unverified, disputed) |
| q-za-01 | ZA | `ground` | ref_ground_red_soil(heuristic) |
| q-za-01 | ZA | `vehicle` | ai_vehicle_01(unverified, disputed) + ai_vehicle_02(unverified, disputed) |
| q-za-01 | ZA | `pavement` | ai_pavement_01(unverified, disputed) + ai_pavement_02(unverified, disputed) |

## 影響

`server/utils/narrowing.ts` は以下を守っているため、**誤った助言は表示されない。**

- 積集合が空（矛盾）の行は `nextPriority` に出さない
- **正解国を含まない行は `nextPriority` に出さない**
- `unverified`（AI 生成）の用語は絞り込み計算に使わない

その結果として「次に見るべきスロット」が空になる出題がある。
**空であることが、辞書が足りていないという事実の表示である。**
