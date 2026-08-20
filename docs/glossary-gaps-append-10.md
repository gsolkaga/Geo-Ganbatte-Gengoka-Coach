# 正解タグと用語辞書の不整合 — Standard append 10

**対象は追加した 10 問**（`gsolkaga__standard-append-10`）である。
最初の 10 問の結果は [`glossary-gaps.md`](glossary-gaps.md) にある。

## 「正解を含まない」が 7 件出た

積集合から正解国が消える組み合わせである。最初の 10 問では 1 件だったものが、
**辞書を足していない別の 10 問では 7 件になった。**

原因は 1 つではない。実測で 2 種類あった。

```
私の記述に情報量が無かった      アスファルト舗装のように、事実だが国を示さない
辞書の該当国が欠けていた        路肩の黄色い二重線に GB が入っていない（出典が南部アフリカ）
```

> **同じ症状に原因が 2 種類あるなら、症状を見て原因を決めてはいけない。**

どちらも `usableForNarrowing` が絞り込みから外すので、**学習者に誤った助言は出ない。**
出るのは「その手がかりでは絞れない」という正直な報告である。

生成: 2026-08-19T09:33:09.121Z　
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

## 検出: 7 件

| 問 | 正解 | スロット | 種類 | 残り | 用語（該当国数） | 見立て |
|---|---|---|---|---|---|---|
| q-kr-01 | KR | `road_marking` | 正解を含まない | 10 | road_marking_center_yellow_edge_white(11) + ref_road_marking_center_yellow(37) | (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない） |
| q-co-01 | CO | `vehicle` | 正解を含まない | 3 | ref_plate_yellow_front_and_rear(3) | (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない） |
| q-sg-01 | SG | `road_marking` | 正解を含まない | 4 | road_marking_edge_yellow(4) | (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない） |
| q-ca-01 | CA | `vehicle` | 正解を含まない | 2 | ref_plate_no_front_plate(2) | (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない） |
| q-lv-01 | LV | `camera` | 正解を含まない | 3 | ref_camera_black_car_below(3) | (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない） |
| q-cl-01 | CL | `camera` | 正解を含まない | 3 | ref_camera_black_car_below(3) | (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない） |
| q-rw-01 | RW | `sign` | 正解を含まない | 1 | ref_sign_stop_dur(1) | (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない） |

## 対応の候補

**見立ては機械的な推定である。** `note` に「保留」「機能しない」と
書いてあるかどうかで分けているだけなので、最終判断は人間が行う。

### q-kr-01 / `road_marking`（正解 KR、残り 10 カ国）

- 用語: road_marking_center_yellow_edge_white(11) + ref_road_marking_center_yellow(37)
- 見立て: (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない）
- 対応: 用語が正しければ直す必要はない。**その手がかりが KR を示さないことが正しい診断である**
- note — road_marking_center_yellow_edge_white: 黄色が中央か外側かを区別することが要点。 外側が黄色なら南部アフリカ（road_marking_edge_yellow）。同一スロット内の組み合わせ。
- note — ref_road_marking_center_yellow: `KZ` を含まない。 人手の road_marking_center_yellow（13 カ国）は本人の連想であり、こちらは記載である。上書きせず別に持つ。出典が独立に「黄色い中央線はカザフスタンを示さない」という診断と一致した。

### q-co-01 / `vehicle`（正解 CO、残り 3 カ国）

- 用語: ref_plate_yellow_front_and_rear(3)
- 見立て: (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない）
- 対応: 用語が正しければ直す必要はない。**その手がかりが CO を示さないことが正しい診断である**
- note — ref_plate_yellow_front_and_rear: 強い。 前後とも黄色い国は少ない。後ろだけ黄色い国（イギリス・香港・ケニアなど）と混同しないよう、前を見たかどうかを確認する。

### q-sg-01 / `road_marking`（正解 SG、残り 4 カ国）

- 用語: road_marking_edge_yellow(4)
- 見立て: (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない）
- 対応: 用語が正しければ直す必要はない。**その手がかりが SG を示さないことが正しい診断である**
- note — road_marking_edge_yellow: 南部アフリカ 4 カ国。同一地域なので良メタ。 出典では混同先に IE が挙がっている。アラビア語が見当たらない場合にアフリカを考えるという条件付き。

### q-ca-01 / `vehicle`（正解 CA、残り 2 カ国）

- 用語: ref_plate_no_front_plate(2)
- 見立て: (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない）
- 対応: 用語が正しければ直す必要はない。**その手がかりが CA を示さないことが正しい診断である**
- note — ref_plate_no_front_plate: アメリカでも地域による。 南東部からミシガン、南部を横切ってアリゾナまでの州で見られる。国全体の性質ではないので、これだけで州を決めない。プエルトリコも前ナンバーが無い。

### q-lv-01 / `camera`（正解 LV、残り 3 カ国）

- 用語: ref_camera_black_car_below(3)
- 見立て: (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない）
- 対応: 用語が正しければ直す必要はない。**その手がかりが LV を示さないことが正しい診断である**
- note — ref_camera_black_car_below: 強い。 撮影世代に依存する。 新しい被写域（Gen 4）へ更新されると消えることがある。ヨルダンは黒（UAE の白と対になる）。アルゼンチンとウルグアイは車の前部が黒くぼんやり写る。

### q-cl-01 / `camera`（正解 CL、残り 3 カ国）

- 用語: ref_camera_black_car_below(3)
- 見立て: (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない）
- 対応: 用語が正しければ直す必要はない。**その手がかりが CL を示さないことが正しい診断である**
- note — ref_camera_black_car_below: 強い。 撮影世代に依存する。 新しい被写域（Gen 4）へ更新されると消えることがある。ヨルダンは黒（UAE の白と対になる）。アルゼンチンとウルグアイは車の前部が黒くぼんやり写る。

### q-rw-01 / `sign`（正解 RW、残り 1 カ国）

- 用語: ref_sign_stop_dur(1)
- 見立て: (b) 観察が誤誘導の可能性（用語は正しく、手がかりが国を示さない）
- 対応: 用語が正しければ直す必要はない。**その手がかりが RW を示さないことが正しい診断である**
- note — ref_sign_stop_dur: 非常に強い。1 カ国。トルコの停止標識は `DUR`。`q-tr-01` はこれが辞書に無かったため 78 カ国のまま止まっていた。トルコ語の `ş ç ı` と併せると確定に近い。

## 保留中の用語（`disputed`）: 1 件

`server/utils/narrowing.ts` は `disputed` な用語を**絞り込み計算から外す。**
したがって誤った助言は出ない。**ただし辞書の宿題は残っている。**

> **除外は問題の解決ではなく、被害の停止である。**

`unverified`（AI 生成）は最初から絞り込みの材料ではないので、ここには出さない。
**人手記述で保留にしたものだけ**が宿題である。

| 問 | 正解 | スロット | 用語 | 該当国数 |
|---|---|---|---|---|
| q-cl-01 | CL | `road_marking` | `road_marking_center_white` | 1 |

- `road_marking_center_white` — 連想である。網羅ではない。「中央線が白なら、まずヨーロッパを考える」。国を挙げられていない（チリだけが書けた）ことが、連想である証拠である。出典による網羅は `ref_road_marking_center_white`（85 カ国）にある。

## 絞り込みに使える用語が無いスロット: 28 件

正解タグには用語が割り当てられているが、**すべて `unverified` か `disputed`** である。
「次に見るべきスロット」として提示されない。

**これは隠された欠落である。** 画面上は何も表示されないため、
辞書が足りないことに気づけない。この一覧がその代わりになる。

| 問 | 正解 | スロット | 割り当てられている用語 |
|---|---|---|---|
| q-kr-01 | KR | `sign` | ai_sign_01(unverified, disputed) |
| q-kr-01 | KR | `vehicle` | ai_vehicle_01(unverified, disputed) + ai_vehicle_02(unverified, disputed) |
| q-kr-01 | KR | `pavement` | ai_pavement_01(unverified, disputed) |
| q-gb-01 | GB | `road_marking` | ai_road_marking_01(unverified, disputed) + ai_road_marking_05(unverified, disputed) |
| q-gb-01 | GB | `sign` | ai_sign_01(unverified, disputed) + ai_sign_02(unverified, disputed) |
| q-gb-01 | GB | `pavement` | ai_pavement_01(unverified, disputed) |
| q-co-01 | CO | `pole` | ai_pole_03(unverified) + ai_pole_02(unverified) |
| q-co-01 | CO | `pavement` | ai_pavement_05(unverified, disputed) + ai_pavement_01(unverified, disputed) |
| q-sg-01 | SG | `vehicle` | ai_vehicle_01(unverified, disputed) |
| q-sg-01 | SG | `pavement` | ai_pavement_01(unverified, disputed) |
| q-mx-01 | MX | `vehicle` | ai_vehicle_02(unverified, disputed) + ai_vehicle_01(unverified, disputed) |
| q-mx-01 | MX | `pavement` | ai_pavement_05(unverified, disputed) |
| q-nz-01 | NZ | `pole` | ai_pole_03(unverified) |
| q-nz-01 | NZ | `vehicle` | ai_vehicle_02(unverified, disputed) + ai_vehicle_01(unverified, disputed) |
| q-nz-01 | NZ | `pavement` | ai_pavement_01(unverified, disputed) |
| q-ca-01 | CA | `pole` | ai_pole_03(unverified) |
| q-ca-01 | CA | `pavement` | ai_pavement_01(unverified, disputed) + ai_pavement_02(unverified, disputed) |
| q-lv-01 | LV | `pole` | ai_pole_03(unverified) |
| q-lv-01 | LV | `vehicle` | ref_plate_eu_blue_band(heuristic) + ai_vehicle_02(unverified, disputed) + ai_vehicle_01(unverified, disputed) |
| q-lv-01 | LV | `pavement` | ai_pavement_01(unverified, disputed) |
| q-cl-01 | CL | `traffic_side` | ai_traffic_side_03(unverified, disputed) |
| q-cl-01 | CL | `road_marking` | road_marking_center_white(heuristic, disputed) |
| q-cl-01 | CL | `pavement` | ai_pavement_05(unverified, disputed) |
| q-rw-01 | RW | `pole` | ai_pole_02(unverified) + ai_pole_03(unverified) |
| q-rw-01 | RW | `ground` | ref_ground_red_soil(heuristic) |
| q-rw-01 | RW | `terrain_vegetation` | ref_flora_palm_tropical_dirt(heuristic) |
| q-rw-01 | RW | `pavement` | ai_pavement_05(unverified, disputed) |
| q-rw-01 | RW | `camera` | ai_camera_05(unverified, disputed) |

## 影響

`server/utils/narrowing.ts` は以下を守っているため、**誤った助言は表示されない。**

- 積集合が空（矛盾）の行は `nextPriority` に出さない
- **正解国を含まない行は `nextPriority` に出さない**
- `unverified`（AI 生成）の用語は絞り込み計算に使わない

その結果として「次に見るべきスロット」が空になる出題がある。
**空であることが、辞書が足りていないという事実の表示である。**
